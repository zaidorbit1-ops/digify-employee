"use client";

import { useEffect, useMemo, useState } from "react";
import {
  IconDownload,
  IconRefresh,
  IconSearch,
  IconTrash,
} from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/empty-state";
import { Field, SelectInput, TextInput } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { calculateMonthlySalary } from "@/lib/salary";

type Employee = { id: number; name: string; salary?: number | null };
type Preview = {
  base_salary: number;
  present_days: number;
  late_days: number;
  absent_days: number;
  half_days: number;
  actual_late_days?: number;
  actual_absent_days?: number;
  actual_half_days?: number;
  deduction_amount: number;
  net_pay: number;
};
type SalaryRecord = {
  id: number;
  employee_id: number;
  month: string;
  base_salary?: number;
  late_days: number;
  absent_days: number;
  half_days: number;
  deduction_amount: number;
  net_pay: number;
  status: "paid" | "unpaid";
  paid_at?: string | null;
  receipt_storage_path?: string | null;
  adjustment_note?: string | null;
  employees?: { name: string } | null;
};

const currentMonth = new Date().toISOString().slice(0, 7);
const money = (value: number) =>
  Number(value || 0).toLocaleString("en-PK", {
    style: "currency",
    currency: "PKR",
  });
const monthLabel = (month: string) => {
  const match = /^(\d{4})-(\d{2})/.exec(month);
  if (!match) return "-";
  return new Date(Number(match[1]), Number(match[2]) - 1, 1).toLocaleDateString(
    undefined,
    { month: "long", year: "numeric" },
  );
};
const dateLabel = (date?: string | null) =>
  date ? new Date(date).toLocaleDateString() : "-";

