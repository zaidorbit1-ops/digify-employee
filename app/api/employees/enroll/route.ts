import { NextResponse } from "next/server";
import { createOrReuseEnrollmentCommand, getDevices, getEmployees, getEnrollmentCommand } from "@/lib/supabase";

const wait = (milliseconds: number) => new Promise((resolve) => setTimeout(resolve, milliseconds));

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const employeeId = Number(body.employee_id);
    const deviceId = Number(body.device_id);
    if (!Number.isInteger(employeeId) || !Number.isInteger(deviceId)) {
      return NextResponse.json({ error: "A valid employee and device are required." }, { status: 400 });
    }

    const [employees, devices] = await Promise.all([getEmployees(), getDevices()]);
    const employee = employees.find((item) => item.id === employeeId);
    const device = devices.find((item) => item.id === deviceId);
    if (!employee) return NextResponse.json({ error: "Employee was not found." }, { status: 404 });
    if (!device) return NextResponse.json({ error: "Device was not found." }, { status: 404 });

    const uid = Number(body.zk_device_uid ?? employee.employee_id ?? employee.zk_device_uid);
    if (!Number.isInteger(uid) || uid <= 0) return NextResponse.json({ error: "A valid numeric device user ID is required." }, { status: 400 });
    const conflictingEmployee = employees.find((item) => item.id !== employee.id && Number(item.zk_device_uid) === uid);
    if (conflictingEmployee) return NextResponse.json({ error: `ZKTeco user ID ${uid} is already assigned to ${conflictingEmployee.name}.` }, { status: 409 });

    const command = await createOrReuseEnrollmentCommand({
      employee_id: employee.id,
      device_id: device.id,
      idempotency_key: `enroll:${device.id}:${employee.id}:${uid}`,
      payload: { device_ip: device.device_ip, port: device.port, uid, name: employee.name },
    });

    for (let attempt = 0; attempt < 35; attempt += 1) {
      const current = await getEnrollmentCommand(command.id);
      if (current?.status === "succeeded") {
        const updatedEmployee = (await getEmployees()).find((item) => item.id === employee.id);
        return NextResponse.json({ ok: true, employee: updatedEmployee, command_id: command.id, message: `${employee.name} was sent to ${device.name}. Complete fingerprint enrollment on the device if required.` });
      }
      if (current?.status === "failed") return NextResponse.json({ ok: false, command_id: command.id, error: current.error_message ?? "Device enrollment failed." }, { status: 502 });
      await wait(1000);
    }
    return NextResponse.json({ ok: false, command_id: command.id, error: "Enrollment request is still pending. Keep the office connector running and try again shortly." }, { status: 504 });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Could not queue device enrollment." }, { status: 500 });
  }
}
