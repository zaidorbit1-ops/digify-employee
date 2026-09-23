import { NextResponse } from "next/server";
import { getCrmAdminContext } from "@/lib/crm-admin";

const orderFields = "id, public_order_id, lead_id, expert_id, service_name, service_charges, service_deadline, is_writing, word_count, subject_area, status, created_by, completed_by, created_at, updated_at, completed_at, crm_leads(id, name, email, phone, company_id, deleted_at, crm_companies(name), crm_websites(name, website_url)), crm_experts(id, name, email, service_area, status)";
const statuses = ["pending", "in_progress", "completed", "cancelled"];

function fail(error: unknown, fallback: string, status = 500) {
  const value = error as { message?: string };
  return NextResponse.json({ error: error instanceof Error ? error.message : value.message ?? fallback }, { status });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { client, error: authError } = await getCrmAdminContext();
    if (authError) return fail(authError, authError, 403);
    const id = Number((await context.params).id);
    const { data, error } = await client.from("crm_orders").select(orderFields).eq("id", id).maybeSingle();
    if (error) throw error;
    if (!data) return fail("Order not found.", "Order not found.", 404);
    const [{ data: notes }, { data: events }] = await Promise.all([
      client.from("crm_order_notes").select("*").eq("order_id", id).order("created_at", { ascending: false }),
      client.from("crm_order_events").select("*").eq("order_id", id).order("created_at", { ascending: true }),
    ]);
    const authorIds = Array.from(new Set((notes ?? []).map((note) => note.author_id).filter(Boolean)));
    const { data: profiles } = authorIds.length ? await client.from("profiles").select("user_id, full_name, role").in("user_id", authorIds) : { data: [] };
    const profileMap = new Map((profiles ?? []).map((profile) => [profile.user_id, profile.full_name || (profile.role === "employee" ? "Employee" : "Admin")]));
    const notesWithAuthors = (notes ?? []).map((note) => { const authorName = note.author_id ? profileMap.get(note.author_id) || "Author not recorded" : "Author not recorded"; return { ...note, note: `[${authorName}] ${note.note}`, author_name: authorName }; });
    return NextResponse.json({ order: data, notes: notesWithAuthors, events: events ?? [] });
  } catch (error) {
    return fail(error, "Could not load order.");
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { client, user, error: authError } = await getCrmAdminContext();
    if (authError || !user) return fail(authError, authError ?? "Superadmin access required.", 403);
    const id = Number((await context.params).id);
    const body = await request.json() as { status?: string; service_name?: string; service_charges?: number; service_deadline?: string; expert_id?: number };
    const update: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.status !== undefined) {
      if (!statuses.includes(body.status)) return fail("Choose a valid order status.", "Choose a valid order status.", 400);
      update.status = body.status;
      if (body.status === "completed") { update.completed_at = new Date().toISOString(); update.completed_by = user.id; }
      if (body.status !== "completed") { update.completed_at = null; update.completed_by = null; }
    }
    if (body.service_name !== undefined) { const value = body.service_name.trim(); if (!value) return fail("Service name is required.", "Service name is required.", 400); update.service_name = value.slice(0, 255); }
    if (body.service_charges !== undefined) { if (!Number.isFinite(Number(body.service_charges)) || Number(body.service_charges) < 0) return fail("Service charges are invalid.", "Service charges are invalid.", 400); update.service_charges = Number(body.service_charges).toFixed(2); }
    if (body.service_deadline !== undefined) { if (Number.isNaN(new Date(body.service_deadline).getTime())) return fail("Service deadline is invalid.", "Service deadline is invalid.", 400); update.service_deadline = new Date(body.service_deadline).toISOString(); }
    if (body.expert_id !== undefined) {
      const { data: expert } = await client.from("crm_experts").select("id").eq("id", Number(body.expert_id)).eq("status", "active").is("deleted_at", null).maybeSingle();
      if (!expert) return fail("Expert is not active or does not exist.", "Expert is not active or does not exist.", 400);
      update.expert_id = Number(body.expert_id);
    }
    const { data, error } = await client.from("crm_orders").update(update).eq("id", id).select(orderFields).single();
    if (error) throw error;
    await client.from("crm_order_events").insert({ order_id: id, actor_id: user.id, event_type: update.status === "completed" ? "order_completed" : "order_updated", event_data: update });
    return NextResponse.json({ order: data });
  } catch (error) {
    return fail(error, "Could not update order.");
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { client, user, error: authError } = await getCrmAdminContext();
    if (authError || !user) return fail(authError, authError ?? "Superadmin access required.", 403);
    const id = Number((await context.params).id);
    const body = await request.json() as { action?: string; note?: string };
    if (body.action !== "note" || !body.note?.trim()) return fail("A note is required.", "A note is required.", 400);
    const { data, error } = await client.from("crm_order_notes").insert({ order_id: id, author_id: user.id, note: body.note.trim() }).select().single();
    if (error) throw error;
    await client.from("crm_order_events").insert({ order_id: id, actor_id: user.id, event_type: "order_note_added", event_data: { note_id: data.id } });
    return NextResponse.json({ note: data }, { status: 201 });
  } catch (error) {
    return fail(error, "Could not add order note.");
  }
}