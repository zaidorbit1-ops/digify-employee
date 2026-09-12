import { createClient } from "@supabase/supabase-js";
import { sessionWindow } from "@/lib/attendance";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "";
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

export const supabase =
  supabaseUrl && (supabaseServiceRoleKey || supabaseAnonKey)
    ? createClient(supabaseUrl, supabaseServiceRoleKey || supabaseAnonKey, {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      })
    : null;

export type DeviceInsert = {
  name: string;
  device_ip: string;
  port: number;
  device_type?: string;
  status?: string;
};

export type EmployeeInsert = {
  employee_id?: string;
  name: string;
  auth_user_id?: string | null;
  department?: string;
  department_id?: number | null;
  email?: string;
  phone?: string;
  position?: string;
  position_id?: number | null;
  shift_id?: number | null;
  salary?: number | null;
  physical_address?: string;
  cnic?: string;
  joining_date?: string | null;
  status?: string;
  device_id?: number | null;
  zk_device_uid?: number | null;
  enrollment_status?: string;
};

export type AttendanceUpsertRow = {
  employee_id?: number | null;
  device_id?: number | null;
  zk_user_id: number;
  check_in: string;
  status?: string;
  arrival_status?: string;
  day_status?: string;
  hours_worked?: number | null;
  worked_minutes?: number | null;
  session_start?: string | null;
  session_end?: string | null;
  device_log_id?: number;
};

export type EnrollmentCommand = {
  id: string;
  employee_id: number;
  device_id: number;
  payload: { device_ip: string; port: number; uid: number; name: string };
  status: "pending" | "processing" | "succeeded" | "failed";
  result?: { uid?: number; userId?: string; name?: string } | null;
  error_message?: string | null;
};

function requireSupabase() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your .env.local file.",
    );
  }

  return supabase;
}

function requireServiceRoleSupabase() {
  if (!supabase || !supabaseServiceRoleKey) {
    throw new Error("Supabase service role is not configured on the server.");
  }

  return supabase;
}

export async function createEmployeeAuthUser(
  email: string,
  password: string,
  fullName: string,
) {
  const client = requireServiceRoleSupabase();
  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role: "employee" },
  });

  if (error || !data.user)
    throw error ?? new Error("Could not create employee login.");
  return data.user;
}

export async function updateEmployeeAuthUser(
  userId: string,
  values: { email?: string; password?: string; active: boolean },
) {
  const client = requireServiceRoleSupabase();
  const { data, error } = await client.auth.admin.updateUserById(userId, {
    ...(values.email ? { email: values.email, email_confirm: true } : {}),
    ...(values.password ? { password: values.password } : {}),
    ban_duration: values.active ? "none" : "876000h",
  });

  if (error || !data.user)
    throw error ?? new Error("Could not update employee login.");
  return data.user;
}

export async function deleteEmployeeAuthUser(userId: string) {
  const client = requireServiceRoleSupabase();
  const { error } = await client.auth.admin.deleteUser(userId);
  if (error) throw error;
}

