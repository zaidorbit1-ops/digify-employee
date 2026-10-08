import { NextResponse } from "next/server";
import { getCrmAdminClient } from "@/lib/crm-admin";

function fail(error: unknown, fallback: string, status = 500) {
  const value = error as { message?: string };
  return NextResponse.json(
    { error: error instanceof Error ? error.message : value.message ?? fallback },
    { status },
  );
}

async function allRows<T>(
  queryPage: (start: number, end: number) => PromiseLike<{
    data: T[] | null;
    error: { message: string } | null;
  }>,
) {
  const rows: T[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await queryPage(start, start + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

export async function GET(_: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return fail(authError, authError, 403);
    const id = Number((await context.params).id);
    if (!Number.isInteger(id) || id <= 0) return fail("A valid contact is required.", "A valid contact is required.", 400);

    const { data: contact, error: contactError } = await client
      .from("crm_contacts")
      .select("*, crm_companies(name), crm_contact_tag_links(crm_contact_tags(id, name)), crm_contact_list_members(contact_list_id, crm_contact_lists(id, name))")
      .eq("id", id)
      .maybeSingle();
    if (contactError) throw contactError;
    if (!contact) return fail("Contact was not found.", "Contact was not found.", 404);

    const campaignContacts = await allRows((start, end) => client
      .from("crm_campaign_contacts")
      .select("id, campaign_id, contact_id, status, created_at")
      .eq("contact_id", id)
      .order("created_at", { ascending: false })
      .range(start, end));
    const campaignIds = [...new Set(campaignContacts.map((item) => item.campaign_id))];
    const campaignContactIds = campaignContacts.map((item) => item.id);
    const [campaigns, messages] = await Promise.all([
      campaignIds.length
        ? allRows((start, end) => client.from("crm_campaigns").select("id, name, subject, status, created_at, schedule_at").in("id", campaignIds).range(start, end))
        : Promise.resolve([]),
      campaignContactIds.length
        ? allRows((start, end) => client.from("crm_campaign_messages").select("id, campaign_contact_id, status, sent_at, scheduled_at, error_message, provider_message_id, attempt_count, updated_at").in("campaign_contact_id", campaignContactIds).order("scheduled_at", { ascending: false }).range(start, end))
        : Promise.resolve([]),
    ]);
    const messageIds = messages.map((message) => message.id);
    const events = messageIds.length
      ? await allRows((start, end) => client.from("crm_email_events").select("id, campaign_message_id, event_type, event_time, metadata").in("campaign_message_id", messageIds).order("event_time", { ascending: false }).range(start, end))
      : [];
    const timeline = await allRows((start, end) => client
      .from("crm_contact_timeline")
      .select("id, event_type, event_data, created_at")
      .eq("contact_id", id)
      .order("created_at", { ascending: false })
      .range(start, end));

    const campaignsById = new Map(campaigns.map((campaign) => [campaign.id, campaign]));
    const messagesByRecipient = new Map<number, typeof messages>();
    for (const message of messages) {
      messagesByRecipient.set(message.campaign_contact_id, [
        ...(messagesByRecipient.get(message.campaign_contact_id) ?? []),
        message,
      ]);
    }
    const eventsByMessage = new Map<number, typeof events>();
    for (const event of events) {
      if (event.campaign_message_id === null) continue;
      eventsByMessage.set(event.campaign_message_id, [
        ...(eventsByMessage.get(event.campaign_message_id) ?? []),
        event,
      ]);
    }
    const campaignHistory = campaignContacts.map((recipient) => ({
      ...recipient,
      campaign: campaignsById.get(recipient.campaign_id) ?? null,
      messages: (messagesByRecipient.get(recipient.id) ?? []).map((message) => ({
        ...message,
        events: eventsByMessage.get(message.id) ?? [],
      })),
    }));

    return NextResponse.json({ contact, campaigns: campaignHistory, timeline });
  } catch (error) {
    return fail(error, "Could not load contact profile.");
  }
}
