import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function getClient() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const status = url.searchParams.get("status") ?? "all";

    let query = getClient()
      .from("leaves")
      .select("*, employees:employee_id (id, name, email, auth_user_id, employee_id)")
      .order("created_at", { ascending: false });

    if (status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) throw error;

    return NextResponse.json({ leaves: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load leave requests." },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const id = Number(body.id);
    const status = String(body.status ?? "").trim();

    if (!Number.isInteger(id) || id <= 0) {
      return NextResponse.json({ error: "A valid leave request is required." }, { status: 400 });
    }

    if (!["pending", "approved", "declined"].includes(status)) {
      return NextResponse.json({ error: "Status must be pending, approved, or declined." }, { status: 400 });
    }

    const existing = await getClient().from("leaves").select("*, employees:employee_id (id, name, auth_user_id)").eq("id", id).single();
    if (existing.error || !existing.data) {
      return NextResponse.json({ error: "Leave request was not found." }, { status: 404 });
    }

    const { data, error } = await getClient()
      .from("leaves")
      .update({
        status,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select("*, employees:employee_id (id, name, email, auth_user_id, employee_id)")
      .single();

    if (error) throw error;

    const recipientId = existing.data.employees?.auth_user_id;
    if (recipientId) {
      await getClient().from("notifications").insert({
        recipient_id: recipientId,
        type: "leave_update",
        message: `Your leave request for ${existing.data.start_date} to ${existing.data.end_date} was ${status}.`,
        is_read: false,
        related_record_id: id,
      });
    }

    return NextResponse.json({ leave: data });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not update leave request." },
      { status: 500 },
    );
  }
}
