const Zkteco = require("zkteco-js");
const attendanceOffsetMinutes = Number(
  process.env.ATTENDANCE_TIMEZONE_OFFSET_MINUTES ?? 300,
);

export type ZkUser = {
  uid?: number;
  userId?: string;
  name?: string;
  role?: number;
  password?: string;
  cardno?: number;
};

export type ZkAttendanceRecord = {
  sn?: number;
  user_id?: string;
  record_time?: string | Date;
  type?: number;
  state?: number;
  ip?: string;
};

export async function connectToZkDevice(ip: string, port: number) {
  const startedAt = Date.now();
  console.info("[ZKTECO] connection attempt", { ip, port });
  const device = new Zkteco(ip, port, 5000, 5000, 65472);
  try {
    await device.createSocket();
    console.info("[ZKTECO] connection established", {
      ip,
      port,
      elapsedMs: Date.now() - startedAt,
    });
    return device;
  } catch (error) {
    console.error("[ZKTECO] connection failed", {
      ip,
      port,
      elapsedMs: Date.now() - startedAt,
      error: error instanceof Error ? error.message : String(error),
      code:
        typeof error === "object" && error !== null && "code" in error
          ? error.code
          : undefined,
    });
    throw error;
  }
}

export async function enrollUserOnZkDevice({
  ip,
  port,
  uid,
  userId,
  name,
}: {
  ip: string;
  port: number;
  uid: number;
  userId: string;
  name: string;
}) {
  console.info("[ZKTECO] enrollment started", { ip, port, uid, userId });
  const device = await connectToZkDevice(ip, port);

  try {
    await device.setUser(uid, userId, name, "", 0, "");
    console.info("[ZKTECO] enrollment user sent", { ip, port, uid, userId });
    return { uid, userId, name };
  } finally {
    await device.disconnect().catch(() => undefined);
    console.info("[ZKTECO] enrollment connection closed", {
      ip,
      port,
      uid,
      userId,
    });
  }
}

export function punchLogId(zkUserId: number, checkIn: string) {
  const key = `${zkUserId}:${checkIn}`;
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return 100000 + ((hash >>> 0) % 2147383647);
}

export function normalizeAttendanceRecord(record: ZkAttendanceRecord) {
  const zkUserId = Number(record.user_id ?? 0);
  const rawTime = String(record.record_time || "");
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(rawTime);
  const parsed =
    record.record_time instanceof Date
      ? record.record_time
      : hasTimezone
        ? new Date(rawTime)
        : new Date(
            new Date(rawTime.replace(" ", "T") + "Z").getTime() -
              attendanceOffsetMinutes * 60000,
          );
  parsed.setMilliseconds(0);
  const checkInISO = parsed.toISOString();
  const safeUserId = Number.isFinite(zkUserId) && zkUserId > 0 ? zkUserId : 0;

  return {
    zk_user_id: safeUserId,
    check_in: checkInISO,
    status: "present",
    device_log_id: punchLogId(safeUserId, checkInISO),
  };
}
