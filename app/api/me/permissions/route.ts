import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export async function GET() {
  try {
    const client = await getSupabaseServerClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const { data: profile } = await client.from("profiles").select("role, employee_id").eq("user_id", user.id).single();
    if (profile?.role !== "employee" || !profile.employee_id) return NextResponse.json({ permissions: [] });
    const { data, error } = await client.from("permissions").select("module, can_read, can_add, can_edit, can_delete").eq("employee_id", profile.employee_id).eq("can_read", true);
    if (error) throw error;
    return NextResponse.json({ permissions: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load your permissions." }, { status: 500 });
  }
}
