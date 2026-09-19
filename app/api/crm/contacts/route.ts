import { NextResponse } from "next/server";
import { getCrmAdminClient } from "@/lib/crm-admin";

function fail(error: unknown, fallback: string, status = 500) {
  const value = error as { message?: string };
  return NextResponse.json({ error: error instanceof Error ? error.message : value.message ?? fallback }, { status });
}

function text(value: unknown, max = 255) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function contactValues(body: Record<string, unknown>) {
  const email = text(body.email, 320).toLowerCase();
  const fullName = text(body.full_name ?? body.name, 255);
  if (!fullName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("A valid contact name and email are required.");
  const parts = fullName.split(/\s+/);
  return { first_name: text(body.first_name, 120) || parts[0], last_name: text(body.last_name, 120) || parts.slice(1).join(" ") || null, full_name: fullName, email, normalized_email: email, phone: text(body.phone, 80) || null, status: text(body.status, 30) || "active", source: text(body.source, 100) || "manual", custom_data: typeof body.custom_data === "object" && body.custom_data && !Array.isArray(body.custom_data) ? body.custom_data : {} };
}

async function syncTags(client: Awaited<ReturnType<typeof getCrmAdminClient>>["client"], companyId: number, contactId: number, tags: unknown) {
  if (!Array.isArray(tags)) return;
  for (const rawTag of tags) {
    const name = text(rawTag, 100);
    if (!name) continue;
    const { data: tag, error: tagError } = await client.from("crm_contact_tags").upsert({ company_id: companyId, name }, { onConflict: "company_id,name" }).select().single();
    if (tagError) throw tagError;
    const { error: linkError } = await client.from("crm_contact_tag_links").upsert({ contact_id: contactId, tag_id: tag.id });
    if (linkError) throw linkError;
  }
}

export async function GET(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return fail(authError, authError, 403);
    const params = new URL(request.url).searchParams;
    let query = client.from("crm_contacts").select("*, crm_contact_tag_links(crm_contact_tags(id, name))").order("created_at", { ascending: false });
    if (params.get("company_id")) query = query.eq("company_id", Number(params.get("company_id")));
    if (params.get("status")) query = query.eq("status", params.get("status"));
    if (params.get("search")) {
      const search = params.get("search");
      query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
    }
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ contacts: data ?? [] });
  } catch (error) {
    return fail(error, "Could not load contacts.");
  }
}

export async function POST(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return fail(authError, authError, 403);
    const body = await request.json() as Record<string, unknown>;
    const companyId = Number(body.company_id);
    if (!Number.isInteger(companyId) || companyId <= 0) return fail("A valid company is required.", "A valid company is required.", 400);
    const { data, error } = await client.from("crm_contacts").insert({ company_id: companyId, ...contactValues(body) }).select().single();
    if (error) return fail(error, "Could not create contact.", error.code === "23505" ? 409 : 500);
    await syncTags(client, companyId, data.id, body.tags);
    return NextResponse.json({ contact: data }, { status: 201 });
  } catch (error) {
    return fail(error, "Could not create contact.");
  }
}