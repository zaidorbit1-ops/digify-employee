import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const cronSecret = Deno.env.get("CRM_CAMPAIGN_CRON_SECRET") ?? "";
const maxAttempts = Number(Deno.env.get("CRM_CAMPAIGN_MAX_ATTEMPTS") ?? "3");
const maxMessagesPerRun = 20;
const pageSize = 1000;
const workerId = `supabase-edge:${crypto.randomUUID()}`;

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

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message || error.name;
  if (error && typeof error === "object") {
    const record = error as Record<string, unknown>;
    const fields = ["message", "details", "hint", "code", "status", "statusCode", "name"];
    const parts = fields.flatMap((field) => {
      const value = record[field];
      return typeof value === "string" || typeof value === "number"
        ? [`${field === "message" ? "" : `${field}: `}${value}`]
        : [];
    });
    if (parts.length) return parts.join(" | ");
    return `Unknown object error (fields: ${Object.keys(record).join(", ") || "none"}).`;
  }
  return error === undefined || error === null ? "Unknown campaign delivery error." : String(error);
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
    console.error("CRM system log write failed:", errorMessage(error));
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

function mailboxEnvSuffix(address: string) {
  const normalized = address.trim().toLowerCase();
  const domain = normalized.split("@")[1];
  const suffix = (domain?.split(".")[0] ?? "").replace(/[^a-z0-9]/gi, "").toUpperCase();
  if (!suffix) throw new Error("A valid mailbox address is required to resolve the brand-specific API key.");
  return suffix;
}

function getBrevoApiKeyForMailbox(address: string) {
  const suffix = mailboxEnvSuffix(address);
  return Deno.env.get(`BREVO_API_KEY_${suffix}`) || Deno.env.get("BREVO_API_KEY") || "";
}

async function sendBrevo(input: { to: string; subject: string; html: string; text: string; displayName: string | null; mailbox: Record<string, any> }) {
  const address = String(input.mailbox.email_address ?? "").trim().toLowerCase();
  const apiKey = getBrevoApiKeyForMailbox(address);
  const suffix = mailboxEnvSuffix(address);
  if (!apiKey) throw new Error(`BREVO_API_KEY_${suffix} or BREVO_API_KEY is missing for ${address}.`);

  const response = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": apiKey,
    },
    body: JSON.stringify({
      sender: {
        name: input.displayName || input.mailbox.display_name || "CRM Campaign",
        email: address,
      },
      to: [{ email: input.to }],
      replyTo: {
        email: address,
        name: input.displayName || input.mailbox.display_name || "CRM Campaign",
      },
      subject: input.subject,
      htmlContent: input.html || input.text,
      textContent: input.text || input.html,
    }),
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    const detail = (await response.text()).slice(0, 1000);
    throw new Error(`Brevo email send failed (${response.status}): ${detail || response.statusText}`);
  }
  const result = await response.json().catch(() => null) as { messageId?: unknown } | null;
  return typeof result?.messageId === "string" ? result.messageId : null;
}

async function sendCampaignMessage(db: ReturnType<typeof createClient>, message: Record<string, any>, campaign: Record<string, any>, contact: Record<string, any>, mailbox: Record<string, any>, html: string, text: string, subject: string) {
  try {
    const brevoMessageId = await sendBrevo({
      to: contact.email,
      subject,
      html,
      text,
      displayName: campaign.from_name,
      mailbox,
    });
    return { providerMessageId: brevoMessageId ?? `brevo:campaign:${message.id}` };
  } catch (error) {
    const reason = errorMessage(error);
    await writeSystemLog(db, {
      level: "error",
      event: "campaign.email.provider_failed",
      message: `BREVO delivery failed for campaign message ${message.id}. ${safeLogMessage(reason)}`,
      companyId: campaign.company_id,
      metadata: {
        campaign_id: campaign.id,
        campaign_message_id: message.id,
        mailbox_id: campaign.mailbox_id,
        provider: "brevo",
        error: safeLogMessage(reason),
      },
    });
    throw new Error(`Brevo campaign delivery failed: ${reason}`);
  }
}

