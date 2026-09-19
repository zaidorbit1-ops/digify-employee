import { createClient } from "@supabase/supabase-js";

const pixel = Buffer.from("R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==", "base64");

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Tracking service is not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(_: Request, context: { params: Promise<{ messageId: string }> }) {
  try {
    const { messageId } = await context.params;
    const id = Number(messageId);
    if (Number.isInteger(id) && id > 0) {
      const client = serviceClient();
      const { data: message } = await client.from("crm_campaign_messages").select("id, company_id").eq("id", id).maybeSingle();
      if (message) await client.from("crm_email_events").insert({ company_id: message.company_id, campaign_message_id: message.id, event_type: "opened", provider_event_id: `open:${message.id}:${Date.now()}`, metadata: { user_agent: "tracking-pixel" } });
    }
  } catch { /* Tracking must never break the recipient's email rendering. */ }
  return new Response(pixel, { headers: { "Content-Type": "image/gif", "Content-Length": String(pixel.length), "Cache-Control": "no-store, no-cache, must-revalidate" } });
}
