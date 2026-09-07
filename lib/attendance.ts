type Shift = { id: number; start_time: string; end_time: string; grace_minutes?: number };
type Employee = { id: number; name: string; employee_id?: string; zk_device_uid?: number | null; shift_id?: number | null; department_id?: number | null; position_id?: number | null };
type Punch = { id?: number; employee_id?: number | null; zk_user_id: number; check_in: string; status?: string; arrival_status?: string; day_status?: string; hours_worked?: number | null; session_start?: string | null; session_end?: string | null; device_log_id?: number };

function timeToMinutes(value: string) {
  const [hours, minutes] = value.slice(0, 5).split(":").map(Number);
  return hours * 60 + minutes;
}

export function dateKey(value: string | Date) {
  return new Date(value).toISOString().slice(0, 10);
}

export function calculatePunchFields(punches: Punch[], shift?: Shift) {
  const sorted = [...punches].sort((a, b) => new Date(a.check_in).getTime() - new Date(b.check_in).getTime());
  const first = sorted[0];
  const second = sorted[1];
  if (!first) return null;

  const start = shift ? timeToMinutes(shift.start_time) : null;
  const punchTime = new Date(first.check_in);
  const arrivalMinutes = punchTime.getUTCHours() * 60 + punchTime.getUTCMinutes();
  const arrivalStatus = start === null || arrivalMinutes <= start + (shift?.grace_minutes ?? 15) ? "on_time" : "late";
  const hoursWorked = second ? Math.max(0, (new Date(second.check_in).getTime() - punchTime.getTime()) / 3600000) : null;
  const dayStatus = hoursWorked !== null && hoursWorked <= 5 ? "half_day" : "present";

  return {
    arrival_status: arrivalStatus,
    day_status: dayStatus,
    hours_worked: hoursWorked === null ? null : Number(hoursWorked.toFixed(2)),
    session_start: first.check_in,
    session_end: second?.check_in ?? null,
  };
}

export function buildAttendanceDays({ employees, shifts, punches, approvedLeaves, startDate, endDate }: { employees: Employee[]; shifts: Shift[]; punches: Punch[]; approvedLeaves: { employee_id: number; start_date: string; end_date: string }[]; startDate: string; endDate: string }) {
  const employeeByUid = new Map(employees.filter((employee) => employee.zk_device_uid != null).map((employee) => [Number(employee.zk_device_uid), employee]));
  const shiftById = new Map(shifts.map((shift) => [shift.id, shift]));
  const grouped = new Map<string, Punch[]>();

  punches.forEach((punch) => {
    const employee = employeeByUid.get(Number(punch.zk_user_id));
    if (!employee) return;
    const key = `${employee.id}:${dateKey(punch.check_in)}`;
    grouped.set(key, [...(grouped.get(key) ?? []), { ...punch, employee_id: employee.id }]);
  });

  const dates: string[] = [];
  const cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cursor <= end) {
    if (cursor.getUTCDay() !== 0) dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return dates.flatMap((date) => employees.map((employee) => {
    const employeePunches = grouped.get(`${employee.id}:${date}`) ?? [];
    const leave = approvedLeaves.some((item) => item.employee_id === employee.id && date >= item.start_date && date <= item.end_date);
    const fields = calculatePunchFields(employeePunches, employee.shift_id ? shiftById.get(employee.shift_id) : undefined);
    return {
      date,
      employee,
      punches: employeePunches,
      status: leave ? "leave" : fields?.day_status ?? "absent",
      arrival_status: fields?.arrival_status ?? null,
      hours_worked: fields?.hours_worked ?? null,
      session_start: fields?.session_start ?? null,
      session_end: fields?.session_end ?? null,
    };
  }));
}