import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { constantTimeSecretMatches, findHostingerMessage, getHostingerMessage, isIncompleteEmailBody, sanitizeEmailHtml } from "@/lib/hostinger-mail";
import { getHostingerWebhookSecret } from "@/lib/hostinger-env";
import { decryptHostingerWebhookSecret } from "@/lib/hostinger-secrets";
import { getSupabaseServiceRoleClient } from "@/lib/supabase-server";
import { parseCampaignBounceNotice, recordCampaignBounce } from "@/lib/crm-campaign-bounces";
import { createCrmActivityNotifications } from "@/lib/crm-notifications";
import { writeCrmLog } from "@/lib/crm-logs";

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
  if (Array.isArray(value)) return value.flatMap((item) => stringValue(item).match(/<[^>]+>|[^\s,]+/g) ?? []).filter(Boolean);
  const result = stringValue(value);
  return result.match(/<[^>]+>|[^\s,]+/g) ?? [];
}

function crmFolderFromProviderFolder(folder: string) {
  const segments = folder.toLowerCase().split(/[./\\]+/).filter(Boolean);
  if (segments.some((segment) => /spam|junk|bulk/.test(segment))) return "spam";
  if (segments.some((segment) => /trash|deleted/.test(segment))) return "trash";
  if (segments.some((segment) => /draft/.test(segment))) return "drafts";
  if (segments.some((segment) => /archive|all mail/.test(segment))) return "archive";
  if (segments.some((segment) => /sent/.test(segment))) return "sent";
  return "inbox";
}

function extractBodyParts(value: unknown, depth = 0): { text: string; html: string } {
  if (depth > 6 || value == null) return { text: "", html: "" };
  if (typeof value === "string") {
    const content = value.trim();
    if (!content) return { text: "", html: "" };
    return /<(?:!doctype|html|body|div|p|table|br|span|h[1-6])\b/i.test(content)
      ? { text: "", html: content }
      : { text: content, html: "" };
  }
  if (Array.isArray(value)) {
    return value.reduce((result, item) => {
      const part = extractBodyParts(item, depth + 1);
      return { text: result.text || part.text, html: result.html || part.html };
    }, { text: "", html: "" });
  }

  const item = record(value);
  const mimeType = firstString(item.contentType, item.content_type, item.mimeType, item.mime_type).toLowerCase();
  let text = firstString(item.text, item.textBody, item.text_body, item.plainText, item.plain_text, item.plain);
  let html = firstString(item.html, item.htmlBody, item.html_body);
  const content = firstString(item.content, item.value);
  if (content && mimeType.includes("text/plain")) text ||= content;
  else if (content && mimeType.includes("text/html")) html ||= content;
  else if (content && !text && !html) {
    const extracted = extractBodyParts(content, depth + 1);
    text ||= extracted.text;
    html ||= extracted.html;
  }

  for (const key of ["body", "parts", "content", "payload", "data"]) {
    const nested = item[key];
    if (nested == null || nested === value) continue;
    const extracted = extractBodyParts(nested, depth + 1);
    text ||= extracted.text;
    html ||= extracted.html;
  }
  return { text, html };
}

function fail(message: string, status: number, requestId?: string, code?: string) {
  return NextResponse.json({ error: message, code, request_id: requestId }, { status });
}