async function sendClaimed(db: ReturnType<typeof createClient>, message: Record<string, any>) {
  const { data: relation, error: relationError } = await db.from("crm_campaign_contacts")
    .select("campaign_id, contact_id, crm_campaigns(*), crm_contacts(*)")
    .eq("id", message.campaign_contact_id).single();
  if (relationError) throw relationError;
  const campaign = relation.crm_campaigns;
  const contact = relation.crm_contacts;
  const [mailboxResult, templateResult, companyResult] = await Promise.all([
    db.from("crm_mailboxes").select("id, company_id, email_address, display_name, status").eq("id", campaign.mailbox_id).single(),
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
  if (trackingBaseUrl) {
    html = html.replace(/href=["'](https?:\/\/[^"']+)["']/gi, (_match, url: string) => `href="${trackingBaseUrl}/api/crm/tracking/click/${message.id}?url=${encodeURIComponent(url)}"`);
    html += `<img src="${trackingBaseUrl}/api/crm/tracking/open/${message.id}" width="1" height="1" alt="" style="display:none" />`;
  } else {
    await writeSystemLog(db, {
      level: "warning",
      event: "campaign.tracking.disabled",
      message: "Campaign sent without tracking because EMAIL_TRACKING_BASE_URL is missing or is not a public HTTPS host.",
      companyId: campaign.company_id,
      metadata: { campaign_id: campaign.id, campaign_message_id: message.id },
    });
  }
  const text = render(templateResult.data.text_body || subject, contact, companyName);

  const { providerMessageId } = await sendCampaignMessage(db, message, campaign, contact, mailboxResult.data, html, text, subject);
  const now = new Date().toISOString();
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
      message: "Brevo accepted the campaign email, but the CRM Sent copy could not be stored.",
      companyId: campaign.company_id,
      metadata: { campaign_id: campaign.id, campaign_message_id: message.id, mailbox_id: campaign.mailbox_id },
    });
  }
  const [{ error: messageUpdateError }, { error: contactUpdateError }, { error: eventError }, { error: timelineError }] = await Promise.all([
    db.from("crm_campaign_messages").update({ status: "sent", sent_at: now, provider_message_id: providerMessageId, error_message: null, updated_at: now }).eq("id", message.id),
    db.from("crm_campaign_contacts").update({ status: "sent" }).eq("id", message.campaign_contact_id),
    db.from("crm_email_events").upsert({ company_id: campaign.company_id, campaign_message_id: message.id, event_type: "sent", provider_event_id: providerMessageId, metadata: { worker_id: workerId } }, { onConflict: "provider_event_id" }),
    db.from("crm_contact_timeline").insert({ company_id: campaign.company_id, contact_id: contact.id, event_type: "campaign_email_sent", event_data: { campaign_id: campaign.id, campaign_message_id: message.id, provider_message_id: providerMessageId, subject } }),
  ]);
  for (const error of [messageUpdateError, contactUpdateError, eventError, timelineError]) if (error) throw error;
  await writeSystemLog(db, {
    level: "success",
    event: "campaign.email.sent",
    message: "Campaign email sent successfully.",
    companyId: campaign.company_id,
    metadata: { campaign_id: campaign.id, campaign_message_id: message.id, mailbox_id: campaign.mailbox_id, email_subject: subject },
  });
}

async function failClaimed(db: ReturnType<typeof createClient>, message: Record<string, any>, error: unknown) {
  const attempts = Number(message.attempt_count || 1);
  const permanent = attempts >= maxAttempts;
  const now = new Date();
  const delaySeconds = Math.min(3600, 60 * (2 ** Math.max(0, attempts - 1)));
  const reason = errorMessage(error);
  const [{ error: messageError }, { error: contactError }] = await Promise.all([
    db.from("crm_campaign_messages").update({ status: permanent ? "failed" : "queued", error_message: reason.slice(0, 2000), next_attempt_at: permanent ? null : new Date(now.getTime() + delaySeconds * 1000).toISOString(), updated_at: now.toISOString() }).eq("id", message.id),
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
    const { error: eventError } = await db.from("crm_email_events").insert({ company_id: message.company_id, campaign_message_id: message.id, event_type: "failed", metadata: { error: reason.slice(0, 1000), attempts } });
    if (eventError) console.error("Failed to persist campaign failure event:", eventError.message);
  }
  console.error(`Campaign message ${message.id} ${permanent ? "failed permanently" : "queued for retry"}: ${reason}`, {
    attempt_count: attempts,
    permanent,
    campaign_message_id: message.id,
    error,
  });
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
      await sendClaimed(db, message);
    } catch (error) {
      failed += 1;
      await failClaimed(db, message, error);
    }
    processed += 1;
  }
  return { processed, failed };
}

async function finishCampaigns(db: ReturnType<typeof createClient>) {
  const campaigns = await allRows(() => db.from("crm_campaigns").select("id").eq("status", "running").order("id"));
  for (const campaign of campaigns) {
    const { count, error } = await db.from("crm_campaign_messages")
      .select("id, crm_campaign_contacts!inner(campaign_id)", { count: "exact", head: true })
      .eq("crm_campaign_contacts.campaign_id", campaign.id)
      .in("status", ["queued", "processing"]);
    if (error) throw error;
    if (count === 0) {
      const { error: updateError } = await db.from("crm_campaigns").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", campaign.id).eq("status", "running");
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
    const reason = errorMessage(error);
    console.error("CRM campaign Edge Function failed:", reason, error);
    await writeSystemLog(db, { level: "error", event: "campaign.worker.failed", message: reason });
    return json({ error: reason }, 500);
  }
});
