import sanitizeHtml from "sanitize-html";
import { NextResponse } from "next/server";
import { getCrmAdminClient } from "@/lib/crm-admin";
import { findHostingerMessage, getHostingerMessage, sanitizeEmailHtml, sendHostingerEmail } from "@/lib/hostinger-mail";

type AttachmentInput = { name: string; size: number; type: string; base64: string };

function fail(error: unknown, fallback: string, status = 500) {
  const value = error as { message?: string };
  return NextResponse.json({ error: error instanceof Error ? error.message : value.message ?? fallback }, { status });
}

function addresses(value?: string) {
  return (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

function hasRenderableBody(textBody?: string | null, htmlBody?: string | null) {
  if (textBody?.trim()) return true;
  if (!htmlBody?.trim()) return false;
  const visibleHtml = htmlBody
    .replace(/<!--(?:.|\n|\r)*?-->/g, " ")
    .replace(/<(head|script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/&nbsp;|&#160;|&#x0*a0;/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return Boolean(visibleHtml || /<(img|picture|video|audio|object|svg|canvas)\b/i.test(htmlBody));
}

function normalizeContentId(value?: string | null) {
  return (value ?? "").trim().replace(/^<|>$/g, "").toLowerCase();
}

async function getMailbox(client: Awaited<ReturnType<typeof getCrmAdminClient>>["client"], id: number) {
  const { data, error } = await client.from("crm_mailboxes").select("id, company_id, email_address, display_name, status").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Mailbox not found.");
  return data;
}

export async function GET(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return fail(authError, authError, 403);
    const params = new URL(request.url).searchParams;
    const mailboxId = Number(params.get("mailbox_id"));
    if (!Number.isInteger(mailboxId) || mailboxId <= 0) return fail("A valid mailbox is required.", "A valid mailbox is required.", 400);
    const mailbox = await getMailbox(client, mailboxId);
    const page = Math.max(1, Number(params.get("page") || 1));
    const limit = Math.min(50, Math.max(1, Number(params.get("limit") || 10)));
    const threadId = Number(params.get("thread_id"));
    let query = client.from("crm_email_threads").select("id, company_id, mailbox_id, contact_id, subject, folder, is_starred, created_at, updated_at").eq("mailbox_id", mailboxId);
    if (Number.isInteger(threadId) && threadId > 0) query = query.eq("id", threadId);
    else query = query.gte("updated_at", params.get("since") || "1970-01-01T00:00:00.000Z").order("updated_at", { ascending: false }).range((page - 1) * limit, page * limit - 1);
    const { data: threads, error: threadError } = await query;
    if (threadError) throw threadError;
    const rows = threads ?? [];
    const ids = rows.map((thread) => thread.id);
    const { data: messages, error: messageError } = ids.length
      ? await client.from("crm_email_messages").select("id, thread_id, direction, sender, recipients, cc, subject, text_body, html_body, is_read, hostinger_uid, hostinger_folder, message_id, provider_message_id, received_at, sent_at, created_at, crm_email_attachments(id, file_name, content_type, content_id, storage_path, file_size)").in("thread_id", ids).order("created_at", { ascending: true })
      : { data: [], error: null };
    if (messageError) throw messageError;
    const detailedMessages = Number.isInteger(threadId) && threadId > 0
      ? await Promise.all((messages ?? []).map(async (message) => {
          if (hasRenderableBody(message.text_body, message.html_body) || !message.hostinger_uid) return message;
          try {
            const folder = message.hostinger_folder || "INBOX";
            const fetched = await getHostingerMessage(mailbox.email_address, folder, Number(message.hostinger_uid));
            const textBody = fetched.body.text?.trim() || null;
            const htmlBody = fetched.body.html?.trim() || null;
            if (!hasRenderableBody(textBody, htmlBody)) return message;
            const safeHtml = htmlBody ? sanitizeEmailHtml(htmlBody) : null;
            const { error: updateError } = await client.from("crm_email_messages").update({ text_body: textBody, html_body: safeHtml }).eq("id", message.id);
            if (updateError) console.warn("[hostinger] recovered message body could not be cached", { message_id: message.id });
            return { ...message, text_body: textBody, html_body: safeHtml };
          } catch {
            return message;
          }
        }))
      : messages ?? [];
    const recoveredMessages = Number.isInteger(threadId) && threadId > 0
      ? await Promise.all(detailedMessages.map(async (message) => {
          if (message.hostinger_uid || message.direction !== "inbound" || !message.message_id || hasRenderableBody(message.text_body, message.html_body)) return message;
          try {
            const folder = message.hostinger_folder || "INBOX";
            const providerMessage = await findHostingerMessage(mailbox.email_address, folder, message.message_id);
            if (!providerMessage?.uid) return message;
            const providerFolder = providerMessage.path || folder;
            const fetched = await getHostingerMessage(mailbox.email_address, providerFolder, providerMessage.uid);
            const textBody = fetched.body.text?.trim() || null;
            const htmlBody = fetched.body.html?.trim() || null;
            const safeHtml = htmlBody ? sanitizeEmailHtml(htmlBody) : null;
            const values = { hostinger_uid: providerMessage.uid, hostinger_folder: providerFolder, text_body: textBody, html_body: safeHtml };
            const { error: updateError } = await client.from("crm_email_messages").update(values).eq("id", message.id);
            if (updateError) console.warn("[hostinger] recovered message metadata could not be cached", { message_id: message.id });
            return { ...message, ...values };
          } catch {
            return message;
          }
        }))
      : detailedMessages;
    const messagesWithInlineAttachments = recoveredMessages.map((message) => {
      if (!message.html_body) return message;
      const attachments = message.crm_email_attachments ?? [];
      const htmlBody = message.html_body.replace(/(src|background)\s*=\s*(["'])cid:([^"']+)\2/gi, (match: string, attribute: string, quote: string, contentId: string) => {
        const attachment = attachments.find((item) => normalizeContentId(item.content_id) === normalizeContentId(contentId));
        return attachment ? `${attribute}=${quote}/api/crm/webmail/attachment?attachment_id=${attachment.id}&inline=1${quote}` : match;
      });
      return { ...message, html_body: htmlBody };
    });
    const byThread = new Map<number, typeof detailedMessages>();
    for (const message of messagesWithInlineAttachments) byThread.set(message.thread_id, [...(byThread.get(message.thread_id) ?? []), message]);
    return NextResponse.json({ mailbox, threads: rows.map((thread) => ({ ...thread, crm_email_messages: byThread.get(thread.id) ?? [] })), page, hasMore: rows.length === limit });
  } catch (error) {
    return fail(error, "Could not load mailbox messages.");
  }
}

export async function POST(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return fail(authError, authError, 403);
    const body = await request.json() as { mailbox_id?: number; action?: string; to?: string; cc?: string; bcc?: string; subject?: string; text?: string; html?: string; thread_id?: number; attachments?: AttachmentInput[] };
    if (body.action !== "send") return fail("Inbox delivery is handled by Hostinger webhooks.", "Inbox delivery is handled by Hostinger webhooks.", 405);
    const mailboxId = Number(body.mailbox_id);
    const to = body.to?.trim() || "";
    const subject = body.subject?.trim() || "";
    const html = body.html?.trim() || "";
    const text = body.text?.trim() || "";
    if (!Number.isInteger(mailboxId) || mailboxId <= 0 || !to || !subject || (!text && !html)) return fail("Mailbox, recipient, subject, and message are required.", "Mailbox, recipient, subject, and message are required.", 400);
    const mailbox = await getMailbox(client, mailboxId);
    const attachments = body.attachments ?? [];
    if (attachments.some((item) => !item.name || item.base64.length > 22_000_000)) return fail("One or more attachments are invalid or too large.", "One or more attachments are invalid or too large.", 400);
    let inReplyTo: { uid: number; folder: string } | undefined;
    const threadId = Number(body.thread_id);
    if (Number.isInteger(threadId) && threadId > 0) {
      const { data: previous } = await client.from("crm_email_messages").select("hostinger_uid, provider_message_id").eq("thread_id", threadId).order("created_at", { ascending: false }).limit(1).maybeSingle();
      if (previous?.hostinger_uid) inReplyTo = { uid: Number(previous.hostinger_uid), folder: "INBOX" };
    }
    await sendHostingerEmail({ to, cc: body.cc, bcc: body.bcc, subject, text, html: sanitizeHtml(html), displayName: mailbox.display_name ?? undefined, mailboxAddress: mailbox.email_address, attachments, inReplyTo });
    const providerMessageId = `hostinger:sent:${crypto.randomUUID()}`;
    let thread: { id: number } | null = null;
    if (Number.isInteger(threadId) && threadId > 0) {
      const { data, error } = await client.from("crm_email_threads").update({ updated_at: new Date().toISOString() }).eq("id", threadId).eq("mailbox_id", mailbox.id).select("id").maybeSingle();
      if (error) throw error;
      thread = data;
    }
    if (!thread) {
      const { data, error } = await client.from("crm_email_threads").insert({ company_id: mailbox.company_id, mailbox_id: mailbox.id, subject, provider_thread_id: providerMessageId, folder: "sent", updated_at: new Date().toISOString() }).select("id").single();
      if (error) throw error;
      thread = data;
    }
    const { data: stored, error: messageError } = await client.from("crm_email_messages").insert({ company_id: mailbox.company_id, thread_id: thread.id, mailbox_id: mailbox.id, direction: "outbound", provider_message_id: providerMessageId, message_id: providerMessageId, sender: mailbox.email_address, recipients: addresses(to), cc: addresses(body.cc), subject, text_body: text || null, html_body: sanitizeHtml(html) || null, is_read: true, sent_at: new Date().toISOString() }).select("id").single();
    if (messageError) throw messageError;
    if (stored && attachments.length) {
      const attachmentRows = attachments.map((item) => ({ company_id: mailbox.company_id, message_id: stored.id, file_name: item.name, content_type: item.type || "application/octet-stream", storage_path: `data:${item.type || "application/octet-stream"};base64,${item.base64.includes(",") ? item.base64.split(",", 2)[1] : item.base64}`, file_size: item.size || 0 }));
      const { error } = await client.from("crm_email_attachments").insert(attachmentRows);
      if (error) console.error("[hostinger] outgoing attachment metadata failed", error.message);
    }
    console.info("[hostinger] outgoing email sent", { mailbox_id: mailbox.id, message_id: providerMessageId });
    return NextResponse.json({ ok: true, message: "Email sent successfully." });
  } catch (error) {
    console.error("[hostinger] outgoing email failed", error instanceof Error ? error.message : "unknown error");
    return fail(error, "Failed to send email.", 400);
  }
}

export async function PATCH(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return fail(authError, authError, 403);
    const body = await request.json() as { message_id?: number; is_read?: boolean; thread_id?: number; is_starred?: boolean; folder?: string; permanent_delete?: boolean };
    if (body.thread_id && body.permanent_delete) {
      const { error } = await client.from("crm_email_threads").delete().eq("id", body.thread_id);
      if (error) throw error;
    } else if (body.thread_id) {
      const values: Record<string, unknown> = {};
      if (typeof body.is_starred === "boolean") values.is_starred = body.is_starred;
      if (body.folder) values.folder = body.folder;
      if (Object.keys(values).length) { const { error } = await client.from("crm_email_threads").update(values).eq("id", body.thread_id); if (error) throw error; }
      if (typeof body.is_read === "boolean") {
        const { error } = await client.from("crm_email_messages").update({ is_read: body.is_read }).eq("thread_id", body.thread_id).eq("direction", "inbound");
        if (error) throw error;
      }
    }
    if (body.message_id) { const { error } = await client.from("crm_email_messages").update({ is_read: body.is_read !== false }).eq("id", body.message_id); if (error) throw error; }
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error, "Could not update message or thread.");
  }
}
