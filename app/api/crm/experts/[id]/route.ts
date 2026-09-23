import { NextResponse } from "next/server";
import { hashExpertPassword } from "@/lib/crm-expert-crypto";
import { getCrmAdminContext } from "@/lib/crm-admin";

function fail(error: unknown, fallback: string, status = 500) {
  const value = error as { message?: string; code?: string };
  return NextResponse.json({ error: error instanceof Error ? error.message : value.message ?? fallback }, { status });
}

const fields = "id, name, email, service_area, status, created_at, updated_at, deleted_at";

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { client, user, error: authError } = await getCrmAdminContext();
    if (authError || !user) return fail(authError, authError ?? "Superadmin access required.", 403);
    const id = Number((await context.params).id);
    const body = await request.json() as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase() || null;
    if (!Number.isInteger(id) || id <= 0 || !name) return fail("A valid expert and name are required.", "A valid expert and name are required.", 400);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Expert email is invalid.", "Expert email is invalid.", 400);
    const update: Record<string, unknown> = { name: name.slice(0, 255), email, service_area: String(body.service_area ?? "").trim().slice(0, 150) || null, status: ["active", "inactive", "archived"].includes(String(body.status)) ? String(body.status) : "active", updated_by: user.id, updated_at: new Date().toISOString() };
    const password = String(body.password ?? "");
    if (password) {
      if (password.length < 8) return fail("Expert password must be at least 8 characters.", "Expert password must be at least 8 characters.", 400);
      update.password_hash = hashExpertPassword(password);
    }
    const { data, error } = await client.from("crm_experts").update(update).eq("id", id).is("deleted_at", null).select(fields).single();
    if (error) return fail(error, "Could not update expert.", error.code === "23505" ? 409 : 500);
    return NextResponse.json({ expert: data });
  } catch (error) {
    return fail(error, "Could not update expert.");
  }
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { client, user, error: authError } = await getCrmAdminContext();
    if (authError || !user) return fail(authError, authError ?? "Superadmin access required.", 403);
    const id = Number((await context.params).id);
    if (!Number.isInteger(id) || id <= 0) return fail("A valid expert is required.", "A valid expert is required.", 400);
    const { data, error } = await client.from("crm_experts").update({ status: "inactive", deleted_at: new Date().toISOString(), updated_by: user.id, updated_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null).select(fields).single();
    if (error) throw error;
    return NextResponse.json({ expert: data });
  } catch (error) {
    return fail(error, "Could not deactivate expert.");
  }
}