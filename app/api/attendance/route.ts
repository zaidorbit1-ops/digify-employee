import { NextResponse } from "next/server";
import { getAttendance, getEmployees } from "@/lib/supabase";

export async function GET() {
  try {
    const [attendance, employees] = await Promise.all([
      getAttendance(),
      getEmployees(),
    ]);
    const employeeByUid = new Map(
      employees
        .filter((employee) => employee.zk_device_uid != null)
        .map((employee) => [Number(employee.zk_device_uid), employee])
    );
    const enrichedAttendance = attendance.map((record) => ({
      ...record,
      employee: employeeByUid.get(Number(record.zk_user_id)) ?? null,
    }));
    return NextResponse.json({ attendance: enrichedAttendance });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}
