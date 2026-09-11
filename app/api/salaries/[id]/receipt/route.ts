import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";
import { supabase } from "@/lib/supabase";
import { generateSalaryReceiptPdf } from "@/lib/salary-receipt";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    if (!supabase) throw new Error("Supabase is not configured.");
    const client = await getSupabaseServerClient();
    const {
      data: { user },
    } = await client.auth.getUser();
    if (!user)
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );

    const { id: rawId } = await params;
    const salaryId = Number(rawId);
    if (!Number.isInteger(salaryId) || salaryId <= 0)
      return NextResponse.json(
        { error: "Invalid salary receipt." },
        { status: 400 },
      );

    const { data: profile } = await client
      .from("profiles")
      .select("role, employee_id")
      .eq("user_id", user.id)
      .single();
    const { data: salary, error: salaryError } = await supabase
      .from("salaries")
      .select(
        "id, employee_id, month, base_salary, actual_late_days, actual_absent_days, actual_half_days, late_days, absent_days, half_days, deduction_amount, net_pay, paid_at, adjustment_note, receipt_storage_path, employees:employee_id (name, employee_id, email)",
      )
      .eq("id", salaryId)
      .single();
    if (salaryError || !salary)
      return NextResponse.json(
        { error: "Salary record not found." },
        { status: 404 },
      );
    const allowed =
      profile?.role === "superadmin" ||
      (profile?.role === "employee" &&
        profile.employee_id === salary.employee_id);
    if (!allowed)
      return NextResponse.json(
        { error: "You are not allowed to access this receipt." },
        { status: 403 },
      );
    if (!salary.receipt_storage_path)
      return NextResponse.json(
        { error: "This salary does not have a receipt yet." },
        { status: 404 },
      );

    const employee = Array.isArray(salary.employees)
      ? salary.employees[0]
      : salary.employees;
    if (!employee)
      return NextResponse.json(
        { error: "Employee record not found." },
        { status: 404 },
      );
    const receipt = await generateSalaryReceiptPdf({
      employee,
      month: salary.month,
      baseSalary: Number(salary.base_salary),
      actualLateDays: salary.actual_late_days ?? salary.late_days,
      actualAbsentDays: salary.actual_absent_days ?? salary.absent_days,
      actualHalfDays: salary.actual_half_days ?? salary.half_days,
      lateDays: salary.late_days,
      absentDays: salary.absent_days,
      halfDays: salary.half_days,
      deductionAmount: Number(salary.deduction_amount),
      netPay: Number(salary.net_pay),
      paidAt: salary.paid_at ?? new Date().toISOString(),
      adjustmentNote: salary.adjustment_note,
    });
    return new NextResponse(receipt as unknown as BodyInit, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="salary-receipt-${salaryId}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not download salary receipt.",
      },
      { status: 500 },
    );
  }
}