export async function getDevices() {
  const client = requireSupabase();
  const { data, error } = await client
    .from("devices")
    .select("*")
    .order("id", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function addDevice(device: DeviceInsert) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("devices")
    .insert(device)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateDevice(id: number, device: Partial<DeviceInsert>) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("devices")
    .update(device)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteDevice(id: number) {
  const client = requireSupabase();
  const { error } = await client.from("devices").delete().eq("id", id);

  if (error) throw error;
}

export async function getEmployees() {
  const client = requireSupabase();
  const { data, error } = await client
    .from("employees")
    .select("*")
    .order("id", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function addEmployee(employee: EmployeeInsert) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("employees")
    .insert(employee)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function updateEmployee(
  id: number,
  employee: Partial<EmployeeInsert>,
) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("employees")
    .update(employee)
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function deleteEmployee(id: number) {
  const client = requireSupabase();
  const { error } = await client.from("employees").delete().eq("id", id);

  if (error) throw error;
}

export async function getAttendance(startDate?: string, endDate?: string) {
  const client = requireSupabase();
  let query = client
    .from("attendance")
    .select("*")
    .order("check_in", { ascending: false });
  if (startDate) query = query.gte("check_in", sessionWindow(startDate).start);
  if (endDate) query = query.lt("check_in", sessionWindow(endDate).start);
  const { data, error } = await query;

  if (error) throw error;
  return data ?? [];
}

export async function updateAttendanceRecord(id: number, checkIn: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("attendance")
    .update({ check_in: checkIn })
    .eq("id", id)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function createManualAttendanceRecord(
  employeeId: number,
  checkIn: string,
) {
  const client = requireSupabase();
  const { data: employee, error: employeeError } = await client
    .from("employees")
    .select("id, zk_device_uid")
    .eq("id", employeeId)
    .maybeSingle();
  if (employeeError) throw employeeError;
  if (!employee?.zk_device_uid)
    throw new Error("Employee has no device user ID.");

  const { data, error } = await client
    .from("attendance")
    .insert({
      employee_id: employeeId,
      zk_user_id: employee.zk_device_uid,
      check_in: checkIn,
      status: "present",
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function clearAttendanceForEmployeeDate(
  employeeId: number,
  date: string,
) {
  const client = requireSupabase();
  const [employees, shifts] = await Promise.all([
    getEmployees(),
    getShiftTimings(),
  ]);
  const employee = employees.find((item) => item.id === employeeId);
  const shift = employee?.shift_id
    ? shifts.find((item) => item.id === employee.shift_id)
    : undefined;
  const { start, end } = sessionWindow(date, shift);
  const { error } = await client
    .from("attendance")
    .delete()
    .eq("employee_id", employeeId)
    .gte("check_in", start)
    .lt("check_in", end);

  if (error) throw error;
}

export async function getShiftTimings() {
  const client = requireSupabase();
  const { data, error } = await client
    .from("shift_timings")
    .select("*")
    .order("name");

  if (error) throw error;
  return data ?? [];
}

export async function getLeavesForRange(startDate: string, endDate: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("leaves")
    .select("employee_id, start_date, end_date, status")
    .eq("status", "approved")
    .lte("start_date", endDate)
    .gte("end_date", startDate);

  if (error) throw error;
  return data ?? [];
}

export async function getHolidaysForRange(startDate: string, endDate: string) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("holidays")
    .select("id, title, start_date, end_date")
    .lte("start_date", endDate)
    .gte("end_date", startDate)
    .order("start_date");
  if (error) throw error;
  return data ?? [];
}

function throwSupabaseError(action: string, error: { message?: string; code?: string; details?: string; hint?: string }) {
  throw new Error(
    `${action}: ${error.message || "request failed"}${error.code ? ` (code=${error.code})` : ""}${error.details ? ` details=${error.details}` : ""}${error.hint ? ` hint=${error.hint}` : ""}`,
  );
}

export async function getAttendanceByZkUserIds(
  zkUserIds: number[],
  startIso?: string,
  endIso?: string,
) {
  const client = requireSupabase();
  if (!zkUserIds.length) return [];
  let query = client.from("attendance").select("*").in("zk_user_id", zkUserIds);
  if (startIso) query = query.gte("check_in", startIso);
  if (endIso) query = query.lt("check_in", endIso);
  const { data, error } = await query;
  if (error) throwSupabaseError("Could not load attendance for device users", error);
  return data ?? [];
}

export async function updateAttendanceSessionFields(
  employeeId: number,
  start: string,
  end: string,
  fields: {
    arrival_status?: string;
    day_status?: string;
    hours_worked?: number | null;
    worked_minutes?: number | null;
    session_start?: string | null;
    session_end?: string | null;
  },
) {
  const client = requireSupabase();
  const { error } = await client
    .from("attendance")
    .update(fields)
    .eq("employee_id", employeeId)
    .gte("check_in", start)
    .lt("check_in", end);
  if (error) throw error;
}

export async function upsertAttendanceRecords(rows: AttendanceUpsertRow[]) {
  const client = requireSupabase();
  if (!rows.length) return [];

  const normalizedRows = [...new Map(
    rows.map((row) => {
      const checkIn = new Date(row.check_in).toISOString();
      return [
        `${row.zk_user_id}:${checkIn}`,
        {
          employee_id: row.employee_id ?? null,
          device_id: row.device_id ?? null,
          zk_user_id: row.zk_user_id,
          check_in: checkIn,
          status: row.status ?? "present",
          arrival_status: row.arrival_status ?? null,
          day_status: row.day_status ?? null,
          hours_worked:
            row.hours_worked == null
              ? null
              : Number(Math.min(9999.99, Math.max(0, Number(row.hours_worked))).toFixed(2)),
          worked_minutes:
            row.worked_minutes == null
              ? null
              : Math.min(599999, Math.max(0, Math.round(Number(row.worked_minutes)))),
          session_start: row.session_start ?? null,
          session_end: row.session_end ?? null,
        },
      ];
    }),
  ).values()];

  try {
    const { data, error } = await client
      .from("attendance")
      .upsert(normalizedRows, { onConflict: "zk_user_id,check_in" })
      .select();

    if (error) throwSupabaseError("Attendance upsert failed", error);
    return data ?? [];
  } catch (error) {
    const { data: existing, error: listError } = await client
      .from("attendance")
      .select("zk_user_id, check_in")
      .in(
        "zk_user_id",
        [...new Set(normalizedRows.map((row) => row.zk_user_id))],
      );

    if (listError) throwSupabaseError("Attendance lookup after upsert failed", listError);

    const existingKeys = new Set(
      (existing ?? []).map(
        (row) => `${row.zk_user_id}:${new Date(row.check_in).toISOString()}`,
      ),
    );

    const insertRows = normalizedRows.filter(
      (row) => !existingKeys.has(`${row.zk_user_id}:${row.check_in}`),
    );
    const updateRows = normalizedRows.filter((row) =>
      existingKeys.has(`${row.zk_user_id}:${row.check_in}`),
    );

    const insertedResult = insertRows.length
      ? await client.from("attendance").insert(insertRows).select()
      : { data: [] as any[], error: null };
    if (insertedResult.error) {
      throwSupabaseError("Attendance insert failed", insertedResult.error);
    }

    const updatedRows: any[] = [];
    for (const row of updateRows) {
      const { data, error: updateError } = await client
        .from("attendance")
        .update({
          employee_id: row.employee_id,
          device_id: row.device_id,
          status: row.status,
          arrival_status: row.arrival_status,
          day_status: row.day_status,
          hours_worked: row.hours_worked,
          worked_minutes: row.worked_minutes,
          session_start: row.session_start,
          session_end: row.session_end,
        })
        .eq("zk_user_id", row.zk_user_id)
        .eq("check_in", row.check_in)
        .select();

      if (updateError) throwSupabaseError("Attendance update failed", updateError);
      updatedRows.push(...(data ?? []));
    }

    return [...(insertedResult.data ?? []), ...updatedRows];
  }
}

export async function createOrReuseEnrollmentCommand(values: {
  employee_id: number;
  device_id: number;
  idempotency_key: string;
  payload: EnrollmentCommand["payload"];
}) {
  const client = requireServiceRoleSupabase();
  const { data: existing, error: findError } = await client
    .from("device_commands")
    .select("*")
    .eq("idempotency_key", values.idempotency_key)
    .maybeSingle();
  if (findError) throw findError;
  if (
    existing &&
    (existing.status === "pending" || existing.status === "processing")
  )
    return existing as EnrollmentCommand;

  const { data, error } = existing
    ? await client
        .from("device_commands")
        .update({
          status: "pending",
          payload: values.payload,
          result: null,
          error_message: null,
          attempts: 0,
          available_at: new Date().toISOString(),
          claimed_at: null,
          completed_at: null,
        })
        .eq("id", existing.id)
        .select()
        .single()
    : await client
        .from("device_commands")
        .insert({
          command_type: "enroll_user",
          employee_id: values.employee_id,
          device_id: values.device_id,
          idempotency_key: values.idempotency_key,
          payload: values.payload,
        })
        .select()
        .single();
  if (error) throw error;
  return data as EnrollmentCommand;
}

export async function getPendingEnrollmentCommands() {
  const client = requireServiceRoleSupabase();
  const staleClaim = new Date(Date.now() - 120000).toISOString();
  await client
    .from("device_commands")
    .update({ status: "pending", claimed_at: null })
    .eq("command_type", "enroll_user")
    .eq("status", "processing")
    .lt("claimed_at", staleClaim);
  const { data, error } = await client
    .from("device_commands")
    .select("*")
    .eq("command_type", "enroll_user")
    .in("status", ["pending", "processing"])
    .lte("available_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(10);
  if (error) throw error;
  return (data ?? []) as EnrollmentCommand[];
}

export async function claimEnrollmentCommand(id: string) {
  const client = requireServiceRoleSupabase();
  const { data: current, error: currentError } = await client
    .from("device_commands")
    .select("attempts")
    .eq("id", id)
    .eq("status", "pending")
    .maybeSingle();
  if (currentError) throw currentError;
  if (!current) return null;
  const { data, error } = await client
    .from("device_commands")
    .update({
      status: "processing",
      attempts: Number(current.attempts ?? 0) + 1,
      claimed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("command_type", "enroll_user")
    .eq("status", "pending")
    .select()
    .maybeSingle();
  if (error) throw error;
  return data as EnrollmentCommand | null;
}

export async function completeEnrollmentCommand(
  id: string,
  result: EnrollmentCommand["result"],
) {
  const client = requireServiceRoleSupabase();
  const { data: command, error: commandError } = await client
    .from("device_commands")
    .update({
      status: "succeeded",
      result,
      error_message: null,
      completed_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "processing")
    .select()
    .single();
  if (commandError) throw commandError;
  await updateEmployee(command.employee_id, {
    device_id: command.device_id,
    zk_device_uid: Number(result?.uid),
    enrollment_status: "enrolled",
  });
  return command as EnrollmentCommand;
}

export async function failEnrollmentCommand(id: string, message: string) {
  const client = requireServiceRoleSupabase();
  const { data: current, error: currentError } = await client
    .from("device_commands")
    .select("attempts")
    .eq("id", id)
    .eq("status", "processing")
    .maybeSingle();
  if (currentError) throw currentError;
  if (!current) return null;
  const attempts = Number(current.attempts ?? 0);
  const retrying = attempts < 3;
  const { data, error } = await client
    .from("device_commands")
    .update({
      status: retrying ? "pending" : "failed",
      error_message: message.slice(0, 1000),
      available_at: new Date(Date.now() + 15000).toISOString(),
      completed_at: retrying ? null : new Date().toISOString(),
    })
    .eq("id", id)
    .eq("status", "processing")
    .select()
    .single();
  if (error) throw error;
  return data as EnrollmentCommand;
}

export async function getEnrollmentCommand(id: string) {
  const client = requireServiceRoleSupabase();
  const { data, error } = await client
    .from("device_commands")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data as EnrollmentCommand | null;
}