export default function SalaryPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [history, setHistory] = useState<SalaryRecord[]>([]);
  const [historyMonth, setHistoryMonth] = useState(currentMonth);
  const [historyEmployee, setHistoryEmployee] = useState("");
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [salaryEmployeeId, setSalaryEmployeeId] = useState("");
  const [salaryMonth, setSalaryMonth] = useState(currentMonth);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    tone: "danger" | "success";
  } | null>(null);
  const [adjustment, setAdjustment] = useState({
    late: "",
    absent: "",
    half: "",
    deduction: "",
    note: "",
  });

  const selectedEmployee = employees.find(
    (employee) => String(employee.id) === salaryEmployeeId,
  );

  async function loadData() {
    setLoading(true);
    setMessage(null);
    try {
      const [employeeResponse, salaryResponse] = await Promise.all([
        fetch("/api/employees", { cache: "no-store" }),
        fetch("/api/salaries", { cache: "no-store" }),
      ]);
      const employeeResult = await employeeResponse.json();
      const salaryResult = await salaryResponse.json();
      if (!employeeResponse.ok)
        throw new Error(employeeResult.error ?? "Could not load employees.");
      if (!salaryResponse.ok)
        throw new Error(salaryResult.error ?? "Could not load salary history.");
      setEmployees(employeeResult.employees ?? []);
      setHistory(salaryResult.salaries ?? []);
    } catch (error) {
      setMessage({
        text:
          error instanceof Error
            ? error.message
            : "Could not load salary data.",
        tone: "danger",
      });
    } finally {
      setLoading(false);
    }
  }

  async function loadPreview(
    employeeId = salaryEmployeeId,
    month = salaryMonth,
  ) {
    if (!employeeId || !month) {
      setPreview(null);
      return;
    }
    setPreviewLoading(true);
    try {
      const response = await fetch(
        `/api/salaries?preview=true&employee_id=${employeeId}&month=${month}`,
        { cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Could not calculate salary preview.");
      setPreview(result.summary ?? null);
    } catch (error) {
      setPreview(null);
      setMessage({
        text:
          error instanceof Error
            ? error.message
            : "Could not calculate salary preview.",
        tone: "danger",
      });
    } finally {
      setPreviewLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  const filteredHistory = useMemo(() => {
    const records = history.filter((record) => {
      const name = record.employees?.name ?? `Employee #${record.employee_id}`;
      return (
        name.toLowerCase().includes(query.toLowerCase()) &&
        (!historyEmployee || String(record.employee_id) === historyEmployee) &&
        (!historyMonth || record.month.startsWith(historyMonth)) &&
        (status === "all" || record.status === status)
      );
    });
    if (status !== "unpaid" || !historyMonth) return records;

    const monthRecords = history.filter((record) =>
      record.month.startsWith(historyMonth),
    );
    const paidEmployeeIds = new Set(
      monthRecords
        .filter((record) => record.status === "paid")
        .map((record) => record.employee_id),
    );
    const existingUnpaidEmployeeIds = new Set(
      records.map((record) => record.employee_id),
    );
    const missingEmployees = employees
      .filter(
        (employee) =>
          !paidEmployeeIds.has(employee.id) &&
          !existingUnpaidEmployeeIds.has(employee.id),
      )
      .filter(
        (employee) =>
          !historyEmployee || String(employee.id) === historyEmployee,
      )
      .filter((employee) =>
        employee.name.toLowerCase().includes(query.toLowerCase()),
      )
      .map((employee) => ({
        id: -employee.id,
        employee_id: employee.id,
        month: `${historyMonth}-01`,
        base_salary: Number(employee.salary ?? 0),
        late_days: 0,
        absent_days: 0,
        half_days: 0,
        deduction_amount: 0,
        net_pay: Number(employee.salary ?? 0),
        status: "unpaid" as const,
        adjustment_note: "Not processed for this month.",
        paid_at: null,
        receipt_storage_path: null,
        employees: { name: employee.name },
      }));
    return [...records, ...missingEmployees];
  }, [history, employees, historyMonth, historyEmployee, query, status]);

  function openAddSalary() {
    const firstEmployee = employees[0];
    const nextEmployeeId =
      salaryEmployeeId || (firstEmployee ? String(firstEmployee.id) : "");
    setSalaryEmployeeId(nextEmployeeId);
    setSalaryMonth(currentMonth);
    setAdjustment({ late: "", absent: "", half: "", deduction: "", note: "" });
    setOpen(true);
    loadPreview(nextEmployeeId, currentMonth);
  }

  function changeSalaryEmployee(value: string) {
    setSalaryEmployeeId(value);
    setAdjustment({ late: "", absent: "", half: "", deduction: "", note: "" });
    loadPreview(value, salaryMonth);
  }
  function changeSalaryMonth(value: string) {
    setSalaryMonth(value);
    setAdjustment({ late: "", absent: "", half: "", deduction: "", note: "" });
    loadPreview(salaryEmployeeId, value);
  }

  const effective = {
    late:
      adjustment.late === ""
        ? (preview?.late_days ?? 0)
        : Math.min(
            Math.max(Number(adjustment.late) || 0, 0),
            preview?.late_days ?? 0,
          ),
    absent:
      adjustment.absent === ""
        ? (preview?.absent_days ?? 0)
        : Math.min(
            Math.max(Number(adjustment.absent) || 0, 0),
            preview?.absent_days ?? 0,
          ),
    half:
      adjustment.half === ""
        ? (preview?.half_days ?? 0)
        : Math.min(
            Math.max(Number(adjustment.half) || 0, 0),
            preview?.half_days ?? 0,
          ),
  };
  const adjustedAutomatic = preview
    ? calculateMonthlySalary({
        baseSalary: preview.base_salary,
        lateDays: effective.late,
        absentDays: effective.absent,
        halfDays: effective.half,
        lateDeductionEnabled: true,
      })
    : null;
  const finalDeduction =
    adjustment.deduction === ""
      ? (adjustedAutomatic?.deduction_amount ?? 0)
      : Math.max(Number(adjustment.deduction) || 0, 0);
  const finalNet = Math.max(
    0,
    Number(preview?.base_salary ?? 0) - finalDeduction,
  );

  async function saveSalary() {
    if (!preview || !selectedEmployee) return;
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/salaries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: selectedEmployee.id,
          month: salaryMonth,
          base_salary: selectedEmployee.salary ?? 0,
          adjusted_late_days: effective.late,
          adjusted_absent_days: effective.absent,
          adjusted_half_days: effective.half,
          actual_late_days: preview.late_days,
          actual_absent_days: preview.absent_days,
          actual_half_days: preview.half_days,
          custom_deduction_amount:
            adjustment.deduction === "" ? null : finalDeduction,
          adjustment_note: adjustment.note,
          pay_now: true,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Could not save salary.");
      setOpen(false);
      setMessage({
        text: `Salary recorded for ${selectedEmployee.name}.`,
        tone: "success",
      });
      await loadData();
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : "Could not save salary.",
        tone: "danger",
      });
    } finally {
      setSaving(false);
    }
  }

  async function deleteSalary(record: SalaryRecord) {
    if (
      !window.confirm(
        `Delete ${record.employees?.name ?? "this employee"}'s salary for ${record.month}? The payment, receipt, and linked expense will be removed.`,
      )
    )
      return;
    const response = await fetch(`/api/salaries?id=${record.id}`, {
      method: "DELETE",
    });
    const result = await response.json();
    if (!response.ok) {
      setMessage({
        text: result.error ?? "Could not delete salary.",
        tone: "danger",
      });
      return;
    }
    setMessage({
      text: "Salary payment and receipt deleted.",
      tone: "success",
    });
    await loadData();
  }

  return (
    <>
      <PageHeader
        eyebrow="Salary management"
        title="Salary history"
        description="Search salary records. Use Add salary to prepare and adjust a payout."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={loadData} disabled={loading}>
              <IconRefresh className="h-4 w-4" />
              Refresh
            </Button>
            <Button onClick={openAddSalary}>Add salary</Button>
          </div>
        }
      />
      {message ? (
        <div className="mb-5">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      ) : null}
      <Card className="mb-5 p-4 sm:p-5">
        <div className="grid gap-3 md:grid-cols-[1.5fr_1fr_1fr_1fr]">
          <label className="relative block">
            <span className="mb-1.5 block text-sm font-medium text-stone-600">
              Search employee
            </span>
            <IconSearch className="pointer-events-none absolute left-3 top-[38px] h-4 w-4 text-muted" />
            <TextInput
              className="pl-9"
              placeholder="Name or employee ID"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <Field label="Employee">
            <SelectInput
              value={historyEmployee}
              onChange={(event) => setHistoryEmployee(event.target.value)}
            >
              <option value="">All employees</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Month">
            <TextInput
              type="month"
              value={historyMonth}
              onChange={(event) => setHistoryMonth(event.target.value)}
            />
          </Field>
          <Field label="Status">
            <SelectInput
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="all">All statuses</option>
              <option value="paid">Paid</option>
              <option value="unpaid">Unpaid</option>
            </SelectInput>
          </Field>
        </div>
      </Card>
      <Card className="overflow-hidden p-0 sm:p-0">
        <div className="border-b border-border bg-[#fcfaf9] px-5 py-4">
          <h2 className="font-semibold">Salary records</h2>
          <p className="mt-1 text-xs text-muted">
            {filteredHistory.length} record
            {filteredHistory.length === 1 ? "" : "s"} match the selected
            filters.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1040px] text-left text-sm">
            <thead className="text-[10px] uppercase tracking-[0.11em] text-stone-400">
              <tr>
                <th className="px-5 py-3 font-bold">Employee</th>
                <th className="px-3 py-3 font-bold">Month</th>
                <th className="px-3 py-3 font-bold">Adjusted attendance</th>
                <th className="px-3 py-3 font-bold">Deduction</th>
                <th className="px-3 py-3 font-bold">Net pay</th>
                <th className="px-3 py-3 font-bold">Status</th>
                <th className="px-3 py-3 font-bold">Paid on</th>
                <th className="px-5 py-3 text-right font-bold">Receipt</th>
                <th className="px-5 py-3 text-right font-bold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredHistory.length ? (
                filteredHistory.map((record) => (
                  <tr key={record.id} className="hover:bg-[#fffafa]">
                    <td className="px-5 py-4 font-semibold">
                      {record.employees?.name ??
                        `Employee #${record.employee_id}`}
                      {record.adjustment_note ? (
                        <p className="mt-1 max-w-[260px] text-xs font-normal text-muted">
                          {record.adjustment_note}
                        </p>
                      ) : null}
                    </td>
                    <td className="px-3 py-4 text-muted">
                      {monthLabel(record.month)}
                    </td>
                    <td className="px-3 py-4 text-xs text-muted">
                      {record.late_days} late · {record.absent_days} absent ·{" "}
                      {record.half_days} half
                    </td>
                    <td className="px-3 py-4 text-rose-700">
                      {money(record.deduction_amount)}
                    </td>
                    <td className="px-3 py-4 font-semibold text-emerald-700">
                      {money(record.net_pay)}
                    </td>
                    <td className="px-3 py-4">
                      <Badge
                        tone={record.status === "paid" ? "success" : "warning"}
                      >
                        {record.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-4 text-muted">
                      {dateLabel(record.paid_at)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {record.receipt_storage_path ? (
                        <a
                          href={`/api/salaries/${record.id}/receipt`}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-2 text-xs font-semibold text-muted transition hover:border-primary/40 hover:bg-primary-soft hover:text-primary"
                        >
                          <IconDownload className="h-3.5 w-3.5" />
                          PDF
                        </a>
                      ) : (
                        <span className="text-xs text-muted">Pending</span>
                      )}
                    </td>
                    <td className="px-5 py-4 text-right">
                      {record.id > 0 ? (
                        <Button
                          variant="ghost"
                          className="px-2.5 py-2 text-rose-700 hover:bg-rose-50 hover:text-rose-800"
                          onClick={() => deleteSalary(record)}
                          aria-label={`Delete salary for ${record.employees?.name ?? "employee"}`}
                        >
                          <IconTrash className="h-4 w-4" />
                          <span>Delete</span>
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={9}
                    className="px-6 py-16 text-center text-sm text-muted"
                  >
                    No salary history matches these filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Add salary"
        description="Select the employee and month, review attendance, then adjust every deduction before saving."
      >
        <div className="space-y-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Employee">
              <SelectInput
                value={salaryEmployeeId}
                onChange={(event) => changeSalaryEmployee(event.target.value)}
              >
                <option value="">Select employee</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Salary month">
              <TextInput
                type="month"
                value={salaryMonth}
                onChange={(event) => changeSalaryMonth(event.target.value)}
              />
            </Field>
          </div>
          {previewLoading ? (
            <p className="rounded-xl bg-[#fcfaf9] p-4 text-sm text-muted">
              Calculating attendance overview...
            </p>
          ) : preview ? (
            <>
              <div className="grid gap-3 sm:grid-cols-3">
                <Summary
                  label="Fixed salary"
                  value={money(preview.base_salary)}
                />
                <Summary
                  label="Present"
                  value={String(preview.present_days)}
                  tone="text-emerald-700"
                />
                <Summary
                  label="Late"
                  value={String(preview.late_days)}
                  tone="text-amber-700"
                />
                <Summary
                  label="Half days"
                  value={String(preview.half_days)}
                  tone="text-amber-700"
                />
                <Summary
                  label="Absent"
                  value={String(preview.absent_days)}
                  tone="text-rose-700"
                />
              </div>
              <div className="rounded-2xl border border-border bg-[#fcfaf9] p-4">
                <p className="text-sm font-semibold">
                  Admin-approved deductions
                </p>
                <p className="mt-1 text-xs text-muted">
                  Attendance stays recorded as it happened. Choose how many days
                  should be deducted from salary; the rest will be marked as
                  waived by admin.
                </p>
                <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900">
                  <span className="font-bold">!</span>
                  <span>
                    Reducing a count does not change attendance. It only waives
                    that deduction for this salary.
                  </span>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-3">
                  <Field label={`Late: deduct (actual ${preview.late_days})`}>
                    <TextInput
                      type="number"
                      min="0"
                      max={preview.late_days}
                      value={adjustment.late}
                      placeholder={String(preview.late_days)}
                      onChange={(event) =>
                        setAdjustment({
                          ...adjustment,
                          late: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field
                    label={`Absent: deduct (actual ${preview.absent_days})`}
                  >
                    <TextInput
                      type="number"
                      min="0"
                      max={preview.absent_days}
                      value={adjustment.absent}
                      placeholder={String(preview.absent_days)}
                      onChange={(event) =>
                        setAdjustment({
                          ...adjustment,
                          absent: event.target.value,
                        })
                      }
                    />
                  </Field>
                  <Field
                    label={`Half day: deduct (actual ${preview.half_days})`}
                  >
                    <TextInput
                      type="number"
                      min="0"
                      max={preview.half_days}
                      value={adjustment.half}
                      placeholder={String(preview.half_days)}
                      onChange={(event) =>
                        setAdjustment({
                          ...adjustment,
                          half: event.target.value,
                        })
                      }
                    />
                  </Field>
                </div>
                <div className="mt-3 grid gap-2 text-xs text-muted sm:grid-cols-3">
                  <p>Waived late: {preview.late_days - effective.late}</p>
                  <p>Waived absent: {preview.absent_days - effective.absent}</p>
                  <p>Waived half day: {preview.half_days - effective.half}</p>
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Final deduction (PKR)">
                  <TextInput
                    type="number"
                    min="0"
                    max={preview.base_salary}
                    step="0.01"
                    placeholder={money(preview.deduction_amount)}
                    value={adjustment.deduction}
                    onChange={(event) =>
                      setAdjustment({
                        ...adjustment,
                        deduction: event.target.value,
                      })
                    }
                  />
                </Field>
                <Summary
                  label="Final net pay"
                  value={money(finalNet)}
                  tone="text-emerald-700"
                />
              </div>
              <Field label="Admin adjustment note">
                <textarea
                  className="min-h-24 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none focus:border-primary"
                  placeholder="Example: Waived two late deductions; next time please be careful."
                  value={adjustment.note}
                  onChange={(event) =>
                    setAdjustment({ ...adjustment, note: event.target.value })
                  }
                />
              </Field>
              <div className="flex justify-end gap-3 border-t border-border pt-5">
                <Button variant="secondary" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={saveSalary} disabled={saving}>
                  {saving ? "Saving..." : `Record salary · ${money(finalNet)}`}
                </Button>
              </div>
            </>
          ) : (
            <p className="text-sm text-muted">
              Select an employee and month to calculate the overview.
            </p>
          )}
        </div>
      </Modal>
    </>
  );
}

function Summary({
  label,
  value,
  tone = "text-foreground",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-[#fcfaf9] p-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-stone-400">
        {label}
      </p>
      <p className={`mt-2 text-lg font-bold ${tone}`}>{value}</p>
    </div>
  );
}
