import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseServiceRoleClient } from "@/lib/supabase-server";

type LeadPayload = {
  name?: unknown;
  first_name?: unknown;
  last_name?: unknown;
  email?: unknown;
  phone?: unknown;
  message?: unknown;
  form_name?: unknown;
  formName?: unknown;
  source_url?: unknown;
  source_page?: unknown;
  source_page_url?: unknown;
  custom_fields?: unknown;
  custom_data?: unknown;
};

function text(value: unknown, maxLength = 10000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function withCorsHeaders(response: NextResponse) {
  response.headers.set("Access-Control-Allow-Origin", "*");
  response.headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, x-crm-integration-id, x-crm-integration-secret");
  response.headers.set("Access-Control-Max-Age", "86400");
  return response;
}

function errorResponse(error: unknown, fallback: string, status = 500) {
  const databaseError = error as { message?: string; details?: string; hint?: string };
  return withCorsHeaders(NextResponse.json(
    { ok: false, error: error instanceof Error ? error.message : databaseError.message || fallback, details: databaseError.details, hint: databaseError.hint },
    { status },
  ));
}

function validSecret(supplied: string, storedHash: string) {
  const suppliedHash = createHash("sha256").update(supplied).digest("hex");
  const expected = Buffer.from(storedHash, "utf8");
  const actual = Buffer.from(suppliedHash, "utf8");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function getCredentials(request: Request) {
  const identifier = request.headers.get("x-crm-integration-id")?.trim() || "";
  const headerSecret = request.headers.get("x-crm-integration-secret")?.trim() || "";
  const authorization = request.headers.get("authorization")?.trim() || "";
  const bearerSecret = authorization.toLowerCase().startsWith("bearer ") ? authorization.slice(7).trim() : "";
  return { identifier, secret: headerSecret || bearerSecret };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseCustomData(value: unknown) {
  return isRecord(value) ? value : {};
}

function parsePayload(body: unknown) {
  if (!isRecord(body)) throw new Error("Request body must be a JSON object.");
  const payload = body as LeadPayload;
  const firstName = text(payload.first_name, 120);
  const lastName = text(payload.last_name, 120);
  const name = text(payload.name, 255) || [firstName, lastName].filter(Boolean).join(" ");
  const email = text(payload.email, 320).toLowerCase();
  if (!name) throw new Error("Lead name is required.");
  if (!email) throw new Error("Lead email is required.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Lead email is invalid.");
  const sourceUrl = text(payload.source_url ?? payload.source_page_url ?? payload.source_page, 2000);
  if (sourceUrl) {
    try {
      const parsed = new URL(sourceUrl);
      if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
    } catch {
      throw new Error("Source URL must be a valid HTTP or HTTPS URL.");
    }
  }
  return {
    name,
    email,
    normalized_email: email,
    phone: text(payload.phone, 80) || null,
    message: text(payload.message, 10000) || null,
    form_name: text(payload.form_name ?? payload.formName, 150) || null,
    source_url: sourceUrl || null,
    custom_data: parseCustomData(payload.custom_fields ?? payload.custom_data),
  };
}

export async function OPTIONS() {
  return withCorsHeaders(new NextResponse(null, { status: 204 }));
}

export async function POST(request: Request) {
  const { identifier, secret } = getCredentials(request);
  if (!identifier || !secret) return errorResponse("Integration identifier and secret are required.", "Integration credentials are required.", 401);

  try {
    const client = getSupabaseServiceRoleClient();
    const { data: integration, error: integrationError } = await client
      .from("crm_website_integrations")
      .select("id, company_id, website_id, secret_hash, is_allowed, crm_websites!inner(status), crm_companies!inner(status)")
      .eq("public_identifier", identifier)
      .maybeSingle();
    if (integrationError) throw integrationError;
    if (!integration || !integration.is_allowed || !validSecret(secret, integration.secret_hash)) return errorResponse("Invalid or inactive integration credentials.", "Invalid integration credentials.", 401);
    const website = integration.crm_websites as unknown as { status: string };
    const company = integration.crm_companies as unknown as { status: string };
    if (website.status !== "active" || company.status !== "active") return errorResponse("The website integration is inactive.", "Inactive website integration.", 403);

    let body: unknown;
    try {
      const contentType = request.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        body = await request.json();
      } else {
        const form = await request.formData();
        body = Object.fromEntries(form.entries());
      }
    } catch {
      return errorResponse("Request body could not be parsed.", "Request body could not be parsed.", 400);
    }
    let lead: ReturnType<typeof parsePayload>;
    try {
      lead = parsePayload(body);
    } catch (error) {
      return errorResponse(error, "Lead data is invalid.", 400);
    }
    const { data: duplicate } = await client.from("crm_leads").select("id").eq("company_id", integration.company_id).eq("normalized_email", lead.normalized_email).limit(1).maybeSingle();
    const { data, error } = await client.from("crm_leads").insert({ company_id: integration.company_id, website_id: integration.website_id, integration_id: integration.id, source: "website", ...lead }).select("id, company_id, website_id, name, email, status, created_at").single();
    if (error) throw error;
    await client.from("crm_website_integrations").update({ last_received_at: new Date().toISOString() }).eq("id", integration.id);
    return withCorsHeaders(NextResponse.json({ ok: true, lead: data, duplicate: Boolean(duplicate), duplicate_of: duplicate?.id ?? null }, { status: 201 }));
  } catch (error) {
    return errorResponse(error, "Could not create CRM lead.");
  }
}