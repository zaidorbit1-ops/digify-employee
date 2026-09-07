import { NextResponse } from "next/server";
import { addDevice, deleteDevice, getDevices, updateDevice } from "@/lib/supabase";

export async function GET() {
  try {
    const devices = await getDevices();
    return NextResponse.json({ devices });
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

    const name = String(body.name ?? "").trim();
    const deviceIp = String(body.device_ip ?? "").trim();
    const port = Number(body.port ?? 4370);

    if (!name) {
      return NextResponse.json(
        { error: "Device name is required." },
        { status: 400 }
      );
    }

    if (!deviceIp) {
      return NextResponse.json(
        { error: "Device IP is required." },
        { status: 400 }
      );
    }

    if (!Number.isFinite(port) || port <= 0) {
      return NextResponse.json(
        { error: "Port must be a valid number greater than 0." },
        { status: 400 }
      );
    }

    const device = await addDevice({
      name,
      device_ip: deviceIp,
      port,
      device_type: String(body.device_type ?? "zkteco_k60"),
      status: String(body.status ?? "active"),
    });

    return NextResponse.json({ device }, { status: 201 });
  } catch (error) {
    let message = error instanceof Error ? error.message : "Unknown error";

    if (typeof error === "object" && error !== null && "code" in error) {
      const code = (error as { code?: string }).code;
      if (code === "42P01") {
        message = "Supabase table 'devices' does not exist yet. Run the migration SQL in the Supabase SQL editor.";
      } else if (code === "42501") {
        message = "Supabase row-level security is blocking the insert. Allow insert access for the devices table.";
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
    const name = String(body.name ?? "").trim();
    const deviceIp = String(body.device_ip ?? "").trim();
    const port = Number(body.port ?? 4370);

    if (!Number.isInteger(id) || id <= 0 || !name || !deviceIp || !Number.isFinite(port) || port <= 0) {
      return NextResponse.json({ error: "Device name, IP, port, and a valid record ID are required." }, { status: 400 });
    }

    const device = await updateDevice(id, {
      name,
      device_ip: deviceIp,
      port,
      device_type: String(body.device_type ?? "zkteco_k60"),
      status: String(body.status ?? "active"),
    });
    return NextResponse.json({ device });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update device." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "A valid device ID is required." }, { status: 400 });
    }
    await deleteDevice(id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to delete device." }, { status: 500 });
  }
}
