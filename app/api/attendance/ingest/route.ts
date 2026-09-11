import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { calculatePunchFields, sessionDateKey } from "@/lib/attendance";
import { normalizeAttendanceRecord } from "@/lib/zkteco";
import {
  getAttendance,
  getDevices,
  getEmployees,
  getShiftTimings,
  upsertAttendanceRecords,
} from "@/lib/supabase";

type IncomingRecord = {
  user_id?: string | number;
  record_time?: string | Date;
};

function hasValidToken(request: Request) {
  const configured = process.env.CONNECTOR_TOKEN;
  const supplied = request.headers.get("x-connector-token") ?? "";
  if (!configured || !supplied) return false;
  const expected = Buffer.from(configured);
  const actual = Buffer.from(supplied);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function isIncomingRecord(value: unknown): value is IncomingRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as IncomingRecord;
  if (record.user_id === undefined || record.record_time === undefined)
    return false;
  const userId = Number(record.user_id);
  const timestamp = new Date(String(record.record_time));
  return (
    Number.isInteger(userId) &&
    userId > 0 &&
    Number.isFinite(timestamp.getTime())
  );
}

export async function POST(request: Request) {
  if (!hasValidToken(request)) {
    return NextResponse.json(
      { ok: false, error: "Invalid connector authentication." },
      { status: 401 },
    );
  }

  try {
    const body = await request.json();
    const deviceIp =
      typeof body?.device_ip === "string" ? body.device_ip.trim() : "";
    const port = Number(body?.port);
    const records = body?.records;

    if (
      !deviceIp ||
      !Number.isInteger(port) ||
      port <= 0 ||
      !Array.isArray(records) ||
      records.length > 10000
    ) {
      return NextResponse.json(
        {
          ok: false,
          error: "A valid device_ip, port, and records array are required.",
        },
        { status: 400 },
      );
    }
    if (!records.every(isIncomingRecord)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Each attendance record must contain a valid user_id and record_time.",
        },
        { status: 400 },
      );
    }

    const [devices, employees, shifts, existingAttendance] = await Promise.all([
      getDevices(),
      getEmployees(),
      getShiftTimings(),
      getAttendance(),
    ]);
    const device = devices.find(
      (item) => item.device_ip === deviceIp && Number(item.port) === port,
    );
    const rawRecords = records.map((record) => ({
      ...normalizeAttendanceRecord({
        ...record,
        user_id: String(record.user_id),
      }),
      device_id: device?.id ?? null,
    }));
    const employeeByUid = new Map(
      employees
        .filter((employee) => employee.zk_device_uid != null)
        .map((employee) => [Number(employee.zk_device_uid), employee]),
    );
    const shiftById = new Map(shifts.map((shift) => [shift.id, shift]));
    const validRecords = rawRecords.filter((record) => record.zk_user_id > 0);
    const grouped = new Map<string, typeof validRecords>();

    existingAttendance.forEach((record) => {
      const employee = employees.find((item) => item.id === record.employee_id);
      if (!employee) return;
      const shift = employee.shift_id
        ? shiftById.get(employee.shift_id)
        : undefined;
      const key = `${employee.id}:${sessionDateKey(record.check_in, shift)}`;
      grouped.set(key, [
        ...(grouped.get(key) ?? []),
        record as (typeof validRecords)[number],
      ]);
    });

    validRecords.forEach((record) => {
      const employee = employeeByUid.get(record.zk_user_id);
      if (!employee) return;
      const shift = employee.shift_id
        ? shiftById.get(employee.shift_id)
        : undefined;
      const key = `${employee.id}:${sessionDateKey(record.check_in, shift)}`;
      grouped.set(key, [...(grouped.get(key) ?? []), record]);
    });

    const attendanceRecords = [
      ...new Map(
        validRecords.map((record) => [
          `${record.zk_user_id}:${record.check_in}`,
          record,
        ]),
      ).values(),
    ].map((record) => {
      const employee = employeeByUid.get(record.zk_user_id);
      const shift = employee?.shift_id
        ? shiftById.get(employee.shift_id)
        : undefined;
      const fields = employee
        ? calculatePunchFields(
            grouped.get(
              `${employee.id}:${sessionDateKey(record.check_in, shift)}`,
            ) ?? [],
            shift,
          )
        : null;
      return { ...record, employee_id: employee?.id ?? null, ...fields };
    });

    const synced = attendanceRecords.length
      ? await upsertAttendanceRecords(attendanceRecords)
      : [];
    console.info("[ATTENDANCE INGEST] completed", {
      deviceIp,
      port,
      received: records.length,
      synced: synced.length,
    });
    return NextResponse.json({
      ok: true,
      received: records.length,
      synced: synced.length,
    });
  } catch (error) {
    console.error(
      "[ATTENDANCE INGEST] failed",
      error instanceof Error ? error.message : "Unknown ingest error",
    );
    return NextResponse.json(
      { ok: false, error: "Attendance ingest failed." },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: "Use POST with connector authentication to ingest attendance.",
  });
}
