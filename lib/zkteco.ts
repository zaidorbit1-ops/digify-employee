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

export function normalizeAttendanceRecord(record: ZkAttendanceRecord) {
  const zkUserId = Number(record.user_id ?? record.sn ?? 0);
  const checkInISO =
    record.record_time instanceof Date
      ? record.record_time.toISOString()
      : new Date(String(record.record_time || new Date())).toISOString();

  return {
    zk_user_id: Number.isFinite(zkUserId) && zkUserId > 0 ? zkUserId : 0,
    check_in: checkInISO,
    status: record.type === 0 ? "present" : "present",
    device_log_id: Number(record.sn ?? 0),
  };
}
