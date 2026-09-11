import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { supabase } from "@/lib/supabase";

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

async function requireAdmin() {
  const auth = await getSupabaseServerClient();
  const {
    data: { user },
  } = await auth.auth.getUser();
  if (!user) throw new Error("Authentication required.");
  const { data: profile } = await auth
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  if (profile?.role !== "superadmin")
    throw new Error("Only a superadmin can manage holidays.");
  return user;
}

export async function GET() {
  try {
    await requireAdmin();
    const { data, error } = await client()
      .from("holidays")
      .select("id, title, start_date, end_date, created_at")
      .order("start_date", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ holidays: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not load holidays.",
      },
      { status: 403 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdmin();
    const body = await request.json();
    const title = String(body.title ?? "").trim();
    const startDate = String(body.start_date ?? "").trim();
    const endDate = String(body.end_date ?? startDate).trim();
    if (
      !title ||
      !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(endDate) ||
      endDate < startDate
    ) {
      return NextResponse.json(
        { error: "Enter a title and valid holiday dates." },
        { status: 400 },
      );
    }
    const { data, error } = await client()
      .from("holidays")
      .insert({
        title,
        start_date: startDate,
        end_date: endDate,
        created_by: user.id,
      })
      .select("id, title, start_date, end_date, created_at")
      .single();
    if (error) throw error;
    return NextResponse.json({ holiday: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not create holiday.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    await requireAdmin();
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0)
      return NextResponse.json(
        { error: "A valid holiday is required." },
        { status: 400 },
      );
    const { error } = await client().from("holidays").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Could not delete holiday.",
      },
      { status: 500 },
    );
  }
}
