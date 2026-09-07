import { NextResponse } from "next/server";
import { buildAttendanceDays } from "@/lib/attendance";
import { getAttendance, getEmployees, getLeavesForRange, getShiftTimings } from "@/lib/supabase";

function monthRange(month: string) {
  const safeMonth = /^\d{4}-\d{2}$/.test(month) ? month : new Date().toISOString().slice(0, 7);
  const [year, monthNumber] = safeMonth.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { month: safeMonth, start: `${safeMonth}-01`, end: `${safeMonth}-${String(lastDay).padStart(2, "0")}` };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const view = url.searchParams.get("view") ?? "today";
    const range = view === "history" ? monthRange(url.searchParams.get("month") ?? "") : { month: "", start: new Date().toISOString().slice(0, 10), end: new Date().toISOString().slice(0, 10) };
    const [attendance, employees, shifts, approvedLeaves] = await Promise.all([getAttendance(), getEmployees(), getShiftTimings(), getLeavesForRange(range.start, range.end)]);
    const days = buildAttendanceDays({ employees, shifts, punches: attendance, approvedLeaves, startDate: range.start, endDate: range.end });
    const employeeByUid = new Map(employees.filter((employee) => employee.zk_device_uid != null).map((employee) => [Number(employee.zk_device_uid), employee]));
    const enrichedAttendance = attendance.map((record) => ({ ...record, employee: employeeByUid.get(Number(record.zk_user_id)) ?? null }));
    return NextResponse.json({ attendance: enrichedAttendance, days, month: range.month, employees, shifts });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}
