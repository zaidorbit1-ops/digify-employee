import { NextResponse } from "next/server";
import { buildAttendanceDays, dateKey } from "@/lib/attendance";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export async function GET(request: Request) {
  try {
    const client = await getSupabaseServerClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user)
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    const { data: profile } = await client
      .from("profiles")
      .select("role, employee_id")
      .eq("user_id", user.id)
      .single();
    if (profile?.role !== "employee" || !profile.employee_id)
      return NextResponse.json(
        { error: "Employee profile is not linked." },
        { status: 403 },
      );

    const month = /^\d{4}-\d{2}$/.test(
      new URL(request.url).searchParams.get("month") ?? "",
    )
      ? new URL(request.url).searchParams.get("month")!
      : dateKey(new Date()).slice(0, 7);
    const [year, monthNumber] = month.split("-").map(Number);
    const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
    const startDate = `${month}-01`;
    const endDate = `${month}-${String(lastDay).padStart(2, "0")}`;
    const nextMonthDate = new Date(Date.UTC(year, monthNumber, 1));
    const nextMonthStart = `${nextMonthDate.getUTCFullYear()}-${String(nextMonthDate.getUTCMonth() + 1).padStart(2, "0")}-01`;
    const [
      { data: employee, error: employeeError },
      { data: shifts, error: shiftError },
      { data: punches, error: attendanceError },
      { data: leaves, error: leaveError },
    ] = await Promise.all([
      client
        .from("employees")
        .select("id, name, employee_id, shift_id, zk_device_uid")
        .eq("id", profile.employee_id)
        .single(),
      client
        .from("shift_timings")
        .select("id, start_time, end_time, grace_minutes"),
      client
        .from("attendance")
        .select(
          "id, employee_id, zk_user_id, check_in, status, arrival_status, day_status, hours_worked, worked_minutes, session_start, session_end",
        )
        .eq("employee_id", profile.employee_id)
        .gte("check_in", `${startDate}T00:00:00.000Z`)
        .lt("check_in", `${nextMonthStart}T00:00:00.000Z`)
        .order("check_in", { ascending: false }),
      client
        .from("leaves")
        .select("employee_id, start_date, end_date")
        .eq("employee_id", profile.employee_id)
        .eq("status", "approved")
        .lte("start_date", endDate)
        .gte("end_date", startDate),
    ]);
    if (employeeError) throw employeeError;
    if (shiftError) throw shiftError;
    if (attendanceError) throw attendanceError;
    if (leaveError) throw leaveError;
    const days = buildAttendanceDays({
      employees: [employee],
      shifts: shifts ?? [],
      punches: punches ?? [],
      approvedLeaves: leaves ?? [],
      startDate,
      endDate,
    });
    return NextResponse.json({
      attendance: days
        .map((day) => ({
          id: day.punches[0]?.id ?? -Date.parse(day.date),
          check_in: day.punches[0]?.check_in ?? null,
          status: day.status,
          day_status: day.status,
          arrival_status: day.arrival_status,
          hours_worked: day.hours_worked,
          worked_minutes: day.worked_minutes,
          session_end: day.session_end,
          date: day.date,
          upcoming: day.status === null,
        }))
        .sort((a, b) => b.date.localeCompare(a.date)),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load your attendance.",
      },
      { status: 500 },
    );
  }
}
