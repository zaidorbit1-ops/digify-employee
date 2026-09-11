"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { IconRefresh } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/empty-state";
import { Field, TextInput } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { EmployeePicker } from "@/components/ui/employee-picker";
import { FilterPicker } from "@/components/ui/filter-picker";
import { MonthPicker } from "@/components/ui/month-picker";
import { PageHeader } from "@/components/ui/page-header";

type Employee = { id: number; name: string; employee_id?: string; shift_id?: number | null };
type Shift = { id: number; name: string };
type AttendanceDay = { date: string; employee: Employee; status: string; arrival_status?: string | null; hours_worked?: number | null; worked_minutes?: number | null; session_start?: string | null; session_end?: string | null; punches: { id?: number; check_in: string }[] };
type View = "today" | "history";

const statusTone: Record<string, "success" | "warning" | "danger" | "primary" | "neutral"> = { present: "success", late: "warning", half_day: "warning", absent: "danger", leave: "primary" };
const labelStatus = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
const initialMonth = new Date().toISOString().slice(0, 7);

export default function AttendancePage() {
  const [view, setView] = useState<View>("today");
  const [month, setMonth] = useState(initialMonth);
  const [days, setDays] = useState<AttendanceDay[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shiftFilter, setShiftFilter] = useState("all");
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editPunch, setEditPunch] = useState<{ id: number; employee: string; value: string } | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [now, setNow] = useState(() => new Date());

  async function loadAttendance() {
    setLoading(true); setError(null);
    try {
      const queryString = view === "history" ? `?view=history&month=${month}` : "?view=today";
      const response = await fetch(`/api/attendance${queryString}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load attendance.");
      setDays(result.days ?? []); setShifts(result.shifts ?? []); setEmployees(result.employees ?? []);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Could not load attendance."); } finally { setLoading(false); }
  }

  async function syncAndLoad() {
    setSyncing(true);
    try {
      await loadAttendance();
    } finally {
      setSyncing(false);
    }
  }

  function editDay(day: AttendanceDay) {
    const punch = day.punches[0];
    if (!punch?.id) { setError("No editable punch exists for this employee today."); return; }
    const date = new Date(punch.check_in);
    const pad = (value: number) => String(value).padStart(2, "0");
    setEditPunch({ id: punch.id, employee: day.employee.name, value: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}` });
  }

  async function savePunch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editPunch) return;
    setActionLoading(true);
    const response = await fetch("/api/attendance", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editPunch.id, check_in: new Date(editPunch.value).toISOString() }) });
    const result = await response.json();
    setActionLoading(false);
    if (!response.ok) { setError(result.error ?? "Could not update attendance."); return; }
    setEditPunch(null); await loadAttendance();
  }

  async function clearDay(day: AttendanceDay) {
    if (!window.confirm(`Clear all attendance punches for ${day.employee.name} on ${day.date}?`)) return;
    setActionLoading(true);
    const response = await fetch(`/api/attendance?employee_id=${day.employee.id}&date=${day.date}`, { method: "DELETE" });
    const result = await response.json();
    setActionLoading(false);
    if (!response.ok) { setError(result.error ?? "Could not clear attendance."); return; }
    await loadAttendance();
  }

  useEffect(() => {
    syncAndLoad();
    const timer = window.setInterval(syncAndLoad, 30000);
    return () => window.clearInterval(timer);
  }, [view, month]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  const visibleDays = days.filter((day) => {
    const matchesShift = shiftFilter === "all" || String(day.employee.shift_id ?? "") === shiftFilter;
    const matchesEmployee = employeeFilter === "all" || String(day.employee.id) === employeeFilter;
    const matchesSearch = view === "history" ? day.employee.name.toLowerCase().includes(query.toLowerCase()) : true;
    return matchesShift && matchesEmployee && matchesSearch;
  });
  const todayRecords = visibleDays.filter((day) => day.punches.length > 0);
  const summaries = useMemo(() => employees.filter((employee) => employee.name.toLowerCase().includes(query.toLowerCase()) && (shiftFilter === "all" || String(employee.shift_id ?? "") === shiftFilter)).map((employee) => {
    const employeeDays = days.filter((day) => day.employee.id === employee.id);
    return { employee, present: employeeDays.filter((day) => day.status === "present").length, late: employeeDays.filter((day) => day.arrival_status === "late").length, absent: employeeDays.filter((day) => day.status === "absent").length, halfDay: employeeDays.filter((day) => day.status === "half_day").length, leave: employeeDays.filter((day) => day.status === "leave").length };
  }), [employees, days, query, shiftFilter]);

  return <>
    <PageHeader eyebrow="Attendance" title="Attendance engine" description="Review shift-based attendance, arrival status, hours, and monthly history." actions={<Button variant="secondary" onClick={syncAndLoad} disabled={loading || syncing}><IconRefresh className="h-4 w-4" />{syncing ? "Syncing..." : loading ? "Loading..." : "Refresh"}</Button>} />
    {error ? <div className="mb-5"><Alert tone="danger">{error}</Alert></div> : null}
    <Card className="mb-5 p-2 sm:p-2"><div className="flex gap-2"><button type="button" onClick={() => setView("today")} className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${view === "today" ? "bg-primary text-white" : "text-muted hover:bg-primary-soft"}`}>Today&apos;s attendance</button><button type="button" onClick={() => setView("history")} className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${view === "history" ? "bg-primary text-white" : "text-muted hover:bg-primary-soft"}`}>History</button></div></Card>
    <Card className="relative overflow-visible p-0 sm:p-0"><div className="flex flex-col gap-3 border-b border-border p-4 sm:p-5"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><h2 className="text-base font-semibold">{view === "today" ? "Today's attendance" : `Attendance history · ${month}`}</h2><p className="mt-0.5 text-xs text-muted">{view === "today" ? `${todayRecords.length} checked-in employees` : `${summaries.length} employees`}</p></div><div className="grid w-full grid-cols-1 gap-2 sm:grid-cols-2 lg:flex lg:w-auto lg:flex-wrap lg:items-center">{view === "today" ? <EmployeePicker className="w-full lg:w-[210px]" employees={employees} value={employeeFilter} onChange={setEmployeeFilter} /> : <TextInput className="!h-9 !w-full text-xs sm:col-span-2 lg:!w-44" placeholder="Search employee" value={query} onChange={(event) => setQuery(event.target.value)} />}<FilterPicker className="w-full lg:w-36" options={[{ value: "all", label: "All shifts" }, ...shifts.map((shift) => ({ value: String(shift.id), label: shift.name }))]} value={shiftFilter} onChange={setShiftFilter} placeholder="All shifts" />{view === "history" ? <MonthPicker className="w-full lg:w-[220px]" value={month} onChange={setMonth} /> : null}</div></div></div>
      {view === "today" ? <TodayTable days={todayRecords} shifts={shifts} loading={loading} now={now} onEdit={editDay} onClear={clearDay} /> : <HistoryList summaries={summaries} month={month} />}
    </Card>
    <Modal open={Boolean(editPunch)} onClose={() => setEditPunch(null)} title="Edit attendance time" description={editPunch ? `Correct the check-in time for ${editPunch.employee}.` : undefined}>
      {editPunch ? <form onSubmit={savePunch} className="space-y-5"><Field label="Check-in time"><TextInput required type="datetime-local" value={editPunch.value} onChange={(event) => setEditPunch({ ...editPunch, value: event.target.value })} /></Field><div className="flex justify-end gap-3 border-t border-border pt-5"><Button type="button" variant="secondary" onClick={() => setEditPunch(null)}>Cancel</Button><Button type="submit" disabled={actionLoading}>{actionLoading ? "Saving..." : "Save time"}</Button></div></form> : null}
    </Modal>
  </>;
}

