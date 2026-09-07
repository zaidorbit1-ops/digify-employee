"use client";

import { useEffect, useMemo, useState } from "react";
import { IconCheck, IconSearch, IconTrash, IconRefresh } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/empty-state";
import { Field, SelectInput, TextInput } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";

type LeaveStatus = "pending" | "approved" | "declined";
type LeaveRecord = {
  id: number;
  employee_id: number;
  start_date: string;
  end_date: string;
  reason: string;
  status: LeaveStatus;
  created_at: string;
  employees?: { id: number; name: string; email?: string | null; employee_id?: string | number | null } | null;
};

type Message = { text: string; tone?: "danger" | "success" };

const statusOptions: Array<{ value: LeaveStatus | "all"; label: string }> = [
  { value: "all", label: "All requests" },
  { value: "pending", label: "Pending" },
  { value: "approved", label: "Approved" },
  { value: "declined", label: "Declined" },
];

function formatDateRange(start: string, end: string) {
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  const sameDay = start === end;
  if (sameDay) return startDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
  return `${startDate.toLocaleDateString(undefined, { month: "short", day: "numeric" })} – ${endDate.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}`;
}

export default function LeaveAdminPage() {
  const [records, setRecords] = useState<LeaveRecord[]>([]);
  const [statusFilter, setStatusFilter] = useState<LeaveStatus | "all">("pending");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [selected, setSelected] = useState<LeaveRecord | null>(null);

  async function loadLeaves() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/leaves?status=${statusFilter}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load leave requests.");
      setRecords(result.leaves ?? []);
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not load leave requests.", tone: "danger" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadLeaves();
  }, [statusFilter]);

  async function updateStatus(nextStatus: "approved" | "declined") {
    if (!selected) return;
    const response = await fetch("/api/leaves", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: selected.id, status: nextStatus }),
    });
    const result = await response.json();
    if (!response.ok) {
      setMessage({ text: result.error ?? "Could not update leave request.", tone: "danger" });
      return;
    }
    setMessage({ text: `Leave request ${nextStatus}.`, tone: "success" });
    setSelected(null);
    await loadLeaves();
  }

  const filteredRecords = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return records.filter((record) => {
      const employeeName = record.employees?.name ?? "";
      const employeeId = String(record.employees?.employee_id ?? record.employee_id ?? "");
      const haystack = `${employeeName} ${employeeId} ${record.reason}`.toLowerCase();
      return !normalized || haystack.includes(normalized);
    });
  }, [records, query]);

  return (
    <>
      <PageHeader
        eyebrow="Leave management"
        title="Admin leave review"
        description="Approve or reject leave requests and keep the attendance and salary rules in sync."
        actions={<Button variant="secondary" onClick={loadLeaves} disabled={loading}><IconRefresh className="h-4 w-4" />{loading ? "Refreshing..." : "Refresh"}</Button>}
      />

      {message ? (
        <div className="mb-5">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      ) : null}

      <Card className="overflow-hidden p-0 sm:p-0">
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <h2 className="text-base font-semibold">Leave requests</h2>
            <p className="mt-0.5 text-xs text-muted">
              {filteredRecords.length} of {records.length} requests shown
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label className="relative block">
              <span className="sr-only">Search leave requests</span>
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <TextInput
                className="h-10 pl-9 text-xs sm:w-60"
                placeholder="Search employee or reason"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>

            <SelectInput className="h-10 w-36 text-xs" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as LeaveStatus | "all")}>
              {statusOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </SelectInput>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <thead className="bg-[#fcfaf9] text-[10px] uppercase tracking-[0.11em] text-stone-400">
              <tr>
                <th className="px-5 py-3 font-bold">Employee</th>
                <th className="px-3 py-3 font-bold">Date range</th>
                <th className="px-3 py-3 font-bold">Reason</th>
                <th className="px-3 py-3 font-bold">Requested</th>
                <th className="px-3 py-3 font-bold">Status</th>
                <th className="px-5 py-3 text-right font-bold">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredRecords.map((record) => (
                <tr key={record.id} className="transition hover:bg-[#fffafa]">
                  <td className="px-5 py-4">
                    <div>
                      <p className="font-semibold leading-tight">{record.employees?.name ?? `Employee #${record.employee_id}`}</p>
                      <p className="mt-1 text-[11px] text-muted">{record.employees?.email ?? "No email"}</p>
                    </div>
                  </td>
                  <td className="px-3 py-4 font-medium text-muted">{formatDateRange(record.start_date, record.end_date)}</td>
                  <td className="px-3 py-4 text-muted">{record.reason || "No reason provided"}</td>
                  <td className="px-3 py-4 text-muted">{new Date(record.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</td>
                  <td className="px-3 py-4">
                    <Badge tone={
                      record.status === "approved" ? "success" :
                      record.status === "declined" ? "danger" : "warning"
                    }>{record.status}</Badge>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-end gap-2">
                      <Button variant="secondary" className="h-9 px-3 text-xs" onClick={() => setSelected(record)}>
                        Review
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {!filteredRecords.length ? (
            <div className="px-6 py-14 text-center text-sm text-muted">
              No leave requests found for the current filter.
            </div>
          ) : null}
        </div>
      </Card>

      <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title="Review leave request" description="Approve or decline this leave request.">
        {selected ? (
          <div className="space-y-5">
            <div className="rounded-2xl border border-border bg-[#fcfaf9] p-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary">Employee</p>
                  <p className="mt-1 text-lg font-bold">{selected.employees?.name ?? `Employee #${selected.employee_id}`}</p>
                </div>
                <Badge tone={selected.status === "approved" ? "success" : selected.status === "declined" ? "danger" : "warning"}>{selected.status}</Badge>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl border border-border bg-white px-3 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-400">Range</p>
                  <p className="mt-2 font-semibold">{formatDateRange(selected.start_date, selected.end_date)}</p>
                </div>
                <div className="rounded-xl border border-border bg-white px-3 py-3">
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-400">Requested</p>
                  <p className="mt-2 font-semibold">{new Date(selected.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</p>
                </div>
              </div>
            </div>

            <Field label="Reason">
              <TextInput value={selected.reason || "No reason provided"} readOnly />
            </Field>

            <div className="flex justify-end gap-3 border-t border-border pt-5">
              <Button type="button" variant="secondary" onClick={() => setSelected(null)}>Cancel</Button>
              <Button type="button" variant="secondary" className="border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 hover:text-rose-800" onClick={() => updateStatus("declined")}>
                <IconTrash className="h-4 w-4" />Decline
              </Button>
              <Button type="button" onClick={() => updateStatus("approved")}>
                <IconCheck className="h-4 w-4" />Approve
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
