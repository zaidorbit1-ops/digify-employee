import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export async function GET() {
  try {
    const client = await getSupabaseServerClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    const { data: profile } = await client.from("profiles").select("role, employee_id").eq("user_id", user.id).single();
    if (profile?.role !== "employee" || !profile.employee_id) return NextResponse.json({ error: "Employee profile is not linked." }, { status: 403 });
    const { data, error } = await client.from("salaries").select("id, month, base_salary, late_days, absent_days, half_days, deduction_amount, net_pay, status, paid_at, receipt_storage_path, adjustment_note").eq("employee_id", profile.employee_id).order("month", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ salaries: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load your salary history." }, { status: 500 });
  }
}
