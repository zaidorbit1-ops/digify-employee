import { createClient } from "@supabase/supabase-js";

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Tracking service is not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function safeTarget(value: string | null, requestUrl: string) {
  if (!value) return new URL("/", requestUrl).toString();
  try {
    const target = new URL(value);
    return ["http:", "https:"].includes(target.protocol) ? target.toString() : new URL("/", requestUrl).toString();
  } catch {
    return new URL("/", requestUrl).toString();
  }
}

export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const target = safeTarget(new URL(request.url).searchParams.get("url"), request.url);
  try {
    const { token } = await context.params;
    if (/^[\da-f]{8}-(?:[\da-f]{4}-){3}[\da-f]{12}$/i.test(token)) {
      const client = serviceClient();
      const { data: message, error } = await client.from("crm_email_messages")
        .select("id, company_id, thread_id")
        .eq("provider_message_id", `hostinger:sent:${token}`)
        .eq("direction", "outbound")
        .maybeSingle();
      if (error) throw error;
      if (message) {
        const { data: event, error: eventError } = await client.from("crm_email_events").upsert({
          company_id: message.company_id,
          message_id: message.id,
          event_type: "clicked",
          provider_event_id: `webmail-click:${token}`,
          metadata: { source: "webmail_click_tracker" },
        }, { onConflict: "provider_event_id", ignoreDuplicates: true }).select("id").maybeSingle();
        if (eventError) throw eventError;
        if (event) {
          const { error: threadError } = await client.from("crm_email_threads").update({ updated_at: new Date().toISOString() }).eq("id", message.thread_id);
          if (threadError) throw threadError;
        }
      }
    }
  } catch { /* A tracking failure must never block a destination link. */ }

  return Response.redirect(target, 302);
}