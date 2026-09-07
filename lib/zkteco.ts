const Zkteco = require("zkteco-js");

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
  const device = new Zkteco(ip, port, 5000, 5000, 65472);
  await device.createSocket();
  return device;
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
  const device = await connectToZkDevice(ip, port);

  try {
    await device.setUser(uid, userId, name, "", 0, "");
    return { uid, userId, name };
  } finally {
    await device.disconnect().catch(() => undefined);
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
  const parsed =
    record.record_time instanceof Date
      ? record.record_time
      : new Date(String(record.record_time || new Date()));
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
