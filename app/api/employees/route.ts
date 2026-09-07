import { NextResponse } from "next/server";
import { addEmployee, deleteEmployee, getEmployees, updateEmployee } from "@/lib/supabase";

export async function GET() {
  try {
    const employees = await getEmployees();
    return NextResponse.json({ employees });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const employeeId = String(body.employee_id ?? "").trim();
    const name = String(body.name ?? "").trim();

    if (!employeeId || !name) {
      return NextResponse.json(
        { error: "Employee ID and full name are required." },
        { status: 400 }
      );
    }

    const employee = await addEmployee({
      employee_id: employeeId,
      name,
      department: String(body.department ?? "").trim(),
      email: String(body.email ?? ""),
      phone: String(body.phone ?? ""),
      position: String(body.position ?? ""),
      salary: body.salary ? Number(body.salary) : null,
      device_id: body.device_id ? Number(body.device_id) : null,
      zk_device_uid: body.zk_device_uid ? Number(body.zk_device_uid) : null,
      enrollment_status: String(body.enrollment_status ?? "pending"),
    });

    return NextResponse.json({ employee }, { status: 201 });
  } catch (error) {
    let message = error instanceof Error ? error.message : "Unknown error";

    if (typeof error === "object" && error !== null && "code" in error) {
      const code = (error as { code?: string }).code;
      if (code === "42P01") {
        message = "Supabase table 'employees' does not exist yet. Run the migration SQL first.";
      } else if (code === "42501") {
        message = "Supabase row-level security is blocking employee insert. Run the updated migration SQL first.";
      } else if (code === "23505") {
        message = "This Employee ID already exists. Use a different Employee ID.";
      }
    }

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const id = Number(body.id);
    const employeeId = String(body.employee_id ?? "").trim();
    const name = String(body.name ?? "").trim();

    if (!Number.isInteger(id) || id <= 0 || !employeeId || !name) {
      return NextResponse.json({ error: "Employee ID, full name, and a valid record ID are required." }, { status: 400 });
    }

    const employee = await updateEmployee(id, {
      employee_id: employeeId,
      name,
      department: String(body.department ?? "").trim(),
      email: String(body.email ?? "").trim(),
      phone: String(body.phone ?? "").trim(),
      position: String(body.position ?? "").trim(),
      salary: body.salary ? Number(body.salary) : null,
      device_id: body.device_id ? Number(body.device_id) : null,
      zk_device_uid: body.zk_device_uid ? Number(body.zk_device_uid) : null,
      enrollment_status: String(body.enrollment_status ?? "pending"),
    });

    return NextResponse.json({ employee });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update employee." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "A valid employee ID is required." }, { status: 400 });
    }
    await deleteEmployee(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to delete employee." }, { status: 500 });
  }
}
