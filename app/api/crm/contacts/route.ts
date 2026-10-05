import { NextResponse } from "next/server";
import { getCrmAdminClient } from "@/lib/crm-admin";
import { withCrmApiLogging } from "@/lib/crm-logs";

function fail(error: unknown, fallback: string, status = 500) {
  const value = error as { message?: string };
  return NextResponse.json({ error: error instanceof Error ? error.message : value.message ?? fallback }, { status });
}

function text(value: unknown, max = 255) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function contactValues(body: Record<string, unknown>) {
  const email = text(body.email, 320).toLowerCase();
  const fullName = text(body.full_name ?? body.name, 255);
  if (!fullName || !email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("A valid contact name and email are required.");
  const parts = fullName.split(/\s+/);
  return { first_name: text(body.first_name, 120) || parts[0], last_name: text(body.last_name, 120) || parts.slice(1).join(" ") || null, full_name: fullName, email, normalized_email: email, phone: text(body.phone, 80) || null, status: text(body.status, 30) || "active", source: text(body.source, 100) || "manual", custom_data: typeof body.custom_data === "object" && body.custom_data && !Array.isArray(body.custom_data) ? body.custom_data : {} };
}

async function syncTags(client: Awaited<ReturnType<typeof getCrmAdminClient>>["client"], companyId: number, contactId: number, tags: unknown) {
  if (!Array.isArray(tags)) return;
  for (const rawTag of tags) {
    const name = text(rawTag, 100);
    if (!name) continue;
    const { data: tag, error: tagError } = await client.from("crm_contact_tags").upsert({ company_id: companyId, name }, { onConflict: "company_id,name" }).select().single();
    if (tagError) throw tagError;
    const { error: linkError } = await client.from("crm_contact_tag_links").upsert({ contact_id: contactId, tag_id: tag.id });
    if (linkError) throw linkError;
  }
}

export async function GET(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return fail(authError, authError, 403);
    const params = new URL(request.url).searchParams;
    const companyId = Number(params.get("company_id"));
    const listId = Number(params.get("contact_list_id"));
    let contactIds: number[] | null = null;
    if (Number.isInteger(listId) && listId > 0) {
      const { data: list, error: listError } = await client.from("crm_contact_lists").select("id, company_id").eq("id", listId).maybeSingle();
      if (listError) throw listError;
      if (!list || (Number.isInteger(companyId) && companyId > 0 && list.company_id !== companyId)) return fail("The selected contact list is not available for this company.", "Contact list is not available.", 403);
      const { data: members, error: memberError } = await client.from("crm_contact_list_members").select("contact_id").eq("contact_list_id", listId);
      if (memberError) throw memberError;
      contactIds = (members ?? []).map((member) => member.contact_id);
      if (!contactIds.length) return NextResponse.json({ contacts: [] });
    }
    let query = client.from("crm_contacts").select("*, crm_contact_tag_links(crm_contact_tags(id, name)), crm_contact_list_members(contact_list_id)").order("created_at", { ascending: false });
    if (Number.isInteger(companyId) && companyId > 0) query = query.eq("company_id", companyId);
    if (contactIds) query = query.in("id", contactIds);
    if (params.get("status")) query = query.eq("status", params.get("status"));
    else if (params.get("exclude_archived") === "true") query = query.neq("status", "archived");
    if (params.get("search")) {
      const search = params.get("search");
      query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
    }
    const { data, error } = await query;
    if (error) throw error;
    const contacts = data ?? [];
    const ids = contacts.map((contact) => contact.id);
    const { data: campaignContacts, error: campaignError } = ids.length
      ? await client.from("crm_campaign_contacts").select("contact_id, campaign_id, status, created_at, crm_campaigns(name), crm_campaign_messages(status, sent_at)").in("contact_id", ids).order("created_at", { ascending: false })
      : { data: [], error: null };
    if (campaignError) throw campaignError;
    const campaignsByContact = new Map<number, Array<{ campaign_id: number; name: string; status: string; sent_at: string | null }>>();
    for (const item of campaignContacts ?? []) {
      const campaign = item.crm_campaigns as { name?: string } | null;
      const messages = item.crm_campaign_messages as Array<{ status: string; sent_at: string | null }> | null;
      const newestMessage = messages?.find((message) => message.sent_at || ["sent", "delivered", "opened", "clicked", "replied"].includes(message.status));
      campaignsByContact.set(item.contact_id, [
        ...(campaignsByContact.get(item.contact_id) ?? []),
        {
          campaign_id: item.campaign_id,
          name: campaign?.name ?? "Campaign",
          status: newestMessage?.status ?? item.status,
          sent_at: newestMessage?.sent_at ?? null,
        },
      ]);
    }
    return NextResponse.json({ contacts: contacts.map((contact) => ({ ...contact, campaigns: campaignsByContact.get(contact.id) ?? [] })) });
  } catch (error) {
    return fail(error, "Could not load contacts.");
  }
}

export const POST = withCrmApiLogging(async function POST(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return fail(authError, authError, 403);
    const body = await request.json() as Record<string, unknown>;
    const companyId = Number(body.company_id);
    if (!Number.isInteger(companyId) || companyId <= 0) return fail("A valid company is required.", "A valid company is required.", 400);
    const contactListId = Number(body.contact_list_id);
    if (!Number.isInteger(contactListId) || contactListId <= 0) return fail("Choose a contact list before adding a contact.", "A contact list is required.", 400);
    const { data: list, error: listError } = await client.from("crm_contact_lists").select("id").eq("id", contactListId).eq("company_id", companyId).maybeSingle();
    if (listError) throw listError;
    if (!list) return fail("The selected contact list does not belong to this company.", "Contact list is not available.", 400);
    const { data, error } = await client.from("crm_contacts").insert({ company_id: companyId, ...contactValues(body) }).select().single();
    if (error) return fail(error, "Could not create contact.", error.code === "23505" ? 409 : 500);
    const { error: membershipError } = await client.from("crm_contact_list_members").insert({ contact_list_id: contactListId, contact_id: data.id });
    if (membershipError) {
      await client.from("crm_contacts").delete().eq("id", data.id);
      return fail(membershipError, "Could not add contact to the selected list.");
    }
    await syncTags(client, companyId, data.id, body.tags);
    return NextResponse.json({ contact: data }, { status: 201 });
  } catch (error) {
    return fail(error, "Could not create contact.");
  }
});