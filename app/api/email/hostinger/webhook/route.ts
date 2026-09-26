import sanitizeHtml from "sanitize-html";
import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { constantTimeSecretMatches } from "@/lib/hostinger-mail";
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
  const message = record(data.message ?? payload.message ?? data);
  const mailboxAddress = firstString(payload.mailbox, data.mailbox, message.mailbox, record(data.mailbox).address).toLowerCase();
  const webhookId = firstString(payload.webhookId, payload.webhook_id, data.webhookId, data.webhook_id);
  const providerMessageId = firstString(message.messageId, message.message_id, message.id, message.uid && `hostinger:uid:${message.uid}`);
  const uid = Number(message.uid ?? message.resourceId ?? data.uid);
  const sender = address(message.from ?? message.sender);
  const recipients = addressList(message.to ?? message.recipients);
  const cc = addressList(message.cc);
  const subject = firstString(message.subject) || "(no subject)";
  const textBody = firstString(message.text, message.textBody, record(message.body).text);
  const htmlBody = firstString(message.html, message.htmlBody, record(message.body).html);
  const messageId = firstString(message.messageId, message.message_id, message.rfc822MessageId);
  const inReplyTo = firstString(message.inReplyTo, message.in_reply_to);
  const references = headerList(message.references ?? message.referencesHeaders);
  if (!providerMessageId || !sender) {
    console.error("[hostinger] webhook rejected", { request_id: requestId, stage: "payload.validate", has_mailbox: Boolean(mailboxAddress), has_message_id: Boolean(providerMessageId), has_sender: Boolean(sender) });
    return fail("Webhook message payload is incomplete.", 400, requestId, "WEBHOOK_PAYLOAD_INCOMPLETE");
  }

  try {
    stage = "database.client";
    const client = getSupabaseServiceRoleClient();
    stage = "database.mailbox.lookup";
    const mailboxQuery = client.from("crm_mailboxes").select("id, company_id, email_address, encrypted_webhook_secret");
    const lookupAddress = mailboxAddress;
    const { data: mailbox, error: mailboxError } = webhookId
      ? await mailboxQuery.eq("webhook_id", webhookId).maybeSingle()
      : lookupAddress
        ? await mailboxQuery.ilike("email_address", lookupAddress).maybeSingle()
        : { data: null, error: null };
    if (mailboxError) throw mailboxError;
    if (!mailbox && !webhookId && !lookupAddress) return fail("Webhook payload did not identify its mailbox.", 400, requestId, "MAILBOX_IDENTIFIER_MISSING");
    if (!mailbox) return fail("Configured Hostinger mailbox was not found.", 404, requestId, "MAILBOX_NOT_FOUND");
    mailboxId = mailbox.id;
    const resolvedMailboxAddress = mailbox.email_address.toLowerCase();
    stage = "webhook.authentication";
    const suppliedSecret = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || request.headers.get("x-webhook-secret") || request.headers.get("x-hostinger-webhook-secret");
    const storedSecret = mailbox.encrypted_webhook_secret ? decryptHostingerWebhookSecret(mailbox.encrypted_webhook_secret, resolvedMailboxAddress) : null;
    const validStoredSecret = constantTimeSecretMatches(suppliedSecret, storedSecret);
    const validConfiguredSecret = constantTimeSecretMatches(suppliedSecret, getHostingerWebhookSecret(resolvedMailboxAddress));
    if (!validStoredSecret && !validConfiguredSecret) {
      console.warn("[hostinger] invalid webhook request", { mailbox_id: mailbox.id });
      return fail("Unauthorized", 401, requestId, "WEBHOOK_SECRET_INVALID");
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
