import type { SupabaseClient } from "@supabase/supabase-js";

export type CampaignBounceNotice = {
  recipient: string;
  diagnostic: string;
  bounceType: string;
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
  const bounceType = /(?:5\.1\.1|user unknown|no such user|invalid recipient|mailbox (?:does not exist|unavailable|not available)|address not found)/i.test(diagnostic)
    ? "hard"
    : /(?:4\.\d\.\d|temporar|try again|mailbox full|quota exceeded|rate limit)/i.test(diagnostic)
      ? "soft"
      : /(?:blocked|blacklist|policy|spam|reputation)/i.test(diagnostic)
        ? "blocked"
        : /(?:rejected|relay denied|access denied)/i.test(diagnostic)
          ? "rejected"
          : "other";
  const originalMessageId = body.match(/(?:Original-Message-ID|Message-ID)\s*:\s*<?([^>\s]+)>?/i)?.[1] ?? null;
  const originalSubject = body.match(/(?:Original-)?Subject\s*:\s*(.+)/i)?.[1]?.trim() ?? null;

  return { recipient, diagnostic, bounceType, originalMessageId, originalSubject };
}

export async function recordCampaignBounce(
  client: SupabaseClient,
  input: {
    mailboxId: number;
    companyId: number;
    receivedAt: string;
    inboundProviderMessageId: string;
    inboundEmailMessageId?: number | null;
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
    .select("campaign_message_id, message_id, subject, sent_at")
    .eq("mailbox_id", input.mailboxId)
    .eq("contact_id", contact.id)
    .eq("direction", "outbound")
    .not("campaign_message_id", "is", null)
    .gte("sent_at", earliestMatch)
    .lte("sent_at", receivedAt.toISOString())
    .order("sent_at", { ascending: false })
    .limit(50);
  if (sentCopiesError) throw sentCopiesError;

  const candidates = sentCopies ?? [];
  let matchingCopies: typeof candidates = [];
  if (input.notice.originalMessageId) {
    matchingCopies = candidates.filter((copy) => copy.message_id && normalizedMessageId(copy.message_id) === normalizedMessageId(input.notice.originalMessageId!));
  } else if (input.notice.originalSubject) {
    const targetSubject = normalizedSubject(input.notice.originalSubject);
    matchingCopies = candidates.filter((copy) => normalizedSubject(copy.subject ?? "") === targetSubject);
  } else if (candidates.length === 1) {
    matchingCopies = candidates;
  }
  if (matchingCopies.length !== 1) return false;

  const campaignMessageId = matchingCopies[0].campaign_message_id;
  if (!campaignMessageId) return false;
  const { data: recorded, error: recordError } = await client.rpc("record_crm_campaign_bounce", {
    p_campaign_message_id: campaignMessageId,
    p_provider_event_id: `hostinger:bounce:${input.mailboxId}:${input.inboundProviderMessageId}`,
    p_email_message_id: input.inboundEmailMessageId ?? null,
    p_received_at: receivedAt.toISOString(),
    p_bounce_type: input.notice.bounceType,
    p_bounce_reason: input.notice.diagnostic,
    p_metadata: {
      source: "hostinger_bounce_email",
      recipient: input.notice.recipient,
      diagnostic: input.notice.diagnostic,
      bounce_type: input.notice.bounceType,
      original_message_id: input.notice.originalMessageId,
      bounce_subject: input.notice.originalSubject,
    },
  });
  if (recordError) throw recordError;
  return Boolean(recorded);
}
