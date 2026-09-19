import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import nodemailer from "nodemailer";
import { NextResponse } from "next/server";
import { getCrmAdminClient } from "@/lib/crm-admin";
import { decryptMailboxCredentials } from "@/lib/crm-mailboxes-crypto";

type MailboxRecord = {
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
};

type ParsedAddress = { address?: string | null };

function fail(error: unknown, fallback: string, status = 500) {
  const value = error as { message?: string };
  return NextResponse.json({ error: error instanceof Error ? error.message : value.message ?? fallback }, { status });
}

function addresses(value: unknown) {
  if (!value || typeof value !== "object" || !("value" in value)) return [];
  const list = (value as { value?: ParsedAddress[] }).value;
  return Array.isArray(list) ? list.map((item) => item.address).filter((item): item is string => Boolean(item)) : [];
}

function securityOptions(mailbox: MailboxRecord) {
  return {
    host: mailbox.imap_host,
    port: Number(mailbox.imap_port),
    secure: mailbox.imap_security === "ssl",
    tls: { rejectUnauthorized: false },
  };
}

async function getMailbox(client: Awaited<ReturnType<typeof getCrmAdminClient>>["client"], mailboxId: number) {
  const { data, error } = await client.from("crm_mailboxes").select("*").eq("id", mailboxId).maybeSingle();
  if (error) throw error;
  if (!data) throw new Error("Mailbox not found.");
  return data as MailboxRecord;
}

