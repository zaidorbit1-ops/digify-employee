import { NextResponse } from "next/server";
import { getCrmAdminContext } from "@/lib/crm-admin";
import { getSupabaseServiceRoleClient } from "@/lib/supabase-server";

const levels = ["success", "info", "warning", "error"] as const;

export async function GET(request: Request) {
  try {
    const { error: authError, profile } = await getCrmAdminContext();
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });
    if (profile?.role !== "superadmin") return NextResponse.json({ error: "Superadmin access required." }, { status: 403 });

    const params = new URL(request.url).searchParams;
    const level = params.get("level");
    const search = params.get("search")?.trim().replace(/[,%()]/g, "").slice(0, 100);
    const client = getSupabaseServiceRoleClient();
    let query = client.from("crm_system_logs").select("id, created_at, level, source, event, message, route, request_id, company_id, metadata").order("created_at", { ascending: false }).order("id", { ascending: false }).limit(300);
    if (levels.includes(level as (typeof levels)[number])) query = query.eq("level", level);
    if (search) query = query.or(`message.ilike.%${search}%,event.ilike.%${search}%,source.ilike.%${search}%,route.ilike.%${search}%`);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ logs: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load system logs." }, { status: 500 });
  }
}