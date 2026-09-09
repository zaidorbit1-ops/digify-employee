const { createClient } = require("@supabase/supabase-js");
const Zkteco = require("zkteco-js");

const intervalMs = Number(process.env.ATTENDANCE_SYNC_INTERVAL_MS || 15000);
const deviceIp = process.env.ZK_DEVICE_IP;
const devicePort = Number(process.env.ZK_DEVICE_PORT || 4370);
const officeOffsetMinutes = Number(process.env.ATTENDANCE_TIMEZONE_OFFSET_MINUTES || 300);
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!deviceIp || !supabaseUrl || !supabaseKey) {
  console.error("ZK_DEVICE_IP, NEXT_PUBLIC_SUPABASE_URL, and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function punchLogId(userId, checkIn) {
  const key = `${userId}:${checkIn}`;
  let hash = 2166136261;
  for (let index = 0; index < key.length; index += 1) {
    hash ^= key.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return 100000 + ((hash >>> 0) % 2147383647);
}

function timeToMinutes(value) {
  const [hours, minutes] = String(value || "00:00").slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

function sessionDateKey(value, shift) {
  const date = new Date(new Date(value).getTime() + officeOffsetMinutes * 60000);
  const calendar = date.toISOString().slice(0, 10);
  if (!shift || timeToMinutes(shift.end_time) > timeToMinutes(shift.start_time)) return calendar;
  const minutes = date.getUTCHours() * 60 + date.getUTCMinutes();
  const midpoint = Math.floor((timeToMinutes(shift.end_time) + timeToMinutes(shift.start_time)) / 2);
  if (minutes >= midpoint) return calendar;
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function calculatePunchFields(punches, shift) {
  const unique = [...punches].sort((left, right) => new Date(left.check_in) - new Date(right.check_in)).filter((punch, index, sorted) => {
    const previous = sorted[index - 1];
    return !previous || new Date(punch.check_in) - new Date(previous.check_in) >= 60000;
  });
  const first = unique[0];
  const second = unique[1];
  if (!first) return {};

  const officePunchTime = new Date(new Date(first.check_in).getTime() + officeOffsetMinutes * 60000);
  const arrivalMinutes = officePunchTime.getUTCHours() * 60 + officePunchTime.getUTCMinutes();
  const start = shift ? timeToMinutes(shift.start_time) : null;
  const arrivalStatus = start === null || arrivalMinutes <= start + Number(shift.grace_minutes || 15) ? "on_time" : "late";
  const workedMinutes = second ? Math.max(0, Math.round((new Date(second.check_in) - new Date(first.check_in)) / 60000)) : null;

  return {
    arrival_status: arrivalStatus,
    day_status: workedMinutes !== null && workedMinutes <= 5 ? "half_day" : "present",
    hours_worked: workedMinutes === null ? null : Number((workedMinutes / 60).toFixed(2)),
    worked_minutes: workedMinutes,
    session_start: first.check_in,
    session_end: second ? second.check_in : null,
  };
}

async function sync() {
  const startedAt = Date.now();
  let device;
  try {
    console.log(`[attendance-worker] reading ${deviceIp}:${devicePort}`);
    const [employeesResult, shiftsResult] = await Promise.all([
      supabase.from("employees").select("id,zk_device_uid,shift_id"),
      supabase.from("shift_timings").select("id,start_time,end_time,grace_minutes"),
    ]);
    if (employeesResult.error) throw employeesResult.error;
    if (shiftsResult.error) throw shiftsResult.error;

    device = new Zkteco(deviceIp, devicePort, 5000, 5000, 65472);
    await device.createSocket();
    const attendanceResponse = await device.getAttendances();
    const employees = employeesResult.data || [];
    const shifts = new Map((shiftsResult.data || []).map((shift) => [shift.id, shift]));
    const employeeByUid = new Map(employees.filter((employee) => employee.zk_device_uid != null).map((employee) => [Number(employee.zk_device_uid), employee]));
    const rawRecords = (attendanceResponse?.data || []).map((record) => {
      const userId = Number(record.user_id || 0);
      const parsed = record.record_time instanceof Date ? record.record_time : new Date(String(record.record_time || new Date()));
      parsed.setMilliseconds(0);
      const checkIn = parsed.toISOString();
      return { zk_user_id: userId, check_in: checkIn, status: "present", device_log_id: punchLogId(userId, checkIn) };
    }).filter((record) => record.zk_user_id > 0);
    const grouped = new Map();
    for (const record of rawRecords) {
      const employee = employeeByUid.get(record.zk_user_id);
      if (!employee) continue;
      const shift = employee.shift_id ? shifts.get(employee.shift_id) : undefined;
      const key = `${employee.id}:${sessionDateKey(record.check_in, shift)}`;
      grouped.set(key, [...(grouped.get(key) || []), record]);
    }
    const rows = rawRecords.map((record) => {
      const employee = employeeByUid.get(record.zk_user_id);
      const shift = employee?.shift_id ? shifts.get(employee.shift_id) : undefined;
      const fields = employee ? calculatePunchFields(grouped.get(`${employee.id}:${sessionDateKey(record.check_in, shift)}`) || [], shift) : {};
      return { ...record, employee_id: employee?.id || null, device_id: null, ...fields };
    });
    if (rows.length) {
      const result = await supabase.from("attendance").upsert(rows, { onConflict: "zk_user_id,check_in" }).select();
      if (result.error) throw result.error;
    }
    console.log(`[attendance-worker] sync completed in ${Date.now() - startedAt}ms; records=${rows.length}`);
  } catch (error) {
    const details = error instanceof Error ? error.message : JSON.stringify(error);
    console.error(`[attendance-worker] sync failed elapsedMs=${Date.now() - startedAt} error=${details}`);
  } finally {
    if (device) await device.disconnect().catch(() => undefined);
  }
}

console.log(`[attendance-worker] running every ${intervalMs / 1000}s; device=${deviceIp}:${devicePort}; database=${supabaseUrl}`);
if (process.env.ATTENDANCE_ONCE === "1") {
  sync().then(() => process.exit(0));
} else {
  sync();
  setInterval(sync, intervalMs);
}
