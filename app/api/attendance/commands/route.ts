import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getPendingEnrollmentCommands } from "@/lib/supabase";

function authorized(request: Request) {
  const expected = Buffer.from(process.env.CONNECTOR_TOKEN ?? "");
  const actual = Buffer.from(request.headers.get("x-connector-token") ?? "");
  return expected.length > 0 && expected.length === actual.length && timingSafeEqual(expected, actual);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false, error: "Invalid connector authentication." }, { status: 401 });
  try {
    const commands = await getPendingEnrollmentCommands();
    return NextResponse.json({ ok: true, commands });
  } catch {
    return NextResponse.json({ ok: false, error: "Could not load device commands." }, { status: 500 });
  }
}
