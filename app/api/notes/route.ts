import { NextResponse } from "next/server";
import { getSupabaseServerClient, getSupabaseServiceRoleClient } from "@/lib/supabase-server";

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    const details = error as { message?: string; code?: string; details?: string };
    return `${details.message ?? fallback}${details.code ? ` (code ${details.code})` : ""}${details.details ? ` ${details.details}` : ""}`;
  }
  return fallback;
}

async function getOwner() {
  const sessionClient = await getSupabaseServerClient();
  const { data: { user }, error } = await sessionClient.auth.getUser();
  if (error || !user) throw new Error("Authentication required.");
  return { client: getSupabaseServiceRoleClient(), user };
}

function parseDate(value: unknown) {
  const date = new Date(String(value ?? ""));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export async function GET() {
  try {
    const { client, user } = await getOwner();
    const { data, error } = await client
      .from("personal_notes")
      .select("id, title, description, remind_at, completed_at, created_at, updated_at")
      .eq("owner_user_id", user.id)
      .order("completed_at", { ascending: true, nullsFirst: true })
      .order("remind_at", { ascending: true });
    if (error) throw error;
    return NextResponse.json({ notes: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not load notes.") }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { client, user } = await getOwner();
    const body = await request.json();
    const title = String(body.title ?? "").trim();
    const remindAt = parseDate(body.remind_at);
    if (!title || title.length > 180) return NextResponse.json({ error: "A note topic up to 180 characters is required." }, { status: 400 });
    if (!remindAt) return NextResponse.json({ error: "A valid reminder date and time are required." }, { status: 400 });
    const { data, error } = await client.from("personal_notes").insert({
      owner_user_id: user.id,
      title,
      description: String(body.description ?? "").trim() || null,
      remind_at: remindAt,
    }).select("id, title, description, remind_at, completed_at, created_at, updated_at").single();
    if (error) throw error;
    return NextResponse.json({ note: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not create note.") }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const { client, user } = await getOwner();
    const body = await request.json();
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "A valid note is required." }, { status: 400 });

    const values: Record<string, string | null> = { updated_at: new Date().toISOString() };
    if (body.action === "done") {
      values.completed_at = new Date().toISOString();
    } else if (body.action === "reopen") {
      values.completed_at = null;
    } else {
      const title = String(body.title ?? "").trim();
      const remindAt = parseDate(body.remind_at);
      if (!title || title.length > 180 || !remindAt) return NextResponse.json({ error: "A valid topic and reminder date/time are required." }, { status: 400 });
      values.title = title;
      values.description = String(body.description ?? "").trim() || null;
      values.remind_at = remindAt;
      values.completed_at = null;
    }

    const { data, error } = await client.from("personal_notes").update(values).eq("id", id).eq("owner_user_id", user.id).select("id, title, description, remind_at, completed_at, created_at, updated_at").single();
    if (error) throw error;
    return NextResponse.json({ note: data });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not update note.") }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { client, user } = await getOwner();
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) return NextResponse.json({ error: "A valid note is required." }, { status: 400 });
    const { error } = await client.from("personal_notes").delete().eq("id", id).eq("owner_user_id", user.id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json({ error: errorMessage(error, "Could not delete note.") }, { status: 500 });
  }
}
