import { NextResponse } from "next/server";
import { getCrmAdminClient } from "@/lib/crm-admin";
import { parseCampaignBounceNotice, recordCampaignBounce } from "@/lib/crm-campaign-bounces";
import { getSupabaseServiceRoleClient } from "@/lib/supabase-server";

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

    let campaignsQuery = client.from("crm_campaigns").select("id, name, status, company_id, mailbox_id, created_at, updated_at").eq("company_id", companyId).order("updated_at", { ascending: false });
    if (Number.isInteger(campaignId) && campaignId > 0) campaignsQuery = campaignsQuery.eq("id", campaignId);
    const { data: campaigns, error: campaignsError } = await campaignsQuery;
    if (campaignsError) throw campaignsError;
    const ids = (campaigns ?? []).map((campaign) => campaign.id);
    if (!ids.length) return NextResponse.json({ campaigns: [], summary: { recipients: 0, queued: 0, processing: 0, sent: 0, pending: 0, failed: 0, delivered: 0, bounced: 0, opened: 0, clicked: 0, replied: 0, unsubscribed: 0 }, recipients: [] });

    const campaignContacts = await allRows((start, end) => client.from("crm_campaign_contacts").select("id, campaign_id, contact_id, status, crm_contacts(id, company_id, full_name, email, status)").in("campaign_id", ids).order("id").range(start, end));
    const campaignContactIds = campaignContacts.map((item) => item.id);
    const messages = campaignContactIds.length
      ? await allRows((start, end) => client.from("crm_campaign_messages").select("id, campaign_contact_id, status, error_message, sent_at, scheduled_at, next_attempt_at, attempt_count, provider_message_id, updated_at").in("campaign_contact_id", campaignContactIds).order("id").range(start, end))
      : [];
    const messageIds = (messages ?? []).map((message) => message.id);
    const events = messageIds.length
      ? await allRows((start, end) => client.from("crm_email_events").select("id, campaign_message_id, event_type, event_time, metadata").in("campaign_message_id", messageIds).order("event_time", { ascending: false }).range(start, end))
      : [];

    const summary = { recipients: campaignContacts.length, queued: 0, processing: 0, sent: 0, pending: 0, failed: 0, delivered: 0, bounced: 0, opened: 0, clicked: 0, replied: 0, unsubscribed: 0 };
    for (const message of messages) {
      const statusKeys = ["queued", "processing", "sent", "failed", "delivered", "bounced", "opened", "clicked", "replied", "unsubscribed"] as const;
      if (statusKeys.includes(message.status as (typeof statusKeys)[number])) summary[message.status as keyof typeof summary] += 1;
    }
    summary.pending = summary.queued + summary.processing;

    const uniqueEventsByType = new Map<string, Set<number>>();
    for (const event of events) {
      const eventType = event.event_type;
      if (!event.campaign_message_id || ["sent", "failed"].includes(eventType)) continue;
      if (!["delivered", "bounced", "opened", "clicked", "replied", "unsubscribed", "complained"].includes(eventType)) continue;
      const set = uniqueEventsByType.get(eventType) ?? new Set<number>();
      set.add(event.campaign_message_id);
      uniqueEventsByType.set(eventType, set);
    }
    for (const [eventType, ids] of uniqueEventsByType) {
      if (eventType in summary) summary[eventType as keyof typeof summary] = Math.max(summary[eventType as keyof typeof summary], ids.size);
    }

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

export async function POST(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return fail(authError, authError, 403);
    const body = await request.json() as Record<string, unknown>;
    const companyId = Number(body.company_id);
    const campaignId = Number(body.campaign_id);
    if (!Number.isInteger(companyId) || companyId <= 0 || !Number.isInteger(campaignId) || campaignId <= 0) {
      return fail("A valid company and campaign are required.", "Campaign details are incomplete.", 400);
    }

    const { data: campaign, error: campaignError } = await client
      .from("crm_campaigns")
      .select("id, company_id, mailbox_id")
      .eq("id", campaignId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (campaignError) throw campaignError;
    if (!campaign) return fail("The source campaign does not belong to this company.", "Campaign is not available.", 404);

    const syncClient = getSupabaseServiceRoleClient();
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const bounceEmails = await allRows((start, end) => syncClient
      .from("crm_email_messages")
      .select("provider_message_id, sender, subject, text_body, html_body, received_at")
      .eq("mailbox_id", campaign.mailbox_id)
      .eq("direction", "inbound")
      .gte("received_at", since)
      .or("sender.ilike.%mailer-daemon%,sender.ilike.%postmaster%,sender.ilike.%mailchannels%,subject.ilike.%undeliver%,subject.ilike.%delivery status%,subject.ilike.%returned mail%,subject.ilike.%failure notice%,subject.ilike.%could not be delivered%")
      .order("received_at", { ascending: false })
      .range(start, end));

    let detected = 0;
    let linked = 0;
    for (const email of bounceEmails) {
      const notice = parseCampaignBounceNotice(email.sender ?? "", email.subject ?? "", email.text_body ?? "", email.html_body ?? "");
      if (!notice) continue;
      detected += 1;
      if (!email.received_at || !email.provider_message_id) continue;
      if (await recordCampaignBounce(syncClient, {
        mailboxId: campaign.mailbox_id,
        companyId,
        receivedAt: email.received_at,
        inboundProviderMessageId: email.provider_message_id,
        notice,
      })) linked += 1;
    }

    return NextResponse.json({ ok: true, detected, linked });
  } catch (error) {
    return fail(error, "Could not synchronize campaign bounce notifications.");
  }
}
