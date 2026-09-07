import { NextResponse } from "next/server";
import { enrollUserOnZkDevice } from "@/lib/zkteco";
import { getDevices, getEmployees, updateEmployee } from "@/lib/supabase";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const employeeId = Number(body.employee_id);
    const deviceId = Number(body.device_id);

    if (!Number.isInteger(employeeId) || !Number.isInteger(deviceId)) {
      return NextResponse.json(
        { error: "A valid employee and device are required." },
        { status: 400 }
      );
    }

    const [employees, devices] = await Promise.all([getEmployees(), getDevices()]);
    const employee = employees.find((item) => item.id === employeeId);
    const device = devices.find((item) => item.id === deviceId);

    if (!employee) {
      return NextResponse.json({ error: "Employee was not found." }, { status: 404 });
    }

    if (!device) {
      return NextResponse.json({ error: "Device was not found." }, { status: 404 });
    }

    const uid = Number(body.zk_device_uid ?? employee.zk_device_uid ?? employee.id);
    if (!Number.isInteger(uid) || uid <= 0) {
      return NextResponse.json(
        { error: "A valid numeric device user ID is required." },
        { status: 400 }
      );
    }

    const enrolled = await enrollUserOnZkDevice({
      ip: device.device_ip,
      port: device.port,
      uid,
      userId: String(uid),
      name: employee.name,
    });

    const updatedEmployee = await updateEmployee(employee.id, {
      device_id: device.id,
      zk_device_uid: enrolled.uid,
      enrollment_status: "enrolled",
    });

    return NextResponse.json({
      ok: true,
      employee: updatedEmployee,
      message: `${employee.name} was sent to ${device.name}. Complete fingerprint enrollment on the device if required.`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Device enrollment failed.";
    return NextResponse.json(
      {
        ok: false,
        error: `Enrollment failed: ${message}`,
        hint: "Check that the K60 is powered on, reachable, and accepting port 4370 connections.",
      },
      { status: 500 }
    );
  }
}