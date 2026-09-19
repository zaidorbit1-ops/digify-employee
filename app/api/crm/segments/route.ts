import { NextResponse } from "next/server";
import { getCrmAdminClient } from "@/lib/crm-admin";

const fields = ["first_name", "last_name", "email", "status", "source"] as const;
const operators = ["equals", "not_equals", "contains", "starts_with"] as const;
type Rule = { field: string; operator: string; value: string };

function fail(error: unknown, fallback: string, status = 500) {
  const value = error as { message?: string; code?: string };
  return NextResponse.json({ error: error instanceof Error ? error.message : value.message ?? fallback }, { status: value.code === "23505" ? 409 : status });
}
function text(value: unknown, max = 255) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }
function parse(body: Record<string, unknown>) {
  const companyId = Number(body.company_id); const name = text(body.name, 150); const description = text(body.description, 500); const rawRules = Array.isArray(body.rules) ? body.rules : [];
  if (!Number.isInteger(companyId) || companyId <= 0) throw new Error("A valid company is required.");
  if (!name) throw new Error("Segment name is required.");
  if (rawRules.length > 10) throw new Error("A segment can have up to 10 rules.");
  const rules = rawRules.map((raw) => { const item = raw as Rule; const field = text(item.field, 50); const operator = text(item.operator, 50); const value = text(item.value, 255); if (!fields.includes(field as (typeof fields)[number])) throw new Error("Choose a valid segment field."); if (!operators.includes(operator as (typeof operators)[number])) throw new Error("Choose a valid segment operator."); if (!value) throw new Error("Every segment rule needs a value."); return { field, operator, value }; });
  return { company_id: companyId, name, description: description || null, rules };
}

export async function GET(request: Request) {
  try { const { client, error: authError } = await getCrmAdminClient(); if (authError) return fail(authError, authError, 403); const companyId = Number(new URL(request.url).searchParams.get("company_id")); let query = client.from("crm_segments").select("*").order("updated_at", { ascending: false }); if (companyId) query = query.eq("company_id", companyId); const { data, error } = await query; if (error) throw error; return NextResponse.json({ segments: data ?? [] }); } catch (error) { return fail(error, "Could not load segments."); }
}
export async function POST(request: Request) {
  try { const { client, error: authError } = await getCrmAdminClient(); if (authError) return fail(authError, authError, 403); const values = parse(await request.json() as Record<string, unknown>); const { data, error } = await client.from("crm_segments").insert(values).select().single(); if (error) throw error; return NextResponse.json({ segment: data }, { status: 201 }); } catch (error) { return fail(error, "Could not create segment.", 400); }
}
export async function PATCH(request: Request) {
  try { const { client, error: authError } = await getCrmAdminClient(); if (authError) return fail(authError, authError, 403); const body = await request.json() as Record<string, unknown>; const id = Number(body.id); if (!Number.isInteger(id) || id <= 0) return fail("A valid segment is required.", "A valid segment is required.", 400); const values = parse(body); const { data, error } = await client.from("crm_segments").update({ ...values, updated_at: new Date().toISOString() }).eq("id", id).select().single(); if (error) throw error; return NextResponse.json({ segment: data }); } catch (error) { return fail(error, "Could not update segment.", 400); }
}
export async function DELETE(request: Request) {
  try { const { client, error: authError } = await getCrmAdminClient(); if (authError) return fail(authError, authError, 403); const id = Number(new URL(request.url).searchParams.get("id")); if (!Number.isInteger(id) || id <= 0) return fail("A valid segment is required.", "A valid segment is required.", 400); const { error } = await client.from("crm_segments").delete().eq("id", id); if (error) throw error; return NextResponse.json({ ok: true }); } catch (error) { return fail(error, "Could not delete segment."); }
}
