import { NextResponse } from "next/server";
import { addDays, buildAttendanceDays, dateKey, sessionDateKey } from "@/lib/attendance";
import { clearAttendanceForEmployeeDate, getAttendance, getEmployees, getLeavesForRange, getShiftTimings, updateAttendanceRecord } from "@/lib/supabase";

function monthRange(month: string) {
  const today = dateKey(new Date());
  const safeMonth = /^\d{4}-\d{2}$/.test(month) ? month : today.slice(0, 7);
  const [year, monthNumber] = safeMonth.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { month: safeMonth, start: `${safeMonth}-01`, end: `${safeMonth}-${String(lastDay).padStart(2, "0")}` };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const view = url.searchParams.get("view") ?? "today";
    const today = dateKey(new Date());
    const range = view === "history" ? monthRange(url.searchParams.get("month") ?? "") : { month: "", start: addDays(today, -1), end: today };
    const [attendance, employees, shifts, approvedLeaves] = await Promise.all([getAttendance(), getEmployees(), getShiftTimings(), getLeavesForRange(range.start, range.end)]);
    const shiftById = new Map(shifts.map((shift) => [shift.id, shift]));
    const allDays = buildAttendanceDays({ employees, shifts, punches: attendance, approvedLeaves, startDate: range.start, endDate: range.end });
    const days = view === "history"
      ? allDays
      : allDays.filter((day) => day.date === sessionDateKey(new Date(), day.employee.shift_id ? shiftById.get(day.employee.shift_id) : undefined));
    const employeeByUid = new Map(employees.filter((employee) => employee.zk_device_uid != null).map((employee) => [Number(employee.zk_device_uid), employee]));
    const enrichedAttendance = attendance.map((record) => ({ ...record, employee: employeeByUid.get(Number(record.zk_user_id)) ?? null }));
    return NextResponse.json({ attendance: enrichedAttendance, days, month: range.month, employees, shifts });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const id = Number(body.id);
    const checkIn = String(body.check_in ?? "");
    if (!Number.isInteger(id) || id <= 0 || !checkIn) return NextResponse.json({ error: "A valid attendance record and time are required." }, { status: 400 });
    const record = await updateAttendanceRecord(id, new Date(checkIn).toISOString());
    return NextResponse.json({ record });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update attendance." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const url = new URL(request.url);
    const employeeId = Number(url.searchParams.get("employee_id"));
    const date = String(url.searchParams.get("date") ?? "");
    if (!Number.isInteger(employeeId) || employeeId <= 0 || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "A valid employee and date are required." }, { status: 400 });
    await clearAttendanceForEmployeeDate(employeeId, date);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not clear attendance." }, { status: 500 });
  }
}
