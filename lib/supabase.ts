import { createClient } from "@supabase/supabase-js";

const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || "";
const supabaseAnonKey =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || "";

export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
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
  employee_id: string;
  name: string;
  department?: string;
  email?: string;
  phone?: string;
  position?: string;
  salary?: number | null;
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

export async function upsertAttendanceRecords(rows: AttendanceUpsertRow[]) {
  const client = requireSupabase();
  const { data, error } = await client
    .from("attendance")
    .upsert(rows, { onConflict: "device_log_id" })
    .select();

  if (error) throw error;
  return data ?? [];
}
