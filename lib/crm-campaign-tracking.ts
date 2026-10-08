import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const automatedAgentPattern =
  /bot|crawler|spider|preview|prefetch|headless|curl\/|wget\/|python-requests|go-http-client|java\/|proofpoint|mimecast|barracuda|safelinks|urlscan|linkcheck|googleimageproxy|facebookexternalhit|slackbot|discordbot|scanner/i;

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Campaign tracking service is not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function requestDetails(request: Request) {
  // Image proxies and privacy relays can fetch pixels for a recipient; no filter proves human intent.
  const userAgent = (request.headers.get("user-agent") ?? "").slice(0, 1000);
  const purpose = request.headers.get("purpose") ?? request.headers.get("sec-purpose") ?? "";
  const prefetch = /prefetch|prerender/i.test(purpose)
    || request.headers.get("sec-fetch-mode") === "navigate" && request.headers.get("sec-fetch-dest") === "empty"
    && /preview|scanner|bot/i.test(userAgent);
  const automatedAgent = automatedAgentPattern.test(userAgent);
  const methodIsAutomated = request.method !== "GET";
  const filterReason = automatedAgent
    ? "known_automated_user_agent"
    : prefetch
      ? "prefetch_request"
      : methodIsAutomated
        ? "non_get_request"
        : !userAgent
          ? "missing_user_agent"
        : null;
  const ipAddress = (
    request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-vercel-forwarded-for")?.split(",")[0]
    ?? request.headers.get("x-real-ip")
    ?? ""
  ).trim().slice(0, 64);

  return {
    userAgent,
    ipAddress: ipAddress || null,
    qualified: filterReason === null,
    metadata: {
      method: request.method,
      accept: (request.headers.get("accept") ?? "").slice(0, 300),
      sec_fetch_dest: request.headers.get("sec-fetch-dest"),
      sec_fetch_mode: request.headers.get("sec-fetch-mode"),
      purpose: purpose.slice(0, 100),
      referrer_host: safeHost(request.headers.get("referer")),
      filter_reason: filterReason,
    },
  };
}

function safeHost(value: string | null) {
  if (!value) return null;
  try {
    return new URL(value).host.slice(0, 255);
  } catch {
    return null;
  }
}

export async function recordCampaignTrackingRequest(
  token: string,
  expectedType: "opened" | "clicked",
  request: Request,
) {
  if (!/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(token)) return null;
  const details = requestDetails(request);
  const { data, error } = await serviceClient().rpc("record_crm_campaign_tracking_event", {
    p_token: token,
    p_event_id: randomUUID(),
    p_expected_event_type: expectedType,
    p_is_qualified: details.qualified,
    p_user_agent: details.userAgent,
    p_ip_address: details.ipAddress,
    p_metadata: details.metadata,
  });
  if (error) throw error;
  const result = Array.isArray(data) ? data[0] : data;
  if (!result?.matched || result.event_type !== expectedType) return null;
  return { targetUrl: typeof result.target_url === "string" ? result.target_url : null };
}

export async function recordLegacyCampaignTrackingRequest(
  messageId: number,
  eventType: "opened" | "clicked",
  request: Request,
  targetUrl?: string,
) {
  const details = requestDetails(request);
  const client = serviceClient();
  const { data: message, error: messageError } = await client
    .from("crm_campaign_messages")
    .select("id, company_id, campaign_contact_id, crm_campaign_contacts(campaign_id)")
    .eq("id", messageId)
    .maybeSingle();
  if (messageError) throw messageError;
  if (!message) return;
  const campaignContact = Array.isArray(message.crm_campaign_contacts)
    ? message.crm_campaign_contacts[0]
    : message.crm_campaign_contacts;
  const { error: eventError } = await client.from("crm_email_events").insert({
    company_id: message.company_id,
    campaign_id: campaignContact?.campaign_id ?? null,
    campaign_contact_id: message.campaign_contact_id,
    campaign_message_id: message.id,
    event_type: eventType,
    provider_event_id: `legacy:${eventType}:${message.id}:${randomUUID()}`,
    is_qualified: details.qualified,
    user_agent: details.userAgent || null,
    ip_address: details.ipAddress,
    metadata: { ...details.metadata, source: "legacy_campaign_tracking", target: targetUrl ?? null },
  });
  if (eventError) throw eventError;
  if (!details.qualified) return;

  const timestamp = new Date().toISOString();
  const status = eventType === "opened" ? ["sent", "delivered"] : ["sent", "delivered", "opened"];
  const messageUpdate = eventType === "opened"
    ? { opened_at: timestamp }
    : { clicked_at: timestamp };
  const { error: updateError } = await client.from("crm_campaign_messages")
    .update({ ...messageUpdate, status: eventType, updated_at: timestamp })
    .eq("id", message.id)
    .in("status", status);
  if (updateError) throw updateError;
}
