import { createClient } from "@supabase/supabase-js";
import { sessionWindow } from "@/lib/attendance";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";
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
  device_log_id: number;
};

function requireSupabase() {
  if (!supabase) {
    throw new Error(
      "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to your .env.local file."
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

export async function createEmployeeAuthUser(email: string, password: string, fullName: string) {
  const client = requireServiceRoleSupabase();
  const { data, error } = await client.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role: "employee" },
  });

  if (error || !data.user) throw error ?? new Error("Could not create employee login.");
  return data.user;
}

export async function updateEmployeeAuthUser(userId: string, values: { email?: string; password?: string; active: boolean }) {
  const client = requireServiceRoleSupabase();
  const { data, error } = await client.auth.admin.updateUserById(userId, {
    ...(values.email ? { email: values.email, email_confirm: true } : {}),
    ...(values.password ? { password: values.password } : {}),
    ban_duration: values.active ? "none" : "876000h",
  });

  if (error || !data.user) throw error ?? new Error("Could not update employee login.");
  return data.user;
}

export async function deleteEmployeeAuthUser(userId: string) {
  const client = requireServiceRoleSupabase();
  const { error } = await client.auth.admin.deleteUser(userId);
  if (error) throw error;
}

export async function getDevices() {
  const client = requireSupabase();
  const { data, error } = await client.from("devices").select("*").order("id", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function addDevice(device: DeviceInsert) {
  const client = requireSupabase();
  const { data, error } = await client.from("devices").insert(device).select().single();

  if (error) throw error;
  return data;
}

export async function updateDevice(id: number, device: Partial<DeviceInsert>) {
  const client = requireSupabase();
  const { data, error } = await client.from("devices").update(device).eq("id", id).select().single();

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
  const { data, error } = await client.from("employees").select("*").order("id", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function addEmployee(employee: EmployeeInsert) {
  const client = requireSupabase();
  const { data, error } = await client.from("employees").insert(employee).select().single();

  if (error) throw error;
  return data;
}

export async function updateEmployee(
  id: number,
  employee: Partial<EmployeeInsert>
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

export async function getAttendance() {
  const client = requireSupabase();
  const { data, error } = await client.from("attendance").select("*").order("check_in", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function updateAttendanceRecord(id: number, checkIn: string) {
  const client = requireSupabase();
  const { data, error } = await client.from("attendance").update({ check_in: checkIn }).eq("id", id).select().single();

  if (error) throw error;
  return data;
}

export async function clearAttendanceForEmployeeDate(employeeId: number, date: string) {
  const client = requireSupabase();
  const [employees, shifts] = await Promise.all([getEmployees(), getShiftTimings()]);
  const employee = employees.find((item) => item.id === employeeId);
  const shift = employee?.shift_id ? shifts.find((item) => item.id === employee.shift_id) : undefined;
  const { start, end } = sessionWindow(date, shift);
  const { error } = await client.from("attendance").delete().eq("employee_id", employeeId).gte("check_in", start).lt("check_in", end);

  if (error) throw error;
}

export async function getShiftTimings() {
  const client = requireSupabase();
  const { data, error } = await client.from("shift_timings").select("*").order("name");

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

export async function upsertAttendanceRecords(rows: AttendanceUpsertRow[]) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("attendance")
    .upsert(rows, { onConflict: "zk_user_id,check_in" })
    .select();

  if (error) throw error;
  return data ?? [];
}
