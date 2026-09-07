import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

type LookupType = "shifts" | "departments" | "positions";

const tableByType: Record<LookupType, "shift_timings" | "departments" | "positions"> = {
  shifts: "shift_timings",
  departments: "departments",
  positions: "positions",
};

function getTable(type: string) {
  return tableByType[type as LookupType] ?? null;
}

function getClient() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function GET(_request: Request, { params }: { params: Promise<{ type: string }> }) {
  try {
    const { type } = await params;
    const table = getTable(type);
    if (!table) return NextResponse.json({ error: "Unknown lookup type." }, { status: 404 });

    const { data, error } = await getClient().from(table).select("*").order("name");
    if (error) throw error;
    return NextResponse.json({ items: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load lookup list." }, { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ type: string }> }) {
  try {
    const { type } = await params;
    const table = getTable(type);
    if (!table) return NextResponse.json({ error: "Unknown lookup type." }, { status: 404 });
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "Name is required." }, { status: 400 });

    let data;
    let error;
    if (table === "shift_timings") {
      const values = { name, start_time: String(body.start_time ?? ""), end_time: String(body.end_time ?? ""), grace_minutes: Number(body.grace_minutes ?? 15) };
      if (!values.start_time || !values.end_time || !Number.isInteger(values.grace_minutes) || values.grace_minutes < 0) return NextResponse.json({ error: "Shift start, end, and a valid grace period are required." }, { status: 400 });
      ({ data, error } = await getClient().from("shift_timings").insert(values).select().single());
    } else {
      ({ data, error } = await getClient().from(table).insert({ name }).select().single());
    }
    if (error) throw error;
    return NextResponse.json({ item: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create lookup item." }, { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ type: string }> }) {
  try {
    const { type } = await params;
    const table = getTable(type);
    if (!table) return NextResponse.json({ error: "Unknown lookup type." }, { status: 404 });
    const body = await request.json();
    const id = Number(body.id);
    const name = String(body.name ?? "").trim();
    if (!Number.isInteger(id) || id <= 0 || !name) return NextResponse.json({ error: "A valid ID and name are required." }, { status: 400 });

    let data;
    let error;
    if (table === "shift_timings") {
      const values = { name, start_time: String(body.start_time ?? ""), end_time: String(body.end_time ?? ""), grace_minutes: Number(body.grace_minutes ?? 15) };
      ({ data, error } = await getClient().from("shift_timings").update(values).eq("id", id).select().single());
    } else {
      ({ data, error } = await getClient().from(table).update({ name }).eq("id", id).select().single());
    }
    if (error) throw error;
    return NextResponse.json({ item: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update lookup item." }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ type: string }> }) {
  try {
    const { type } = await params;
    const table = getTable(type);
    if (!table) return NextResponse.json({ error: "Unknown lookup type." }, { status: 404 });
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "A valid ID is required." }, { status: 400 });

    const { error } = await getClient().from(table).delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not delete lookup item." }, { status: 500 });
  }
}
