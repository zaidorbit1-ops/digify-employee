import { NextResponse } from "next/server";
import { getCrmAdminClient } from "@/lib/crm-admin";

async function allRows<T>(queryPage: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await queryPage(start, start + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

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

    const campaignContacts = await allRows((start, end) => client.from("crm_campaign_contacts").select("id, campaign_id, contact_id, status, crm_contacts(id, full_name, email)").in("campaign_id", ids).order("id").range(start, end));
    const campaignContactIds = campaignContacts.map((item) => item.id);
    const messages = campaignContactIds.length
      ? await allRows((start, end) => client.from("crm_campaign_messages").select("id, campaign_contact_id, status, error_message, sent_at, scheduled_at, next_attempt_at, attempt_count, provider_message_id, updated_at").in("campaign_contact_id", campaignContactIds).order("id").range(start, end))
      : [];
    const messageIds = (messages ?? []).map((message) => message.id);
    const events = messageIds.length
      ? await allRows((start, end) => client.from("crm_email_events").select("id, campaign_message_id, event_type, event_time, metadata").in("campaign_message_id", messageIds).order("event_time", { ascending: false }).range(start, end))
      : [];

    const summary = { recipients: campaignContacts.length, sent: 0, pending: 0, failed: 0, delivered: 0, bounced: 0, opened: 0, clicked: 0, replied: 0, unsubscribed: 0 };
    for (const message of messages) {
      if (["sent", "delivered"].includes(message.status)) summary.sent += 1;
      if (["queued", "processing"].includes(message.status)) summary.pending += 1;
      if (message.status === "failed") summary.failed += 1;
    }
    for (const event of events) if (event.event_type in summary && event.event_type !== "sent") summary[event.event_type as keyof typeof summary] += 1;

    const messagesByContact = new Map<number, typeof messages>();
    for (const message of messages) messagesByContact.set(message.campaign_contact_id, [...(messagesByContact.get(message.campaign_contact_id) ?? []), message]);
    const eventsByMessage = new Map<number, typeof events>();
    for (const event of events) eventsByMessage.set(event.campaign_message_id, [...(eventsByMessage.get(event.campaign_message_id) ?? []), event]);
    const recipients = (campaignContacts ?? []).map((contact) => {
      const contactMessages = messagesByContact.get(contact.id) ?? [];
      const contactEvents = contactMessages.flatMap((message) => eventsByMessage.get(message.id) ?? []);
      return { ...contact, events: contactEvents, messages: contactMessages };
    });
    return NextResponse.json({ campaigns: campaigns ?? [], summary, recipients });
  } catch (error) { return fail(error, "Could not load campaign analytics."); }
}
