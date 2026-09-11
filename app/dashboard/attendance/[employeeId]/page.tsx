"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  IconArrowRight,
  IconDownload,
  IconFile,
  IconRefresh,
} from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/empty-state";
import { Field, TextInput } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { MonthPicker } from "@/components/ui/month-picker";
import { PageHeader } from "@/components/ui/page-header";

type Employee = {
  id: number;
  name: string;
  employee_id?: string;
  shift_id?: number | null;
};
type AttendanceDay = {
  date: string;
  employee: Employee;
  status: string | null;
  arrival_status?: string | null;
  hours_worked?: number | null;
  worked_minutes?: number | null;
  session_start?: string | null;
  session_end?: string | null;
  punches: { id?: number; check_in: string }[];
};
const tone: Record<
  string,
  "success" | "warning" | "danger" | "primary" | "neutral"
> = {
  present: "success",
  late: "warning",
  half_day: "warning",
  absent: "danger",
  leave: "primary",
};
const statusLabel = (value: string) =>
  value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function AttendanceEmployeeDetailPage() {
  const params = useParams<{ employeeId: string }>();
  const searchParams = useSearchParams();
  const [month, setMonth] = useState(
    searchParams.get("month") ?? new Date().toISOString().slice(0, 7),
  );
  const [days, setDays] = useState<AttendanceDay[]>([]);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingDay, setEditingDay] = useState<AttendanceDay | null>(null);
  const [editTimes, setEditTimes] = useState({ checkIn: "", checkOut: "" });
  const [saving, setSaving] = useState(false);

  async function loadDetails() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/attendance?view=history&month=${month}`,
        { cache: "no-store" },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Could not load attendance.");
      const selected = (result.days ?? []).filter(
        (day: AttendanceDay) => day.employee.id === Number(params.employeeId),
      );
      setDays(selected);
      setEmployee(
        selected[0]?.employee ??
          (result.employees ?? []).find(
            (item: Employee) => item.id === Number(params.employeeId),
          ) ??
          null,
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load attendance.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDetails();
  }, [month, params.employeeId]);

  const stats = useMemo(
    () => ({
      present: days.filter((day) => day.status === "present").length,
      late: days.filter((day) => day.arrival_status === "late").length,
      absent: days.filter((day) => day.status === "absent").length,
      halfDay: days.filter((day) => day.status === "half_day").length,
      leave: days.filter((day) => day.status === "leave").length,
    }),
    [days],
  );

  function exportExcel() {
    const employeeName = employee?.name ?? "Employee attendance";
    const rows = days
      .map(
        (day) =>
          `<tr><td>${escapeHtml(formatDate(day.date))}</td><td>${escapeHtml(formatPunch(day.punches[0]?.check_in))}</td><td>${escapeHtml(formatPunch(day.punches[1]?.check_in, "Missing"))}</td><td>${escapeHtml(day.arrival_status ? statusLabel(day.arrival_status) : "No punch")}</td><td>${escapeHtml(formatWorked(day))}</td><td>${escapeHtml(day.status ? statusLabel(day.status) : "Upcoming")}</td></tr>`,
      )
      .join("");
    const html = `<html><head><meta charset="UTF-8"><style>body{font-family:Arial,sans-serif;color:#28201f}table{border-collapse:collapse;width:100%}td,th{border:1px solid #eadfdb;padding:9px;text-align:left}th{background:#e45a5a;color:#fff;font-weight:700}h1{color:#e45a5a;margin-bottom:4px}.meta{color:#716563}.summary td{background:#fff5f3;font-weight:700}</style></head><body><h1>Attendance report</h1><p class="meta"><b>Employee:</b> ${escapeHtml(employeeName)} &nbsp; <b>Month:</b> ${escapeHtml(month)}</p><table class="summary"><tr><td>Present</td><td>Late</td><td>Absent</td><td>Half day</td><td>Leave</td></tr><tr><td>${stats.present}</td><td>${stats.late}</td><td>${stats.absent}</td><td>${stats.halfDay}</td><td>${stats.leave}</td></tr></table><br><table><thead><tr><th>Date</th><th>Check-in</th><th>Check-out</th><th>Arrival</th><th>Worked</th><th>Day status</th></tr></thead><tbody>${rows}</tbody></table></body></html>`;
    const link = document.createElement("a");
    link.href = URL.createObjectURL(
      new Blob([html], { type: "application/vnd.ms-excel" }),
    );
    link.download = `${employeeName}-attendance-${month}.xls`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  function toInputValue(value?: string) {
    if (!value) return "";
    const date = new Date(value);
    const pad = (number: number) => String(number).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function openEdit(day: AttendanceDay) {
    setEditingDay(day);
    setEditTimes({
      checkIn: toInputValue(day.punches[0]?.check_in),
      checkOut: toInputValue(day.punches[1]?.check_in),
    });
  }

  async function saveDay(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingDay || !editTimes.checkIn) return;
    setSaving(true);
    setError(null);
    try {
      const requests = [];
      if (editingDay.punches[0]?.id) {
        requests.push(
          fetch("/api/attendance", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              id: editingDay.punches[0].id,
              check_in: new Date(editTimes.checkIn).toISOString(),
            }),
          }),
        );
      }
      if (editTimes.checkOut) {
        requests.push(
          editingDay.punches[1]?.id
            ? fetch("/api/attendance", {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  id: editingDay.punches[1].id,
                  check_in: new Date(editTimes.checkOut).toISOString(),
                }),
              })
            : fetch("/api/attendance", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  employee_id: editingDay.employee.id,
                  check_in: new Date(editTimes.checkOut).toISOString(),
                }),
              }),
        );
      }
      const responses = await Promise.all(requests);
      const result = await Promise.all(
        responses.map((response) => response.json()),
      );
      const failed = responses.findIndex((response) => !response.ok);
      if (failed >= 0)
        throw new Error(result[failed].error ?? "Could not save attendance.");
      setEditingDay(null);
      await loadDetails();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Could not save attendance.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Attendance history"
        title={employee?.name ?? "Employee attendance"}
        description={
          employee
            ? `Monthly attendance details for ${month}. Sundays are weekly holidays.`
            : "Loading employee attendance details."
        }
        actions={
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/attendance"
              className="inline-flex items-center gap-1 rounded-xl border border-border bg-white px-3 py-2.5 text-sm font-semibold text-muted hover:bg-primary-soft hover:text-primary"
            >
              <IconArrowRight className="h-4 w-4 rotate-180" />
              Back
            </Link>
            <Button
              variant="secondary"
              onClick={loadDetails}
              disabled={loading}
            >
              <IconRefresh className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        }
      />
      {error ? (
        <div className="mb-5">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}
      <Card className="mb-5 p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
          <div className="block min-w-0">
            <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.12em] text-stone-400">
              Report month
            </span>
            <MonthPicker value={month} onChange={setMonth} />
          </div>
          <Button
            variant="secondary"
            className="h-10 w-full text-xs sm:w-auto"
            onClick={exportExcel}
          >
            <IconDownload className="h-3.5 w-3.5" />
            Excel
          </Button>
          <Button
            variant="secondary"
            className="h-10 w-full text-xs sm:w-auto"
            onClick={() => window.print()}
          >
            <IconFile className="h-3.5 w-3.5" />
            PDF
          </Button>
        </div>
      </Card>
      <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Present" value={stats.present} tone="text-emerald-700" />
        <Stat label="Late" value={stats.late} tone="text-amber-700" />
        <Stat label="Absent" value={stats.absent} tone="text-rose-700" />
        <Stat label="Half day" value={stats.halfDay} tone="text-amber-700" />
        <Stat label="Leave" value={stats.leave} tone="text-primary" />
      </div>
      <Card className="overflow-hidden p-0 sm:p-0">
        <div className="border-b border-border bg-[#fcfaf9] px-5 py-4">
          <h2 className="font-semibold">Daily attendance</h2>
          <p className="mt-1 text-xs text-muted">
            {days.length} working days shown · Sundays excluded as holidays
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead className="text-[10px] uppercase tracking-[0.11em] text-stone-400">
              <tr>
                <th className="px-5 py-3 font-bold">Date</th>
                <th className="px-3 py-3 font-bold">Check-in</th>
                <th className="px-3 py-3 font-bold">Check-out</th>
                <th className="px-3 py-3 font-bold">Arrival</th>
                <th className="px-3 py-3 font-bold">Worked</th>
                <th className="px-5 py-3 font-bold">Day status</th>
                <th className="px-5 py-3 text-right font-bold">Admin</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {days.map((day) => (
                <tr key={day.date} className="hover:bg-[#fffafa]">
                  <td className="px-5 py-3">
                    <p className="font-semibold">
                      {formatDate(day.date, true)}
                    </p>
                    <p className="text-xs text-muted">{day.date}</p>
                  </td>
                  <td className="px-3 py-3 font-medium">
                    {formatPunch(day.punches[0]?.check_in)}
                  </td>
                  <td className="px-3 py-3 font-medium">
                    {formatPunch(day.punches[1]?.check_in, "Missing")}
                  </td>
                  <td className="px-3 py-3">
                    <Badge
                      tone={
                        day.arrival_status === "late"
                          ? "warning"
                          : day.arrival_status
                            ? "success"
                            : "neutral"
                      }
                    >
                      {day.arrival_status
                        ? statusLabel(day.arrival_status)
                        : "No punch"}
                    </Badge>
                  </td>
                  <td className="px-3 py-3 font-medium">{formatWorked(day)}</td>
                  <td className="px-5 py-3">
                    <Badge
                      tone={
                        day.status ? (tone[day.status] ?? "neutral") : "neutral"
                      }
                    >
                      {day.status ? statusLabel(day.status) : "Upcoming"}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-right">
                    <Button
                      variant="secondary"
                      className="h-8 px-3 text-xs"
                      onClick={() => openEdit(day)}
                      disabled={!day.status}
                    >
                      Edit day
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!days.length ? (
            <div className="px-6 py-14 text-center text-sm text-muted">
              {loading
                ? "Loading attendance..."
                : "No attendance records for this month."}
            </div>
          ) : null}
        </div>
      </Card>
      <div className="print-report" aria-hidden="true">
        <div className="print-report__header">
          <div>
            <p className="print-report__eyebrow">DIGIFY IT SOLUTION</p>
            <h1>Attendance report</h1>
            <p>Monthly attendance statement</p>
          </div>
          <div className="print-report__period">
            <span>REPORT PERIOD</span>
            <strong>{month}</strong>
          </div>
        </div>
        <div className="print-report__identity">
          <span>EMPLOYEE</span>
          <strong>{employee?.name ?? "Employee attendance"}</strong>
          <small>
            {employee?.employee_id
              ? `Employee ID · ${employee.employee_id}`
              : "Official attendance record"}
          </small>
        </div>
        <div className="print-report__stats">
          {[
            ["Present", stats.present, "green"],
            ["Late", stats.late, "amber"],
            ["Absent", stats.absent, "red"],
            ["Half day", stats.halfDay, "amber"],
            ["Leave", stats.leave, "coral"],
          ].map(([label, value, color]) => (
            <div
              key={String(label)}
              className={`print-report__stat print-report__stat--${color}`}
            >
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
        <table className="print-report__table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Check-in</th>
              <th>Check-out</th>
              <th>Arrival</th>
              <th>Worked</th>
              <th>Day status</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day.date}>
                <td>{formatDate(day.date, true)}</td>
                <td>{formatPunch(day.punches[0]?.check_in)}</td>
                <td>{formatPunch(day.punches[1]?.check_in, "Missing")}</td>
                <td>
                  {day.arrival_status
                    ? statusLabel(day.arrival_status)
                    : "No punch"}
                </td>
                <td>{formatWorked(day)}</td>
                <td>
                  <strong>
                    {day.status ? statusLabel(day.status) : "Upcoming"}
                  </strong>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="print-report__footer">
          Generated from the Digify attendance engine · Sundays excluded as
          weekly holidays
        </p>
      </div>
      <Modal
        open={Boolean(editingDay)}
        onClose={() => setEditingDay(null)}
        title="Edit daily attendance"
        description={
          editingDay
            ? `Correct check-in or add the missing checkout for ${editingDay.date}.`
            : undefined
        }
      >
        {editingDay ? (
          <form onSubmit={saveDay} className="space-y-5">
            <Field label="Check-in time">
              <TextInput
                required
                type="datetime-local"
                value={editTimes.checkIn}
                onChange={(event) =>
                  setEditTimes({ ...editTimes, checkIn: event.target.value })
                }
              />
            </Field>
            <Field label="Check-out time">
              <TextInput
                type="datetime-local"
                value={editTimes.checkOut}
                onChange={(event) =>
                  setEditTimes({ ...editTimes, checkOut: event.target.value })
                }
              />
            </Field>
            <p className="text-xs text-muted">
              Leave checkout blank only when the employee was still working.
              Saving a checkout adds a manual attendance punch if the device
              punch was missed.
            </p>
            <div className="flex justify-end gap-3 border-t border-border pt-5">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setEditingDay(null)}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={saving}>
                {saving ? "Saving..." : "Save attendance"}
              </Button>
            </div>
          </form>
        ) : null}
      </Modal>
    </>
  );
}

function formatPunch(value?: string, empty = "-") {
  return value
    ? new Date(value).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : empty;
}

function formatWorked(day: AttendanceDay) {
  return day.worked_minutes != null
    ? `${Math.floor(day.worked_minutes / 60)}h ${day.worked_minutes % 60}m`
    : day.session_start
      ? "In progress"
      : "-";
}

function formatDate(value: string, includeWeekday = false) {
  return new Date(`${value}T00:00:00`).toLocaleDateString(
    undefined,
    includeWeekday
      ? { weekday: "short", day: "numeric", month: "short", year: "numeric" }
      : { day: "numeric", month: "short", year: "numeric" },
  );
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function Stat({
  label,
  value,
  tone: textTone,
}: {
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${textTone}`}>{value}</p>
    </Card>
  );
}
