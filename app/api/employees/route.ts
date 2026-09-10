import { NextResponse } from "next/server";
import {
  addEmployee,
  createEmployeeAuthUser,
  deleteEmployee,
  deleteEmployeeAuthUser,
  getEmployees,
  supabase,
  updateEmployee,
  updateEmployeeAuthUser,
} from "@/lib/supabase";

function requireDatabase() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

function employeeValues(body: Record<string, unknown>) {
  return {
    name: String(body.name ?? "").trim(),
    phone: String(body.phone ?? "").trim(),
    email: String(body.email ?? "").trim().toLowerCase(),
    department_id: body.department_id ? Number(body.department_id) : null,
    position_id: body.position_id ? Number(body.position_id) : null,
    shift_id: body.shift_id ? Number(body.shift_id) : null,
    salary: body.salary ? Number(body.salary) : null,
    physical_address: String(body.physical_address ?? "").trim(),
    cnic: String(body.cnic ?? "").trim(),
    joining_date: body.joining_date ? String(body.joining_date) : null,
    status: String(body.status ?? "active"),
    device_id: body.device_id ? Number(body.device_id) : null,
    zk_device_uid: body.zk_device_uid ? Number(body.zk_device_uid) : null,
    enrollment_status: String(body.enrollment_status ?? "pending"),
  };
}

function validateEmployee(values: ReturnType<typeof employeeValues>, password?: string) {
  if (!values.name || !values.phone || !values.email) return "Name, phone number, and email address are required.";
  if (password !== undefined && password.length < 6) return "Password must be at least 6 characters.";
  if (values.salary !== null && (!Number.isFinite(values.salary) || values.salary < 0)) return "Salary must be a valid non-negative number.";
  return null;
}

async function nextEmployeeId() {
  const employees = await getEmployees();
  const numbers = employees
    .map((employee) => Number(employee.employee_id ?? employee.employee_number))
    .filter((value) => Number.isInteger(value) && value > 0);
  return String(Math.max(0, ...numbers) + 1);
}

export async function GET() {
  try {
    const employees = await getEmployees();
    return NextResponse.json({ employees });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unknown error" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  let authUserId: string | null = null;
  try {
    const body = await request.json() as Record<string, unknown>;
    const values = employeeValues(body);
    const password = String(body.password ?? "");
    const validationError = validateEmployee(values, password);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const employeeId = await nextEmployeeId();
    const authUser = await createEmployeeAuthUser(values.email, password, values.name);
    authUserId = authUser.id;
    const employee = await addEmployee({ ...values, employee_id: employeeId, auth_user_id: authUser.id });

    const { error: profileError } = await requireDatabase().from("profiles").upsert({
      user_id: authUser.id,
      role: "employee",
      employee_id: employee.id,
      full_name: values.name,
      is_active: values.status === "active",
    });
    if (profileError) throw profileError;

    return NextResponse.json({ employee }, { status: 201 });
  } catch (error) {
    if (authUserId) await deleteEmployeeAuthUser(authUserId).catch(() => undefined);
    const message = error instanceof Error ? error.message : "Failed to create employee.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json() as Record<string, unknown>;
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "A valid employee ID is required." }, { status: 400 });

    const values = employeeValues(body);
    const password = body.password ? String(body.password) : undefined;
    const validationError = validateEmployee(values, password);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

    const current = (await getEmployees()).find((employee) => employee.id === id);
    if (!current) return NextResponse.json({ error: "Employee was not found." }, { status: 404 });

    if (body.enrollment_status === undefined) {
      values.enrollment_status = current.enrollment_status ?? "pending";
    }

    const employee = await updateEmployee(id, values);
    if (current.auth_user_id) {
      await updateEmployeeAuthUser(current.auth_user_id, { email: values.email, password, active: values.status === "active" });
    }
    const { error: profileError } = await requireDatabase().from("profiles").update({ full_name: values.name, is_active: values.status === "active" }).eq("employee_id", id);
    if (profileError) throw profileError;

    return NextResponse.json({ employee });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update employee." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "A valid employee ID is required." }, { status: 400 });
    const current = (await getEmployees()).find((employee) => employee.id === id);
    if (!current) return NextResponse.json({ error: "Employee was not found." }, { status: 404 });

    await deleteEmployee(id);
    if (current.auth_user_id) await deleteEmployeeAuthUser(current.auth_user_id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to delete employee." }, { status: 500 });
  }
}
