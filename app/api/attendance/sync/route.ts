import { NextResponse } from "next/server";

const response = {
  ok: false,
  error: "Direct device sync is disabled. The office attendance connector performs K60 sync locally.",
};

export async function POST() {
  return NextResponse.json(response, { status: 410 });
}

export async function GET() {
  return NextResponse.json({ ok: true, message: "K60 sync runs through the office attendance connector." });
}
