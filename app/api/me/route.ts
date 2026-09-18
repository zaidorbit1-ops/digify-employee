import { NextResponse } from "next/server";
import { buildAttendanceDays, dateKey } from "@/lib/attendance";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export async function GET() {
  try {
    const client = await getSupabaseServerClient();
    const { data: { user } } = await client.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: profile, error: profileError } = await client.from("profiles").select("user_id, role, employee_id, full_name, is_active").eq("user_id", user.id).single();
    if (profileError) throw profileError;
    if (profile.role !== "employee" || !profile.employee_id) return NextResponse.json({ error: "Employee profile is not linked." }, { status: 403 });

    const today = dateKey(new Date());
    const monthStart = `${today.slice(0, 7)}-01`;
    const [{ data: employee, error: employeeError }, { data: shifts, error: shiftError }, { data: punches, error: attendanceError }, { data: salaries, error: salariesError }, { data: leaves, error: leavesError }] = await Promise.all([
      client.from("employees").select("id, employee_id, name, email, phone, salary, joining_date, status, enrollment_status, shift_id, zk_device_uid").eq("id", profile.employee_id).single(),
      client.from("shift_timings").select("id, start_time, end_time, grace_minutes"),
      client.from("attendance").select("id, employee_id, zk_user_id, check_in, status, arrival_status, day_status, hours_worked, worked_minutes, session_start, session_end").eq("employee_id", profile.employee_id).gte("check_in", `${monthStart}T00:00:00.000Z`).order("check_in", { ascending: false }),
      client.from("salaries").select("id, month, base_salary, deduction_amount, net_pay, status, paid_at, adjustment_note").eq("employee_id", profile.employee_id).order("month", { ascending: false }).limit(12),
      client.from("leaves").select("id, start_date, end_date, reason, status, created_at").eq("employee_id", profile.employee_id).order("created_at", { ascending: false }).limit(10),
    ]);
    if (employeeError) throw new Error(`Employee data: ${employeeError.message}`);
    if (shiftError) throw new Error(`Shift data: ${shiftError.message}`);
    if (attendanceError) throw new Error(`Attendance data: ${attendanceError.message}`);
    if (salariesError) throw new Error(`Salary data: ${salariesError.message}`);
    if (leavesError) throw new Error(`Leave data: ${leavesError.message}`);

    const attendanceDays = employee
      ? buildAttendanceDays({
          employees: [employee],
          shifts: shifts ?? [],
          punches: punches ?? [],
          approvedLeaves: [],
          startDate: monthStart,
          endDate: today,
        })
      : [];
    const attendance = attendanceDays
      .filter((day) => day.punches.length > 0)
      .map((day) => ({
        id: day.punches[0]?.id,
        check_in: day.punches[0]?.check_in,
        status: day.status,
        arrival_status: day.arrival_status,
        day_status: day.status,
        hours_worked: day.hours_worked,
        worked_minutes: day.worked_minutes,
        session_end: day.session_end,
      }))
      .slice(-20)
      .reverse();
    const todayDay = attendanceDays.find((day) => day.date === today);
    const todayAttendance = todayDay?.punches.length
      ? {
          id: todayDay.punches[0]?.id,
          check_in: todayDay.punches[0]?.check_in,
          session_end: todayDay.session_end,
          worked_minutes: todayDay.worked_minutes,
          arrival_status: todayDay.arrival_status,
        }
      : null;
    const missingCheckoutWarnings = attendanceDays
      .filter((day) => {
        const checkIn = day.punches[0]?.check_in;
        return (
          day.punches.length === 1 &&
          Boolean(checkIn) &&
          Date.now() - new Date(checkIn).getTime() >= 13 * 60 * 60 * 1000
        );
      })
      .map((day) => ({
        date: day.date,
        check_in: day.punches[0].check_in,
      }));
    return NextResponse.json({
      employee,
      attendance,
      todayAttendance,
      missingCheckoutWarnings,
      salaries: salaries ?? [],
      leaves: leaves ?? [],
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load your dashboard." }, { status: 500 });
  }
}
