import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { calculatePunchFields, sessionDateKey } from "@/lib/attendance";
import { normalizeAttendanceRecord } from "@/lib/zkteco";
import {
  getAttendanceByZkUserIds,
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

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      cause:
        error instanceof Error && "cause" in error && error.cause !== undefined
          ? serializeError(error.cause)
          : undefined,
    };
  }

  if (typeof error === "string") return { message: error };
  if (error && typeof error === "object") {
    try {
      return JSON.parse(JSON.stringify(error));
    } catch {
      return { message: String(error) };
    }
  }

  return { message: String(error) };
}

export async function POST(request: Request) {
  if (!hasValidToken(request)) {
    return NextResponse.json(
      { ok: false, error: "Invalid connector authentication." },
      { status: 401 },
    );
  }

  let body: any = null;

  try {
    body = await request.json();
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

    const zkUserIds = [
      ...new Set(
        records
          .map((record) => Number(record.user_id))
          .filter((userId) => Number.isInteger(userId) && userId > 0),
      ),
    ];
    const recordTimes = records
      .map((record) => new Date(String(record.record_time)).getTime())
      .filter((time) => Number.isFinite(time));
    const rangeStart = recordTimes.length
      ? new Date(Math.min(...recordTimes) - 36 * 60 * 60 * 1000).toISOString()
      : undefined;
    const rangeEnd = recordTimes.length
      ? new Date(Math.max(...recordTimes) + 36 * 60 * 60 * 1000).toISOString()
      : undefined;
    const [devices, employees, shifts, existingAttendance] = await Promise.all([
      getDevices(),
      getEmployees(),
      getShiftTimings(),
      getAttendanceByZkUserIds(zkUserIds, rangeStart, rangeEnd),
    ]);
    const device = devices.find(
      (item) => item.device_ip === deviceIp && Number(item.port) === port,
    );
    const rawRecords = [];
    for (const record of records) {
      try {
        rawRecords.push({
          ...normalizeAttendanceRecord({
            ...record,
            user_id: String(record.user_id),
          }),
          device_id: device?.id ?? null,
        });
      } catch (error) {
        console.warn("[ATTENDANCE INGEST] skipped record", {
          user_id: record.user_id,
          record_time: record.record_time,
          error: serializeError(error),
        });
      }
    }
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
    const details = serializeError(error);
    console.error("[ATTENDANCE INGEST] failed", {
      details,
      deviceIp: body?.device_ip,
      port: body?.port,
      recordCount: Array.isArray(body?.records) ? body.records.length : 0,
    });

    return NextResponse.json(
      {
        ok: false,
        error: details.message
          ? `Attendance ingest failed: ${String(details.message)}`
          : "Attendance ingest failed.",
        details,
      },
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
