import { NextResponse } from "next/server";
import net from "node:net";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const ip = String(body.device_ip ?? process.env.ZK_DEVICE_IP ?? "192.168.1.201");
    const port = Number(body.port ?? process.env.ZK_DEVICE_PORT ?? 4370);
    const startedAt = Date.now();

    console.info("[DEVICE TEST] TCP connection attempt", { ip, port });

    const result = await new Promise<{ ok: boolean; code?: string; error?: string }>((resolve) => {
      const socket = new net.Socket();
      const timer = setTimeout(() => {
        socket.destroy();
        resolve({ ok: false, code: "ETIMEDOUT", error: `Connection timed out after 2500ms.` });
      }, 2500);

      socket.once("connect", () => {
        clearTimeout(timer);
        socket.destroy();
        resolve({ ok: true });
      });

      socket.once("error", (error: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        socket.destroy();
        resolve({ ok: false, code: error.code, error: error.message });
      });

      socket.connect(port, ip);
    });

    console.info(result.ok ? "[DEVICE TEST] TCP connection succeeded" : "[DEVICE TEST] TCP connection failed", {
      ip,
      port,
      elapsedMs: Date.now() - startedAt,
      code: result.code,
      error: result.error,
    });

    return NextResponse.json({
      ok: result.ok,
      ip,
      port,
      code: result.code,
      message: result.ok
        ? "Device is reachable on the network."
        : `Device is not reachable (${result.code ?? "unknown error"}). Check IP ${ip}, LAN connection, and port ${port}.`,
    });
  } catch (error) {
    console.error("[DEVICE TEST] request failed", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
