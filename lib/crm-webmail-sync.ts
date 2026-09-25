import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { getCrmAdminClient } from "@/lib/crm-admin";
import { decryptMailboxCredentials } from "@/lib/crm-mailboxes-crypto";

export type MailboxRecord = {
  id: number;
  company_id: number;
  email_address: string;
  imap_host: string;
  imap_port: number;
  imap_security: string;
  smtp_host: string;
  smtp_port: number;
  smtp_security: string;
  encrypted_credentials: string;
  last_sync_uid?: number;
};

type ParsedAddress = { address?: string | null };
type CrmClient = Awaited<ReturnType<typeof getCrmAdminClient>>["client"];

function addresses(value: unknown) {
  if (!value || typeof value !== "object" || !("value" in value)) return [];
  const list = (value as { value?: ParsedAddress[] }).value;
  return Array.isArray(list) ? list.map((item) => item.address).filter((item): item is string => Boolean(item)) : [];
}

function subjectCandidates(subject: string | null | undefined) {
  const value = subject?.trim();
  if (!value) return [];
  const withoutReplyPrefix = value.replace(/^(re|fw|fwd):\s*/i, "").trim();
  return Array.from(new Set([value, withoutReplyPrefix].filter(Boolean)));
}

function stringArray(value: unknown) {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string" && item.length > 0);
  return typeof value === "string" && value.length > 0 ? [value] : [];
}

