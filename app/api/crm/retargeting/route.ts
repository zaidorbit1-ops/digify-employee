import { NextResponse } from "next/server";
import { getCrmAdminClient } from "@/lib/crm-admin";

const metrics = ["opened", "clicked", "delivered", "delivered_not_opened", "opened_not_clicked", "replied", "failed"] as const;
type RetargetMetric = (typeof metrics)[number];

async function allRows<T>(queryPage: (start: number, end: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>) {
  const rows: T[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await queryPage(start, start + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return rows;
  }
}

function matchesMetric(metric: RetargetMetric, statuses: string[], eventTypes: Set<string>) {
  if (metric === "failed") return statuses.includes("failed") || eventTypes.has("failed");
  const opened = eventTypes.has("opened") || statuses.some((status) => ["opened", "clicked", "replied"].includes(status));
  const clicked = eventTypes.has("clicked") || statuses.includes("clicked");
  const delivered = eventTypes.has("delivered") || statuses.some((status) => ["delivered", "opened", "clicked", "replied"].includes(status));
  const sentOrDelivered = eventTypes.has("sent") || delivered || statuses.includes("sent");
  if (metric === "opened") return opened;
  if (metric === "clicked") return clicked;
  if (metric === "delivered") return delivered;
  if (metric === "delivered_not_opened") return sentOrDelivered && !opened;
  if (metric === "opened_not_clicked") return opened && !clicked;
  return eventTypes.has("replied") || statuses.includes("replied");
}

function fail(error: unknown, fallback: string, status = 500) {
  const value = error as { message?: string; code?: string };
  return NextResponse.json(
    { error: error instanceof Error ? error.message : value.message ?? fallback },
    { status: value.code === "23505" ? 409 : status },
  );
}

export async function POST(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return fail(authError, authError, 403);
    const body = await request.json() as Record<string, unknown>;
    const companyId = Number(body.company_id);
    const campaignId = Number(body.campaign_id);
    const metric = String(body.metric ?? "") as RetargetMetric;
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 150) : "";
    if (!Number.isInteger(companyId) || companyId <= 0 || !Number.isInteger(campaignId) || campaignId <= 0) return fail("Choose a valid company and source campaign.", "Campaign details are incomplete.", 400);
    if (!metrics.includes(metric)) return fail("Choose a supported campaign outcome.", "Campaign outcome is not supported.", 400);
    if (!name) return fail("Retargeting audience name is required.", "Audience name is required.", 400);

    const { data: campaign, error: campaignError } = await client.from("crm_campaigns").select("id, company_id, name").eq("id", campaignId).eq("company_id", companyId).maybeSingle();
    if (campaignError) throw campaignError;
    if (!campaign) return fail("The source campaign does not belong to this company.", "Campaign is not available.", 404);

    const campaignContacts = await allRows((start, end) => client.from("crm_campaign_contacts")
      .select("id, contact_id, status, crm_contacts!inner(id, company_id, full_name, email, status)")
      .eq("campaign_id", campaignId)
      .order("id")
      .range(start, end));
    const campaignContactIds = campaignContacts.map((item) => item.id);
    const messages = campaignContactIds.length
      ? await allRows((start, end) => client.from("crm_campaign_messages")
        .select("id, campaign_contact_id, status")
        .in("campaign_contact_id", campaignContactIds)
        .order("id")
        .range(start, end))
      : [];
    const messageIds = messages.map((message) => message.id);
    const events = messageIds.length
      ? await allRows((start, end) => client.from("crm_email_events")
        .select("campaign_message_id, event_type")
        .in("campaign_message_id", messageIds)
        .order("id")
        .range(start, end))
      : [];

    const messagesByContact = new Map<number, typeof messages>();
    for (const message of messages) messagesByContact.set(message.campaign_contact_id, [...(messagesByContact.get(message.campaign_contact_id) ?? []), message]);
    const eventsByMessage = new Map<number, typeof events>();
    for (const event of events) eventsByMessage.set(event.campaign_message_id, [...(eventsByMessage.get(event.campaign_message_id) ?? []), event]);

    const eligibleContacts = campaignContacts.filter((campaignContact) => {
      const contactRelation = campaignContact.crm_contacts as unknown as { id: number; company_id: number; email: string; status: string }[] | { id: number; company_id: number; email: string; status: string } | null;
      const contact = Array.isArray(contactRelation) ? contactRelation[0] : contactRelation;
      if (!contact || contact.company_id !== companyId || contact.status !== "active" || !contact.email) return false;
      const contactMessages = messagesByContact.get(campaignContact.id) ?? [];
      const statuses = [campaignContact.status, ...contactMessages.map((message) => message.status)];
      const eventTypes = new Set(contactMessages.flatMap((message) => (eventsByMessage.get(message.id) ?? []).map((event) => event.event_type)));
      if (statuses.some((status) => ["failed", "bounced", "unsubscribed"].includes(status)) || ["bounced", "complained", "unsubscribed"].some((eventType) => eventTypes.has(eventType))) return false;
      return matchesMetric(metric, statuses, eventTypes);
    });
    const uniqueContactIds = [...new Set(eligibleContacts.map((item) => item.contact_id))];
    if (!uniqueContactIds.length) return fail("No active, eligible contacts match this campaign outcome.", "No eligible contacts found.", 400);

    const { data: list, error: listError } = await client.from("crm_contact_lists")
      .insert({ company_id: companyId, name, description: `Retargeting audience from ${campaign.name} (${metric.replaceAll("_", " ")}).` })
      .select("id, name, company_id")
      .single();
    if (listError) throw listError;

    for (let start = 0; start < uniqueContactIds.length; start += 500) {
      const memberships = uniqueContactIds.slice(start, start + 500).map((contactId) => ({ contact_list_id: list.id, contact_id: contactId }));
      const { error } = await client.from("crm_contact_list_members").upsert(memberships, { onConflict: "contact_list_id,contact_id", ignoreDuplicates: true });
      if (error) {
        await client.from("crm_contact_lists").delete().eq("id", list.id);
        throw error;
      }
    }

    return NextResponse.json({ list, recipient_count: uniqueContactIds.length }, { status: 201 });
  } catch (error) {
    return fail(error, "Could not create retargeting audience.", 400);
  }
}