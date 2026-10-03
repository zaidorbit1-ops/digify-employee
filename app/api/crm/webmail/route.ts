import sanitizeHtml from "sanitize-html";
import { NextResponse } from "next/server";
import { getCrmAdminClient } from "@/lib/crm-admin";
import { findHostingerMessage, getHostingerMessage, isIncompleteEmailBody, sanitizeEmailHtml, sendHostingerEmail } from "@/lib/hostinger-mail";
import { withCrmApiLogging, writeCrmLog } from "@/lib/crm-logs";

type AttachmentInput = { name: string; size: number; type: string; base64: string };

function fail(error: unknown, fallback: string, status = 500) {
  const value = error as { message?: string };
  return NextResponse.json({ error: error instanceof Error ? error.message : value.message ?? fallback }, { status });
}

function addresses(value?: string) {
  return (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

function addOpenTrackingPixel(html: string, pixel: string) {
  const closingBody = html.search(/<\/body\s*>/i);
  return closingBody < 0 ? `${html}${pixel}` : `${html.slice(0, closingBody)}${pixel}${html.slice(closingBody)}`;
}

function usablePublicOrigin(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const octets = hostname.split(".").map(Number);
    const isPrivateIpv4 = octets.length === 4 && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
      && (octets[0] === 10 || octets[0] === 127 || octets[0] === 0 || (octets[0] === 192 && octets[1] === 168) || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31));
    if (!["http:", "https:"].includes(url.protocol) || hostname === "localhost" || hostname === "::1" || hostname.endsWith(".local") || isPrivateIpv4) return null;
    return url.origin;
  } catch {
    return null;
  }
}

function emailTrackingOrigin(mailboxAddress: string) {
  const domain = mailboxAddress.trim().toLowerCase().split("@")[1] ?? "";
  const suffix = domain.split(".")[0].replace(/[^a-z0-9]/g, "").toUpperCase();
  if (!suffix) return null;
  const configured = process.env[`EMAIL_TRACKING_BASE_URL_${suffix}`]?.trim();
  if (!configured || !configured.startsWith("https://")) return null;
  const trackingOrigin = usablePublicOrigin(configured);
  const crmOrigin = usablePublicOrigin(process.env.CRM_PUBLIC_URL);
  return trackingOrigin && trackingOrigin !== crmOrigin ? trackingOrigin : null;
}

function sanitizeAndTrackLinks(html: string, publicUrl: string, trackingToken: string) {
  return sanitizeEmailHtml(html, {
    transformTags: {
      a: (tagName, attributes) => {
        const href = attributes.href;
        if (!href) return { tagName, attribs: attributes };
        try {
          const target = new URL(href);
          if (!["http:", "https:"].includes(target.protocol)) return { tagName, attribs: attributes };
          return {
            tagName,
            attribs: { ...attributes, href: `${publicUrl}/api/crm/webmail/tracking/click/${trackingToken}?url=${encodeURIComponent(target.toString())}` },
          };
        } catch {
          return { tagName, attribs: attributes };
        }
      },
    },
  });
}