export async function syncMailbox(client: CrmClient, mailbox: MailboxRecord) {
  const credentials = decryptMailboxCredentials(mailbox.encrypted_credentials ?? "");
  const imap = new ImapFlow({
    host: mailbox.imap_host,
    port: Number(mailbox.imap_port),
    secure: mailbox.imap_security === "ssl",
    tls: { rejectUnauthorized: false },
    auth: { user: credentials.username, pass: credentials.password },
    logger: false,
  });
  let imported = 0;
  let highestUid = Number(mailbox.last_sync_uid ?? 0);

  try {
    await imap.connect();
    const lock = await imap.getMailboxLock("INBOX");
    try {
      const exists = imap.mailbox && typeof imap.mailbox === "object" ? imap.mailbox.exists : 0;
      const useUidRange = highestUid > 0;
      const start = useUidRange ? Math.max(1, highestUid - 24) : Math.max(1, exists - 49);
      if (start <= exists || useUidRange) {
        for await (const message of imap.fetch(`${start}:*`, { envelope: true, source: true, flags: true, uid: true, internalDate: true }, { uid: useUidRange })) {
          highestUid = Math.max(highestUid, Number(message.uid ?? 0));
          if (!message.source) continue;
          const parsed = await simpleParser(message.source);
          const providerMessageId = parsed.messageId || `imap:${message.uid}`;
          const sender = parsed.from?.value?.[0]?.address ?? null;
          const recipientList = addresses(parsed.to);
          const ccList = addresses(parsed.cc);
          const internalDate = message.internalDate instanceof Date ? message.internalDate : message.internalDate ? new Date(message.internalDate) : null;
          const receivedAt = internalDate?.toISOString() ?? parsed.date?.toISOString() ?? new Date().toISOString();
          const references = stringArray(parsed.references);
          const headerCandidates = [parsed.inReplyTo, ...references].filter((value): value is string => Boolean(value));
          const { data: matchedMessage } = headerCandidates.length
            ? await client.from("crm_email_messages").select("thread_id, contact_id").eq("mailbox_id", mailbox.id).in("message_id", headerCandidates).limit(1).maybeSingle()
            : { data: null };
          const { data: subjectThread } = !matchedMessage && subjectCandidates(parsed.subject).length
            ? await client.from("crm_email_threads").select("id, contact_id").eq("mailbox_id", mailbox.id).in("subject", subjectCandidates(parsed.subject)).order("updated_at", { ascending: false }).limit(1).maybeSingle()
            : { data: null };
          const matchedThreadId = matchedMessage?.thread_id ?? subjectThread?.id;
          const threadKey = parsed.inReplyTo || references[0] || parsed.subject || providerMessageId;
          let contactId: number | null = matchedMessage?.contact_id ?? subjectThread?.contact_id ?? null;

          if (!contactId && sender) {
            const { data: contact } = await client.from("crm_contacts").select("id").eq("company_id", mailbox.company_id).eq("normalized_email", sender.toLowerCase()).maybeSingle();
            contactId = contact?.id ?? null;
          }

          const threadPayload = {
            company_id: mailbox.company_id,
            mailbox_id: mailbox.id,
            contact_id: contactId,
            subject: parsed.subject || "(no subject)",
            provider_thread_id: threadKey,
            folder: "inbox",
            updated_at: receivedAt,
          };
          const { data: thread, error: threadError } = matchedThreadId
            ? await client.from("crm_email_threads").update(threadPayload).eq("id", matchedThreadId).select("id").single()
            : await client.from("crm_email_threads").upsert(threadPayload, { onConflict: "mailbox_id,provider_thread_id" }).select("id").single();
          if (threadError) throw threadError;

          const { data: storedMessage, error: messageError } = await client.from("crm_email_messages").upsert({
            company_id: mailbox.company_id,
            thread_id: thread.id,
            mailbox_id: mailbox.id,
            contact_id: contactId,
            direction: "inbound",
            provider_message_id: providerMessageId,
            message_id: parsed.messageId ?? null,
            in_reply_to: parsed.inReplyTo ?? null,
            references_headers: references,
            sender,
            recipients: recipientList,
            cc: ccList,
            subject: parsed.subject || "(no subject)",
            text_body: parsed.text ?? null,
            html_body: typeof parsed.html === "string" ? parsed.html : null,
            is_read: message.flags?.has("\\Seen") ?? false,
            received_at: receivedAt,
          }, { onConflict: "mailbox_id,provider_message_id" }).select("id").single();
          if (messageError) throw messageError;

          if (parsed.attachments && parsed.attachments.length > 0 && storedMessage) {
            for (const att of parsed.attachments) {
              try {
                await client.from("crm_email_attachments").insert({
                  company_id: mailbox.company_id,
                  message_id: storedMessage.id,
                  file_name: att.filename || "attachment",
                  content_type: att.contentType || "application/octet-stream",
                  storage_path: `data:${att.contentType || "application/octet-stream"};base64,${att.content ? att.content.toString("base64") : ""}`,
                  file_size: att.size || (att.content ? att.content.length : 0),
                });
              } catch {
                // Ignore attachment insert errors.
              }
            }
          }

          if (contactId && storedMessage) {
            const eventType = matchedThreadId ? "email_replied" : "email_received";
            const { data: existingTimeline } = await client.from("crm_contact_timeline").select("id").eq("company_id", mailbox.company_id).eq("contact_id", contactId).eq("event_type", eventType).contains("event_data", { provider_message_id: providerMessageId }).maybeSingle();
            if (!existingTimeline) {
              await client.from("crm_contact_timeline").insert({ company_id: mailbox.company_id, contact_id: contactId, event_type: eventType, event_data: { message_id: storedMessage.id, provider_message_id: providerMessageId, subject: parsed.subject || "(no subject)", sender } });
            }
          }
          imported += 1;
        }
      }
    } finally {
      lock.release();
    }
    await client.from("crm_mailboxes").update({ status: "connected", last_sync_at: new Date().toISOString(), last_sync_uid: highestUid, last_error: null }).eq("id", mailbox.id);
    return imported;
  } catch (error) {
    await client.from("crm_mailboxes").update({ status: "error", last_error: error instanceof Error ? error.message : "Mailbox sync failed." }).eq("id", mailbox.id);
    throw error;
  } finally {
    await imap.logout().catch(() => undefined);
  }
}