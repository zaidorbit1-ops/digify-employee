import { NextResponse } from "next/server";
import { getCrmAdminClient } from "@/lib/crm-admin";
import { withCrmApiLogging } from "@/lib/crm-logs";

function fail(error: unknown, fallback: string, status = 500) {
  const value = error as { message?: string; code?: string };
  return NextResponse.json({ error: error instanceof Error ? error.message : value.message ?? fallback }, { status: value.code === "23505" ? 409 : value.code === "23503" ? 409 : status });
}

function text(value: unknown, max = 500) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function values(body: Record<string, unknown>) {
  const companyId = Number(body.company_id);
  const name = text(body.name, 150);
  if (!Number.isInteger(companyId) || companyId <= 0) throw new Error("A valid company is required.");
  if (!name) throw new Error("Contact list name is required.");
  return { company_id: companyId, name, description: text(body.description, 1000) || null };
}

export async function GET(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return fail(authError, authError, 403);
    const companyId = Number(new URL(request.url).searchParams.get("company_id"));
    let query = client.from("crm_contact_lists").select("*").order("name");
    if (Number.isInteger(companyId) && companyId > 0) query = query.eq("company_id", companyId);
    const { data: lists, error } = await query;
    if (error) throw error;
    const ids = (lists ?? []).map((list) => list.id);
    const { data: memberships, error: membershipError } = ids.length
      ? await client.from("crm_contact_list_members").select("contact_list_id").in("contact_list_id", ids)
      : { data: [], error: null };
    if (membershipError) throw membershipError;
    const counts = new Map<number, number>();
    for (const membership of memberships ?? []) counts.set(membership.contact_list_id, (counts.get(membership.contact_list_id) ?? 0) + 1);
    return NextResponse.json({ lists: (lists ?? []).map((list) => ({ ...list, contact_count: counts.get(list.id) ?? 0 })) });
  } catch (error) { return fail(error, "Could not load contact lists."); }
}

export const POST = withCrmApiLogging(async function POST(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return fail(authError, authError, 403);
    const body = await request.json() as Record<string, unknown>;
    const { data, error } = await client.from("crm_contact_lists").insert(values(body)).select().single();
    if (error) throw error;
    return NextResponse.json({ list: { ...data, contact_count: 0 } }, { status: 201 });
  } catch (error) { return fail(error, "Could not create contact list.", 400); }
});

export const PATCH = withCrmApiLogging(async function PATCH(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return fail(authError, authError, 403);
    const body = await request.json() as Record<string, unknown>;
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return fail("A valid contact list is required.", "A valid contact list is required.", 400);
    const { data, error } = await client.from("crm_contact_lists").update({ ...values(body), updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) throw error;
    return NextResponse.json({ list: data });
  } catch (error) { return fail(error, "Could not update contact list.", 400); }
});

export const DELETE = withCrmApiLogging(async function DELETE(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return fail(authError, authError, 403);
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) return fail("A valid contact list is required.", "A valid contact list is required.", 400);
    const { error: unlinkError } = await client.from("crm_campaigns").update({ contact_list_id: null }).eq("contact_list_id", id);
    if (unlinkError) throw unlinkError;
    const { error } = await client.from("crm_contact_lists").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) { return fail(error, "Could not delete contact list."); }
});
