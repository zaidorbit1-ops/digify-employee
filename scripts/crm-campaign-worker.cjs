const { AccountApi, Configuration, SendApi } = require("hostinger-mail-api-sdk");
const { createClient } = require("@supabase/supabase-js");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceRoleKey) throw new Error("Supabase URL and service-role key are required for the CRM campaign worker.");

const db = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const workerId = `${process.env.COMPUTERNAME || process.env.HOSTNAME || "crm-worker"}:${process.pid}`;
const once = process.argv.includes("--once");
const pollMs = Number(process.env.CRM_CAMPAIGN_WORKER_POLL_MS || 5000);
const maxAttempts = Number(process.env.CRM_CAMPAIGN_MAX_ATTEMPTS || 3);

async function sendHostinger({ to, subject, html, text, displayName, mailboxAddress }) {
  const token = process.env.HOSTINGER_API_TOKEN;
  const address = String(mailboxAddress || process.env.HOSTINGER_MAILBOX || "").toLowerCase();
  if (!token || !address) throw new Error("Hostinger API configuration is incomplete.");
  const configuration = new Configuration({ accessToken: token });
  const account = await new AccountApi(configuration).getCurrentAccount();
  const mailbox = (account.data.data.mailboxes || []).find((item) => item.address.toLowerCase() === address);
  if (!mailbox) throw new Error("Configured Hostinger mailbox is not available to this API token.");
  await new SendApi(configuration).sendEmail(mailbox.resourceId, { to: [to], cc: [], bcc: [], displayName: displayName || "", subject, html, text, attachments: [] });
}

function render(value, contact, companyName) {
  return String(value || "").replace(/\{\{\s*(first_name|last_name|email|company_name)\s*\}\}/g, (_, key) => ({ first_name: contact.first_name || "", last_name: contact.last_name || "", email: contact.email || "", company_name: companyName || "" })[key] || "");
}

function matchesRule(contact, rule) {
  const actual = String(contact[rule.field] || "").toLowerCase();
  const expected = String(rule.value || "").toLowerCase();
  if (rule.operator === "equals") return actual === expected;
  if (rule.operator === "not_equals") return actual !== expected;
  if (rule.operator === "starts_with") return actual.startsWith(expected);
  return actual.includes(expected);
}

async function prepareCampaign(campaign) {
  if (!["scheduled", "running"].includes(campaign.status)) return;
  if (campaign.status === "scheduled" && campaign.schedule_at && new Date(campaign.schedule_at).getTime() > Date.now()) return;
  if (campaign.status === "scheduled") {
    const { error } = await db.from("crm_campaigns").update({ status: "running", updated_at: new Date().toISOString() }).eq("id", campaign.id).eq("status", "scheduled");
    if (error) throw error;
  }

  const [{ data: contacts, error: contactsError }, { data: existing, error: existingError }, { data: segment, error: segmentError }] = await Promise.all([
    db.from("crm_contacts").select("id, first_name, last_name, email, status, source").eq("company_id", campaign.company_id).eq("status", "active"),
    db.from("crm_campaign_contacts").select("contact_id").eq("campaign_id", campaign.id),
    campaign.segment_id ? db.from("crm_segments").select("rules").eq("id", campaign.segment_id).single() : Promise.resolve({ data: null, error: null }),
  ]);
  if (contactsError) throw contactsError;
  if (existingError) throw existingError;
  if (segmentError) throw segmentError;
  const existingIds = new Set((existing || []).map((item) => item.contact_id));
  const rules = Array.isArray(segment?.rules) ? segment.rules : [];
  const newContacts = (contacts || []).filter((contact) => !existingIds.has(contact.id) && rules.every((rule) => matchesRule(contact, rule)));
  if (!newContacts.length) return;

  const { data: inserted, error: insertError } = await db.from("crm_campaign_contacts").insert(newContacts.map((contact) => ({ company_id: campaign.company_id, campaign_id: campaign.id, contact_id: contact.id }))).select("id, contact_id");
  if (insertError) throw insertError;
  const start = campaign.schedule_at && new Date(campaign.schedule_at).getTime() > Date.now() ? new Date(campaign.schedule_at) : new Date();
  const messages = (inserted || []).map((item, index) => ({ company_id: campaign.company_id, campaign_contact_id: item.id, scheduled_at: new Date(start.getTime() + Math.floor(index / campaign.batch_size) * campaign.interval_seconds * 1000).toISOString(), status: "queued" }));
  const { error: messageError } = await db.from("crm_campaign_messages").insert(messages);
  if (messageError) throw messageError;
}

async function loadCampaigns() {
  const { data, error } = await db.from("crm_campaigns").select("*").in("status", ["scheduled", "running"]);
  if (error) throw error;
  for (const campaign of data || []) await prepareCampaign(campaign);
}

