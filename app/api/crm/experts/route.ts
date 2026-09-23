import { NextResponse } from "next/server";
import { hashExpertPassword } from "@/lib/crm-expert-crypto";
import { getCrmAdminContext } from "@/lib/crm-admin";

function fail(error: unknown, fallback: string, status = 500) {
  const value = error as { message?: string; code?: string };
  return NextResponse.json({ error: error instanceof Error ? error.message : value.message ?? fallback }, { status });
}

function publicFields() {
  return "id, name, email, service_area, status, created_at, updated_at, deleted_at";
}

export async function GET(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminContext();
    if (authError) return fail(authError, authError, 403);
    const params = new URL(request.url).searchParams;
    let query = client.from("crm_experts").select(publicFields()).is("deleted_at", null).order("name");
    if (params.get("status")) query = query.eq("status", params.get("status"));
    if (params.get("search")?.trim()) {
      const search = params.get("search")!.trim();
      query = query.or(`name.ilike.%${search}%,email.ilike.%${search}%,service_area.ilike.%${search}%`);
    }
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ experts: data ?? [] });
  } catch (error) {
    return fail(error, "Could not load experts.");
  }
}

export async function POST(request: Request) {
  try {
    const { client, user, error: authError } = await getCrmAdminContext();
    if (authError || !user) return fail(authError, authError ?? "Superadmin access required.", 403);
    const body = await request.json() as Record<string, unknown>;
    const name = String(body.name ?? "").trim();
    const email = String(body.email ?? "").trim().toLowerCase() || null;
    const password = String(body.password ?? "");
    if (!name) return fail("Expert name is required.", "Expert name is required.", 400);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Expert email is invalid.", "Expert email is invalid.", 400);
    if (password && password.length < 8) return fail("Expert password must be at least 8 characters.", "Expert password must be at least 8 characters.", 400);
    const { data, error } = await client.from("crm_experts").insert({ name: name.slice(0, 255), email, password_hash: password ? hashExpertPassword(password) : null, service_area: String(body.service_area ?? "").trim().slice(0, 150) || null, created_by: user.id, updated_by: user.id }).select(publicFields()).single();
    if (error) return fail(error, "Could not create expert.", error.code === "23505" ? 409 : 500);
    return NextResponse.json({ expert: data }, { status: 201 });
  } catch (error) {
    return fail(error, "Could not create expert.");
  }
}