import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function getClient() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ employeeId: string }> },
) {
  try {
    const { employeeId } = await params;
    const employeeNumber = Number(employeeId);

    if (!Number.isInteger(employeeNumber) || employeeNumber <= 0) {
      return NextResponse.json({ error: "A valid employee ID is required." }, { status: 400 });
    }

    const { data, error } = await getClient()
      .from("leaves")
      .select("*")
      .eq("employee_id", employeeNumber)
      .order("start_date", { ascending: false });

    if (error) throw error;

    return NextResponse.json({ leaves: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not load leave records." },
      { status: 500 },
    );
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ employeeId: string }> },
) {
  try {
    const { employeeId } = await params;
    const employeeNumber = Number(employeeId);
    const body = await request.json();
    const startDate = String(body.start_date ?? "").trim();
    const endDate = String(body.end_date ?? "").trim();
    const reason = String(body.reason ?? "").trim();

    if (!Number.isInteger(employeeNumber) || employeeNumber <= 0) {
      return NextResponse.json({ error: "A valid employee ID is required." }, { status: 400 });
    }
    if (!startDate || !endDate) {
      return NextResponse.json({ error: "A start date and end date are required." }, { status: 400 });
    }
    if (!reason) {
      return NextResponse.json({ error: "A leave reason is required." }, { status: 400 });
    }

    const { data, error } = await getClient()
      .from("leaves")
      .insert({
        employee_id: employeeNumber,
        start_date: startDate,
        end_date: endDate,
        reason,
        status: "pending",
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ leave: data }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Could not create leave request." },
      { status: 500 },
    );
  }
}
