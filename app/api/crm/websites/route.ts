import { NextResponse } from "next/server";
import { getCrmAdminClient } from "@/lib/crm-admin";

const technologies = ["react", "nextjs", "php", "wordpress", "other"];
const hostingProviders = ["hostinger", "orangehost", "other"];
const statuses = ["active", "inactive", "archived"];

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function errorResponse(error: unknown, fallback: string) {
  const databaseError = error as { code?: string; message?: string; details?: string; hint?: string };
  const message = error instanceof Error ? error.message : databaseError.message || fallback;
  const status = databaseError.code === "23505" ? 409 : 500;
  return NextResponse.json({ error: message, details: databaseError.details, hint: databaseError.hint }, { status });
}

function normalizeCustomFieldName(value: string) {
  return value
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_]/g, "")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function parseCustomFields(value: unknown) {
  if (!Array.isArray(value)) return [];
  const validFields = value
    .map((item) => {
      if (typeof item !== "object" || item === null || Array.isArray(item)) return null;
      const name = text((item as Record<string, unknown>).name);
      const label = text((item as Record<string, unknown>).label) || name;
      if (!name) return null;
      const normalized = normalizeCustomFieldName(name) || normalizeCustomFieldName(label);
      if (!normalized) return null;
      const aliasValues = Array.isArray((item as Record<string, unknown>).aliases)
        ? ((item as Record<string, unknown>).aliases as unknown[])
        : [];
      const aliases = aliasValues
        .filter((alias): alias is string => typeof alias === "string")
        .map((alias: string) => alias.trim())
        .filter(Boolean)
        .map((alias: string) => normalizeCustomFieldName(alias))
        .filter(Boolean);
      return {
        name: normalized,
        label,
        aliases: Array.from(new Set([normalized, ...aliases])),
      };
    })
    .filter((field): field is { name: string; label: string; aliases: string[] } => Boolean(field));
  return validFields.slice(0, 50);
}

function parseWebsite(body: Record<string, unknown>) {
  const name = text(body.name);
  const websiteUrl = text(body.website_url);
  const technology = text(body.technology) || "other";
  const hostingProvider = text(body.hosting_provider) || "other";
  const status = text(body.status) || "active";
  const customFields = parseCustomFields(body.custom_fields);
  if (!name || !websiteUrl) throw new Error("Website name and URL are required.");
  try {
    const parsed = new URL(websiteUrl);
    if (!["http:", "https:"].includes(parsed.protocol)) throw new Error();
  } catch {
    throw new Error("Website URL must be a valid HTTP or HTTPS URL.");
  }
  if (!technologies.includes(technology)) throw new Error("Choose a valid website technology.");
  if (!hostingProviders.includes(hostingProvider)) throw new Error("Choose a valid hosting provider.");
  if (!statuses.includes(status)) throw new Error("Choose a valid website status.");
  return { name, website_url: websiteUrl, technology, hosting_provider: hostingProvider, status, custom_fields: customFields };
}

export async function GET(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });
    const companyId = Number(new URL(request.url).searchParams.get("company_id"));
    if (!Number.isInteger(companyId) || companyId <= 0) return NextResponse.json({ error: "A valid company is required." }, { status: 400 });
    const { data, error } = await client.from("crm_websites").select("*, crm_website_integrations(id, integration_name, public_identifier, is_allowed, last_received_at, created_at)").eq("company_id", companyId).order("name");
    if (error) throw error;
    return NextResponse.json({ websites: data ?? [] });
  } catch (error) {
    return errorResponse(error, "Could not load CRM websites.");
  }
}

export async function POST(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const companyId = Number(body.company_id);
    if (!Number.isInteger(companyId) || companyId <= 0) return NextResponse.json({ error: "A valid company is required." }, { status: 400 });
    const { data: company, error: companyError } = await client.from("crm_companies").select("id").eq("id", companyId).maybeSingle();
    if (companyError) throw companyError;
    if (!company) return NextResponse.json({ error: "CRM company not found." }, { status: 404 });
    const { data, error } = await client.from("crm_websites").insert({ company_id: companyId, ...parseWebsite(body) }).select().single();
    if (error) throw error;
    return NextResponse.json({ website: data }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Could not create CRM website.");
  }
}

export async function PATCH(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });
    const body = await request.json() as Record<string, unknown>;
    const websiteId = Number(body.id);
    if (!Number.isInteger(websiteId) || websiteId <= 0) return NextResponse.json({ error: "A valid website is required." }, { status: 400 });
    const { data, error } = await client.from("crm_websites").update({ ...parseWebsite(body), updated_at: new Date().toISOString() }).eq("id", websiteId).select().single();
    if (error) throw error;
    return NextResponse.json({ website: data });
  } catch (error) {
    return errorResponse(error, "Could not update CRM website.");
  }
}

export async function DELETE(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });
    const websiteId = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(websiteId) || websiteId <= 0) return NextResponse.json({ error: "A valid website is required." }, { status: 400 });
    const { error } = await client.from("crm_websites").delete().eq("id", websiteId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Could not delete CRM website.");
  }
}