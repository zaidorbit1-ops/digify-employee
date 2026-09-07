import { NextResponse } from "next/server";
import { calculatePunchFields } from "@/lib/attendance";
import { connectToZkDevice, normalizeAttendanceRecord } from "@/lib/zkteco";
import { getDevices, getEmployees, getShiftTimings, upsertAttendanceRecords } from "@/lib/supabase";

export async function POST(request: Request) {
  let zkDevice: Awaited<ReturnType<typeof connectToZkDevice>> | null = null;

  try {
    const body = await request.json().catch(() => ({}));
    const devices = await getDevices();
    const requestedDeviceId = Number(body.device_id);
    const device = devices.find((item) => item.id === requestedDeviceId) ?? devices.find((item) => item.status === "active") ?? devices[0];

    if (!device) {
      return NextResponse.json(
        { ok: false, error: "Add a K60 device before starting attendance sync." },
        { status: 400 }
      );
    }

    zkDevice = await connectToZkDevice(device.device_ip, device.port);

    const usersResponse = await zkDevice.getUsers();
    const attendanceResponse = await zkDevice.getAttendances();

    const rawRecords: Array<ReturnType<typeof normalizeAttendanceRecord> & { device_id: number }> = (attendanceResponse?.data ?? []).map(
      (record: Parameters<typeof normalizeAttendanceRecord>[0]) => ({
        ...normalizeAttendanceRecord(record),
        device_id: device.id,
      })
    );
    const [employees, shifts] = await Promise.all([getEmployees(), getShiftTimings()]);
    const employeeByUid = new Map(employees.filter((employee) => employee.zk_device_uid != null).map((employee) => [Number(employee.zk_device_uid), employee]));
    const grouped = new Map<string, typeof rawRecords>();
    rawRecords.forEach((record) => {
      const employee = employeeByUid.get(record.zk_user_id);
      if (!employee) return;
      const key = `${employee.id}:${new Date(record.check_in).toISOString().slice(0, 10)}`;
      grouped.set(key, [...(grouped.get(key) ?? []), record]);
    });
    const shiftById = new Map(shifts.map((shift) => [shift.id, shift]));
    const attendanceRecords = rawRecords.map((record) => {
      const employee = employeeByUid.get(record.zk_user_id);
      const fields = employee
      ? calculatePunchFields(grouped.get(`${employee.id}:${new Date(record.check_in).toISOString().slice(0, 10)}`) ?? [], employee.shift_id ? shiftById.get(employee.shift_id) : undefined)
      : null;
      return { ...record, employee_id: employee?.id ?? null, ...fields };
    });

    const inserted = await upsertAttendanceRecords(attendanceRecords);

    const latest = attendanceRecords.at(-1);
    console.info("[K60 MONITOR]", {
      device: device.name,
      ip: device.device_ip,
      checkedAt: new Date().toISOString(),
      logsRead: attendanceRecords.length,
      databaseRowsReturned: inserted.length,
      latestThumb: latest
        ? { userId: latest.zk_user_id, checkedInAt: latest.check_in, deviceLogId: latest.device_log_id }
        : null,
    });

    return NextResponse.json({
      ok: true,
      device: device.name,
      ip: device.device_ip,
      port: device.port,
      usersFetched: usersResponse?.data?.length ?? 0,
      logsFetched: attendanceRecords.length,
      inserted: inserted.length,
    });
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : "Unknown ZKTeco sync error";

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  } finally {
    await zkDevice?.disconnect().catch(() => undefined);
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Use POST to sync attendance from K60.",
  });
}
