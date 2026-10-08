import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const cronSecret = Deno.env.get("CRM_CAMPAIGN_CRON_SECRET") ?? "";
const maxAttempts = Number(Deno.env.get("CRM_CAMPAIGN_MAX_ATTEMPTS") ?? "3");
const maxMessagesPerRun = 20;
const pageSize = 1000;
const workerId = `supabase-edge:${crypto.randomUUID()}`;

class AcceptedButUnrecordedError extends Error {
  constructor() {
    super("Hostinger accepted the campaign email but the database could not record the rolling send.");
  }
}

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function safeEqual(left: string, right: string) {
  const encoder = new TextEncoder();
  const a = encoder.encode(left);
  const b = encoder.encode(right);
  let mismatch = a.length ^ b.length;
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) mismatch |= (a[index] ?? 0) ^ (b[index] ?? 0);
  return mismatch === 0;
}

async function allRows(makeQuery: () => any) {
  const rows: any[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await makeQuery().range(offset, offset + pageSize - 1);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < pageSize) return rows;
  }
}

function safeLogMessage(value: string) {
  return value.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[email]").replace(/Bearer\s+\S+/gi, "Bearer [REDACTED]").slice(0, 500);
}

function describeDeliveryError(error: unknown): string {
  if (error instanceof Error) return error.message || error.name || "Campaign delivery failed.";
  if (typeof error === "string") return error;
  if (!error || typeof error !== "object") return `Campaign delivery failed (${String(error)}).`;

  const value = error as Record<string, unknown>;
  const fields = ["message", "error", "detail", "details", "hint", "code", "status", "statusCode", "statusText", "reason"];
  const parts = fields.flatMap((key) => {
    const field = value[key];
    if (typeof field === "string" && field.trim()) return [`${key}: ${field.trim()}`];
    if (typeof field === "number") return [`${key}: ${field}`];
    return [];
  });

  const response = value.response;
  if (response && typeof response === "object") {
    const responseValue = response as Record<string, unknown>;
    for (const key of ["status", "statusCode", "statusText", "data", "body"]) {
      const field = responseValue[key];
      if (typeof field === "string" && field.trim()) parts.push(`response ${key}: ${field.trim()}`);
      else if (typeof field === "number") parts.push(`response ${key}: ${field}`);
      else if (field && typeof field === "object" && !Array.isArray(field)) {
        const data = field as Record<string, unknown>;
        for (const detailKey of ["message", "error", "detail", "details", "code"]) {
          const detail = data[detailKey];
          if (typeof detail === "string" && detail.trim()) parts.push(`response ${detailKey}: ${detail.trim()}`);
        }
      }
    }
  }

  return parts.length ? parts.join("; ") : `Campaign delivery failed (unrecognized ${value.constructor?.name ?? "error"} object).`;
}

async function writeSystemLog(db: ReturnType<typeof createClient>, input: { level: "success" | "info" | "warning" | "error"; event: string; message: string; companyId?: number; requestId?: string; metadata?: Record<string, unknown> }) {
  try {
    const { error } = await db.rpc("insert_crm_system_log", {
      p_level: input.level,
      p_source: "crm-campaign-worker",
      p_event: input.event,
      p_message: safeLogMessage(input.message),
      p_route: "supabase/functions/crm-campaign-worker",
      p_request_id: input.requestId ?? workerId,
      p_company_id: input.companyId ?? null,
      p_metadata: input.metadata ?? {},
    });
    if (error) console.error("CRM system log write failed:", error.message);
  } catch (error) {
    console.error("CRM system log write failed:", error instanceof Error ? error.message : "Unknown error");
  }
}

function matchesRule(contact: Record<string, unknown>, rule: { field: string; operator: string; value: string }) {
  const actual = String(contact[rule.field] ?? "").toLowerCase();
  const expected = String(rule.value ?? "").toLowerCase();
  if (rule.operator === "equals") return actual === expected;
  if (rule.operator === "not_equals") return actual !== expected;
  if (rule.operator === "starts_with") return actual.startsWith(expected);
  return actual.includes(expected);
}

