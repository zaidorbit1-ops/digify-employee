"use client";

import { useEffect, useMemo, useState } from "react";
import { IconRefresh } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/empty-state";
import { Field, SelectInput, TextInput } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";

type Employee = { id: number; name: string; salary?: number | null; email?: string | null; employee_id?: string | number | null };

type SalaryPreview = {
  base_salary: number;
  late_days: number;
  absent_days: number;
  half_days: number;
  late_deduction_enabled: boolean;
  deduction_amount: number;
  net_pay: number;
};

type SalaryRecord = {
  id: number;
  employee_id: number;
  month: string;
  base_salary: number;
  late_days: number;
  absent_days: number;
  half_days: number;
  late_deduction_enabled: boolean;
  deduction_amount: number;
  net_pay: number;
  status: "paid" | "unpaid";
  paid_at?: string | null;
  adjustment_note?: string | null;
  custom_deduction_amount?: number | null;
  employees?: { id: number; name: string; email?: string | null; employee_id?: string | number | null } | null;
};

type Message = { text: string; tone?: "danger" | "success" };

const todayMonth = new Date().toISOString().slice(0, 7);

function formatCurrency(value: number) {
  return Number(value || 0).toLocaleString("en-PK", { style: "currency", currency: "PKR" });
}

export default function SalaryPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [employeeId, setEmployeeId] = useState("");
  const [month, setMonth] = useState(todayMonth);
  const [preview, setPreview] = useState<SalaryPreview | null>(null);
  const [history, setHistory] = useState<SalaryRecord[]>([]);
  const [lateDeductionEnabled, setLateDeductionEnabled] = useState(true);
  const [ignoreLateDeduction, setIgnoreLateDeduction] = useState(false);
  const [ignoreAbsentDeduction, setIgnoreAbsentDeduction] = useState(false);
  const [customDeduction, setCustomDeduction] = useState("");
  const [adjustmentNote, setAdjustmentNote] = useState("");
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  async function loadEmployees() {
    const response = await fetch("/api/employees", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not load employees.");
    const employeeList = result.employees ?? [];
    setEmployees(employeeList);
    if (employeeList.length && !employeeId) setEmployeeId(String(employeeList[0].id));
  }

  async function loadHistory() {
    try {
      const response = await fetch("/api/salaries", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load salary history.");
      setHistory((result.salaries ?? []).filter((record: SalaryRecord) => record.status === "paid").slice(0, 10));
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not load salary history.", tone: "danger" });
    }
  }

  async function loadPreview() {
    if (!employeeId || !month) return;
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/salaries?preview=true&employee_id=${employeeId}&month=${month}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not calculate salary preview.");
      setPreview(result.summary ?? null);
      setLateDeductionEnabled(result.summary?.late_deduction_enabled ?? true);
      setIgnoreLateDeduction(false);
      setIgnoreAbsentDeduction(false);
      setCustomDeduction("");
      setAdjustmentNote("");
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not calculate salary preview.", tone: "danger" });
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadEmployees().catch((error) => setMessage({ text: error instanceof Error ? error.message : "Could not load employees.", tone: "danger" }));
    loadHistory().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (employeeId && month) {
      loadPreview();
    }
  }, [employeeId, month]);

  const selectedEmployee = useMemo(() => employees.find((employee) => String(employee.id) === String(employeeId)), [employees, employeeId]);

  const adjustedDeduction = useMemo(() => {
    const customValue = customDeduction === "" ? Number.NaN : Number(customDeduction);
    if (customDeduction !== "" && Number.isFinite(customValue) && customValue >= 0) {
      return customValue;
    }
    if (!preview) return 0;
    return Number(preview.deduction_amount ?? 0);
  }, [customDeduction, preview]);

  const adjustedNetPay = useMemo(() => {
    const customValue = customDeduction === "" ? Number.NaN : Number(customDeduction);
    if (!preview) return 0;
    if (customDeduction !== "" && Number.isFinite(customValue) && customValue >= 0) {
      return Math.max(0, Number(preview.base_salary ?? 0) - customValue);
    }
    return Number(preview.net_pay ?? 0);
  }, [customDeduction, preview]);

  async function paySalary() {
    if (!employeeId || !month) return;
    setLoading(true);
    try {
      const response = await fetch("/api/salaries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee_id: Number(employeeId),
          month,
          base_salary: selectedEmployee?.salary ?? 0,
          late_deduction_enabled: lateDeductionEnabled,
          ignore_late_deduction: ignoreLateDeduction,
          ignore_absent_deduction: ignoreAbsentDeduction,
          custom_deduction_amount: customDeduction === "" ? null : Number(customDeduction),
          adjustment_note: adjustmentNote,
          pay_now: true,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not pay salary.");
      setMessage({ text: `Salary marked paid for ${selectedEmployee?.name ?? "employee"}.`, tone: "success" });
      setShowAdjustmentModal(false);
      await loadHistory();
      await loadPreview();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not pay salary.", tone: "danger" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Salary management"
        title="Monthly salary review"
        description="Generate the monthly salary summary, adjust deductions, and record recent paid salaries."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={loadPreview} disabled={loading || !employeeId || !month}>
              <IconRefresh className="h-4 w-4" />{loading ? "Loading..." : "Refresh"}
            </Button>
            <Button onClick={() => {
              if (!preview) {
                setMessage({ text: "Select an employee and month to prepare the payout first.", tone: "danger" });
                return;
              }
              setShowAdjustmentModal(true);
            }}>
              Add salary
            </Button>
          </div>
        }
      />

      {message ? (
        <div className="mb-5">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      ) : null}

      <Card className="mb-5 p-5 sm:p-6">
        <div className="grid gap-4 md:grid-cols-3">
          <Field label="Employee">
            <SelectInput value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
              <option value="">Select employee</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>{employee.name}</option>
              ))}
            </SelectInput>
          </Field>

          <Field label="Month">
            <TextInput type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
          </Field>

          <Field label="Late deduction">
            <div className="flex h-[42px] items-center gap-2 rounded-xl border border-border bg-white px-3">
              <input
                type="checkbox"
                checked={lateDeductionEnabled}
                onChange={(event) => setLateDeductionEnabled(event.target.checked)}
                className="h-4 w-4 accent-primary"
              />
              <span className="text-sm text-stone-700">Apply late-arrival deduction</span>
            </div>
          </Field>
        </div>
      </Card>

      {preview ? (
        <div className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <Card className="p-5 sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary">Salary breakdown</p>
                <h2 className="mt-1 text-xl font-bold">{selectedEmployee?.name ?? "Employee"}</h2>
              </div>
              <Badge tone="primary">{month}</Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-[#fcfaf9] p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-400">Base salary</p>
                <p className="mt-2 text-lg font-bold">{formatCurrency(preview.base_salary)}</p>
              </div>
              <div className="rounded-xl border border-border bg-[#fcfaf9] p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-400">Net pay</p>
                <p className="mt-2 text-lg font-bold text-emerald-700">{formatCurrency(preview.net_pay)}</p>
              </div>
              <div className="rounded-xl border border-border bg-[#fcfaf9] p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-400">Late days</p>
                <p className="mt-2 text-lg font-bold">{preview.late_days}</p>
              </div>
              <div className="rounded-xl border border-border bg-[#fcfaf9] p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-400">Absent days</p>
                <p className="mt-2 text-lg font-bold">{preview.absent_days}</p>
              </div>
              <div className="rounded-xl border border-border bg-[#fcfaf9] p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-400">Half days</p>
                <p className="mt-2 text-lg font-bold">{preview.half_days}</p>
              </div>
              <div className="rounded-xl border border-border bg-[#fcfaf9] p-3">
                <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-400">Total cut</p>
                <p className="mt-2 text-lg font-bold text-rose-700">{formatCurrency(preview.deduction_amount)}</p>
              </div>
            </div>
          </Card>

          <Card className="p-5 sm:p-6">
            <h3 className="text-base font-semibold">Payout action</h3>
            <div className="mt-4 space-y-3 rounded-2xl border border-border bg-[#fcfaf9] p-4">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted">Late deduction toggle</span>
                <Badge tone={lateDeductionEnabled ? "warning" : "neutral"}>{lateDeductionEnabled ? "Enabled" : "Disabled"}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted">Monthly deduction</span>
                <span className="font-semibold">{formatCurrency(preview.deduction_amount)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted">Net payable</span>
                <span className="font-semibold text-emerald-700">{formatCurrency(preview.net_pay)}</span>
              </div>
            </div>

            <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {lateDeductionEnabled
                ? "Late-arrival deductions are active for this payout."
                : "Late deductions are disabled for this payout. This matches the config warning requirement."}
            </div>

            <Button className="mt-5 w-full" onClick={() => setShowAdjustmentModal(true)} disabled={loading || !selectedEmployee}>
              {loading ? "Processing..." : "Add salary / Pay now"}
            </Button>
          </Card>
        </div>
      ) : (
        <Card className="p-6 text-sm text-muted">
          Select an employee and month to generate the payout preview.
        </Card>
      )}

      <div className="mt-5">
        <h3 className="mb-3 text-base font-semibold">Recent paid salaries</h3>
        <Card className="overflow-hidden p-0 sm:p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-[#fcfaf9] text-[10px] uppercase tracking-[0.11em] text-stone-400">
                <tr>
                  <th className="px-5 py-3 font-bold">Employee</th>
                  <th className="px-3 py-3 font-bold">Month</th>
                  <th className="px-3 py-3 font-bold">Net pay</th>
                  <th className="px-3 py-3 font-bold">Deduction</th>
                  <th className="px-3 py-3 font-bold">Paid on</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {history.length ? (
                  history.map((record) => (
                    <tr key={record.id} className="transition hover:bg-[#fffafa]">
                      <td className="px-5 py-4">
                        <div>
                          <p className="font-semibold leading-tight">{record.employees?.name ?? `Employee #${record.employee_id}`}</p>
                          {record.adjustment_note ? <p className="mt-1 text-[11px] text-muted">{record.adjustment_note}</p> : null}
                        </div>
                      </td>
                      <td className="px-3 py-4 text-muted">{new Date(record.month).toLocaleDateString(undefined, { month: "short", year: "numeric" })}</td>
                      <td className="px-3 py-4 font-semibold text-emerald-700">{formatCurrency(record.net_pay)}</td>
                      <td className="px-3 py-4 text-rose-700">{formatCurrency(record.deduction_amount)}</td>
                      <td className="px-3 py-4 text-muted">{record.paid_at ? new Date(record.paid_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—"}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-6 py-14 text-center text-sm text-muted">
                      No paid salaries have been recorded yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      <Modal open={showAdjustmentModal} onClose={() => setShowAdjustmentModal(false)} title="Adjust and pay salary" description="Override the automatic deduction calculation and add an admin note before payment.">
        {preview ? (
          <div className="space-y-5">
            <div className="rounded-2xl border border-border bg-[#fcfaf9] p-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-white px-3 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-400">Auto deduction</p>
                  <p className="mt-2 text-lg font-bold text-rose-700">{formatCurrency(preview.deduction_amount)}</p>
                </div>
                <div className="rounded-xl border border-border bg-white px-3 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-400">Suggested net pay</p>
                  <p className="mt-2 text-lg font-bold text-emerald-700">{formatCurrency(preview.net_pay)}</p>
                </div>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="flex items-center gap-3 rounded-xl border border-border bg-white px-3 py-3">
                <input type="checkbox" checked={ignoreLateDeduction} onChange={(event) => setIgnoreLateDeduction(event.target.checked)} className="h-4 w-4 accent-primary" />
                <span className="text-sm text-stone-700">Do not deduct late days</span>
              </label>

              <label className="flex items-center gap-3 rounded-xl border border-border bg-white px-3 py-3">
                <input type="checkbox" checked={ignoreAbsentDeduction} onChange={(event) => setIgnoreAbsentDeduction(event.target.checked)} className="h-4 w-4 accent-primary" />
                <span className="text-sm text-stone-700">Do not deduct absent days</span>
              </label>
            </div>

            <Field label="Custom deduction amount (PKR)">
              <TextInput
                type="number"
                min="0"
                step="0.01"
                placeholder="Optional override"
                value={customDeduction}
                onChange={(event) => setCustomDeduction(event.target.value)}
              />
            </Field>

            <Field label="Admin note">
              <TextInput
                placeholder="Example: approved reduced deduction due to special case"
                value={adjustmentNote}
                onChange={(event) => setAdjustmentNote(event.target.value)}
              />
            </Field>

            <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              Final payable: <span className="font-bold">{formatCurrency(adjustedNetPay)}</span>
              <span className="ml-2">| Adjusted deduction: <span className="font-bold">{formatCurrency(adjustedDeduction)}</span></span>
            </div>

            <div className="flex justify-end gap-3 border-t border-border pt-5">
              <Button type="button" variant="secondary" onClick={() => setShowAdjustmentModal(false)}>Cancel</Button>
              <Button type="button" onClick={paySalary} disabled={loading || !selectedEmployee}>Confirm pay</Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
