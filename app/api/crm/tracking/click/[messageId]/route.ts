import { createClient } from "@supabase/supabase-js";

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Tracking service is not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(request: Request, context: { params: Promise<{ messageId: string }> }) {
  const target = new URL(request.url).searchParams.get("url") || "/";
  let redirect = "/";
  try {
    const parsed = new URL(target);
    if (["http:", "https:"].includes(parsed.protocol)) redirect = parsed.toString();
  } catch { /* Invalid targets fall back to the application root. */ }

  try {
    const { messageId } = await context.params;
    const id = Number(messageId);
    if (Number.isInteger(id) && id > 0) {
      const client = serviceClient();
      const { data: message } = await client.from("crm_campaign_messages").select("id, company_id").eq("id", id).maybeSingle();
      if (message) await client.from("crm_email_events").insert({ company_id: message.company_id, campaign_message_id: message.id, event_type: "clicked", provider_event_id: `click:${message.id}:${Date.now()}`, metadata: { target: redirect } });
    }
  } catch { /* Tracking must never prevent a link from opening. */ }
  return Response.redirect(redirect, 302);
}