function looksLikePartialBody(textBody?: string | null, htmlBody?: string | null) {
  if (isIncompleteEmailBody(textBody, htmlBody)) return true;
  if (textBody?.trim()) return false;
  const html = htmlBody?.trim() ?? "";
  if (!html) return true;
  const visible = html.replace(/<(head|script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  const endsMidToken = /(?:&(?:[a-z]+|#\d*|#x[\da-f]*)?|<)\s*$/i.test(html);
  const hasBodyStructure = /<(?:html|body|div|p|table|tr|td|h[1-6]|ul|ol|blockquote)\b/i.test(html);
  return endsMidToken || (!hasBodyStructure && visible.length < 160);
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
    const folder = params.get("folder");
    const since = params.get("since");
    const threadId = Number(params.get("thread_id"));
    let query = client.from("crm_email_threads").select("id, company_id, mailbox_id, contact_id, subject, folder, is_starred, created_at, updated_at").eq("mailbox_id", mailboxId);
    if (Number.isInteger(threadId) && threadId > 0) query = query.eq("id", threadId);
    else {
      if (folder === "starred") query = query.eq("is_starred", true);
      else if (["inbox", "sent", "drafts", "archive", "spam", "trash"].includes(folder ?? "")) query = query.eq("folder", folder);
      query = query.gte("updated_at", since || "1970-01-01T00:00:00.000Z").order("updated_at", { ascending: false });
      const start = (page - 1) * limit;
      query = query.range(start, start + limit - (since ? 1 : 0));
    }
    const { data: threads, error: threadError } = await query;
    if (threadError) throw threadError;
    const hasMore = !since && Number(threads?.length ?? 0) > limit;
    const rows = (threads ?? []).slice(0, limit);
    const ids = rows.map((thread) => thread.id);
    const { data: messages, error: messageError } = ids.length
      ? await client.from("crm_email_messages").select("id, thread_id, direction, sender, sent_by_user_id, sent_by_name, recipients, cc, subject, text_body, html_body, is_read, hostinger_uid, hostinger_folder, message_id, provider_message_id, received_at, sent_at, created_at, crm_email_attachments(id, file_name, content_type, content_id, storage_path, file_size)").in("thread_id", ids).order("created_at", { ascending: true })
      : { data: [], error: null };
    if (messageError) throw messageError;
    const outboundMessageIds = (messages ?? []).filter((item) => item.direction === "outbound").map((item) => item.id);
    const { data: trackingEvents, error: trackingEventsError } = outboundMessageIds.length
      ? await client.from("crm_email_events").select("message_id, event_type, event_time").in("event_type", ["opened", "clicked"]).in("message_id", outboundMessageIds).order("event_time", { ascending: true })
      : { data: [], error: null };
    if (trackingEventsError) throw trackingEventsError;
    const firstOpenAt = new Map<number, string>();
    const firstClickAt = new Map<number, string>();
    for (const event of trackingEvents ?? []) {
      if (!event.message_id) continue;
      if (event.event_type === "opened" && !firstOpenAt.has(event.message_id)) firstOpenAt.set(event.message_id, event.event_time);
      if (event.event_type === "clicked" && !firstClickAt.has(event.message_id)) firstClickAt.set(event.message_id, event.event_time);
    }
    const trackedMessages = (messages ?? []).map((item) => ({ ...item, opened_at: firstOpenAt.get(item.id) ?? null, clicked_at: firstClickAt.get(item.id) ?? null }));
    const detailedMessages = Number.isInteger(threadId) && threadId > 0
      ? await Promise.all(trackedMessages.map(async (message) => {
          if (message.direction !== "inbound" || !message.hostinger_uid || !looksLikePartialBody(message.text_body, message.html_body)) return message;
          try {
            const folder = message.hostinger_folder || "INBOX";
            const fetched = await getHostingerMessage(mailbox.email_address, folder, Number(message.hostinger_uid));
            const textBody = fetched.body.text?.trim() || null;
            const htmlBody = fetched.body.html?.trim() || null;
            if (isIncompleteEmailBody(textBody, htmlBody)) {
              await writeCrmLog({ level: "warning", source: "hostinger-webmail", event: "webmail.email.body_recovery_incomplete", message: "Hostinger returned no complete body for this message UID.", route: "/api/crm/webmail", companyId: mailbox.company_id, metadata: { mailbox_id: mailbox.id, message_id: message.id, hostinger_uid: message.hostinger_uid, email_subject: message.subject, text_length: textBody?.length ?? 0, html_length: htmlBody?.length ?? 0 } });
              return message;
            }
            const safeHtml = htmlBody ? sanitizeEmailHtml(htmlBody) : null;
            const { error: updateError } = await client.from("crm_email_messages").update({ text_body: textBody, html_body: safeHtml }).eq("id", message.id);
            if (updateError) {
              console.warn("[hostinger] recovered message body could not be cached", { message_id: message.id, code: updateError.code });
              await writeCrmLog({ level: "error", source: "hostinger-webmail", event: "webmail.email.body_recovery_save_failed", message: `Recovered body could not be saved [${updateError.code}]: ${updateError.message}`, route: "/api/crm/webmail", companyId: mailbox.company_id, metadata: { mailbox_id: mailbox.id, message_id: message.id, hostinger_uid: message.hostinger_uid, email_subject: message.subject, error_code: updateError.code } });
              return message;
            }
            await writeCrmLog({ level: "success", source: "hostinger-webmail", event: "webmail.email.body_recovered", message: "Canonical email body recovered from Hostinger.", route: "/api/crm/webmail", companyId: mailbox.company_id, metadata: { mailbox_id: mailbox.id, message_id: message.id, hostinger_uid: message.hostinger_uid, email_subject: message.subject, body_source: "hostinger_raw_source", text_length: textBody?.length ?? 0, html_length: safeHtml?.length ?? 0 } });
            return { ...message, text_body: textBody, html_body: safeHtml };
          } catch (error) {
            console.warn("[hostinger] message body recovery failed", { message_id: message.id, error: error instanceof Error ? error.message : "Unknown error" });
            await writeCrmLog({ level: "error", source: "hostinger-webmail", event: "webmail.email.body_recovery_failed", message: error instanceof Error ? error.message : "Could not recover email body from Hostinger.", route: "/api/crm/webmail", companyId: mailbox.company_id, metadata: { mailbox_id: mailbox.id, message_id: message.id, email_subject: message.subject, hostinger_uid: message.hostinger_uid } });
            return message;
          }
        }))
      : trackedMessages;
    const recoveredMessages = Number.isInteger(threadId) && threadId > 0
      ? await Promise.all(detailedMessages.map(async (message) => {
          if (message.direction !== "inbound" || !looksLikePartialBody(message.text_body, message.html_body)) return message;
          try {
            const folder = message.hostinger_folder || "INBOX";
            const providerMessage = await findHostingerMessage(mailbox.email_address, folder, message.message_id, { subject: message.subject, sender: message.sender, receivedAt: message.received_at });
            if (!providerMessage?.uid) {
              console.warn("[hostinger] message recovery lookup found no safe provider match", { message_id: message.id });
              await writeCrmLog({ level: "warning", source: "hostinger-webmail", event: "webmail.email.body_recovery_lookup_miss", message: "No Hostinger message matched this stored Message-ID or the strict sender/subject/time fallback.", route: "/api/crm/webmail", companyId: mailbox.company_id, metadata: { mailbox_id: mailbox.id, message_id: message.id, email_subject: message.subject, has_message_id: Boolean(message.message_id), has_sender: Boolean(message.sender), has_received_at: Boolean(message.received_at), text_length: message.text_body?.length ?? 0, html_length: message.html_body?.length ?? 0 } });
              return message;
            }
            const providerFolder = providerMessage.path || folder;
            const fetched = await getHostingerMessage(mailbox.email_address, providerFolder, providerMessage.uid);
            const textBody = fetched.body.text?.trim() || null;
            const htmlBody = fetched.body.html?.trim() || null;
            if (isIncompleteEmailBody(textBody, htmlBody)) {
              await writeCrmLog({ level: "warning", source: "hostinger-webmail", event: "webmail.email.body_recovery_incomplete", message: "Hostinger matched the message, but its canonical body is still incomplete.", route: "/api/crm/webmail", companyId: mailbox.company_id, metadata: { mailbox_id: mailbox.id, message_id: message.id, hostinger_uid: providerMessage.uid, email_subject: message.subject, text_length: textBody?.length ?? 0, html_length: htmlBody?.length ?? 0 } });
              return message;
            }
            const safeHtml = htmlBody ? sanitizeEmailHtml(htmlBody) : null;
            const values = { hostinger_uid: providerMessage.uid, hostinger_folder: providerFolder, text_body: textBody, html_body: safeHtml };
            const { error: updateError } = await client.from("crm_email_messages").update(values).eq("id", message.id);
            if (updateError) {
              console.warn("[hostinger] recovered message metadata could not be cached", { message_id: message.id, code: updateError.code });
              await writeCrmLog({ level: "error", source: "hostinger-webmail", event: "webmail.email.body_recovery_save_failed", message: `Recovered body and Hostinger UID could not be saved [${updateError.code}]: ${updateError.message}`, route: "/api/crm/webmail", companyId: mailbox.company_id, metadata: { mailbox_id: mailbox.id, message_id: message.id, hostinger_uid: providerMessage.uid, email_subject: message.subject, error_code: updateError.code } });
              return message;
            }
            await writeCrmLog({ level: "success", source: "hostinger-webmail", event: "webmail.email.body_recovered", message: "Email body and Hostinger UID recovered by Message-ID or strict metadata match.", route: "/api/crm/webmail", companyId: mailbox.company_id, metadata: { mailbox_id: mailbox.id, message_id: message.id, hostinger_uid: providerMessage.uid, email_subject: message.subject, body_source: "hostinger_raw_source", text_length: textBody?.length ?? 0, html_length: safeHtml?.length ?? 0 } });
            return { ...message, ...values };
          } catch (error) {
            console.warn("[hostinger] message recovery lookup failed", { message_id: message.id, error: error instanceof Error ? error.message : "Unknown error" });
            await writeCrmLog({ level: "error", source: "hostinger-webmail", event: "webmail.email.body_recovery_failed", message: error instanceof Error ? error.message : "Could not resolve and recover email body from Hostinger.", route: "/api/crm/webmail", companyId: mailbox.company_id, metadata: { mailbox_id: mailbox.id, message_id: message.id, email_subject: message.subject, hostinger_uid: message.hostinger_uid } });
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
    return NextResponse.json({ mailbox, threads: rows.map((thread) => ({ ...thread, crm_email_messages: byThread.get(thread.id) ?? [] })), page, hasMore });
  } catch (error) {
    return fail(error, "Could not load mailbox messages.");
  }
}

export const POST = withCrmApiLogging(async function POST(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return fail(authError, authError, 403);
    const { data: { user: senderUser } } = await client.auth.getUser();
    if (!senderUser) return fail("Authentication required.", "Authentication required.", 401);
    const { data: senderProfile, error: senderProfileError } = await client.from("profiles").select("full_name").eq("user_id", senderUser.id).maybeSingle();
    if (senderProfileError) throw senderProfileError;
    const sentByName = senderProfile?.full_name?.trim() || senderUser.email || "CRM user";
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
    const trackingToken = crypto.randomUUID();
    const providerMessageId = `hostinger:sent:${trackingToken}`;
    const safeHtml = sanitizeEmailHtml(html);
    const trackingOrigin = emailTrackingOrigin(mailbox.email_address);
    const trackedHtml = trackingOrigin
      ? addOpenTrackingPixel(sanitizeAndTrackLinks(html, trackingOrigin, trackingToken), `<img src="${trackingOrigin}/api/crm/webmail/tracking/open/${trackingToken}" width="1" height="1" alt="" />`)
      : safeHtml;
    if (!trackingOrigin) {
      await writeCrmLog({ level: "warning", source: "hostinger-webmail", event: "webmail.tracking.disabled", message: "Webmail sent without tracking because EMAIL_TRACKING_BASE_URL is missing or is not a public HTTPS host.", route: "/api/crm/webmail", companyId: mailbox.company_id, metadata: { mailbox_id: mailbox.id } });
    }
    let thread: { id: number } | null = null;
    let createdThread = false;
    if (Number.isInteger(threadId) && threadId > 0) {
      const { data, error } = await client.from("crm_email_threads").select("id").eq("id", threadId).eq("mailbox_id", mailbox.id).maybeSingle();
      if (error) throw error;
      thread = data;
    }
    if (!thread) {
      const { data, error } = await client.from("crm_email_threads").insert({ company_id: mailbox.company_id, mailbox_id: mailbox.id, subject, provider_thread_id: providerMessageId, folder: "sent", updated_at: new Date().toISOString() }).select("id").single();
      if (error) throw error;
      thread = data;
      createdThread = true;
    }
    const { data: stored, error: messageError } = await client.from("crm_email_messages").insert({ company_id: mailbox.company_id, thread_id: thread.id, mailbox_id: mailbox.id, direction: "outbound", sent_by_user_id: senderUser.id, sent_by_name: sentByName, provider_message_id: providerMessageId, message_id: providerMessageId, sender: mailbox.email_address, recipients: addresses(to), cc: addresses(body.cc), subject, text_body: text || null, html_body: safeHtml || null, is_read: true }).select("id").single();
    if (messageError) {
      if (createdThread) await client.from("crm_email_threads").delete().eq("id", thread.id);
      throw messageError;
    }
    try {
      await sendHostingerEmail({ to, cc: body.cc, bcc: body.bcc, subject, text, html: trackedHtml, displayName: mailbox.display_name ?? undefined, mailboxAddress: mailbox.email_address, attachments, inReplyTo });
    } catch (error) {
      await client.from("crm_email_messages").delete().eq("id", stored.id);
      if (createdThread) await client.from("crm_email_threads").delete().eq("id", thread.id);
      throw error;
    }
    const sentAt = new Date().toISOString();
    const [{ error: sentAtError }, { error: threadUpdateError }] = await Promise.all([
      client.from("crm_email_messages").update({ sent_at: sentAt }).eq("id", stored.id),
      client.from("crm_email_threads").update({ updated_at: sentAt }).eq("id", thread.id),
    ]);
    if (sentAtError) console.error("[hostinger] sent message timestamp could not be saved", sentAtError.message);
    if (threadUpdateError) console.error("[hostinger] sent thread timestamp could not be saved", threadUpdateError.message);
    if (stored && attachments.length) {
      const attachmentRows = attachments.map((item) => ({ company_id: mailbox.company_id, message_id: stored.id, file_name: item.name, content_type: item.type || "application/octet-stream", storage_path: `data:${item.type || "application/octet-stream"};base64,${item.base64.includes(",") ? item.base64.split(",", 2)[1] : item.base64}`, file_size: item.size || 0 }));
      const { error } = await client.from("crm_email_attachments").insert(attachmentRows);
      if (error) console.error("[hostinger] outgoing attachment metadata failed", error.message);
    }
    console.info("[hostinger] outgoing email sent", { mailbox_id: mailbox.id, message_id: providerMessageId });
    await writeCrmLog({ level: "success", source: "hostinger-webmail", event: "webmail.email.sent", message: "Webmail email sent successfully.", route: "/api/crm/webmail", companyId: mailbox.company_id, metadata: { mailbox_id: mailbox.id, message_id: stored.id, email_subject: subject, recipient_count: addresses(to).length + addresses(body.cc).length + addresses(body.bcc).length } });
    return NextResponse.json({ ok: true, message: "Email sent successfully." });
  } catch (error) {
    console.error("[hostinger] outgoing email failed", error instanceof Error ? error.message : "unknown error");
    await writeCrmLog({ level: "error", source: "hostinger-webmail", event: "webmail.email.failed", message: error instanceof Error ? error.message : "Email send failed.", route: "/api/crm/webmail" });
    return fail(error, "Failed to send email.", 400);
  }
});

export const PATCH = withCrmApiLogging(async function PATCH(request: Request) {
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
});
