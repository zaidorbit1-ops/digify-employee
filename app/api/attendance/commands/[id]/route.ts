import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { claimEnrollmentCommand, completeEnrollmentCommand, failEnrollmentCommand, getEnrollmentCommand } from "@/lib/supabase";

function authorized(request: Request) {
  const expected = Buffer.from(process.env.CONNECTOR_TOKEN ?? "");
  const actual = Buffer.from(request.headers.get("x-connector-token") ?? "");
  return expected.length > 0 && expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "Invalid connector authentication." }, { status: 401 });
  const { id } = await context.params;
  try {
    const body = await request.json().catch(() => ({}));
    if (body.action === "claim") {
      const command = await claimEnrollmentCommand(id);
      return NextResponse.json({ ok: true, claimed: Boolean(command), command });
    }
    if (body.action === "complete" && body.result && Number.isInteger(Number(body.result.uid))) {
      const command = await completeEnrollmentCommand(id, body.result);
      return NextResponse.json({ ok: true, command });
    }
    if (body.action === "fail" && typeof body.error === "string") {
      const command = await failEnrollmentCommand(id, body.error);
      return NextResponse.json({ ok: true, command });
    }
    return NextResponse.json({ ok: false, error: "Unsupported command action." }, { status: 400 });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not update device command." }, { status: 500 });
  }
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "Invalid connector authentication." }, { status: 401 });
  const { id } = await context.params;
  const command = await getEnrollmentCommand(id);
  return command ? NextResponse.json({ ok: true, command }) : NextResponse.json({ ok: false, error: "Command not found." }, { status: 404 });
}
