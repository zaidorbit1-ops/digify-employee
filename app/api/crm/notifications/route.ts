import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

async function getSuperadminClient() {
  const client = await getSupabaseServerClient();
  const { data: { user } } = await client.auth.getUser();
  if (!user) return { client, user: null, status: 401 };

  const { data: profile, error } = await client
    .from("profiles")
    .select("role, is_active")
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw error;
  if (profile?.role !== "superadmin" || profile.is_active === false) return { client, user: null, status: 403 };
  return { client, user, status: 200 };
}

export async function GET() {
  try {
    const { client, user, status } = await getSuperadminClient();
    if (!user) return NextResponse.json({ error: "Superadmin access required." }, { status });
    const { data, error } = await client
      .from("notifications")
      .select("id, recipient_id, type, message, is_read, related_record_id, created_at")
      .eq("recipient_id", user.id)
      .in("type", ["crm_lead", "crm_email"])
      .order("created_at", { ascending: false })
      .limit(40);
    if (error) throw error;
    return NextResponse.json({ notifications: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load CRM notifications." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { client, user, status } = await getSuperadminClient();
    if (!user) return NextResponse.json({ error: "Superadmin access required." }, { status });
    const body = await request.json() as { id?: unknown };
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "A valid notification is required." }, { status: 400 });
    const { error } = await client
      .from("notifications")
      .update({ is_read: true })
      .eq("id", id)
      .eq("recipient_id", user.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update notification." }, { status: 500 });
  }
}