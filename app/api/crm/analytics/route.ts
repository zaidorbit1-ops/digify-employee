import { NextResponse } from "next/server";
import { getCrmAdminClient } from "@/lib/crm-admin";

function fail(error: unknown, fallback: string, status = 500) {
  const value = error as { message?: string };
  return NextResponse.json({ error: error instanceof Error ? error.message : value.message ?? fallback }, { status });
}

export async function GET(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return fail(authError, authError, 403);
    const params = new URL(request.url).searchParams;
    const companyId = Number(params.get("company_id"));
    const campaignId = Number(params.get("campaign_id"));
    if (!Number.isInteger(companyId) || companyId <= 0) return fail("A valid company is required.", "A valid company is required.", 400);

    let campaignsQuery = client.from("crm_campaigns").select("id, name, status, company_id, created_at, updated_at").eq("company_id", companyId).order("updated_at", { ascending: false });
    if (Number.isInteger(campaignId) && campaignId > 0) campaignsQuery = campaignsQuery.eq("id", campaignId);
    const { data: campaigns, error: campaignsError } = await campaignsQuery;
    if (campaignsError) throw campaignsError;
    const ids = (campaigns ?? []).map((campaign) => campaign.id);
    if (!ids.length) return NextResponse.json({ campaigns: [], summary: { recipients: 0, sent: 0, pending: 0, failed: 0, delivered: 0, bounced: 0, opened: 0, clicked: 0, replied: 0, unsubscribed: 0 }, recipients: [] });

    const [{ data: campaignContacts, error: contactsError }, { data: messages, error: messagesError }] = await Promise.all([
      client.from("crm_campaign_contacts").select("id, campaign_id, contact_id, status, crm_contacts(id, full_name, email)").in("campaign_id", ids),
      client.from("crm_campaign_messages").select("id, campaign_contact_id, status, error_message, sent_at, provider_message_id").in("campaign_contact_id", (await client.from("crm_campaign_contacts").select("id").in("campaign_id", ids)).data?.map((item) => item.id) ?? []),
    ]);
    if (contactsError) throw contactsError;
    if (messagesError) throw messagesError;
    const messageIds = (messages ?? []).map((message) => message.id);
    const { data: events, error: eventsError } = messageIds.length ? await client.from("crm_email_events").select("id, campaign_message_id, event_type, event_time, metadata").in("campaign_message_id", messageIds).order("event_time", { ascending: false }) : { data: [], error: null };
    if (eventsError) throw eventsError;

    const summary = { recipients: campaignContacts?.length ?? 0, sent: 0, pending: 0, failed: 0, delivered: 0, bounced: 0, opened: 0, clicked: 0, replied: 0, unsubscribed: 0 };
    for (const contact of campaignContacts ?? []) {
      if (contact.status === "sent" || contact.status === "delivered") summary.sent += 1;
      if (["queued", "processing"].includes(contact.status)) summary.pending += 1;
      if (contact.status === "failed") summary.failed += 1;
    }
    for (const event of events ?? []) if (event.event_type in summary) summary[event.event_type as keyof typeof summary] += 1;

    const recipients = (campaignContacts ?? []).map((contact) => {
      const contactMessages = (messages ?? []).filter((message) => message.campaign_contact_id === contact.id);
      const contactMessageIds = new Set(contactMessages.map((message) => message.id));
      return { ...contact, events: (events ?? []).filter((event) => contactMessageIds.has(event.campaign_message_id)), messages: contactMessages };
    });
    return NextResponse.json({ campaigns: campaigns ?? [], summary, recipients });
  } catch (error) { return fail(error, "Could not load campaign analytics."); }
}
