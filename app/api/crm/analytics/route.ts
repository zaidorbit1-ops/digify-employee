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
      ? await allRows((start, end) => client.from("crm_campaign_messages").select("id, campaign_contact_id, status, error_message, sent_at, sending_at, failed_at, delivered_at, bounced_at, opened_at, clicked_at, replied_at, rfc_message_id, hostinger_message_id, scheduled_at, next_attempt_at, attempt_count, provider_message_id, updated_at").in("campaign_contact_id", campaignContactIds).order("id").range(start, end))
      : [];
    const messageIds = (messages ?? []).map((message) => message.id);
    const events = messageIds.length
      ? await allRows((start, end) => client.from("crm_email_events").select("id, campaign_id, campaign_contact_id, campaign_message_id, message_id, event_type, event_time, provider_event_id, is_qualified, user_agent, ip_address, metadata").in("campaign_message_id", messageIds).order("event_time", { ascending: false }).range(start, end))
      : [];

    const summary = { recipients: campaignContacts.length, queued: 0, processing: 0, sent: 0, pending: 0, failed: 0, delivered: 0, bounced: 0, opened: 0, clicked: 0, replied: 0, unsubscribed: 0 };
    const contactsByMetric = new Map<string, Set<number>>();
    const addMetric = (metric: string, contactId: number) => {
      const ids = contactsByMetric.get(metric) ?? new Set<number>();
      ids.add(contactId);
      contactsByMetric.set(metric, ids);
    };
    const contactByMessage = new Map<number, number>();
    for (const message of messages) {
      contactByMessage.set(message.id, message.campaign_contact_id);
      if (message.sent_at || ["sent", "delivered", "bounced", "opened", "clicked", "replied"].includes(message.status)) {
        addMetric("sent", message.campaign_contact_id);
      }
      if (message.status === "failed" || message.failed_at) addMetric("failed", message.campaign_contact_id);
      if (message.status === "queued") summary.queued += 1;
      if (message.status === "processing") summary.processing += 1;
    }

    for (const event of events) {
      const contactId = event.campaign_contact_id ?? (event.campaign_message_id ? contactByMessage.get(event.campaign_message_id) : null);
      if (!contactId) continue;
      if (event.event_type === "sent") addMetric("sent", contactId);
      if (event.event_type === "failed") addMetric("failed", contactId);
      if (event.event_type === "bounced") addMetric("bounced", contactId);
      if (event.event_type === "delivered") addMetric("delivered", contactId);
      if (event.is_qualified && ["opened", "clicked"].includes(event.event_type)) addMetric(event.event_type, contactId);
      if (event.event_type === "replied") addMetric("replied", contactId);
      if (event.event_type === "unsubscribed") addMetric("unsubscribed", contactId);
    }
    for (const metric of ["sent", "failed", "delivered", "bounced", "opened", "clicked", "replied"] as const) {
      summary[metric] = contactsByMetric.get(metric)?.size ?? 0;
    }
    const bouncedContacts = contactsByMetric.get("bounced") ?? new Set<number>();
    summary.pending = summary.queued + summary.processing;
    summary.delivered = [...(contactsByMetric.get("delivered") ?? [])].filter((id) => !bouncedContacts.has(id)).length;
    summary.unsubscribed = contactsByMetric.get("unsubscribed")?.size ?? 0;

    const messagesByContact = new Map<number, typeof messages>();
    for (const message of messages) messagesByContact.set(message.campaign_contact_id, [...(messagesByContact.get(message.campaign_contact_id) ?? []), message]);
    const eventsByMessage = new Map<number, typeof events>();
    for (const event of events) eventsByMessage.set(event.campaign_message_id, [...(eventsByMessage.get(event.campaign_message_id) ?? []), event]);
    const recipients = (campaignContacts ?? []).map((contact) => {
      const contactMessages = messagesByContact.get(contact.id) ?? [];
      const contactEvents = contactMessages.flatMap((message) => eventsByMessage.get(message.id) ?? []);
      const eventTypes = new Set(contactEvents.filter((event) => event.is_qualified !== false).map((event) => event.event_type));
      const accepted = contactMessages.some((message) => message.sent_at || ["sent", "delivered", "bounced", "opened", "clicked", "replied"].includes(message.status));
      const failed = contactMessages.some((message) => message.status === "failed" || message.failed_at);
      const displayStatus = eventTypes.has("replied") ? "replied"
        : eventTypes.has("clicked") ? "clicked"
          : eventTypes.has("opened") ? "opened"
            : eventTypes.has("bounced") ? "bounced"
              : eventTypes.has("delivered") ? "delivered"
                : accepted ? "sent"
                  : failed ? "failed"
                    : contactMessages.some((message) => message.status === "processing") ? "processing"
                      : contactMessages.some((message) => message.status === "queued") ? "queued"
                        : contact.status;
      return { ...contact, display_status: displayStatus, events: contactEvents, messages: contactMessages };
    });
    return NextResponse.json({
      campaigns: campaigns ?? [],
      summary,
      recipients,
      delivery_tracking: {
        provider_delivery_events_supported: false,
        note: "Hostinger's current campaign integration does not provide a delivery-confirmation webhook. Delivered is counted only when a real delivery event is recorded.",
      },
    });
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
      .select("id, provider_message_id, sender, subject, text_body, html_body, received_at")
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
        inboundEmailMessageId: email.id,
        notice,
      })) linked += 1;
    }

    return NextResponse.json({ ok: true, detected, linked });
  } catch (error) {
    return fail(error, "Could not synchronize campaign bounce notifications.");
  }
}
