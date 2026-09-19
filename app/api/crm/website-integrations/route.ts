import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getCrmAdminClient } from "@/lib/crm-admin";

function errorResponse(error: unknown, fallback: string) {
  const databaseError = error as { code?: string; message?: string; details?: string; hint?: string };
  const message = error instanceof Error ? error.message : databaseError.message || fallback;
  const status = databaseError.code === "23505" ? 409 : 500;
  return NextResponse.json({ error: message, details: databaseError.details, hint: databaseError.hint }, { status });
}

export async function POST(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });
    const body = await request.json() as { website_id?: number; integration_name?: string };
    const websiteId = Number(body.website_id);
    const integrationName = String(body.integration_name ?? "Website lead form").trim();
    if (!Number.isInteger(websiteId) || websiteId <= 0 || !integrationName) return NextResponse.json({ error: "Website and integration name are required." }, { status: 400 });
    const { data: website, error: websiteError } = await client.from("crm_websites").select("id, company_id").eq("id", websiteId).maybeSingle();
    if (websiteError) throw websiteError;
    if (!website) return NextResponse.json({ error: "CRM website not found." }, { status: 404 });
    const secret = `crm_${randomBytes(32).toString("hex")}`;
    const publicIdentifier = `site_${randomBytes(12).toString("hex")}`;
    const secretHash = createHash("sha256").update(secret).digest("hex");
    const { data, error } = await client.from("crm_website_integrations").insert({ company_id: website.company_id, website_id: website.id, integration_name: integrationName, public_identifier: publicIdentifier, secret_hash: secretHash }).select("id, company_id, website_id, integration_name, public_identifier, is_allowed, created_at").single();
    if (error) throw error;
    return NextResponse.json({ integration: data, secret }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Could not create website integration.");
  }
}

export async function DELETE(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });
    const integrationId = String(new URL(request.url).searchParams.get("id") ?? "").trim();
    if (!integrationId) return NextResponse.json({ error: "A valid integration is required." }, { status: 400 });
    const { error } = await client.from("crm_website_integrations").delete().eq("id", integrationId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Could not delete website integration.");
  }
}