export async function POST(request: Request) {
  const requestId = randomUUID();
  let stage = "payload.parse";
  let mailboxId: number | null = null;
  let diagnosticSubject: string | null = null;
  let diagnosticUid: number | null = null;
  let diagnosticHasMessageId = false;
  let diagnosticBodySource = "hostinger_webhook_payload";
  let diagnosticTextLength = 0;
  let diagnosticHtmlLength = 0;
  let payload: RecordValue;
  try {
    payload = record(await request.json());
  } catch {
    console.error("[hostinger] webhook rejected", { request_id: requestId, stage, reason: "malformed_payload" });
    return fail("Malformed webhook payload.", 400, requestId, "WEBHOOK_PAYLOAD_INVALID");
  }

  const event = firstString(payload.event, payload.type, record(payload.data).event);
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
    const { data: mailboxCompany, error: companyError } = await client
      .from("crm_companies")
      .select("name")
      .eq("id", mailbox.company_id)
      .maybeSingle();
    if (companyError) throw companyError;
    const companyName = mailboxCompany?.name ?? "CRM company";
    if (event && event !== "message.received") return NextResponse.json({ ok: true, ignored: true });

    stage = "payload.normalize";
    let uid = Number(message.uid ?? message.messageUid ?? data.uid ?? data.messageUid ?? payload.uid);
    if ((!Number.isInteger(uid) || uid <= 0) && /^\d+$/.test(stringValue(message.id))) uid = Number(message.id);
    diagnosticUid = Number.isInteger(uid) && uid > 0 ? uid : null;
    let folder = firstString(message.folder, message.path, data.folder, payload.folder) || "INBOX";
    let crmFolder = crmFolderFromProviderFolder(folder);
    let sender = address(message.from ?? message.sender);
    let recipients = addressList(message.to ?? message.recipients);
    let cc = addressList(message.cc);
    let subject = firstString(message.subject) || "(no subject)";
    diagnosticSubject = subject;
    const payloadBodies = extractBodyParts(message);
    let textBody = firstString(message.text, message.textBody, record(message.body).text, payloadBodies.text);
    let htmlBody = firstString(message.html, message.htmlBody, record(message.body).html, payloadBodies.html);
    diagnosticTextLength = textBody.length;
    diagnosticHtmlLength = htmlBody.length;
    let messageId = firstString(message.messageId, message.message_id, message.rfc822MessageId);
    diagnosticHasMessageId = Boolean(messageId);
    let inReplyTo = firstString(message.inReplyTo, message.in_reply_to);
    let references = headerList(message.references ?? message.referencesHeaders);
    let attachments = Array.isArray(message.attachments) ? message.attachments : [];
    stage = "hostinger.message.lookup";
    const providerMessage = Number.isInteger(uid) && uid > 0
      ? { uid, path: folder }
      : await findHostingerMessage(resolvedMailboxAddress, folder, messageId, { subject, sender, receivedAt: firstString(message.receivedAt, message.received_at, message.date) });
    if (providerMessage?.uid) {
        uid = providerMessage.uid;
        diagnosticUid = uid;
        folder = providerMessage.path || folder;
        crmFolder = crmFolderFromProviderFolder(folder);
        stage = "hostinger.message.fetch";
        diagnosticBodySource = "hostinger_message_api";
        const fetched = await getHostingerMessage(resolvedMailboxAddress, folder, uid, { markSeen: false });
        const fetchedMessage = record(fetched.message);
        const fetchedBodies = extractBodyParts(fetchedMessage);
        const fetchedText = firstString(fetched.body.text, fetchedMessage.text, fetchedMessage.textBody, record(fetchedMessage.body).text, fetchedBodies.text);
        const fetchedHtml = firstString(fetched.body.html, fetchedMessage.html, fetchedMessage.htmlBody, record(fetchedMessage.body).html, fetchedBodies.html);
        if (fetchedMessage.from) sender = address(fetchedMessage.from) || sender;
        if (!recipients.length) recipients = addressList(fetchedMessage.to ?? fetchedMessage.recipients);
        if (!cc.length) cc = addressList(fetchedMessage.cc);
        subject = firstString(fetchedMessage.subject, message.subject) || subject;
        diagnosticSubject = subject;
        messageId = firstString(fetchedMessage.messageId, fetchedMessage.message_id, fetchedMessage.rfc822MessageId, messageId);
        diagnosticHasMessageId = Boolean(messageId);
        inReplyTo = firstString(fetchedMessage.inReplyTo, fetchedMessage.in_reply_to, inReplyTo);
        references = headerList(fetchedMessage.references ?? fetchedMessage.referencesHeaders ?? references);
        if (!isIncompleteEmailBody(fetchedText, fetchedHtml)) {
          textBody = fetchedText;
          htmlBody = fetchedHtml;
        } else if (isIncompleteEmailBody(textBody, htmlBody)) {
          textBody = "";
          htmlBody = "";
        }
        diagnosticTextLength = textBody.length;
        diagnosticHtmlLength = htmlBody.length;
        if (!attachments.length && Array.isArray(fetchedMessage.attachments)) attachments = fetchedMessage.attachments;
        message = { ...message, ...fetchedMessage };
    }
    if (isIncompleteEmailBody(textBody, htmlBody) && !attachments.length) {
      stage = "hostinger.message.recovery";
      throw new Error(`Full email body could not be recovered from Hostinger for Message-ID ${messageId || "(missing)"}.`);
    }
    diagnosticTextLength = textBody.length;
    diagnosticHtmlLength = htmlBody.length;
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
    const hasHeaderThreadMatch = Boolean(matchedMessageById || matchedMessageByReply);
    const subjectKey = subject.replace(/^(?:(?:re|fw|fwd):\s*)+/i, "").trim();
    const { data: subjectThread } = !matchedMessage ? await client.from("crm_email_threads").select("id, contact_id").eq("mailbox_id", mailbox.id).ilike("subject", subjectKey).order("updated_at", { ascending: false }).limit(1).maybeSingle() : { data: null };
    const senderEmail = (sender.match(/<([^<>]+)>/)?.[1] ?? sender).trim().toLowerCase();
    let contactId = matchedMessage?.contact_id ?? subjectThread?.contact_id ?? null;
    if (!contactId) {
      const { data: contact } = await client.from("crm_contacts").select("id").eq("company_id", mailbox.company_id).eq("normalized_email", senderEmail).maybeSingle();
      contactId = contact?.id ?? null;
    }
    let campaignReplyMessageId: number | null = null;
    const replyHeaders = [inReplyTo, ...references].filter(Boolean);
    if (replyHeaders.length && /^[^@\s]+@[^@\s]+$/.test(senderEmail)) {
      const { data: senderContact, error: senderContactError } = await client.from("crm_contacts")
        .select("id")
        .eq("company_id", mailbox.company_id)
        .eq("normalized_email", senderEmail)
        .maybeSingle();
      if (senderContactError) throw senderContactError;
      if (senderContact) {
        const { data: campaignReply, error: campaignReplyError } = await client.from("crm_email_messages")
          .select("campaign_message_id")
          .eq("mailbox_id", mailbox.id)
          .eq("direction", "outbound")
          .eq("contact_id", senderContact.id)
          .not("campaign_message_id", "is", null)
          .in("message_id", replyHeaders)
          .limit(2);
        if (campaignReplyError) throw campaignReplyError;
        if (campaignReply?.length === 1 && campaignReply[0].campaign_message_id) {
          campaignReplyMessageId = campaignReply[0].campaign_message_id;
        }
      }
    }
    const threadId = matchedMessage?.thread_id ?? subjectThread?.id;
    const threadKey = inReplyTo || references[0] || messageId || providerMessageId;
    stage = "database.thread_save";
    const threadResult = threadId
      ? await client.from("crm_email_threads").update({ contact_id: contactId, subject, folder: crmFolder, updated_at: new Date().toISOString() }).eq("id", threadId).select("id").single()
      : await client.from("crm_email_threads").upsert({ company_id: mailbox.company_id, mailbox_id: mailbox.id, contact_id: contactId, subject, provider_thread_id: threadKey, folder: crmFolder, updated_at: new Date().toISOString() }, { onConflict: "mailbox_id,provider_thread_id" }).select("id").single();
    if (threadResult.error) throw threadResult.error;
    const receivedAtValue = firstString(message.receivedAt, message.received_at, message.date);
    const receivedAtDate = receivedAtValue ? new Date(receivedAtValue) : new Date();
    if (Number.isNaN(receivedAtDate.getTime())) throw new Error("Hostinger message received timestamp is invalid.");
    const receivedAt = receivedAtDate.toISOString();
    stage = "database.message_save";
    const { data: stored, error: messageError } = await client.from("crm_email_messages")
      .upsert({
        company_id: mailbox.company_id,
        thread_id: threadResult.data.id,
        mailbox_id: mailbox.id,
        contact_id: contactId,
        direction: "inbound",
        provider_message_id: providerMessageId,
        hostinger_uid: Number.isInteger(uid) && uid > 0 ? uid : null,
        hostinger_folder: folder,
        message_id: messageId || null,
        in_reply_to: inReplyTo || null,
        references_headers: references,
        sender,
        recipients,
        cc,
        subject,
        text_body: textBody || null,
        html_body: htmlBody ? sanitizeEmailHtml(htmlBody) : null,
        is_read: false,
        received_at: receivedAt,
      }, { onConflict: "mailbox_id,provider_message_id", ignoreDuplicates: true })
      .select("id")
      .maybeSingle();
    if (messageError) throw messageError;
    if (!stored) {
      console.info("[hostinger] concurrent duplicate email ignored", { mailbox_id: mailbox.id, provider_message_id: providerMessageId });
      return NextResponse.json({ ok: true, duplicate: true });
    }

    stage = "database.attachment_save";
    if (stored && attachments.length) {
      const rows = attachments.map((item) => { const attachment = record(item); return { company_id: mailbox.company_id, message_id: stored.id, file_name: firstString(attachment.filename, attachment.fileName) || "attachment", content_type: firstString(attachment.contentType, attachment.content_type) || "application/octet-stream", content_id: firstString(attachment.contentId, attachment.content_id) || null, storage_path: attachment.id ? `hostinger:attachment:${attachment.id}` : firstString(attachment.downloadUrl, attachment.url, "hostinger:attachment"), file_size: Number(attachment.sizeBytes ?? attachment.size) || 0 }; });
      const { error } = await client.from("crm_email_attachments").insert(rows);
      if (error) console.error("[hostinger] incoming attachment metadata failed", error.message);
    }
    const bounceNotice = parseCampaignBounceNotice(sender, subject, textBody, htmlBody);
    if (bounceNotice) {
      stage = "campaign.bounce_link";
      const linked = await recordCampaignBounce(client, {
        mailboxId: mailbox.id,
        companyId: mailbox.company_id,
        receivedAt,
        inboundProviderMessageId: providerMessageId,
        inboundEmailMessageId: stored.id,
        notice: bounceNotice,
      });
      if (linked) {
        console.info("[hostinger] campaign bounce linked", { mailbox_id: mailbox.id, recipient: bounceNotice.recipient });
      } else {
        console.warn("[hostinger] campaign bounce could not be linked unambiguously", { mailbox_id: mailbox.id, recipient: bounceNotice.recipient, bounce_subject: subject });
      }
    } else if (campaignReplyMessageId) {
      stage = "campaign.reply_link";
      const { error: replyError } = await client.rpc("record_crm_campaign_reply", {
        p_campaign_message_id: campaignReplyMessageId,
        p_provider_event_id: `hostinger:reply:${mailbox.id}:${providerMessageId}`,
        p_email_message_id: stored.id,
        p_replied_at: receivedAt,
        p_metadata: {
          source: "hostinger_inbound_reply",
          inbound_provider_message_id: providerMessageId,
          inbound_message_id: messageId || null,
          in_reply_to: inReplyTo || null,
          references,
        },
      });
      if (replyError) throw replyError;
    }
    stage = "database.status_update";
    await client.from("crm_mailboxes").update({ status: "connected", last_webhook_at: new Date().toISOString(), last_error: null }).eq("id", mailbox.id);
    if (contactId) await client.from("crm_contact_timeline").insert({ company_id: mailbox.company_id, contact_id: contactId, event_type: hasHeaderThreadMatch ? "email_replied" : "email_received", event_data: { message_id: stored.id, provider_message_id: providerMessageId, subject, sender } });
    await createCrmActivityNotifications({
      body: `on ${companyName}`,
      notificationType: "crm_email",
      relatedRecordId: stored.id,
      relatedUrl: `/dashboard/crm/webmail/${mailbox.id}?thread_id=${threadResult.data.id}`,
      companyId: mailbox.company_id,
    });
    console.info("[hostinger] incoming email processed", { mailbox_id: mailbox.id, provider_message_id: providerMessageId });
    await writeCrmLog({ level: "success", source: "hostinger-webhook", event: "webmail.email.received", message: "Incoming email received and stored.", route: "/api/email/hostinger/webhook", requestId, companyId: mailbox.company_id, metadata: { mailbox_id: mailbox.id, message_id: stored.id, email_subject: subject, body_source: diagnosticBodySource, text_length: diagnosticTextLength, html_length: diagnosticHtmlLength, has_hostinger_uid: Boolean(uid), has_message_id: Boolean(messageId) } });
    return NextResponse.json({ ok: true, message_id: stored.id });
  } catch (error) {
    const errorRecord = record(error);
    const reason = error instanceof Error ? error.message : firstString(errorRecord.message, errorRecord.details, "Unknown webhook processing error.");
    const errorCode = stringValue(errorRecord.code) || null;
    console.error("[hostinger] webhook processing failed", { request_id: requestId, mailbox_id: mailboxId, stage, error_code: errorCode, reason });
    await writeCrmLog({ level: "error", source: "hostinger-webhook", event: "webmail.email.receive_failed", message: `${stage}${errorCode ? ` [${errorCode}]` : ""}: ${reason}`, route: "/api/email/hostinger/webhook", requestId, metadata: { mailbox_id: mailboxId, stage, error_code: errorCode, email_subject: diagnosticSubject, body_source: diagnosticBodySource, text_length: diagnosticTextLength, html_length: diagnosticHtmlLength, hostinger_uid: diagnosticUid, has_message_id: diagnosticHasMessageId } });
    return fail(`Webhook processing failed at ${stage}.`, 500, requestId, "WEBHOOK_PROCESSING_FAILED");
  }
}
