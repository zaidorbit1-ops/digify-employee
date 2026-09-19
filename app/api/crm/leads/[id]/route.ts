import { NextResponse } from "next/server";
import { getCrmAdminClient } from "@/lib/crm-admin";

const statuses = ["new", "contacted", "qualified", "converted", "lost"];

function fail(error: unknown, fallback: string, status = 500) {
  const value = error as { message?: string };
  return NextResponse.json({ error: error instanceof Error ? error.message : value.message ?? fallback }, { status });
}

async function getLead(client: Awaited<ReturnType<typeof getCrmAdminClient>>["client"], id: number) {
  const { data, error } = await client.from("crm_leads").select("*, crm_websites(name, website_url), crm_contacts(id, full_name, email), crm_contact_timeline(*)").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return fail(authError, authError, 403);
    const id = Number((await context.params).id);
    if (!Number.isInteger(id) || id <= 0) return fail("A valid lead is required.", "A valid lead is required.", 400);
    const lead = await getLead(client, id);
    if (!lead) return fail("Lead not found.", "Lead not found.", 404);
    return NextResponse.json({ lead });
  } catch (error) {
    return fail(error, "Could not load lead.");
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return fail(authError, authError, 403);
    const id = Number((await context.params).id);
    const body = await request.json() as { status?: string };
    if (!Number.isInteger(id) || !statuses.includes(body.status ?? "")) return fail("Choose a valid lead status.", "Choose a valid lead status.", 400);
    const { data, error } = await client.from("crm_leads").update({ status: body.status, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) throw error;
    return NextResponse.json({ lead: data });
  } catch (error) {
    return fail(error, "Could not update lead.");
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return fail(authError, authError, 403);
    const id = Number((await context.params).id);
    const body = await request.json() as { action?: string; note?: string };
    const lead = await getLead(client, id);
    if (!lead) return fail("Lead not found.", "Lead not found.", 404);
    if (body.action === "note") {
      const note = body.note?.trim();
      if (!note) return fail("Note is required.", "Note is required.", 400);
      const customData = lead.custom_data && typeof lead.custom_data === "object" ? lead.custom_data as Record<string, unknown> : {};
      const notes = Array.isArray(customData.notes) ? customData.notes : [];
      const nextData = { ...customData, notes: [...notes, { text: note, created_at: new Date().toISOString() }] };
      const { data, error } = await client.from("crm_leads").update({ custom_data: nextData, updated_at: new Date().toISOString() }).eq("id", id).select().single();
      if (error) throw error;
      return NextResponse.json({ lead: data });
    }
    if (body.action === "convert") {
      const normalizedEmail = String(lead.normalized_email ?? lead.email).toLowerCase().trim();
      let { data: contact, error: contactError } = await client.from("crm_contacts").select("*").eq("company_id", lead.company_id).eq("normalized_email", normalizedEmail).maybeSingle();
      if (contactError) throw contactError;
      const alreadyExistingContact = Boolean(contact);
      if (!contact) {
        const parts = lead.name.trim().split(/\s+/);
        const { data: created, error } = await client.from("crm_contacts").insert({ company_id: lead.company_id, first_name: parts[0] ?? null, last_name: parts.slice(1).join(" ") || null, full_name: lead.name, email: lead.email, normalized_email: normalizedEmail, phone: lead.phone, source: "website lead", custom_data: lead.custom_data ?? {} }).select().single();
        if (error) throw error;
        contact = created;
      }
      const { data: updatedLead, error: leadError } = await client.from("crm_leads").update({ converted_contact_id: contact.id, status: "converted", updated_at: new Date().toISOString() }).eq("id", id).select().single();
      if (leadError) throw leadError;
      const { error: timelineError } = await client.from("crm_contact_timeline").insert({ company_id: lead.company_id, contact_id: contact.id, lead_id: lead.id, event_type: "lead_converted", event_data: { lead_id: lead.id, lead_name: lead.name } });
      if (timelineError) throw timelineError;
      return NextResponse.json({ lead: updatedLead, contact, already_existing: alreadyExistingContact || Boolean(lead.converted_contact_id) });
    }
    return fail("Unsupported lead action.", "Unsupported lead action.", 400);
  } catch (error) {
    return fail(error, "Could not update lead.");
  }
}