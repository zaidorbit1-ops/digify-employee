import type { SupabaseClient } from "@supabase/supabase-js";

export type CampaignBounceNotice = {
  recipient: string;
  diagnostic: string;
  originalMessageId: string | null;
  originalSubject: string | null;
};

function normalizedSubject(value: string) {
  return value.replace(/^(?:(?:re|fw|fwd):\s*)+/i, "").replace(/\s+/g, " ").trim().toLowerCase();
}

function normalizedMessageId(value: string) {
  return value.trim().replace(/^<|>$/g, "").toLowerCase();
}

export function parseCampaignBounceNotice(sender: string, subject: string, text: string, html = ""): CampaignBounceNotice | null {
  const body = text.trim() || html
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ");
  const content = `${subject}\n${body}`.replace(/\s+/g, " ");
  const deliveryFailure = /(?:could not be delivered|couldn't be delivered|failed to deliver|delivery status notification|undeliverable|returned mail|failure notice)/i.test(content);
  const daemonSender = /(?:mailer-daemon|postmaster|mailchannels)/i.test(sender);
  const diagnosticLine = body.match(/<(?:[^<>\s]+@[^<>\s]+)>:\s*host\b[^\r\n]*(?:\r?\n[ \t]+[^\r\n]*){0,3}/i)?.[0];
  const recipientField = body.match(/(?:Final|Original)-Recipient\s*:\s*(?:rfc822\s*;\s*)?<*([^<>\s;]+@[^<>\s;]+)>?/i)?.[1];
  const rejectedAddress = diagnosticLine?.match(/<([^<>\s]+@[^<>\s]+)>/)?.[1];
  const recipient = (recipientField || rejectedAddress || "").trim().toLowerCase();
  if (!recipient || !deliveryFailure || (!daemonSender && !diagnosticLine && !recipientField)) return null;

  const diagnostic = (body.match(/Diagnostic-Code\s*:\s*([^\r\n]+(?:\r?\n[ \t]+[^\r\n]+)*)/i)?.[1]
    || diagnosticLine
    || subject
    || "Hostinger returned a delivery failure.")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1000);
  const originalMessageId = body.match(/(?:Original-Message-ID|Message-ID)\s*:\s*<?([^>\s]+)>?/i)?.[1] ?? null;
  const originalSubject = body.match(/(?:Original-)?Subject\s*:\s*(.+)/i)?.[1]?.trim() ?? null;

  return { recipient, diagnostic, originalMessageId, originalSubject };
}

export async function recordCampaignBounce(
  client: SupabaseClient,
  input: {
    mailboxId: number;
    companyId: number;
    receivedAt: string;
    inboundProviderMessageId: string;
    notice: CampaignBounceNotice;
  },
) {
  const receivedAt = new Date(input.receivedAt);
  if (Number.isNaN(receivedAt.getTime())) throw new Error("Bounce notification has an invalid received time.");

  const { data: contact, error: contactError } = await client
    .from("crm_contacts")
    .select("id")
    .eq("company_id", input.companyId)
    .eq("normalized_email", input.notice.recipient)
    .maybeSingle();
  if (contactError) throw contactError;
  if (!contact) return false;

  const earliestMatch = new Date(receivedAt.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const { data: sentCopies, error: sentCopiesError } = await client
    .from("crm_email_messages")
    .select("provider_message_id, message_id, subject, sent_at")
    .eq("mailbox_id", input.mailboxId)
    .eq("contact_id", contact.id)
    .eq("direction", "outbound")
    .like("provider_message_id", "hostinger:campaign:%")
    .gte("sent_at", earliestMatch)
    .lte("sent_at", receivedAt.toISOString())
    .order("sent_at", { ascending: false })
    .limit(50);
  if (sentCopiesError) throw sentCopiesError;

  const candidates = sentCopies ?? [];
  let matchingCopies = input.notice.originalMessageId
    ? candidates.filter((copy) => copy.message_id && normalizedMessageId(copy.message_id) === normalizedMessageId(input.notice.originalMessageId!))
    : [];
  if (matchingCopies.length !== 1 && input.notice.originalSubject) {
    const targetSubject = normalizedSubject(input.notice.originalSubject);
    matchingCopies = candidates.filter((copy) => normalizedSubject(copy.subject ?? "") === targetSubject);
  }
  if (matchingCopies.length !== 1) matchingCopies = candidates.length === 1 ? candidates : [];
  if (matchingCopies.length !== 1) return false;

  const campaignMessageId = matchingCopies[0].provider_message_id.match(/^hostinger:campaign:(\d+)$/)?.[1];
  if (!campaignMessageId) return false;
  const { data: campaignMessage, error: campaignMessageError } = await client
    .from("crm_campaign_messages")
    .select("id, campaign_contact_id, status")
    .eq("id", campaignMessageId)
    .maybeSingle();
  if (campaignMessageError) throw campaignMessageError;
  if (!campaignMessage || !["sent", "delivered", "bounced"].includes(campaignMessage.status)) return false;

  const now = new Date().toISOString();
  if (campaignMessage.status !== "bounced") {
    const { error: messageUpdateError } = await client
      .from("crm_campaign_messages")
      .update({
        status: "bounced",
        error_message: `Bounce-back received: ${input.notice.diagnostic}`,
        updated_at: now,
      })
      .eq("id", campaignMessage.id)
      .in("status", ["sent", "delivered"]);
    if (messageUpdateError) throw messageUpdateError;

  }

  const { error: contactUpdateError } = await client
    .from("crm_campaign_contacts")
    .update({ status: "bounced" })
    .eq("id", campaignMessage.campaign_contact_id);
  if (contactUpdateError) throw contactUpdateError;

  const { error: eventError } = await client.from("crm_email_events").upsert({
    company_id: input.companyId,
    campaign_message_id: campaignMessage.id,
    event_type: "bounced",
    provider_event_id: `hostinger:bounce:${input.mailboxId}:${input.inboundProviderMessageId}`,
    event_time: receivedAt.toISOString(),
    metadata: {
      source: "hostinger_bounce_email",
      recipient: input.notice.recipient,
      diagnostic: input.notice.diagnostic,
      bounce_subject: input.notice.originalSubject,
    },
  }, { onConflict: "provider_event_id" });
  if (eventError) throw eventError;
  return true;
}
