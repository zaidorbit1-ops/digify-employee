import { NextResponse } from "next/server";
import { getCrmAdminClient } from "@/lib/crm-admin";

function fail(error: unknown, fallback: string, status = 500) {
  const value = error as { message?: string };
  return NextResponse.json({ error: error instanceof Error ? error.message : value.message ?? fallback }, { status });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return fail(authError, authError, 403);
    const id = Number((await context.params).id);
    const body = await request.json() as Record<string, unknown>;
    const email = String(body.email ?? "").trim().toLowerCase();
    const fullName = String(body.full_name ?? body.name ?? "").trim();
    if (!Number.isInteger(id) || !fullName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("A valid contact name and email are required.", "A valid contact name and email are required.", 400);
    const { data, error } = await client.from("crm_contacts").update({ full_name: fullName, first_name: fullName.split(/\s+/)[0], last_name: fullName.split(/\s+/).slice(1).join(" ") || null, email, normalized_email: email, phone: String(body.phone ?? "").trim() || null, status: String(body.status ?? "active"), source: String(body.source ?? "manual"), updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) return fail(error, "Could not update contact.", error.code === "23505" ? 409 : 500);
    return NextResponse.json({ contact: data });
  } catch (error) {
    return fail(error, "Could not update contact.");
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
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
}