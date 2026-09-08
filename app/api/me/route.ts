import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export async function GET() {
  try {
    const client = await getSupabaseServerClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: profile, error: profileError } = await client.from("profiles").select("user_id, role, employee_id, full_name, is_active").eq("user_id", user.id).single();
    if (profileError) throw profileError;
    if (profile.role !== "employee" || !profile.employee_id) return NextResponse.json({ error: "Employee profile is not linked." }, { status: 403 });

    const [{ data: employee, error: employeeError }, { data: attendance, error: attendanceError }, { data: salaries, error: salariesError }, { data: leaves, error: leavesError }] = await Promise.all([
      client.from("employees").select("id, employee_id, name, email, phone, salary, joining_date, status, enrollment_status").eq("id", profile.employee_id).single(),
      client.from("attendance").select("id, check_in, status, arrival_status, day_status, hours_worked, worked_minutes, session_start, session_end").eq("employee_id", profile.employee_id).order("check_in", { ascending: false }).limit(20),
      client.from("salaries").select("id, month, base_salary, deduction_amount, net_pay, status, paid_at, adjustment_note").eq("employee_id", profile.employee_id).order("month", { ascending: false }).limit(12),
      client.from("leaves").select("id, start_date, end_date, reason, status, created_at").eq("employee_id", profile.employee_id).order("created_at", { ascending: false }).limit(10),
    ]);
    if (employeeError) throw new Error(`Employee data: ${employeeError.message}`);
    if (attendanceError) throw new Error(`Attendance data: ${attendanceError.message}`);
    if (salariesError) throw new Error(`Salary data: ${salariesError.message}`);
    if (leavesError) throw new Error(`Leave data: ${leavesError.message}`);

    return NextResponse.json({ employee, attendance: attendance ?? [], salaries: salaries ?? [], leaves: leaves ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load your dashboard." }, { status: 500 });
  }
}