async function claim() {
  const { data, error } = await db.rpc("claim_crm_campaign_message", { p_worker_id: workerId });
  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

async function sendClaimed(message) {
  const { data: relation, error: relationError } = await db.from("crm_campaign_contacts").select("campaign_id, contact_id, crm_campaigns(*), crm_contacts(* )").eq("id", message.campaign_contact_id).single();
  if (relationError) throw relationError;
  const campaign = relation.crm_campaigns;
  const contact = relation.crm_contacts;
  const [{ data: mailbox, error: mailboxError }, { data: template, error: templateError }, { data: company, error: companyError }] = await Promise.all([
    db.from("crm_mailboxes").select("*").eq("id", campaign.mailbox_id).single(),
    db.from("crm_email_templates").select("*").eq("id", campaign.template_id).single(),
    db.from("crm_companies").select("name").eq("id", campaign.company_id).single(),
  ]);
  if (mailboxError) throw mailboxError;
  if (templateError) throw templateError;
  if (companyError) throw companyError;
  const subject = render(campaign.subject || template.subject, contact, company.name);
  const publicUrl = String(process.env.CRM_PUBLIC_URL || "").replace(/\/$/, "");
  let html = render(template.html_body, contact, company.name);
  if (publicUrl) {
    html = html.replace(/href=["'](https?:\/\/[^"']+)["']/gi, (_, url) => `href="${publicUrl}/api/crm/tracking/click/${message.id}?url=${encodeURIComponent(url)}"`);
    html += `<img src="${publicUrl}/api/crm/tracking/open/${message.id}" width="1" height="1" alt="" style="display:none" />`;
  }
  await sendHostinger({ to: contact.email, subject, html, text: render(template.text_body || subject, contact, company.name), displayName: campaign.from_name || undefined, mailboxAddress: mailbox.email_address });
  const providerMessageId = `hostinger:campaign:${message.id}`;
  const now = new Date().toISOString();
  await db.from("crm_campaign_messages").update({ status: "sent", sent_at: now, provider_message_id: providerMessageId, error_message: null, updated_at: now }).eq("id", message.id);
  await db.from("crm_campaign_contacts").update({ status: "sent" }).eq("id", message.campaign_contact_id);
  await db.from("crm_email_events").insert({ company_id: campaign.company_id, campaign_message_id: message.id, event_type: "sent", provider_event_id: providerMessageId, metadata: { worker_id: workerId } });
  await db.from("crm_contact_timeline").insert({ company_id: campaign.company_id, contact_id: contact.id, event_type: "campaign_email_sent", event_data: { campaign_id: campaign.id, campaign_message_id: message.id, provider_message_id: providerMessageId, subject } });
}

async function failClaimed(message, error) {
  const attempts = Number(message.attempt_count || 1);
  const permanent = attempts >= maxAttempts;
  const now = new Date();
  const nextAttempt = new Date(now.getTime() + Math.min(3600, 60 * (2 ** Math.max(0, attempts - 1))) * 1000);
  const reason = error instanceof Error ? error.message : "Campaign delivery failed.";
  await db.from("crm_campaign_messages").update({ status: permanent ? "failed" : "queued", error_message: reason, next_attempt_at: permanent ? null : nextAttempt.toISOString(), updated_at: now.toISOString() }).eq("id", message.id);
  await db.from("crm_campaign_contacts").update({ status: permanent ? "failed" : "queued" }).eq("id", message.campaign_contact_id);
  if (permanent) await db.from("crm_email_events").insert({ company_id: message.company_id, campaign_message_id: message.id, event_type: "failed", metadata: { error: reason, attempts } });
  console.error(`[campaign-worker] message ${message.id} ${permanent ? "failed permanently" : "queued for retry"}: ${reason}`);
}

async function finishCampaigns() {
  const { data: campaigns, error } = await db.from("crm_campaigns").select("id, status").eq("status", "running");
  if (error) throw error;
  for (const campaign of campaigns || []) {
    const { data: campaignContacts, error: contactsError } = await db.from("crm_campaign_contacts").select("id").eq("campaign_id", campaign.id);
    if (contactsError) continue;
    const contactIds = (campaignContacts || []).map((item) => item.id);
    if (!contactIds.length) continue;
    const { count, error: countError } = await db.from("crm_campaign_messages").select("id", { count: "exact", head: true }).in("campaign_contact_id", contactIds).in("status", ["queued", "processing"]);
    if (!countError && count === 0) await db.from("crm_campaigns").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", campaign.id).eq("status", "running");
  }
}

async function tick() {
  await loadCampaigns();
  for (let i = 0; i < 100; i += 1) {
    const message = await claim();
    if (!message) break;
    try { await sendClaimed(message); } catch (error) { await failClaimed(message, error); }
  }
  await finishCampaigns();
}

async function main() {
  console.log(`[campaign-worker] started as ${workerId}`);
  do {
    try { await tick(); } catch (error) { console.error("[campaign-worker] tick failed:", error); }
    if (!once) await new Promise((resolve) => setTimeout(resolve, pollMs));
  } while (!once);
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
