import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function GET() {
  try {
    const { data, error } = await client().from("companies").select("*").order("name");
    if (error) throw error;
    return NextResponse.json({ companies: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load companies." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const name = String(body.name ?? "").trim();
    if (!name) return NextResponse.json({ error: "Company name is required." }, { status: 400 });

    const { data, error } = await client().from("companies").insert({
      name,
      logo_url: String(body.logo_url ?? "").trim() || null,
      notes: String(body.notes ?? "").trim() || null,
    }).select().single();
    if (error) throw error;
    return NextResponse.json({ company: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not create company." }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const id = Number(body.id);
    const name = String(body.name ?? "").trim();
    if (!Number.isInteger(id) || id <= 0 || !name) return NextResponse.json({ error: "A valid company and name are required." }, { status: 400 });

    const { data, error } = await client().from("companies").update({
      name,
      logo_url: String(body.logo_url ?? "").trim() || null,
      notes: String(body.notes ?? "").trim() || null,
      updated_at: new Date().toISOString(),
    }).eq("id", id).select().single();
    if (error) throw error;
    return NextResponse.json({ company: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not update company." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "A valid company is required." }, { status: 400 });
    const { error } = await client().from("companies").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not delete company." }, { status: 500 });
  }
}