function TodayTable({ days, shifts, loading, now, onEdit, onClear }: { days: AttendanceDay[]; shifts: Shift[]; loading: boolean; now: Date; onEdit: (day: AttendanceDay) => void; onClear: (day: AttendanceDay) => void }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-[#fcfaf9] text-[10px] uppercase tracking-[0.11em] text-stone-400"><tr><th className="px-5 py-3 font-bold">Employee</th><th className="px-3 py-3 font-bold">Shift</th><th className="px-3 py-3 font-bold">Arrival</th><th className="px-3 py-3 font-bold">Check-in</th><th className="px-3 py-3 font-bold">Check-out</th><th className="px-3 py-3 font-bold">Worked</th><th className="px-5 py-3 font-bold">Day status</th><th className="px-5 py-3 text-right font-bold">Admin</th></tr></thead><tbody className="divide-y divide-border">{days.map((day) => <tr key={`${day.employee.id}-${day.date}`} className="hover:bg-[#fffafa]"><td className="px-5 py-3 font-semibold">{day.employee.name}</td><td className="px-3 py-3 text-xs text-muted">{shifts.find((shift) => shift.id === day.employee.shift_id)?.name ?? "Not assigned"}</td><td className="px-3 py-3"><Badge tone={day.arrival_status === "late" ? "warning" : "success"}>{labelStatus(day.arrival_status ?? "on_time")}</Badge></td><td className="px-3 py-3 font-medium">{formatPunchTime(day.punches[0]?.check_in)}</td><td className="px-3 py-3 font-medium">{formatPunchTime(day.punches[1]?.check_in, "Open")}</td><td className="px-3 py-3 font-medium text-foreground">{formatWorked(day, now)}</td><td className="px-5 py-3"><Badge tone={statusTone[day.status] ?? "neutral"}>{labelStatus(day.status)}</Badge></td><td className="px-5 py-3"><div className="flex justify-end gap-1.5"><button type="button" onClick={() => onEdit(day)} className="rounded-lg border border-border px-2 py-1 text-[11px] font-semibold text-muted hover:bg-primary-soft hover:text-primary">Edit time</button><button type="button" onClick={() => onClear(day)} className="rounded-lg border border-rose-200 px-2 py-1 text-[11px] font-semibold text-rose-600 hover:bg-rose-50">Clear</button></div></td></tr>)}</tbody></table>{!days.length ? <div className="px-6 py-14 text-center text-sm text-muted">{loading ? "Loading attendance..." : "No checked-in employees for this filter."}</div> : null}</div>;
}

function formatPunchTime(value?: string, empty = "-") {
  return value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : empty;
}

function formatWorked(day: AttendanceDay, now: Date) {
  const minutes = day.session_end
    ? (day.worked_minutes ?? Math.max(0, Math.round((new Date(day.session_end).getTime() - new Date(day.session_start ?? day.punches[0]?.check_in).getTime()) / 60000)))
    : day.session_start
      ? Math.max(0, Math.round((now.getTime() - new Date(day.session_start).getTime()) / 60000))
      : null;
  if (minutes === null) return "-";
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function HistoryList({ summaries, month }: { summaries: { employee: Employee; present: number; late: number; absent: number; halfDay: number; leave: number }[]; month: string }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-[#fcfaf9] text-[10px] uppercase tracking-[0.11em] text-stone-400"><tr><th className="px-5 py-3 font-bold">Employee</th><th className="px-3 py-3 font-bold">Present</th><th className="px-3 py-3 font-bold">Late</th><th className="px-3 py-3 font-bold">Absent</th><th className="px-3 py-3 font-bold">Half day</th><th className="px-3 py-3 font-bold">Leave</th><th className="px-5 py-3 text-right font-bold">View</th></tr></thead><tbody className="divide-y divide-border">{summaries.map((summary) => <tr key={summary.employee.id} className="transition hover:bg-primary-soft/30"><td className="px-5 py-3 font-semibold">{summary.employee.name}</td><td className="px-3 py-3 text-emerald-700">{summary.present}</td><td className="px-3 py-3 text-amber-700">{summary.late}</td><td className="px-3 py-3 text-rose-700">{summary.absent}</td><td className="px-3 py-3 text-amber-700">{summary.halfDay}</td><td className="px-3 py-3 text-primary">{summary.leave}</td><td className="px-5 py-3 text-right"><Link href={`/dashboard/attendance/${summary.employee.id}?month=${month}`} className="text-xs font-semibold text-primary hover:underline">Open details →</Link></td></tr>)}</tbody></table>{!summaries.length ? <div className="px-6 py-14 text-center text-sm text-muted">No employees found.</div> : null}</div>;
}
