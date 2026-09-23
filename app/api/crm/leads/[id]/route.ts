import { NextResponse } from "next/server";
import { getCrmAdminContext } from "@/lib/crm-admin";

const statuses = ["new", "contacted", "qualified", "converted", "lost"];

function fail(error: unknown, fallback: string, status = 500) {
  const value = error as { message?: string };
  return NextResponse.json({ error: error instanceof Error ? error.message : value.message ?? fallback }, { status });
}

async function getLead(client: Awaited<ReturnType<typeof getCrmAdminContext>>["client"], id: number) {
  const { data, error } = await client.from("crm_leads").select("*, crm_companies(name), crm_websites(name, website_url), crm_contacts(id, full_name, email), crm_contact_timeline(*)").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { client, error: authError } = await getCrmAdminContext();
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
    const { client, user, error: authError } = await getCrmAdminContext();
    if (authError) return fail(authError, authError, 403);
    const id = Number((await context.params).id);
    const body = await request.json() as Record<string, unknown>;
    if (!Number.isInteger(id) || id <= 0) return fail("A valid lead is required.", "A valid lead is required.", 400);
    const existing = await getLead(client, id);
    if (!existing) return fail("Lead not found.", "Lead not found.", 404);
    if (body.status !== undefined && Object.keys(body).length === 1) {
      if (!statuses.includes(String(body.status))) return fail("Choose a valid lead status.", "Choose a valid lead status.", 400);
    } else {
      const name = String(body.name ?? existing.name).trim();
      const email = String(body.email ?? existing.email).trim().toLowerCase();
      const companyId = Number(body.company_id ?? existing.company_id);
      const websiteId = Number(body.website_id ?? existing.website_id);
      if (!name || !email || !Number.isInteger(companyId) || companyId <= 0 || !Number.isInteger(websiteId) || websiteId <= 0) return fail("Lead name, email, company, and website are required.", "Lead name, email, company, and website are required.", 400);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return fail("Lead email is invalid.", "Lead email is invalid.", 400);
      const sourceUrl = String(body.source_url ?? existing.source_url ?? "").trim();
      if (sourceUrl) {
        try { const parsed = new URL(sourceUrl); if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error(); } catch { return fail("Source URL must be a valid HTTP or HTTPS URL.", "Source URL must be a valid HTTP or HTTPS URL.", 400); }
      }
      const { data: website, error: websiteError } = await client.from("crm_websites").select("id, company_id").eq("id", websiteId).maybeSingle();
      if (websiteError) throw websiteError;
      if (!website || website.company_id !== companyId) return fail("Website does not belong to the selected company.", "Website does not belong to the selected company.", 400);
      const { data: company, error: companyError } = await client.from("crm_companies").select("id").eq("id", companyId).maybeSingle();
      if (companyError) throw companyError;
      if (!company) return fail("CRM company not found.", "CRM company not found.", 404);
      const { data, error } = await client.from("crm_leads").update({
        company_id: companyId,
        website_id: websiteId,
        integration_id: existing.company_id === companyId && existing.website_id === websiteId ? existing.integration_id : null,
        name: name.slice(0, 255),
        email: email.slice(0, 320),
        normalized_email: email.slice(0, 320),
        phone: String(body.phone ?? existing.phone ?? "").trim().slice(0, 80) || null,
        message: String(body.message ?? existing.message ?? "").trim() || null,
        form_name: String(body.form_name ?? existing.form_name ?? "").trim() || null,
        source: String(body.source_name ?? existing.source ?? "manual").trim().slice(0, 100) || "manual",
        source_url: sourceUrl || null,
        custom_data: body.custom_data && typeof body.custom_data === "object" && !Array.isArray(body.custom_data) ? body.custom_data : existing.custom_data ?? {},
        updated_by: user?.id ?? null,
        updated_at: new Date().toISOString(),
      }).eq("id", id).is("deleted_at", null).select().single();
      if (error) throw error;
      await client.from("crm_audit_logs").insert({ company_id: companyId, actor_user_id: user?.id ?? null, action: "lead_updated", entity_type: "crm_lead", entity_id: String(id), after_data: data });
      return NextResponse.json({ lead: data });
    }
    const { data, error } = await client.from("crm_leads").update({ status: String(body.status), updated_by: user?.id ?? null, updated_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null).select().single();
    if (error) throw error;
    await client.from("crm_audit_logs").insert({ company_id: data.company_id, actor_user_id: user?.id ?? null, action: "lead_status_changed", entity_type: "crm_lead", entity_id: String(id), after_data: { status: data.status } });
    return NextResponse.json({ lead: data });
  } catch (error) {
    return fail(error, "Could not update lead.");
  }
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { client, user, error: authError } = await getCrmAdminContext();
    if (authError || !user) return fail(authError, authError ?? "Superadmin access required.", 403);
    const id = Number((await context.params).id);
    const body = await request.json() as { action?: string; note?: string };
    const lead = await getLead(client, id);
    if (!lead) return fail("Lead not found.", "Lead not found.", 404);
    if (body.action === "note") {
      const note = body.note?.trim();
      if (!note) return fail("Note is required.", "Note is required.", 400);
      const customData = lead.custom_data && typeof lead.custom_data === "object" ? lead.custom_data as Record<string, unknown> : {};
      const notes = Array.isArray(customData.notes) ? customData.notes : [];
      const { data: profile } = await client.from("profiles").select("full_name, role").eq("user_id", user.id).maybeSingle();
      const authorName = profile?.full_name || (profile?.role === "employee" ? "Employee" : "Admin");
      const nextData = { ...customData, notes: [...notes, { text: `[${authorName}] ${note}`, created_at: new Date().toISOString(), author_id: user.id, author_name: authorName }] };
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
    if (body.action === "restore") {
      const { data: restored, error } = await client.from("crm_leads").update({ deleted_at: null, deleted_by: null, updated_at: new Date().toISOString() }).eq("id", id).not("deleted_at", "is", null).select().single();
      if (error) throw error;
      return NextResponse.json({ lead: restored });
    }
    if (body.action === "permanent_delete") {
      const { count, error: orderError } = await client.from("crm_orders").select("id", { count: "exact", head: true }).eq("lead_id", id);
      if (orderError) throw orderError;
      if ((count ?? 0) > 0) return fail("This lead has order history and cannot be permanently deleted. Restore or keep it in Trash.", "This lead has order history and cannot be permanently deleted.", 409);
      const { error } = await client.from("crm_leads").delete().eq("id", id).not("deleted_at", "is", null);
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    return fail("Unsupported lead action.", "Unsupported lead action.", 400);
  } catch (error) {
    return fail(error, "Could not update lead.");
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { client, user, error: authError } = await getCrmAdminContext();
    if (authError) return fail(authError, authError, 403);
    const id = Number((await context.params).id);
    if (!Number.isInteger(id) || id <= 0) return fail("A valid lead is required.", "A valid lead is required.", 400);
    const { data, error } = await client.from("crm_leads").update({ deleted_at: new Date().toISOString(), deleted_by: user?.id ?? null, updated_by: user?.id ?? null, updated_at: new Date().toISOString() }).eq("id", id).is("deleted_at", null).select().single();
    if (error) throw error;
    if (!data) return fail("Lead not found or already in Trash.", "Lead not found or already in Trash.", 404);
    await client.from("crm_audit_logs").insert({ company_id: data.company_id, actor_user_id: user?.id ?? null, action: "lead_trashed", entity_type: "crm_lead", entity_id: String(id) });
    return NextResponse.json({ lead: data });
  } catch (error) {
    return fail(error, "Could not move lead to Trash.");
  }
}