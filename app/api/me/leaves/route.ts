import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

async function employeeContext() {
  const client = await getSupabaseServerClient();
  const {
    data: { user },
  } = await client.auth.getUser();
  if (!user) throw new Error("Authentication required.");
  const { data: profile } = await client
    .from("profiles")
    .select("role, employee_id")
    .eq("user_id", user.id)
    .single();
  if (profile?.role !== "employee" || !profile.employee_id)
    throw new Error("Employee profile is not linked.");
  return { client, employeeId: profile.employee_id };
}

export async function GET() {
  try {
    const { client, employeeId } = await employeeContext();
    const { data, error } = await client
      .from("leaves")
      .select("id, start_date, end_date, reason, status, created_at")
      .eq("employee_id", employeeId)
      .order("created_at", { ascending: false });
    if (error) throw error;
    return NextResponse.json({ leaves: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load your leave requests.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const { client, employeeId } = await employeeContext();
    const body = await request.json();
    const leaveType = body.leave_type === "multiple" ? "multiple" : "single";
    const startDate = String(body.start_date ?? "").trim();
    const endDate =
      leaveType === "single" ? startDate : String(body.end_date ?? "").trim();
    const reason = String(body.reason ?? "").trim();
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(startDate) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(endDate) ||
      endDate < startDate ||
      (leaveType === "multiple" && endDate === startDate) ||
      !reason
    ) {
      return NextResponse.json(
        {
          error:
            leaveType === "multiple"
              ? "Select a valid start and end date for multiple days."
              : "Select a valid leave date and enter a reason.",
        },
        { status: 400 },
      );
    }
    const { data, error } = await client
      .from("leaves")
      .insert({
        employee_id: employeeId,
        start_date: startDate,
        end_date: endDate,
        reason,
        status: "pending",
      })
      .select("id, start_date, end_date, reason, status, created_at")
      .single();
    if (error) throw error;
    return NextResponse.json({ leave: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not submit leave request.",
      },
      { status: 500 },
    );
  }
}
