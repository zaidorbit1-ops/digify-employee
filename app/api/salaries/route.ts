import { NextResponse } from "next/server";
import { buildAttendanceDays } from "@/lib/attendance";
import {
  calculateMonthlySalary,
  dateInMonth,
  normalizeMonthKey,
} from "@/lib/salary";
import {
  getAttendance,
  getEmployees,
  getLeavesForRange,
  getShiftTimings,
  supabase,
} from "@/lib/supabase";
import { generateSalaryReceiptPdf } from "@/lib/salary-receipt";
import { getSupabaseServerClient } from "@/lib/supabase-server";

function getClient() {
  if (!supabase) throw new Error("Supabase is not configured.");
  return supabase;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const employeeId = Number(url.searchParams.get("employee_id"));
    const month = String(url.searchParams.get("month") ?? "").trim();
    const preview = url.searchParams.get("preview") === "true";

    if (
      preview &&
      employeeId &&
      Number.isInteger(employeeId) &&
      employeeId > 0 &&
      month
    ) {
      const monthKey = normalizeMonthKey(month);
      const [attendance, employees, shifts, leaves] = await Promise.all([
        getAttendance(),
        getEmployees(),
        getShiftTimings(),
        getLeavesForRange(monthKey, monthKey.replace("-01", "-31")),
      ]);

      const employee = employees.find((entry) => entry.id === employeeId);
      if (!employee) {
        return NextResponse.json(
          { error: "Employee was not found." },
          { status: 404 },
        );
      }

      const monthDays = buildAttendanceDays({
        employees: [employee],
        shifts,
        punches: attendance,
        approvedLeaves: leaves,
        startDate: monthKey,
        endDate: monthKey.replace("-01", "-31"),
      });

      const monthSummary = monthDays.filter(
        (day) =>
          day.employee.id === employeeId && dateInMonth(day.date, monthKey),
      );
      const lateDays = monthSummary.filter(
        (day) => day.arrival_status === "late" && day.status !== "leave",
      ).length;
      const absentDays = monthSummary.filter(
        (day) => day.status === "absent",
      ).length;
      const halfDays = monthSummary.filter(
        (day) => day.status === "half_day",
      ).length;
      const presentDays = monthSummary.filter(
        (day) => day.status === "present",
      ).length;

      const baseSalary = Number(employee.salary ?? 0);
      const summary = calculateMonthlySalary({
        baseSalary,
        lateDays,
        absentDays,
        halfDays,
        lateDeductionEnabled: true,
      });

      return NextResponse.json({
        summary: { ...summary, present_days: presentDays },
        employee,
        month: monthKey,
      });
    }

    const { data, error } = await getClient()
      .from("salaries")
      .select("*, employees:employee_id (id, name, email, employee_id)")
      .order("month", { ascending: false });

    if (error) throw error;
    return NextResponse.json({ salaries: data ?? [] });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not load salary data.",
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const employeeId = Number(body.employee_id);
    const month = normalizeMonthKey(String(body.month ?? "").trim());
    const baseSalary = Number(body.base_salary ?? 0);
    const lateDeductionEnabled = body.late_deduction_enabled !== false;
    const ignoreLate = body.ignore_late_deduction === true;
    const ignoreAbsent = body.ignore_absent_deduction === true;
    const customDeductionAmount =
      body.custom_deduction_amount === undefined ||
      body.custom_deduction_amount === null ||
      body.custom_deduction_amount === ""
        ? null
        : Number(body.custom_deduction_amount);
    const adjustmentNote =
      typeof body.adjustment_note === "string"
        ? body.adjustment_note.trim()
        : "";

    if (!Number.isInteger(employeeId) || employeeId <= 0) {
      return NextResponse.json(
        { error: "A valid employee is required." },
        { status: 400 },
      );
    }

    if (!Number.isFinite(baseSalary) || baseSalary < 0) {
      return NextResponse.json(
        { error: "A valid base salary is required." },
        { status: 400 },
      );
    }

    const [attendance, employees, shifts, leaves] = await Promise.all([
      getAttendance(),
      getEmployees(),
      getShiftTimings(),
      getLeavesForRange(month, month.replace("-01", "-31")),
    ]);

    const employee = employees.find((entry) => entry.id === employeeId);
    if (!employee) {
      return NextResponse.json(
        { error: "Employee was not found." },
        { status: 404 },
      );
    }

    const dayRange = buildAttendanceDays({
      employees: [employee],
      shifts,
      punches: attendance,
      approvedLeaves: leaves,
      startDate: month,
      endDate: month.replace("-01", "-31"),
    });

    const monthSummary = dayRange.filter(
      (day) => day.employee.id === employeeId && dateInMonth(day.date, month),
    );
    const lateDays = monthSummary.filter(
      (day) => day.arrival_status === "late" && day.status !== "leave",
    ).length;
    const absentDays = monthSummary.filter(
      (day) => day.status === "absent",
    ).length;
    const halfDays = monthSummary.filter(
      (day) => day.status === "half_day",
    ).length;

    const adjustedLateDays = Number(body.adjusted_late_days);
    const adjustedAbsentDays = Number(body.adjusted_absent_days);
    const adjustedHalfDays = Number(body.adjusted_half_days);
    const effectiveLateDays =
      Number.isInteger(adjustedLateDays) && adjustedLateDays >= 0
        ? Math.min(adjustedLateDays, lateDays)
        : ignoreLate
          ? 0
          : lateDays;
    const effectiveAbsentDays =
      Number.isInteger(adjustedAbsentDays) && adjustedAbsentDays >= 0
        ? Math.min(adjustedAbsentDays, absentDays)
        : ignoreAbsent
          ? 0
          : absentDays;
    const effectiveHalfDays =
      Number.isInteger(adjustedHalfDays) && adjustedHalfDays >= 0
        ? Math.min(adjustedHalfDays, halfDays)
        : halfDays;

    let summary = calculateMonthlySalary({
      baseSalary,
      lateDays: effectiveLateDays,
      absentDays: effectiveAbsentDays,
      halfDays: effectiveHalfDays,
      lateDeductionEnabled,
    });

    if (
      customDeductionAmount !== null &&
      Number.isFinite(customDeductionAmount) &&
      customDeductionAmount >= 0
    ) {
      const safeDeductionAmount = Math.min(customDeductionAmount, baseSalary);
      summary = {
        ...summary,
        deduction_amount: Number(safeDeductionAmount.toFixed(2)),
        net_pay: Number(
          Math.max(0, baseSalary - safeDeductionAmount).toFixed(2),
        ),
      };
    }

    const payload = {
      employee_id: employeeId,
      month,
      base_salary: summary.base_salary,
      actual_late_days: lateDays,
      actual_absent_days: absentDays,
      actual_half_days: halfDays,
      late_days: effectiveLateDays,
      absent_days: effectiveAbsentDays,
      half_days: summary.half_days,
      late_deduction_enabled: summary.late_deduction_enabled,
      deduction_amount: summary.deduction_amount,
      net_pay: summary.net_pay,
      custom_deduction_amount:
        customDeductionAmount !== null && Number.isFinite(customDeductionAmount)
          ? Number(customDeductionAmount.toFixed(2))
          : null,
      adjustment_note: adjustmentNote || null,
      status: body.pay_now === true ? "paid" : "unpaid",
      paid_at: body.pay_now === true ? new Date().toISOString() : null,
    };

    const { data, error } = await getClient()
      .from("salaries")
      .upsert(
        {
          ...payload,
          month,
        },
        { onConflict: "employee_id,month" },
      )
      .select()
      .single();

    if (error) throw error;

    if (body.pay_now === true) {
      const { error: expenseError } = await getClient()
        .from("expenses")
        .upsert(
          {
            source: "salary",
            salary_id: data.id,
            amount: summary.net_pay,
            description: `Salary payout for ${employee.name} (${new Date(month).toLocaleDateString(undefined, { month: "long", year: "numeric" })})`,
            expense_date: new Date().toISOString().slice(0, 10),
          },
          { onConflict: "salary_id" },
        );

      if (expenseError) throw expenseError;

      const receiptBytes = await generateSalaryReceiptPdf({
        employee,
        month,
        baseSalary: summary.base_salary,
        actualLateDays: lateDays,
        actualAbsentDays: absentDays,
        actualHalfDays: halfDays,
        lateDays: effectiveLateDays,
        absentDays: effectiveAbsentDays,
        halfDays: summary.half_days,
        deductionAmount: summary.deduction_amount,
        netPay: summary.net_pay,
        paidAt: payload.paid_at ?? new Date().toISOString(),
        adjustmentNote,
      });
      const receiptStoragePath = `${employeeId}/${month}/${data.id}.pdf`;
      const { error: uploadError } = await getClient()
        .storage.from("salary-receipts")
        .upload(receiptStoragePath, receiptBytes, {
          contentType: "application/pdf",
          upsert: true,
        });
      if (uploadError) throw uploadError;

      const { data: receiptSalary, error: receiptUpdateError } =
        await getClient()
          .from("salaries")
          .update({ receipt_storage_path: receiptStoragePath })
          .eq("id", data.id)
          .select()
          .single();
      if (receiptUpdateError) throw receiptUpdateError;
      return NextResponse.json({
        salary: receiptSalary,
        summary,
        receipt_ready: true,
      });
    }

    return NextResponse.json({ salary: data, summary });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not create salary record.",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    if (!supabase) throw new Error("Supabase is not configured.");
    const authClient = await getSupabaseServerClient();
    const {
      data: { user },
    } = await authClient.auth.getUser();
    if (!user)
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    const { data: profile } = await authClient
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();
    if (profile?.role !== "superadmin")
      return NextResponse.json(
        { error: "Only a superadmin can delete salary payments." },
        { status: 403 },
      );

    const salaryId = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(salaryId) || salaryId <= 0)
      return NextResponse.json(
        { error: "A valid salary record is required." },
        { status: 400 },
      );
    const { data: salary, error: salaryLookupError } = await supabase
      .from("salaries")
      .select("id, receipt_storage_path")
      .eq("id", salaryId)
      .single();
    if (salaryLookupError || !salary)
      return NextResponse.json(
        { error: "Salary record not found." },
        { status: 404 },
      );

    const { error: expenseError } = await supabase
      .from("expenses")
      .delete()
      .eq("salary_id", salaryId);
    if (expenseError) throw expenseError;
    if (salary.receipt_storage_path) {
      const { error: fileError } = await supabase.storage
        .from("salary-receipts")
        .remove([salary.receipt_storage_path]);
      if (fileError) throw fileError;
    }
    const { error: deleteError } = await supabase
      .from("salaries")
      .delete()
      .eq("id", salaryId);
    if (deleteError) throw deleteError;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Could not delete salary payment.",
      },
      { status: 500 },
    );
  }
}
