import { NextResponse } from "next/server";
import { getCrmAdminClient } from "@/lib/crm-admin";
import { withCrmApiLogging } from "@/lib/crm-logs";

function fail(error: unknown, fallback: string, status = 500) {
  const value = error as { message?: string };
  return NextResponse.json({ error: error instanceof Error ? error.message : value.message ?? fallback }, { status });
}

export const PATCH = withCrmApiLogging(async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return fail(authError, authError, 403);
    const id = Number((await context.params).id);
    const body = await request.json() as Record<string, unknown>;
    const email = String(body.email ?? "").trim().toLowerCase();
    const fullName = String(body.full_name ?? body.name ?? "").trim();
    if (!Number.isInteger(id) || !fullName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("A valid contact name and email are required.", "A valid contact name and email are required.", 400);
    const contactListId = Number(body.contact_list_id);
    if (contactListId) {
      const { data: contact, error: contactError } = await client.from("crm_contacts").select("id, company_id").eq("id", id).maybeSingle();
      if (contactError) throw contactError;
      if (!contact) return fail("Contact was not found.", "Contact was not found.", 404);
      const { data: list, error: listError } = await client.from("crm_contact_lists").select("id").eq("id", contactListId).eq("company_id", contact.company_id).maybeSingle();
      if (listError) throw listError;
      if (!list) return fail("The selected contact list does not belong to this company.", "Contact list is not available.", 400);
    }
    const { data, error } = await client.from("crm_contacts").update({ full_name: fullName, first_name: fullName.split(/\s+/)[0], last_name: fullName.split(/\s+/).slice(1).join(" ") || null, email, normalized_email: email, phone: String(body.phone ?? "").trim() || null, status: String(body.status ?? "active"), source: String(body.source ?? "manual"), updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) return fail(error, "Could not update contact.", error.code === "23505" ? 409 : 500);
    if (contactListId) {
      const { error: membershipError } = await client.from("crm_contact_list_members").upsert({ contact_list_id: contactListId, contact_id: id }, { onConflict: "contact_list_id,contact_id", ignoreDuplicates: true });
      if (membershipError) throw membershipError;
    }
    return NextResponse.json({ contact: data });
  } catch (error) {
    return fail(error, "Could not update contact.");
  }
});

export const POST = withCrmApiLogging(async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return fail(authError, authError, 403);
    const id = Number((await context.params).id);
    const body = await request.json() as { action?: string };
    if (!Number.isInteger(id) || id <= 0) return fail("A valid contact is required.", "A valid contact is required.", 400);
    if (body.action === "restore") {
      const { data, error } = await client.from("crm_contacts").update({ status: "active", updated_at: new Date().toISOString() }).eq("id", id).eq("status", "archived").select("id").maybeSingle();
      if (error) throw error;
      if (!data) return fail("Only archived contacts can be restored.", "Contact is not archived or was not found.", 404);
      return NextResponse.json({ ok: true });
    }
    if (body.action !== "permanent_delete") return fail("Unsupported contact action.", "Unsupported contact action.", 400);
    const { data, error } = await client.from("crm_contacts").delete().eq("id", id).eq("status", "archived").select("id").maybeSingle();
    if (error) throw error;
    if (!data) return fail("Only archived contacts can be permanently deleted.", "Contact is not archived or was not found.", 404);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error, "Could not permanently delete contact.");
  }
});

export const DELETE = withCrmApiLogging(async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return fail(authError, authError, 403);
    const id = Number((await context.params).id);
    if (!Number.isInteger(id) || id <= 0) return fail("A valid contact is required.", "A valid contact is required.", 400);
    const { error } = await client.from("crm_contacts").update({ status: "archived", updated_at: new Date().toISOString() }).eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error, "Could not archive contact.");
  }
});