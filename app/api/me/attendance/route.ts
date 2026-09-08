import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export async function GET(request: Request) {
  try {
    const client = await getSupabaseServerClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const { data: profile } = await client.from("profiles").select("role, employee_id").eq("user_id", user.id).single();
    if (profile?.role !== "employee" || !profile.employee_id) return NextResponse.json({ error: "Employee profile is not linked." }, { status: 403 });

    const month = new URL(request.url).searchParams.get("month") ?? "";
    let query = client.from("attendance").select("id, check_in, status, arrival_status, day_status, hours_worked, worked_minutes, session_start, session_end").eq("employee_id", profile.employee_id).order("check_in", { ascending: false });
    if (/^\d{4}-\d{2}$/.test(month)) {
      const [year, monthNumber] = month.split("-").map(Number);
      const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
      query = query.gte("check_in", `${month}-01T00:00:00.000Z`).lt("check_in", `${month}-${String(lastDay).padStart(2, "0")}T23:59:59.999Z`);
    }
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ attendance: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load your attendance." }, { status: 500 });
  }
}
