import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

function client() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function GET() {
  try {
    const [{ data: employees, error: employeesError }, { data: permissions, error: permissionsError }] = await Promise.all([
      client().from("employees").select("id, name, employee_id, email, status").order("name"),
      client().from("permissions").select("*").order("module"),
    ]);
    if (employeesError) throw employeesError;
    if (permissionsError) throw permissionsError;
    return NextResponse.json({ employees: employees ?? [], permissions: permissions ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not load permissions." }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const employeeId = Number(body.employee_id);
    const module = String(body.module ?? "").trim();
    if (!Number.isInteger(employeeId) || employeeId <= 0 || !module) {
      return NextResponse.json({ error: "A valid employee and module are required." }, { status: 400 });
    }

    const values = {
      employee_id: employeeId,
      module,
      can_read: body.can_read === true,
      can_add: body.can_add === true,
      can_edit: body.can_edit === true,
      can_delete: body.can_delete === true,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await client().from("permissions").upsert(values, { onConflict: "employee_id,module" }).select().single();
    if (error) throw error;
    return NextResponse.json({ permission: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not save permissions." }, { status: 500 });
  }
}
