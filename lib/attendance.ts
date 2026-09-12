export type Shift = {
  id?: number;
  start_time: string;
  end_time: string;
  grace_minutes?: number;
};
type Employee = {
  id: number;
  name: string;
  employee_id?: string;
  zk_device_uid?: number | null;
  shift_id?: number | null;
  department_id?: number | null;
  position_id?: number | null;
};
type Punch = {
  id?: number;
  employee_id?: number | null;
  zk_user_id: number;
  check_in: string;
  status?: string;
  arrival_status?: string;
  day_status?: string;
  hours_worked?: number | null;
  session_start?: string | null;
  session_end?: string | null;
  device_log_id?: number;
};
export type AttendanceEventKind = "check_in" | "check_out" | "ignored";

const officeOffsetMinutes = Number(
  process.env.ATTENDANCE_TIMEZONE_OFFSET_MINUTES ?? 300,
);
const duplicatePunchWindowMs = 60_000;
const SESSION_LEAD_MINUTES = 4 * 60;
const SESSION_TAIL_MINUTES = 4 * 60;

function timeToMinutes(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

function officeDateTimeToUtc(date: string, minutes: number) {
  return new Date(
    new Date(`${date}T00:00:00Z`).getTime() -
      officeOffsetMinutes * 60000 +
      minutes * 60000,
  ).toISOString();
}

function shiftEndMinutesFromStartDate(shift: Shift) {
  const start = timeToMinutes(shift.start_time);
  const end = timeToMinutes(shift.end_time);
  return end <= start ? end + 24 * 60 : end;
}

export function addDays(date: string, days: number) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

export function dateKey(value: string | Date) {
  const shifted = new Date(
    new Date(value).getTime() + officeOffsetMinutes * 60000,
  );
  if (!Number.isFinite(shifted.getTime())) return "";
  return shifted.toISOString().slice(0, 10);
}

export function sessionWindow(date: string, shift?: Shift) {
  if (!shift) {
    return {
      start: officeDateTimeToUtc(date, 0),
      end: officeDateTimeToUtc(addDays(date, 1), 0),
    };
  }
  const startMinutes = timeToMinutes(shift.start_time);
  const endMinutes = shiftEndMinutesFromStartDate(shift);
  return {
    start: officeDateTimeToUtc(date, startMinutes - SESSION_LEAD_MINUTES),
    end: officeDateTimeToUtc(date, endMinutes + SESSION_TAIL_MINUTES),
  };
}

export function sessionDateKey(value: string | Date, shift?: Shift) {
  const calendar = dateKey(value);
  if (!calendar) return "";
  if (!shift) return calendar;
  const punch = new Date(value).getTime();
  if (!Number.isFinite(punch)) return "";
  for (const delta of [-1, 0, 1]) {
    const date = addDays(calendar, delta);
    const window = sessionWindow(date, shift);
    const start = new Date(window.start).getTime();
    const end = new Date(window.end).getTime();
    if (punch >= start && punch < end) return date;
  }
  return "";
}

export function sessionPunches<T extends { check_in: string }>(punches: T[]) {
  const sorted = [...punches].sort(
    (a, b) => new Date(a.check_in).getTime() - new Date(b.check_in).getTime(),
  );
  const unique: T[] = [];
  sorted.forEach((punch) => {
    const previous = unique.at(-1);
    if (
      previous &&
      new Date(punch.check_in).getTime() -
        new Date(previous.check_in).getTime() <
        duplicatePunchWindowMs
    )
      return;
    unique.push(punch);
  });
  return unique;
}

export function calculatePunchFields(punches: Punch[], shift?: Shift) {
  const unique = sessionPunches(punches);
  const first = unique[0];
  if (!first) return null;

  const sessionDate = sessionDateKey(first.check_in, shift);
  const window = sessionDate ? sessionWindow(sessionDate, shift) : null;
  const windowEnd = window ? new Date(window.end).getTime() : Number.POSITIVE_INFINITY;
  const inWindow = unique.filter(
    (punch) => new Date(punch.check_in).getTime() < windowEnd,
  );
  const checkIn = inWindow[0];
  const checkOut = inWindow[1];
  if (!checkIn) return null;

  let arrivalStatus = "on_time";
  if (shift && sessionDate) {
    const shiftStart = new Date(
      officeDateTimeToUtc(sessionDate, timeToMinutes(shift.start_time)),
    ).getTime();
    const graceMs = (shift.grace_minutes ?? 15) * 60_000;
    if (new Date(checkIn.check_in).getTime() > shiftStart + graceMs) {
      arrivalStatus = "late";
    }
  }

  const workedMinutes = checkOut
    ? Math.max(
        0,
        Math.round(
          (new Date(checkOut.check_in).getTime() -
            new Date(checkIn.check_in).getTime()) /
            60000,
        ),
      )
    : null;
  const hoursWorked = workedMinutes === null ? null : workedMinutes / 60;
  const dayStatus =
    hoursWorked !== null && hoursWorked <= 5 ? "half_day" : "present";

  return {
    arrival_status: arrivalStatus,
    day_status: dayStatus,
    hours_worked: hoursWorked === null ? null : Number(hoursWorked.toFixed(2)),
    worked_minutes: workedMinutes,
    session_start: checkIn.check_in,
    session_end: checkOut?.check_in ?? null,
  };
}

export function attendanceEventKind(
  punches: { check_in: string }[],
  incomingCheckIn: string,
): AttendanceEventKind {
  const unique = sessionPunches(punches);
  const index = unique.findIndex((punch) => punch.check_in === incomingCheckIn);
  if (index === 0) return "check_in";
  if (index === 1) return "check_out";
  return "ignored";
}

export function buildAttendanceDays({
  employees,
  shifts,
  punches,
  approvedLeaves,
  holidays,
  startDate,
  endDate,
}: {
  employees: Employee[];
  shifts: Shift[];
  punches: Punch[];
  approvedLeaves: {
    employee_id: number;
    start_date: string;
    end_date: string;
  }[];
  holidays?: {
    id?: number;
    title: string;
    start_date: string;
    end_date: string;
  }[];
  startDate: string;
  endDate: string;
}) {
  const employeeById = new Map(
    employees.map((employee) => [employee.id, employee]),
  );
  const employeeByUid = new Map(
    employees
      .filter((employee) => employee.zk_device_uid != null)
      .map((employee) => [Number(employee.zk_device_uid), employee]),
  );
  const shiftById = new Map(shifts.map((shift) => [shift.id, shift]));
  const grouped = new Map<string, Punch[]>();
  const holidayRanges = holidays ?? [];

  punches.forEach((punch) => {
    const employee =
      (punch.employee_id ? employeeById.get(punch.employee_id) : undefined) ??
      employeeByUid.get(Number(punch.zk_user_id));
    if (!employee) return;
    const shift = employee.shift_id
      ? shiftById.get(employee.shift_id)
      : undefined;
    const sessionDate = sessionDateKey(punch.check_in, shift);
    if (!sessionDate) return;
    const key = `${employee.id}:${sessionDate}`;
    grouped.set(key, [
      ...(grouped.get(key) ?? []),
      { ...punch, employee_id: employee.id },
    ]);
  });

  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cursor <= end) {
    if (cursor.getUTCDay() !== 0) dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates.flatMap((date) =>
    employees.map((employee) => {
      const employeePunches = sessionPunches(
        grouped.get(`${employee.id}:${date}`) ?? [],
      );
      const leave = approvedLeaves.some(
        (item) =>
          item.employee_id === employee.id &&
          date >= item.start_date &&
          date <= item.end_date,
      );
      const holiday = holidayRanges.find(
        (item) => date >= item.start_date && date <= item.end_date,
      );
      const fields = calculatePunchFields(
        employeePunches,
        employee.shift_id ? shiftById.get(employee.shift_id) : undefined,
      );
      return {
        date,
        employee,
        punches: employeePunches,
        status: holiday
          ? "holiday"
          : date > dateKey(new Date())
            ? null
            : leave
              ? "leave"
              : (fields?.day_status ?? "absent"),
        arrival_status: fields?.arrival_status ?? null,
        hours_worked: fields?.hours_worked ?? null,
        worked_minutes: fields?.worked_minutes ?? null,
        session_start: fields?.session_start ?? null,
        session_end: fields?.session_end ?? null,
        holiday_title: holiday?.title ?? null,
      };
    }),
  );
}