async function syncMailbox(client: Awaited<ReturnType<typeof getCrmAdminClient>>["client"], mailbox: MailboxRecord) {
  const credentials = decryptMailboxCredentials(mailbox.encrypted_credentials ?? "");
  const imap = new ImapFlow({
    ...securityOptions(mailbox),
    auth: { user: credentials.username, pass: credentials.password },
    logger: false,
  });
  let imported = 0;

  try {
    await imap.connect();
    const lock = await imap.getMailboxLock("INBOX");
    try {
      const exists = imap.mailbox && typeof imap.mailbox === "object" ? imap.mailbox.exists : 0;
      const start = Math.max(1, exists - 49);
      for await (const message of imap.fetch(`${start}:*`, { envelope: true, source: true, flags: true, uid: true, internalDate: true })) {
        if (!message.source) continue;
        const parsed = await simpleParser(message.source);
        const providerMessageId = parsed.messageId || `imap:${message.uid}`;
        const sender = parsed.from?.value?.[0]?.address ?? null;
        const recipientList = addresses(parsed.to);
        const ccList = addresses(parsed.cc);
        const internalDate = message.internalDate instanceof Date ? message.internalDate : message.internalDate ? new Date(message.internalDate) : null;
        const receivedAt = internalDate?.toISOString() ?? parsed.date?.toISOString() ?? new Date().toISOString();
        const references = parsed.references ?? [];
        const headerCandidates = [parsed.inReplyTo, ...references].filter((value): value is string => Boolean(value));
        const { data: matchedMessage } = headerCandidates.length
          ? await client.from("crm_email_messages").select("thread_id, contact_id").eq("mailbox_id", mailbox.id).in("message_id", headerCandidates).limit(1).maybeSingle()
          : { data: null };
        const threadKey = parsed.inReplyTo || references[0] || parsed.subject || providerMessageId;
        let contactId: number | null = null;

        if (matchedMessage?.contact_id) {
          contactId = matchedMessage.contact_id;
        } else if (sender) {
          const { data: contact } = await client
            .from("crm_contacts")
            .select("id")
            .eq("company_id", mailbox.company_id)
            .eq("normalized_email", sender.toLowerCase())
            .maybeSingle();
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
        const { data: thread, error: threadError } = matchedMessage?.thread_id
          ? await client.from("crm_email_threads").update(threadPayload).eq("id", matchedMessage.thread_id).select("id").single()
          : await client.from("crm_email_threads").upsert(threadPayload, { onConflict: "mailbox_id,provider_thread_id" }).select("id").single();
        if (threadError) throw threadError;

        const { data: storedMessage, error: messageError } = await client
          .from("crm_email_messages")
          .upsert({
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
        if (contactId && storedMessage) {
          const eventType = matchedMessage?.thread_id ? "email_replied" : "email_received";
          const { data: existingTimeline } = await client.from("crm_contact_timeline").select("id").eq("company_id", mailbox.company_id).eq("contact_id", contactId).eq("event_type", eventType).contains("event_data", { provider_message_id: providerMessageId }).maybeSingle();
          if (!existingTimeline) {
            const { error: timelineError } = await client.from("crm_contact_timeline").insert({ company_id: mailbox.company_id, contact_id: contactId, event_type: eventType, event_data: { message_id: storedMessage.id, provider_message_id: providerMessageId, subject: parsed.subject || "(no subject)", sender } });
            if (timelineError) throw timelineError;
          }
        }
        imported += 1;
      }
    } finally {
      lock.release();
    }
    await client.from("crm_mailboxes").update({ status: "connected", last_sync_at: new Date().toISOString(), last_error: null }).eq("id", mailbox.id);
    return imported;
  } catch (error) {
    await client.from("crm_mailboxes").update({ status: "error", last_error: error instanceof Error ? error.message : "Mailbox sync failed." }).eq("id", mailbox.id);
    throw error;
  } finally {
    await imap.logout().catch(() => undefined);
  }
}

export async function GET(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return fail(authError, authError, 403);
    const params = new URL(request.url).searchParams;
    const mailboxId = Number(params.get("mailbox_id"));
    if (!Number.isInteger(mailboxId) || mailboxId <= 0) return fail("A valid mailbox is required.", "A valid mailbox is required.", 400);
    const mailbox = await getMailbox(client, mailboxId);
    const { data, error } = await client
      .from("crm_email_threads")
      .select("*, crm_email_messages(*)")
      .eq("mailbox_id", mailboxId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ mailbox: { id: mailbox.id, company_id: mailbox.company_id, email_address: mailbox.email_address, display_name: mailbox.email_address, status: "connected" }, threads: data ?? [] });
  } catch (error) {
    return fail(error, "Could not load mailbox messages.");
  }
}

export async function POST(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return fail(authError, authError, 403);
    const body = await request.json() as { mailbox_id?: number; action?: string; to?: string; cc?: string; subject?: string; text?: string };
    const mailboxId = Number(body.mailbox_id);
    if (!Number.isInteger(mailboxId) || mailboxId <= 0) return fail("A valid mailbox is required.", "A valid mailbox is required.", 400);
    const mailbox = await getMailbox(client, mailboxId);
    if (body.action === "send") {
      const to = body.to?.trim();
      const subject = body.subject?.trim();
      const textBody = body.text?.trim();
      if (!to || !subject || !textBody) return fail("Recipient, subject, and message are required.", "Recipient, subject, and message are required.", 400);
      const credentials = decryptMailboxCredentials(mailbox.encrypted_credentials ?? "");
      const transporter = nodemailer.createTransport({
        host: mailbox.smtp_host,
        port: Number(mailbox.smtp_port),
        secure: mailbox.smtp_security === "ssl",
        requireTLS: mailbox.smtp_security === "starttls",
        tls: { rejectUnauthorized: false },
        auth: { user: credentials.username, pass: credentials.password },
      });
      const sent = await transporter.sendMail({ from: mailbox.email_address, to, cc: body.cc?.trim() || undefined, subject, text: textBody });
      const providerMessageId = sent.messageId || `sent:${Date.now()}`;
      const { data: thread, error: threadError } = await client.from("crm_email_threads").insert({ company_id: mailbox.company_id, mailbox_id: mailbox.id, subject, provider_thread_id: providerMessageId, folder: "sent", updated_at: new Date().toISOString() }).select("id").single();
      if (threadError) throw threadError;
      const { error: messageError } = await client.from("crm_email_messages").insert({ company_id: mailbox.company_id, thread_id: thread.id, mailbox_id: mailbox.id, direction: "outbound", provider_message_id: providerMessageId, message_id: providerMessageId, sender: mailbox.email_address, recipients: to.split(",").map((value) => value.trim()).filter(Boolean), cc: body.cc ? body.cc.split(",").map((value) => value.trim()).filter(Boolean) : [], subject, text_body: textBody, is_read: true, sent_at: new Date().toISOString() });
      if (messageError) throw messageError;
      const recipientEmail = to.split(",")[0]?.trim().toLowerCase();
      if (recipientEmail) {
        const { data: contact } = await client.from("crm_contacts").select("id").eq("company_id", mailbox.company_id).eq("normalized_email", recipientEmail).maybeSingle();
        if (contact) {
          const { error: timelineError } = await client.from("crm_contact_timeline").insert({ company_id: mailbox.company_id, contact_id: contact.id, event_type: "admin_replied", event_data: { provider_message_id: providerMessageId, subject } });
          if (timelineError) throw timelineError;
        }
      }
      return NextResponse.json({ ok: true, message: "Email sent successfully." });
    }
    const imported = await syncMailbox(client, mailbox);
    return NextResponse.json({ ok: true, imported, message: imported ? `${imported} message(s) synced from Inbox.` : "Inbox checked. No messages found." });
  } catch (error) {
    return fail(error, "Could not sync mailbox messages.", 400);
  }
}

export async function PATCH(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return fail(authError, authError, 403);
    const body = await request.json() as { message_id?: number; is_read?: boolean };
    const messageId = Number(body.message_id);
    if (!Number.isInteger(messageId) || messageId <= 0) return fail("A valid message is required.", "A valid message is required.", 400);
    const { error } = await client.from("crm_email_messages").update({ is_read: body.is_read !== false }).eq("id", messageId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error, "Could not update message.");
  }
}