function render(value: string | null | undefined, contact: Record<string, any>, companyName: string) {
  return String(value ?? "").replace(/\{\{\s*(first_name|last_name|email|company_name)\s*\}\}/g, (_match, key: string) => ({
    first_name: contact.first_name ?? "",
    last_name: contact.last_name ?? "",
    email: contact.email ?? "",
    company_name: companyName,
  })[key] ?? "");
}

async function prepareCampaign(db: ReturnType<typeof createClient>, campaign: Record<string, any>) {
  if (!["scheduled", "running"].includes(campaign.status)) return;
  if (campaign.status === "scheduled" && campaign.schedule_at && new Date(campaign.schedule_at).getTime() > Date.now()) return;
  if (campaign.status === "scheduled") {
    const { data, error } = await db.from("crm_campaigns").update({ status: "running", updated_at: new Date().toISOString() }).eq("id", campaign.id).eq("status", "scheduled").select("id").maybeSingle();
    if (error) throw error;
    if (!data) return;
  }

  const [contacts, existing, segmentResult] = await Promise.all([
    campaign.contact_list_id
      ? allRows(() => db.from("crm_contact_list_members").select("contact_id, crm_contacts!inner(id, first_name, last_name, email, status, source, company_id)").eq("contact_list_id", campaign.contact_list_id).eq("crm_contacts.company_id", campaign.company_id).eq("crm_contacts.status", "active").order("contact_id")).then((members) => members.map((member: { crm_contacts: Record<string, any> }) => member.crm_contacts))
      : allRows(() => db.from("crm_contacts").select("id, first_name, last_name, email, status, source").eq("company_id", campaign.company_id).eq("status", "active").order("id")),
    allRows(() => db.from("crm_campaign_contacts").select("id, contact_id, crm_campaign_messages(id)").eq("campaign_id", campaign.id).order("id")),
    campaign.segment_id && !campaign.contact_list_id ? db.from("crm_segments").select("rules").eq("id", campaign.segment_id).eq("company_id", campaign.company_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
  ]);
  if (segmentResult.error) throw segmentResult.error;
  const existingIds = new Set(existing.map((item: { contact_id: number }) => item.contact_id));
  const rules = Array.isArray(segmentResult.data?.rules) ? segmentResult.data.rules : [];
  const eligible = contacts.filter((contact: Record<string, any>) => !existingIds.has(contact.id) && rules.every((rule: { field: string; operator: string; value: string }) => matchesRule(contact, rule)));
  const { data: inserted, error: insertError } = eligible.length
    ? await db.from("crm_campaign_contacts")
      .upsert(eligible.map((contact: Record<string, any>) => ({ company_id: campaign.company_id, campaign_id: campaign.id, contact_id: contact.id })), { onConflict: "campaign_id,contact_id", ignoreDuplicates: true })
      .select("id, contact_id")
    : { data: [], error: null };
  if (insertError) throw insertError;
  const orphaned = existing.filter((item: { crm_campaign_messages?: { id: number }[] }) => !item.crm_campaign_messages?.length);
  const queueContacts = [...orphaned, ...(inserted ?? [])];
  if (!queueContacts.length) return;

  const now = Date.now();
  const scheduledStart = campaign.schedule_at ? new Date(campaign.schedule_at).getTime() : now;
  const start = Math.max(now, Number.isFinite(scheduledStart) ? scheduledStart : now);
  const batchSize = Math.max(1, Number(campaign.batch_size) || 1);
  const intervalSeconds = Math.max(1, Number(campaign.interval_seconds) || 180);
  const messages = queueContacts.map((item: { id: number }, index: number) => ({
    company_id: campaign.company_id,
    campaign_contact_id: item.id,
    scheduled_at: new Date(start + Math.floor(index / batchSize) * intervalSeconds * 1000).toISOString(),
    status: "queued",
  }));
  const { error: messageError } = await db.from("crm_campaign_messages").upsert(messages, { onConflict: "campaign_contact_id", ignoreDuplicates: true });
  if (messageError) throw messageError;
}

async function prepareDueCampaigns(db: ReturnType<typeof createClient>) {
  const campaigns = await allRows(() => db.from("crm_campaigns").select("*").in("status", ["scheduled", "running"]).order("id"));
  for (const campaign of campaigns) await prepareCampaign(db, campaign);
}

function responseMessageId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  for (const key of ["messageId", "message_id", "providerMessageId", "provider_message_id", "id"]) {
    if (typeof item[key] === "string" && item[key].trim()) return (item[key] as string).trim();
  }
  for (const key of ["id", "data", "message", "result"]) {
    const nested = responseMessageId(item[key]);
    if (nested) return nested;
  }
  return null;
}

