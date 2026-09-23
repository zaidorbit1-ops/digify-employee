import { randomInt } from "node:crypto";
import { NextResponse } from "next/server";
import { getCrmAdminContext } from "@/lib/crm-admin";

const orderFields = "id, public_order_id, lead_id, expert_id, service_name, service_charges, service_deadline, is_writing, word_count, subject_area, status, created_by, completed_by, created_at, updated_at, completed_at, crm_leads(id, name, email, phone, company_id, deleted_at, crm_companies(name), crm_websites(name, website_url)), crm_experts(id, name, email, service_area, status)";

function fail(error: unknown, fallback: string, status = 500) {
  const value = error as { message?: string; code?: string };
  return NextResponse.json({ error: error instanceof Error ? error.message : value.message ?? fallback }, { status });
}

function parseOrderBody(body: Record<string, unknown>) {
  const leadId = Number(body.lead_id);
  const expertId = Number(body.expert_id);
  const serviceName = String(body.service_name ?? "").trim();
  const chargesValue = String(body.service_charges ?? "").trim();
  const charges = chargesValue ? Number(chargesValue) : null;
  const deadline = String(body.service_deadline ?? "").trim();
  const isWriting = body.is_writing === true || body.is_writing === "true";
  const wordCount = body.word_count === undefined || body.word_count === "" ? null : Number(body.word_count);
  const subjectArea = String(body.subject_area ?? "").trim() || null;
  if (!Number.isInteger(leadId) || leadId <= 0 || !Number.isInteger(expertId) || expertId <= 0) throw new Error("A valid lead and expert are required.");
  if (!serviceName) throw new Error("Service name is required.");
  if (charges !== null && (!Number.isFinite(charges) || charges < 0)) throw new Error("Service charges must be a non-negative number.");
  if (!deadline || Number.isNaN(new Date(deadline).getTime())) throw new Error("A valid service deadline is required.");
  if (wordCount !== null && (!Number.isInteger(wordCount) || wordCount < 0)) throw new Error("Word count must be a non-negative whole number.");
  return { leadId, expertId, serviceName: serviceName.slice(0, 255), charges, deadline: new Date(deadline).toISOString(), isWriting, wordCount, subjectArea: subjectArea?.slice(0, 255) ?? null };
}

async function generateOrderId(client: Awaited<ReturnType<typeof getCrmAdminContext>>["client"]) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const candidate = String(randomInt(1000, 10000));
    const { data, error } = await client.from("crm_orders").select("id").eq("public_order_id", candidate).maybeSingle();
    if (error) throw error;
    if (!data) return candidate;
  }
  throw new Error("Could not generate a unique order ID. Please try again.");
}

export async function GET(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminContext();
    if (authError) return fail(authError, authError, 403);
    const params = new URL(request.url).searchParams;
    let query = client.from("crm_orders").select(orderFields).order("created_at", { ascending: false });
    if (params.get("lead_id")) query = query.eq("lead_id", Number(params.get("lead_id")));
    if (params.get("expert_id")) query = query.eq("expert_id", Number(params.get("expert_id")));
    if (params.get("status")) query = query.eq("status", params.get("status"));
    if (params.get("search")?.trim()) query = query.ilike("public_order_id", `%${params.get("search")!.trim()}%`);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ orders: data ?? [] });
  } catch (error) {
    return fail(error, "Could not load orders.");
  }
}

export async function POST(request: Request) {
  try {
    const { client, user, error: authError } = await getCrmAdminContext();
    if (authError || !user) return fail(authError, authError ?? "Superadmin access required.", 403);
    const body = await request.json() as Record<string, unknown>;
    let parsed: ReturnType<typeof parseOrderBody>;
    try { parsed = parseOrderBody(body); } catch (error) { return fail(error, "Order data is invalid.", 400); }
    const { data: lead, error: leadError } = await client.from("crm_leads").select("id, company_id, deleted_at").eq("id", parsed.leadId).maybeSingle();
    if (leadError) throw leadError;
    if (!lead) return fail("Lead not found.", "Lead not found.", 404);
    if (lead.deleted_at) return fail("Orders cannot be created for a lead in Trash.", "Orders cannot be created for a lead in Trash.", 409);
    const { data: expert, error: expertError } = await client.from("crm_experts").select("id, status, deleted_at").eq("id", parsed.expertId).maybeSingle();
    if (expertError) throw expertError;
    if (!expert || expert.status !== "active" || expert.deleted_at) return fail("Expert is not active or does not exist.", "Expert is not active or does not exist.", 400);
    let publicOrderId = "";
    let data: Record<string, unknown> | null = null;
    let error: { message?: string; code?: string } | null = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      publicOrderId = await generateOrderId(client);
      const inserted = await client.from("crm_orders").insert({ public_order_id: publicOrderId, lead_id: parsed.leadId, expert_id: parsed.expertId, service_name: parsed.serviceName, service_charges: parsed.charges === null ? null : parsed.charges.toFixed(2), service_deadline: parsed.deadline, is_writing: parsed.isWriting, word_count: parsed.wordCount, subject_area: parsed.subjectArea, status: "pending", created_by: user.id }).select(orderFields).single();
      data = inserted.data as Record<string, unknown> | null;
      error = inserted.error;
      if (!error) break;
      if (error.code !== "23505") break;
    }
    if (error || !data) return fail(error, "Could not create order.", 500);
    await client.from("crm_order_events").insert({ order_id: data.id, actor_id: user.id, event_type: "order_created", event_data: { public_order_id: publicOrderId, service_name: parsed.serviceName } });
    return NextResponse.json({ order: data }, { status: 201 });
  } catch (error) {
    return fail(error, "Could not create order.");
  }
}