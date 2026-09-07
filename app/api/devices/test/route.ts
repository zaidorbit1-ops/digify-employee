import { NextResponse } from "next/server";
import net from "node:net";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const ip = String(body.device_ip ?? process.env.ZK_DEVICE_IP ?? "192.168.1.201");
    const port = Number(body.port ?? process.env.ZK_DEVICE_PORT ?? 4370);

    const isReachable = await new Promise<boolean>((resolve) => {
      const socket = new net.Socket();
      const timer = setTimeout(() => {
        socket.destroy();
        resolve(false);
      }, 2500);

      socket.once("connect", () => {
        clearTimeout(timer);
        socket.destroy();
        resolve(true);
      });

      socket.once("error", () => {
        clearTimeout(timer);
        socket.destroy();
        resolve(false);
      });

      socket.connect(port, ip);
    });

    return NextResponse.json({
      ok: isReachable,
      ip,
      port,
      message: isReachable
        ? "Device is reachable on the network."
        : "Device is not reachable. Check IP, LAN connection, and port 4370.",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