async function sendHostinger(input: { to: string; subject: string; html: string; text: string; displayName: string | null; mailbox: Record<string, any> }) {
  const address = String(input.mailbox.email_address ?? "").trim().toLowerCase();
  const suffix = (address.split("@")[1]?.split(".")[0] ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
  const token = Deno.env.get(`HOSTINGER_API_TOKEN_${suffix}`) || Deno.env.get("HOSTINGER_API_TOKEN");
  const configuredAddress = (Deno.env.get(`HOSTINGER_MAILBOX_${suffix}`) || address).trim().toLowerCase();
  const resourceId = String(input.mailbox.hostinger_resource_id ?? "");
  if (!token || !address || !resourceId) throw new Error("Hostinger API configuration is incomplete for the selected mailbox.");
  if (configuredAddress !== address) throw new Error(`HOSTINGER_MAILBOX_${suffix} must match ${address}.`);

  const response = await fetch(`https://api.mail.hostinger.com/api/v1/mailboxes/${encodeURIComponent(resourceId)}/send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      to: [input.to],
      cc: [],
      bcc: [],
      displayName: input.displayName ?? "",
      subject: input.subject,
      html: input.html,
      text: input.text,
      attachments: [],
    }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1000);
    throw new Error(`Hostinger email send failed (${response.status}): ${detail || response.statusText}`);
  }
  const responseBody = await response.text();
  const rfcHeader = response.headers.get("message-id");
  let providerMessageId = response.headers.get("x-message-id");
  let responseId: string | null = null;
  if (!providerMessageId && responseBody) {
    try {
      responseId = responseMessageId(JSON.parse(responseBody));
    } catch {
      responseId = null;
    }
  }
  providerMessageId ??= responseId;
  return {
    providerMessageId: providerMessageId?.trim() || null,
    rfcMessageId: rfcHeader?.trim() || (responseId?.includes("@") ? responseId : null),
  };
}

async function findHostingerRfcMessageId(input: {
  mailbox: Record<string, any>;
  recipient: string;
  subject: string;
  token: string;
}) {
  const address = String(input.mailbox.email_address ?? "").trim().toLowerCase();
  const suffix = (address.split("@")[1]?.split(".")[0] ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
  const token = Deno.env.get(`HOSTINGER_API_TOKEN_${suffix}`) || Deno.env.get("HOSTINGER_API_TOKEN");
  const resourceId = String(input.mailbox.hostinger_resource_id ?? "");
  if (!token || !resourceId) return null;

  const search = {
    since: "",
    before: "",
    flags: [],
    uid: "",
    subject: input.subject,
    from: "",
    to: input.recipient,
    cc: "",
    body: input.token,
    header: "",
    larger: 0,
    smaller: 0,
    text: "",
  };

  for (const folder of ["Sent", "INBOX.Sent"]) {
    const url = new URL(`https://api.mail.hostinger.com/api/v1/mailboxes/${encodeURIComponent(resourceId)}/folders/${encodeURIComponent(folder)}/messages/search`);
    url.searchParams.set("page", "1");
    url.searchParams.set("perPage", "10");
    url.searchParams.set("sort", "-uid");
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(search),
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) continue;
    const payload = await response.json() as Record<string, any>;
    const rows = Array.isArray(payload.data?.data) ? payload.data.data : Array.isArray(payload.data) ? payload.data : [];
    const matching = rows.filter((row: Record<string, any>) => {
      const recipients = Array.isArray(row.to) ? row.to.map((item: any) => String(item.address ?? item)).map((item: string) => item.toLowerCase()) : [];
      return typeof row.messageId === "string"
        && recipients.includes(input.recipient.toLowerCase())
        && String(row.subject ?? "").trim() === input.subject.trim();
    });
    if (matching.length === 1) return String(matching[0].messageId).trim();
  }
  return null;
}

