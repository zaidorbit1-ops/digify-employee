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

export async function GET(request: Request) {
  try {
    const { client, user, status } = await getSuperadminClient();
    if (!user) return NextResponse.json({ error: "Superadmin access required." }, { status });
    const params = new URL(request.url).searchParams;
    const requestedPage = Number(params.get("page") || 1);
    const requestedLimit = Number(params.get("limit") || 10);
    const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
    const limit = Number.isInteger(requestedLimit) ? Math.min(100, Math.max(1, requestedLimit)) : 10;
    const typeFilter = params.get("type");
    const readFilter = params.get("read");
    const supportedType = typeFilter === "crm_lead" || typeFilter === "crm_email" ? typeFilter : null;
    const supportedRead = readFilter === "read" || readFilter === "unread" ? readFilter : null;
    let historyQuery = client
      .from("notifications")
      .select("id, recipient_id, type, message, is_read, related_record_id, related_url, created_at", { count: "exact" })
      .eq("recipient_id", user.id)
      .in("type", ["crm_lead", "crm_email"]);
    if (supportedType) historyQuery = historyQuery.eq("type", supportedType);
    if (supportedRead) historyQuery = historyQuery.eq("is_read", supportedRead === "read");
    const [notificationsResult, unreadResult] = await Promise.all([
      historyQuery
        .order("created_at", { ascending: false })
        .range((page - 1) * limit, page * limit - 1),
      client
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", user.id)
        .in("type", ["crm_lead", "crm_email"])
        .eq("is_read", false),
    ]);
    if (notificationsResult.error) throw notificationsResult.error;
    if (unreadResult.error) throw unreadResult.error;
    return NextResponse.json({
      notifications: notificationsResult.data ?? [],
      unreadCount: unreadResult.count ?? 0,
      page,
      totalCount: notificationsResult.count ?? 0,
      hasMore: page * limit < (notificationsResult.count ?? 0),
    });
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