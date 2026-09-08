import { NextResponse } from "next/server";
import { calculatePunchFields, sessionDateKey } from "@/lib/attendance";
import { connectToZkDevice, normalizeAttendanceRecord } from "@/lib/zkteco";
import { getDevices, getEmployees, getShiftTimings, upsertAttendanceRecords } from "@/lib/supabase";

export async function POST(request: Request) {
  let zkDevice: Awaited<ReturnType<typeof connectToZkDevice>> | null = null;
  const startedAt = Date.now();
  let syncPhase = "request";

  try {
    console.info("[ATTENDANCE SYNC] started", { at: new Date().toISOString() });
    const body = await request.json().catch(() => ({}));
    syncPhase = "load devices";
    const devices = await getDevices();
    const requestedDeviceId = Number(body.device_id);
    const device = devices.find((item) => item.id === requestedDeviceId) ?? devices.find((item) => item.status === "active") ?? devices[0];

    if (!device) {
      console.error("[ATTENDANCE SYNC] no device configured");
      return NextResponse.json(
        { ok: false, error: "Add a K60 device before starting attendance sync." },
        { status: 400 }
      );
    }

    console.info("[ATTENDANCE SYNC] selected device", {
      deviceId: device.id,
      device: device.name,
      ip: device.device_ip,
      port: device.port,
      status: device.status,
    });

    syncPhase = "connect device";
    zkDevice = await connectToZkDevice(device.device_ip, device.port);

    syncPhase = "read users";
    const usersResponse = await zkDevice.getUsers();
    console.info("[ATTENDANCE SYNC] users fetched", { device: device.name, count: usersResponse?.data?.length ?? 0 });

    syncPhase = "read attendance logs";
    const attendanceResponse = await zkDevice.getAttendances();
    console.info("[ATTENDANCE SYNC] attendance logs fetched", { device: device.name, count: attendanceResponse?.data?.length ?? 0 });

    syncPhase = "calculate attendance records";
    const rawRecords: Array<ReturnType<typeof normalizeAttendanceRecord> & { device_id: number }> = (attendanceResponse?.data ?? []).map(
      (record: Parameters<typeof normalizeAttendanceRecord>[0]) => ({
        ...normalizeAttendanceRecord(record),
        device_id: device.id,
      })
    );
    const [employees, shifts] = await Promise.all([getEmployees(), getShiftTimings()]);
    const employeeByUid = new Map(employees.filter((employee) => employee.zk_device_uid != null).map((employee) => [Number(employee.zk_device_uid), employee]));
    const shiftById = new Map(shifts.map((shift) => [shift.id, shift]));
    const validRecords = rawRecords.filter((record) => record.zk_user_id > 0);
    const grouped = new Map<string, typeof validRecords>();
    validRecords.forEach((record) => {
      const employee = employeeByUid.get(record.zk_user_id);
      if (!employee) return;
      const shift = employee.shift_id ? shiftById.get(employee.shift_id) : undefined;
      const key = `${employee.id}:${sessionDateKey(record.check_in, shift)}`;
      grouped.set(key, [...(grouped.get(key) ?? []), record]);
    });
    const attendanceRecords = [...new Map(validRecords.map((record) => [`${record.zk_user_id}:${record.check_in}`, record])).values()].map((record) => {
      const employee = employeeByUid.get(record.zk_user_id);
      const shift = employee?.shift_id ? shiftById.get(employee.shift_id) : undefined;
      const fields = employee
        ? calculatePunchFields(grouped.get(`${employee.id}:${sessionDateKey(record.check_in, shift)}`) ?? [], shift)
        : null;
      return { ...record, employee_id: employee?.id ?? null, ...fields };
    });

    syncPhase = "save attendance records";
    const inserted = attendanceRecords.length ? await upsertAttendanceRecords(attendanceRecords) : [];

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
      console.info("[ATTENDANCE SYNC] completed", { device: device.name, elapsedMs: Date.now() - startedAt });

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
      error instanceof Error
        ? error.message
        : typeof error === "object" && error !== null && "message" in error
          ? String(error.message)
          : "Unknown ZKTeco sync error";

    console.error("[ATTENDANCE SYNC] failed", {
      phase: syncPhase,
      elapsedMs: Date.now() - startedAt,
      error: message,
      code: typeof error === "object" && error !== null && "code" in error ? error.code : undefined,
      details: typeof error === "object" && error !== null && "details" in error ? error.details : undefined,
      hint: typeof error === "object" && error !== null && "hint" in error ? error.hint : undefined,
    });

    return NextResponse.json(
      {
        ok: false,
        error: message,
      },
      { status: 500 }
    );
  } finally {
    if (zkDevice) {
      await zkDevice.disconnect().catch((error: unknown) => {
        console.error("[ATTENDANCE SYNC] device disconnect failed", error);
      });
      console.info("[ATTENDANCE SYNC] device connection closed");
    }
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Use POST to sync attendance from K60.",
  });
}
