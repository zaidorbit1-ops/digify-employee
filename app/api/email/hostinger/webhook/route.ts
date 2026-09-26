import sanitizeHtml from "sanitize-html";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { constantTimeSecretMatches, getHostingerMessage } from "@/lib/hostinger-mail";
import { getHostingerWebhookSecret } from "@/lib/hostinger-env";
import { decryptHostingerWebhookSecret } from "@/lib/hostinger-secrets";
import { getSupabaseServiceRoleClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

type RecordValue = Record<string, unknown>;

function record(value: unknown): RecordValue {
  return value && typeof value === "object" && !Array.isArray(value) ? value as RecordValue : {};
}

function stringValue(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  return "";
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    const result = stringValue(value);
    if (result) return result;
  }
  return "";
}

function address(value: unknown): string {
  if (typeof value === "string") return value.trim();
  const item = record(value);
  return firstString(item.address, item.email, item.value, item.name);
}

function addressList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(address).filter(Boolean);
  const result = address(value);
  return result ? result.split(",").map((item) => item.trim()).filter(Boolean) : [];
}

function headerList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(stringValue).filter(Boolean);
  const result = stringValue(value);
  return result ? [result] : [];
}

function fail(message: string, status: number, requestId?: string, code?: string) {
  return NextResponse.json({ error: message, code, request_id: requestId }, { status });
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  let stage = "payload.parse";
  let mailboxId: number | null = null;
  let payload: RecordValue;
  try {
    payload = record(await request.json());
  } catch {
    console.error("[hostinger] webhook rejected", { request_id: requestId, stage, reason: "malformed_payload" });
    return fail("Malformed webhook payload.", 400, requestId, "WEBHOOK_PAYLOAD_INVALID");
  }

  const event = firstString(payload.event, payload.type, record(payload.data).event);
  if (event && event !== "message.received") return NextResponse.json({ ok: true, ignored: true });
  const data = record(payload.data);
  let message = record(data.message ?? payload.message ?? data);
  const mailboxAddress = firstString(payload.mailbox, data.mailbox, message.mailbox, record(data.mailbox).address).toLowerCase();
  const webhookId = firstString(payload.webhookId, payload.webhook_id, data.webhookId, data.webhook_id, record(payload.webhook).id, record(data.webhook).id, request.headers.get("x-hostinger-webhook-id"), request.headers.get("x-webhook-id"));
  const suppliedSecret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || request.headers.get("x-webhook-secret") || request.headers.get("x-hostinger-webhook-secret");
  console.info("[hostinger] webhook received", {
    request_id: requestId,
    event: event || "unspecified",
    payload_fields: Object.keys(payload),
    data_fields: Object.keys(data),
    message_fields: Object.keys(message),
    has_mailbox: Boolean(mailboxAddress),
    has_webhook_id: Boolean(webhookId),
    has_bearer_secret: Boolean(suppliedSecret),
  });

  try {
    stage = "database.client";
    const client = getSupabaseServiceRoleClient();
    stage = "database.mailbox.lookup";
    stage = "database.mailbox.lookup";
    const { data: mailboxes, error: mailboxError } = await client.from("crm_mailboxes").select("id, company_id, email_address, webhook_id, encrypted_webhook_secret");
    if (mailboxError) throw mailboxError;
    const mailbox = (mailboxes ?? []).find((candidate) =>
      (webhookId && candidate.webhook_id === webhookId)
      || (!webhookId && mailboxAddress && candidate.email_address.toLowerCase() === mailboxAddress)
      || (!webhookId && !mailboxAddress && suppliedSecret && (
        (candidate.encrypted_webhook_secret && (() => {
          try { return constantTimeSecretMatches(suppliedSecret, decryptHostingerWebhookSecret(candidate.encrypted_webhook_secret, candidate.email_address)); } catch { return false; }
        })())
        || constantTimeSecretMatches(suppliedSecret, getHostingerWebhookSecret(candidate.email_address))
      )),
    );
    if (!mailbox && (webhookId || mailboxAddress)) return fail("Configured Hostinger mailbox was not found.", 404, requestId, "MAILBOX_NOT_FOUND");
    if (!mailbox) {
      console.warn("[hostinger] webhook mailbox could not be resolved", { request_id: requestId, has_webhook_id: Boolean(webhookId), has_mailbox: Boolean(mailboxAddress) });
      return fail("Webhook could not be matched to an authenticated mailbox.", 401, requestId, "WEBHOOK_MAILBOX_AUTH_FAILED");
    }
    mailboxId = mailbox.id;
    const resolvedMailboxAddress = mailbox.email_address.toLowerCase();
    stage = "webhook.authentication";
    const storedSecret = mailbox.encrypted_webhook_secret ? decryptHostingerWebhookSecret(mailbox.encrypted_webhook_secret, resolvedMailboxAddress) : null;
    const validStoredSecret = constantTimeSecretMatches(suppliedSecret, storedSecret);
    const validConfiguredSecret = constantTimeSecretMatches(suppliedSecret, getHostingerWebhookSecret(resolvedMailboxAddress));
    if (!validStoredSecret && !validConfiguredSecret) {
      console.warn("[hostinger] invalid webhook request", { mailbox_id: mailbox.id });
      return fail("Unauthorized", 401, requestId, "WEBHOOK_SECRET_INVALID");
    }

    stage = "payload.normalize";
    let uid = Number(message.uid ?? message.messageUid ?? message.resourceId ?? data.uid ?? data.messageUid ?? payload.uid);
    if ((!Number.isInteger(uid) || uid <= 0) && /^\d+$/.test(stringValue(message.id))) uid = Number(message.id);
    let folder = firstString(message.folder, message.path, data.folder, payload.folder) || "INBOX";
    let sender = address(message.from ?? message.sender);
    let recipients = addressList(message.to ?? message.recipients);
    let cc = addressList(message.cc);
    let subject = firstString(message.subject) || "(no subject)";
    let textBody = firstString(message.text, message.textBody, record(message.body).text);
    let htmlBody = firstString(message.html, message.htmlBody, record(message.body).html);
    let messageId = firstString(message.messageId, message.message_id, message.rfc822MessageId);
    let inReplyTo = firstString(message.inReplyTo, message.in_reply_to);
    let references = headerList(message.references ?? message.referencesHeaders);
    if ((!sender || !messageId || (!textBody && !htmlBody)) && Number.isInteger(uid) && uid > 0) {
      stage = "hostinger.message.fetch";
      const fetched = await getHostingerMessage(resolvedMailboxAddress, folder, uid);
      message = { ...fetched.message, ...message };
      sender = address(message.from ?? message.sender);
      recipients = addressList(message.to ?? message.recipients);
      cc = addressList(message.cc);
      subject = firstString(message.subject) || subject;
      textBody = firstString(message.text, message.textBody, fetched.body.text, record(message.body).text);
      htmlBody = firstString(message.html, message.htmlBody, fetched.body.html, record(message.body).html);
      messageId = firstString(message.messageId, message.message_id, message.rfc822MessageId);
      inReplyTo = firstString(message.inReplyTo, message.in_reply_to);
      references = headerList(message.references ?? message.referencesHeaders);
      folder = firstString(message.path, message.folder, folder) || "INBOX";
    }
    const providerMessageId = firstString(message.messageId, message.message_id, message.id) || (Number.isInteger(uid) && uid > 0 ? `hostinger:uid:${uid}` : "");
    if (!providerMessageId || !sender) {
      console.error("[hostinger] webhook rejected", { request_id: requestId, mailbox_id: mailbox.id, stage: "payload.validate", has_uid: Number.isInteger(uid) && uid > 0, has_message_id: Boolean(providerMessageId), has_sender: Boolean(sender) });
      return fail("Webhook message details could not be retrieved or are incomplete.", 400, requestId, "WEBHOOK_MESSAGE_DETAILS_INCOMPLETE");
    }

    stage = "database.duplicate_check";
    const duplicateQuery = client.from("crm_email_messages").select("id").eq("mailbox_id", mailbox.id).eq("provider_message_id", providerMessageId).maybeSingle();
    const { data: duplicate, error: duplicateError } = await duplicateQuery;
    if (duplicateError) throw duplicateError;
    if (duplicate) {
      console.info("[hostinger] duplicate email ignored", { mailbox_id: mailbox.id, provider_message_id: providerMessageId });
      return NextResponse.json({ ok: true, duplicate: true });
    }

    stage = "database.thread_lookup";
    const headerCandidates = [messageId, inReplyTo, ...references].filter(Boolean);
    const { data: matchedMessageById } = headerCandidates.length ? await client.from("crm_email_messages").select("thread_id, contact_id").eq("mailbox_id", mailbox.id).in("message_id", headerCandidates).limit(1).maybeSingle() : { data: null };
    const { data: matchedMessageByReply } = !matchedMessageById && headerCandidates.length ? await client.from("crm_email_messages").select("thread_id, contact_id").eq("mailbox_id", mailbox.id).in("in_reply_to", headerCandidates).limit(1).maybeSingle() : { data: null };
    const matchedMessage = matchedMessageById ?? matchedMessageByReply;
    const subjectKey = subject.replace(/^(re|fw|fwd):\s*/i, "").trim();
    const { data: subjectThread } = !matchedMessage ? await client.from("crm_email_threads").select("id, contact_id").eq("mailbox_id", mailbox.id).ilike("subject", subjectKey).order("updated_at", { ascending: false }).limit(1).maybeSingle() : { data: null };
    let contactId = matchedMessage?.contact_id ?? subjectThread?.contact_id ?? null;
    if (!contactId) {
      const { data: contact } = await client.from("crm_contacts").select("id").eq("company_id", mailbox.company_id).eq("normalized_email", sender.toLowerCase()).maybeSingle();
      contactId = contact?.id ?? null;
    }
    const threadId = matchedMessage?.thread_id ?? subjectThread?.id;
    const threadKey = inReplyTo || references[0] || messageId || providerMessageId;
    stage = "database.thread_save";
    const threadResult = threadId
      ? await client.from("crm_email_threads").update({ contact_id: contactId, subject, updated_at: new Date().toISOString() }).eq("id", threadId).select("id").single()
      : await client.from("crm_email_threads").upsert({ company_id: mailbox.company_id, mailbox_id: mailbox.id, contact_id: contactId, subject, provider_thread_id: threadKey, folder: "inbox", updated_at: new Date().toISOString() }, { onConflict: "mailbox_id,provider_thread_id" }).select("id").single();
    if (threadResult.error) throw threadResult.error;
    const receivedAt = firstString(message.receivedAt, message.received_at, message.date) || new Date().toISOString();
    stage = "database.message_save";
    const { data: stored, error: messageError } = await client.from("crm_email_messages").insert({ company_id: mailbox.company_id, thread_id: threadResult.data.id, mailbox_id: mailbox.id, contact_id: contactId, direction: "inbound", provider_message_id: providerMessageId, hostinger_uid: Number.isInteger(uid) && uid > 0 ? uid : null, message_id: messageId || null, in_reply_to: inReplyTo || null, references_headers: references, sender, recipients, cc, subject, text_body: textBody || null, html_body: htmlBody ? sanitizeHtml(htmlBody) : null, is_read: false, received_at: receivedAt }).select("id").single();
    if (messageError) throw messageError;

    stage = "database.attachment_save";
    const attachments = Array.isArray(message.attachments) ? message.attachments : [];
    if (stored && attachments.length) {
      const rows = attachments.map((item) => { const attachment = record(item); return { company_id: mailbox.company_id, message_id: stored.id, file_name: firstString(attachment.filename, attachment.fileName) || "attachment", content_type: firstString(attachment.contentType, attachment.content_type) || "application/octet-stream", storage_path: firstString(attachment.downloadUrl, attachment.url, attachment.id ? `hostinger:attachment:${attachment.id}` : "hostinger:attachment"), file_size: Number(attachment.size) || 0 }; });
      const { error } = await client.from("crm_email_attachments").insert(rows);
      if (error) console.error("[hostinger] incoming attachment metadata failed", error.message);
    }
    stage = "database.status_update";
    await client.from("crm_mailboxes").update({ status: "connected", last_webhook_at: new Date().toISOString(), last_error: null }).eq("id", mailbox.id);
    if (contactId) await client.from("crm_contact_timeline").insert({ company_id: mailbox.company_id, contact_id: contactId, event_type: threadId ? "email_replied" : "email_received", event_data: { message_id: stored.id, provider_message_id: providerMessageId, subject, sender } });
    console.info("[hostinger] incoming email processed", { mailbox_id: mailbox.id, provider_message_id: providerMessageId });
    return NextResponse.json({ ok: true, message_id: stored.id });
  } catch (error) {
    const reason = error instanceof Error ? error.message : "unknown error";
    console.error("[hostinger] webhook processing failed", { request_id: requestId, mailbox_id: mailboxId, stage, reason });
    return fail(`Webhook processing failed at ${stage}.`, 500, requestId, "WEBHOOK_PROCESSING_FAILED");
  }
}