async function prepareCampaignTracking(db: ReturnType<typeof createClient>, message: Record<string, any>, campaign: Record<string, any>, html: string, text: string, trackingBaseUrl: string) {
  const links = new Map<string, string>();
  const hrefPattern = /href=(["'])(https?:\/\/[^"']+)\1/gi;
  for (const match of html.matchAll(hrefPattern)) {
    const target = match[2].replace(/&amp;/gi, "&");
    try {
      const parsed = new URL(target);
      if (["http:", "https:"].includes(parsed.protocol)) links.set(target, target);
    } catch {
      continue;
    }
  }
  for (const match of text.matchAll(/https?:\/\/[^\s<>"']+/gi)) {
    const target = match[0].replace(/[),.!?;:]+$/, "").replace(/&amp;/gi, "&");
    try {
      const parsed = new URL(target);
      if (["http:", "https:"].includes(parsed.protocol)) links.set(target, target);
    } catch {
      continue;
    }
  }

  const { data: existing, error: existingError } = await db.from("crm_campaign_tracking_tokens")
    .select("token, event_type, target_url")
    .eq("campaign_message_id", message.id);
  if (existingError) throw existingError;
  const tokenByTarget = new Map<string, string>();
  let openToken = (existing ?? []).find((row: Record<string, any>) => row.event_type === "opened")?.token as string | undefined;
  for (const row of existing ?? []) {
    if (row.event_type === "clicked") tokenByTarget.set(row.target_url, row.token);
  }

  const newTokens: Record<string, unknown>[] = [];
  if (!openToken) {
    openToken = crypto.randomUUID();
    newTokens.push({
      token: openToken,
      campaign_id: campaign.id,
      campaign_contact_id: message.campaign_contact_id,
      campaign_message_id: message.id,
      event_type: "opened",
      target_url: "",
    });
  }
  for (const target of links.keys()) {
    if (tokenByTarget.has(target)) continue;
    const clickToken = crypto.randomUUID();
    tokenByTarget.set(target, clickToken);
    newTokens.push({
      token: clickToken,
      campaign_id: campaign.id,
      campaign_contact_id: message.campaign_contact_id,
      campaign_message_id: message.id,
      event_type: "clicked",
      target_url: target,
    });
  }
  if (newTokens.length) {
    const { error: insertError } = await db.from("crm_campaign_tracking_tokens").insert(newTokens);
    if (insertError) throw insertError;
  }

  const clickUrl = (token: string, target: string) =>
    `${trackingBaseUrl}/api/email/track/click/${token}?url=${encodeURIComponent(target)}`;
  const trackedHtml = html.replace(hrefPattern, (_match, quote: string, rawTarget: string) => {
    const target = rawTarget.replace(/&amp;/gi, "&");
    const clickToken = tokenByTarget.get(target);
    return clickToken ? `href=${quote}${clickUrl(clickToken, target)}${quote}` : _match;
  });
  const textUrls = new Map<string, string>();
  for (const [target, token] of tokenByTarget) textUrls.set(target, clickUrl(token, target));
  return {
    html: `${trackedHtml}<img src="${trackingBaseUrl}/api/email/track/open/${openToken}" width="1" height="1" alt="" style="display:none" />`,
    textUrls,
    openToken,
  };
}

async function sendClaimed(db: ReturnType<typeof createClient>, message: Record<string, any>): Promise<boolean> {
  const { data: relation, error: relationError } = await db.from("crm_campaign_contacts")
    .select("campaign_id, contact_id, crm_campaigns(*), crm_contacts(*)")
    .eq("id", message.campaign_contact_id).single();
  if (relationError) throw relationError;
  const campaign = relation.crm_campaigns;
  const contact = relation.crm_contacts;
  const [mailboxResult, templateResult, companyResult] = await Promise.all([
    db.from("crm_mailboxes").select("id, email_address, status, hostinger_resource_id").eq("id", campaign.mailbox_id).single(),
    db.from("crm_email_templates").select("subject, html_body, text_body").eq("id", campaign.template_id).single(),
    db.from("crm_companies").select("name").eq("id", campaign.company_id).single(),
  ]);
  if (mailboxResult.error) throw mailboxResult.error;
  if (templateResult.error) throw templateResult.error;
  if (companyResult.error) throw companyResult.error;
  if (mailboxResult.data.status !== "connected") throw new Error("Campaign sender mailbox is no longer connected.");

  const companyName = companyResult.data.name;
  const subject = render(campaign.subject || templateResult.data.subject, contact, companyName);
  const configuredTrackingUrl = (Deno.env.get("CRM_PUBLIC_URL") ?? "https://office.digifyitsolution.com").trim();
  let trackingBaseUrl = "";
  try {
    const trackingUrl = new URL(configuredTrackingUrl);
    if (trackingUrl.protocol === "https:") trackingBaseUrl = trackingUrl.origin;
  } catch {
    trackingBaseUrl = "";
  }
  let html = render(templateResult.data.html_body, contact, companyName);
  let text = render(templateResult.data.text_body || subject, contact, companyName);
  let openToken: string | null = null;
  let trackedTextUrls = new Map<string, string>();
  if (trackingBaseUrl) {
    const tracked = await prepareCampaignTracking(db, message, campaign, html, text, trackingBaseUrl);
    html = tracked.html;
    openToken = tracked.openToken;
    trackedTextUrls = tracked.textUrls;
    text = text.replace(/https?:\/\/[^\s<>"']+/gi, (url: string) => {
      const normalized = url.replace(/[),.!?;:]+$/, "").replace(/&amp;/gi, "&");
      const trackedUrl = trackedTextUrls.get(normalized);
      return trackedUrl ? `${trackedUrl}${url.slice(url.replace(/[),.!?;:]+$/, "").length)}` : url;
    });
  } else {
    await writeSystemLog(db, {
      level: "warning",
      event: "campaign.tracking.disabled",
      message: "Campaign sent without tracking because EMAIL_TRACKING_BASE_URL is missing or is not a public HTTPS host.",
      companyId: campaign.company_id,
      metadata: { campaign_id: campaign.id, campaign_message_id: message.id },
    });
  }
  const providerMessageId = `hostinger:campaign:${message.id}`;
  const reservationId = crypto.randomUUID();
  const { data: reservationData, error: reservationError } = await db.rpc("reserve_crm_campaign_send", {
    p_reservation_id: reservationId,
    p_campaign_message_id: message.id,
  });
  if (reservationError) throw reservationError;
  const reservation = Array.isArray(reservationData) ? reservationData[0] : reservationData;
  if (!reservation?.allowed) return false;

  let sendResult: { providerMessageId: string | null; rfcMessageId: string | null };
  try {
    sendResult = await sendHostinger({ to: contact.email, subject, html, text, displayName: campaign.from_name, mailbox: mailboxResult.data });
  } catch (error) {
    const { error: releaseError } = await db.rpc("release_crm_campaign_send", { p_reservation_id: reservationId });
    if (releaseError) console.error(`Campaign message ${message.id} failed and its quota reservation could not be released:`, releaseError.message);
    throw error;
  }
  let rfcMessageId = sendResult.rfcMessageId;
  if (!rfcMessageId && openToken) {
    try {
      rfcMessageId = await findHostingerRfcMessageId({
        mailbox: mailboxResult.data,
        recipient: contact.email,
        subject,
        token: openToken,
      });
    } catch (error) {
      console.warn(`Campaign message ${message.id} was accepted but its Hostinger Message-ID could not be looked up:`, error instanceof Error ? error.message : "Unknown error");
    }
  }

  const completionArgs = {
    p_reservation_id: reservationId,
    p_provider_message_id: providerMessageId,
    p_subject: subject,
    p_worker_id: workerId,
  };
  let { error: completionError } = await db.rpc("complete_crm_campaign_send", completionArgs);
  if (completionError) ({ error: completionError } = await db.rpc("complete_crm_campaign_send", completionArgs));
  if (completionError) {
    console.error(`Campaign message ${message.id} was accepted by Hostinger but could not be recorded:`, completionError.message);
    throw new AcceptedButUnrecordedError();
  }

  const now = new Date().toISOString();
  if (!rfcMessageId) {
    await writeSystemLog(db, {
      level: "warning",
      event: "campaign.email.provider_id_unavailable",
      message: "Hostinger accepted the campaign email, but its RFC Message-ID was not present in the send response or searchable Sent copy.",
      companyId: campaign.company_id,
      metadata: { campaign_id: campaign.id, campaign_message_id: message.id },
    });
  }
  const { error: providerIdError } = await db.from("crm_campaign_messages")
    .update({
      rfc_message_id: rfcMessageId,
      hostinger_message_id: sendResult.providerMessageId,
      updated_at: now,
    })
    .eq("id", message.id);
  if (providerIdError) {
    await writeSystemLog(db, {
      level: "warning",
      event: "campaign.email.provider_id_unrecorded",
      message: "Hostinger accepted the campaign email, but the provider Message-ID could not be recorded.",
      companyId: campaign.company_id,
      metadata: { campaign_id: campaign.id, campaign_message_id: message.id },
    });
  }
  try {
    const { data: thread, error: threadError } = await db.from("crm_email_threads").upsert({
      company_id: campaign.company_id,
      mailbox_id: campaign.mailbox_id,
      contact_id: contact.id,
      subject,
      provider_thread_id: providerMessageId,
      folder: "sent",
      updated_at: now,
    }, { onConflict: "mailbox_id,provider_thread_id" }).select("id").single();
    if (threadError) throw threadError;
    const { error: sentCopyError } = await db.from("crm_email_messages").upsert({
      company_id: campaign.company_id,
      thread_id: thread.id,
      mailbox_id: campaign.mailbox_id,
      contact_id: contact.id,
      direction: "outbound",
      provider_message_id: providerMessageId,
      campaign_message_id: message.id,
      message_id: rfcMessageId,
      sender: mailboxResult.data.email_address,
      recipients: [contact.email],
      subject,
      text_body: text || null,
      html_body: html || null,
      is_read: true,
      sent_at: now,
    }, { onConflict: "mailbox_id,provider_message_id", ignoreDuplicates: true });
    if (sentCopyError) throw sentCopyError;
  } catch (error) {
    console.error("Campaign email sent, but its CRM Sent copy could not be stored:", error instanceof Error ? error.message : "Unknown error");
    await writeSystemLog(db, {
      level: "warning",
      event: "campaign.email.sent_copy_failed",
      message: "Hostinger accepted the campaign email, but the CRM Sent copy could not be stored.",
      companyId: campaign.company_id,
      metadata: { campaign_id: campaign.id, campaign_message_id: message.id, mailbox_id: campaign.mailbox_id },
    });
  }
  await writeSystemLog(db, {
    level: "success",
    event: "campaign.email.sent",
    message: "Campaign email sent successfully.",
    companyId: campaign.company_id,
    metadata: { campaign_id: campaign.id, campaign_message_id: message.id, mailbox_id: campaign.mailbox_id, email_subject: subject },
  });
  return true;
}

async function failClaimed(db: ReturnType<typeof createClient>, message: Record<string, any>, error: unknown) {
  const attempts = Number(message.attempt_count || 1);
  const permanent = attempts >= maxAttempts;
  const now = new Date();
  const delaySeconds = Math.min(3600, 60 * (2 ** Math.max(0, attempts - 1)));
  const reason = safeLogMessage(describeDeliveryError(error));
  const [{ error: messageError }, { error: contactError }] = await Promise.all([
    db.from("crm_campaign_messages").update({ status: permanent ? "failed" : "queued", failed_at: permanent ? now.toISOString() : null, error_message: reason.slice(0, 2000), next_attempt_at: permanent ? null : new Date(now.getTime() + delaySeconds * 1000).toISOString(), updated_at: now.toISOString() }).eq("id", message.id),
    db.from("crm_campaign_contacts").update({ status: permanent ? "failed" : "queued" }).eq("id", message.campaign_contact_id),
  ]);
  if (messageError) throw messageError;
  if (contactError) throw contactError;
  const { data: campaignContext } = await db.from("crm_campaign_contacts")
    .select("campaign_id, crm_campaigns(name, mailbox_id, subject)")
    .eq("id", message.campaign_contact_id)
    .maybeSingle();
  const campaign = Array.isArray(campaignContext?.crm_campaigns) ? campaignContext.crm_campaigns[0] : campaignContext?.crm_campaigns;
  await writeSystemLog(db, {
    level: permanent ? "error" : "warning",
    event: permanent ? "campaign.email.failed" : "campaign.email.retry_scheduled",
    message: safeLogMessage(reason),
    companyId: message.company_id,
    metadata: { campaign_id: campaignContext?.campaign_id, campaign_name: campaign?.name, campaign_message_id: message.id, mailbox_id: campaign?.mailbox_id, email_subject: campaign?.subject, attempt_count: attempts, permanent },
  });
  if (permanent) {
    const { error: eventError } = await db.from("crm_email_events").upsert({
      company_id: message.company_id,
      campaign_id: campaignContext?.campaign_id,
      campaign_contact_id: message.campaign_contact_id,
      campaign_message_id: message.id,
      event_type: "failed",
      provider_event_id: `campaign:failed:${message.id}:${attempts}`,
      event_time: now.toISOString(),
      metadata: { error: reason.slice(0, 1000), attempts },
    }, { onConflict: "provider_event_id", ignoreDuplicates: true });
    if (eventError) console.error("Failed to persist campaign failure event:", eventError.message);
  }
  console.error(`Campaign message ${message.id} ${permanent ? "failed permanently" : "queued for retry"}: ${reason}`);
}

async function deliverDueMessages(db: ReturnType<typeof createClient>) {
  let processed = 0;
  let failed = 0;
  for (let attempt = 0; attempt < maxMessagesPerRun; attempt += 1) {
    const { data, error } = await db.rpc("claim_crm_campaign_message", { p_worker_id: workerId });
    if (error) throw error;
    const message = Array.isArray(data) ? data[0] : data;
    if (!message) break;
    try {
      const sent = await sendClaimed(db, message);
      if (!sent) break;
    } catch (error) {
      failed += 1;
      if (error instanceof AcceptedButUnrecordedError) {
        await writeSystemLog(db, {
          level: "error",
          event: "campaign.email.quota_recording_failed",
          message: error.message,
          companyId: message.company_id,
          metadata: { campaign_message_id: message.id },
        });
      } else {
        await failClaimed(db, message, error);
      }
    }
    processed += 1;
  }
  return { processed, failed };
}

async function finishCampaigns(db: ReturnType<typeof createClient>) {
  const campaigns = await allRows(() => db.from("crm_campaigns").select("id").in("status", ["running", "rate_limit_pause"]).order("id"));
  for (const campaign of campaigns) {
    const { count, error } = await db.from("crm_campaign_messages")
      .select("id, crm_campaign_contacts!inner(campaign_id)", { count: "exact", head: true })
      .eq("crm_campaign_contacts.campaign_id", campaign.id)
      .in("status", ["queued", "processing"]);
    if (error) throw error;
    if (count === 0) {
      const { error: updateError } = await db.from("crm_campaigns").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", campaign.id).in("status", ["running", "rate_limit_pause"]);
      if (updateError) throw updateError;
    }
  }
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ error: "Method not allowed." }, 405);
  const providedSecret = request.headers.get("x-cron-secret") ?? "";
  if (!cronSecret || !safeEqual(providedSecret, cronSecret)) return json({ error: "Unauthorized." }, 401);
  if (!supabaseUrl || !serviceRoleKey) return json({ error: "Supabase service configuration is missing." }, 500);

  const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const { error: rollingStatusError } = await db.rpc("crm_campaign_rolling_send_status", { p_company_id: null });
    if (rollingStatusError) throw rollingStatusError;
    await prepareDueCampaigns(db);
    const delivery = await deliverDueMessages(db);
    await finishCampaigns(db);
    await writeSystemLog(db, {
      level: delivery.failed ? "warning" : "success",
      event: "campaign.worker.completed",
      message: `Campaign worker processed ${delivery.processed} message(s), with ${delivery.failed} failure(s).`,
      requestId: workerId,
      metadata: delivery,
    });
    return json({ ok: true, ...delivery });
  } catch (error) {
    console.error("CRM campaign Edge Function failed:", error);
    await writeSystemLog(db, { level: "error", event: "campaign.worker.failed", message: error instanceof Error ? error.message : "Campaign processing failed." });
    return json({ error: error instanceof Error ? error.message : "Campaign processing failed." }, 500);
  }
});
