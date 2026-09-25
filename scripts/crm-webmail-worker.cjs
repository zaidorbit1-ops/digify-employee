const crypto = require("node:crypto");
const { ImapFlow } = require("imapflow");
const { simpleParser } = require("mailparser");
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) {
  console.error("Supabase URL and service-role key are required for the webmail worker.");
  process.exit(1);
}

const db = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function encryptionKey() {
  const secret = process.env.CRM_MAILBOXES_ENCRYPTION_KEY || process.env.COMPANY_ACCOUNTS_ENCRYPTION_KEY;
  if (!secret) throw new Error("CRM_MAILBOXES_ENCRYPTION_KEY is required.");
  return crypto.createHash("sha256").update(secret).digest();
}

function decryptCredentials(payload) {
  const [version, ivValue, tagValue, encryptedValue] = String(payload || "").split(":");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) {
    throw new Error("Mailbox credentials have an invalid encryption format.");
  }
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  const value = Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");
  return JSON.parse(value);
}

function addresses(value) {
  if (!value || typeof value !== "object" || !("value" in value)) return [];
  const list = value.value;
  return Array.isArray(list) ? list.map((item) => item.address).filter(Boolean) : [];
}

function subjectCandidates(subject) {
  const value = String(subject || "").trim();
  if (!value) return [];
  const withoutReplyPrefix = value.replace(/^(re|fw|fwd):\s*/i, "").trim();
  return [...new Set([value, withoutReplyPrefix].filter(Boolean))];
}

function stringArray(value) {
  if (Array.isArray(value)) return value.filter((item) => typeof item === "string" && item.length > 0);
  return typeof value === "string" && value.length > 0 ? [value] : [];
}

async function syncMailbox(mailbox) {
  const credentials = decryptCredentials(mailbox.encrypted_credentials);
  const client = new ImapFlow({
    host: mailbox.imap_host,
    port: Number(mailbox.imap_port),
    secure: mailbox.imap_security === "ssl",
    tls: { rejectUnauthorized: false },
    auth: { user: credentials.username, pass: credentials.password },
    logger: false,
  });

  try {
    await client.connect();
    let highestUid = Number(mailbox.last_sync_uid || 0);
    const lock = await client.getMailboxLock("INBOX");
    try {
      const exists = client.mailbox && typeof client.mailbox === "object" ? client.mailbox.exists : 0;
      const start = highestUid > 0 ? Math.max(1, highestUid - 24) : Math.max(1, exists - 25);
      const useUidRange = highestUid > 0;
      for await (const message of client.fetch(`${start}:*`, { envelope: true, source: true, flags: true, uid: true, internalDate: true }, { uid: useUidRange })) {
        highestUid = Math.max(highestUid, Number(message.uid || 0));
        if (!message.source) continue;
        const parsed = await simpleParser(message.source);
        const providerMessageId = parsed.messageId || `imap:${message.uid}`;
        const sender = parsed.from?.value?.[0]?.address ?? null;
        const recipientList = addresses(parsed.to);
        const ccList = addresses(parsed.cc);
        const internalDate = message.internalDate instanceof Date ? message.internalDate : message.internalDate ? new Date(message.internalDate) : null;
        const receivedAt = internalDate?.toISOString() ?? parsed.date?.toISOString() ?? new Date().toISOString();
        const references = stringArray(parsed.references);
        const headerCandidates = [parsed.inReplyTo, ...references].filter(Boolean);

        const { data: matchedMessage } = headerCandidates.length
          ? await db.from("crm_email_messages").select("thread_id, contact_id").eq("mailbox_id", mailbox.id).in("message_id", headerCandidates).limit(1).maybeSingle()
          : { data: null };
        const { data: subjectThread } = !matchedMessage && subjectCandidates(parsed.subject).length
          ? await db.from("crm_email_threads").select("id, contact_id").eq("mailbox_id", mailbox.id).in("subject", subjectCandidates(parsed.subject)).order("updated_at", { ascending: false }).limit(1).maybeSingle()
          : { data: null };
        const matchedThreadId = matchedMessage?.thread_id || subjectThread?.id;

        const threadKey = parsed.inReplyTo || references[0] || parsed.subject || providerMessageId;
        let contactId = matchedMessage?.contact_id || subjectThread?.contact_id || null;

        if (!contactId && sender) {
          const { data: contact } = await db.from("crm_contacts").select("id").eq("company_id", mailbox.company_id).eq("normalized_email", sender.toLowerCase()).maybeSingle();
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

        const { data: thread } = matchedThreadId
          ? await db.from("crm_email_threads").update(threadPayload).eq("id", matchedThreadId).select("id").single()
          : await db.from("crm_email_threads").upsert(threadPayload, { onConflict: "mailbox_id,provider_thread_id" }).select("id").single();

        if (!thread) continue;

        const { data: storedMessage } = await db.from("crm_email_messages").upsert({
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

        if (parsed.attachments && parsed.attachments.length > 0 && storedMessage) {
          for (const att of parsed.attachments) {
            try {
              await db.from("crm_email_attachments").insert({
                company_id: mailbox.company_id,
                message_id: storedMessage.id,
                file_name: att.filename || "attachment",
                content_type: att.contentType || "application/octet-stream",
                storage_path: `data:${att.contentType || "application/octet-stream"};base64,${att.content ? att.content.toString("base64") : ""}`,
                file_size: att.size || (att.content ? att.content.length : 0),
              });
            } catch {
              // ignore
            }
          }
        }
      }
    } finally {
      lock.release();
    }
    await db.from("crm_mailboxes").update({ status: "connected", last_sync_at: new Date().toISOString(), last_sync_uid: highestUid, last_error: null }).eq("id", mailbox.id);
  } catch (err) {
    console.error(`[Worker] Error syncing mailbox ${mailbox.email_address}:`, err.message);
  } finally {
    await client.logout().catch(() => undefined);
  }
}

async function runWorkerLoop() {
  console.log("🚀 CRM Webmail Fast Sync Worker started (Every 3 seconds)...");
  while (true) {
    try {
      const { data: mailboxes } = await db.from("crm_mailboxes").select("*").eq("status", "connected");
      if (mailboxes && mailboxes.length > 0) {
        for (const mb of mailboxes) {
          await syncMailbox(mb);
        }
      }
    } catch (err) {
      console.error("[Worker] Loop error:", err.message);
    }
    await new Promise((r) => setTimeout(r, 3000));
  }
}

runWorkerLoop();
