"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { IconDownload, IconFile, IconRefresh } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/empty-state";
import { SelectInput, TextInput } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";

type Employee = { id: number; name: string; employee_id?: string; shift_id?: number | null };
type Shift = { id: number; name: string };
type AttendanceDay = { date: string; employee: Employee; status: string; arrival_status?: string | null; hours_worked?: number | null; session_start?: string | null; session_end?: string | null };
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
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      await fetch("/api/attendance/sync", { method: "POST" });
    } catch {
      // Existing database records can still be displayed if the device is offline.
    } finally {
      await loadAttendance();
      setSyncing(false);
    }
  }

  useEffect(() => {
    syncAndLoad();
    const timer = window.setInterval(syncAndLoad, 30000);
    return () => window.clearInterval(timer);
  }, [view, month]);

  const visibleDays = days.filter((day) => {
    const matchesShift = shiftFilter === "all" || String(day.employee.shift_id ?? "") === shiftFilter;
    const matchesSearch = day.employee.name.toLowerCase().includes(query.toLowerCase());
    return matchesShift && matchesSearch;
  });
  const summaries = useMemo(() => employees.filter((employee) => employee.name.toLowerCase().includes(query.toLowerCase()) && (shiftFilter === "all" || String(employee.shift_id ?? "") === shiftFilter)).map((employee) => {
    const employeeDays = days.filter((day) => day.employee.id === employee.id);
    return { employee, present: employeeDays.filter((day) => day.status === "present").length, late: employeeDays.filter((day) => day.arrival_status === "late").length, absent: employeeDays.filter((day) => day.status === "absent").length, halfDay: employeeDays.filter((day) => day.status === "half_day").length, leave: employeeDays.filter((day) => day.status === "leave").length };
  }), [employees, days, query, shiftFilter]);

  function exportCsv() {
    const rows = visibleDays.map((day) => [day.date, day.employee.name, labelStatus(day.status), labelStatus(day.arrival_status ?? "-"), day.hours_worked ?? "", day.session_start ?? "", day.session_end ?? ""]);
    const csv = [["Date", "Employee", "Day status", "Arrival", "Hours worked", "Session start", "Session end"], ...rows].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a"); link.href = URL.createObjectURL(blob); link.download = `attendance-${month}.csv`; link.click(); URL.revokeObjectURL(link.href);
  }

  return <>
    <PageHeader eyebrow="Attendance" title="Attendance engine" description="Review shift-based attendance, arrival status, hours, and monthly history." actions={<Button variant="secondary" onClick={syncAndLoad} disabled={loading || syncing}><IconRefresh className="h-4 w-4" />{syncing ? "Syncing..." : loading ? "Loading..." : "Refresh"}</Button>} />
    {error ? <div className="mb-5"><Alert tone="danger">{error}</Alert></div> : null}
    <Card className="mb-5 p-2 sm:p-2"><div className="flex gap-2"><button type="button" onClick={() => setView("today")} className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${view === "today" ? "bg-primary text-white" : "text-muted hover:bg-primary-soft"}`}>Today&apos;s attendance</button><button type="button" onClick={() => setView("history")} className={`rounded-xl px-4 py-2.5 text-sm font-semibold ${view === "history" ? "bg-primary text-white" : "text-muted hover:bg-primary-soft"}`}>History</button></div></Card>
    <Card className="overflow-hidden p-0 sm:p-0"><div className="flex flex-col gap-3 border-b border-border p-4 sm:p-5"><div className="flex items-center justify-between gap-3"><div><h2 className="text-base font-semibold">{view === "today" ? "Today's attendance" : `Attendance history · ${month}`}</h2><p className="mt-0.5 text-xs text-muted">{view === "today" ? `${visibleDays.length} employee records` : `${summaries.length} employees`}</p></div><div className="flex max-w-full flex-nowrap items-center gap-2 overflow-x-auto pb-1"><TextInput className="!h-9 !w-44 shrink-0 text-xs" placeholder="Search employee" value={query} onChange={(event) => setQuery(event.target.value)} /><SelectInput className="!h-9 !w-36 shrink-0 text-xs" value={shiftFilter} onChange={(event) => setShiftFilter(event.target.value)}><option value="all">All shifts</option>{shifts.map((shift) => <option key={shift.id} value={shift.id}>{shift.name}</option>)}</SelectInput>{view === "history" ? <TextInput className="!h-9 !w-36 shrink-0 text-xs" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /> : null}<Button variant="secondary" className="h-9 shrink-0 px-3 text-xs" onClick={exportCsv}><IconDownload className="h-3.5 w-3.5" />Excel</Button><Button variant="secondary" className="h-9 shrink-0 px-3 text-xs" onClick={() => window.print()}><IconFile className="h-3.5 w-3.5" />PDF</Button></div></div></div>
      {view === "today" ? <TodayTable days={visibleDays} shifts={shifts} loading={loading} /> : <HistoryList summaries={summaries} month={month} />}
    </Card>
  </>;
}

function TodayTable({ days, shifts, loading }: { days: AttendanceDay[]; shifts: Shift[]; loading: boolean }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-[#fcfaf9] text-[10px] uppercase tracking-[0.11em] text-stone-400"><tr><th className="px-5 py-3 font-bold">Employee</th><th className="px-3 py-3 font-bold">Shift</th><th className="px-3 py-3 font-bold">Arrival</th><th className="px-3 py-3 font-bold">Session</th><th className="px-3 py-3 font-bold">Hours</th><th className="px-5 py-3 font-bold">Day status</th></tr></thead><tbody className="divide-y divide-border">{days.map((day) => <tr key={`${day.employee.id}-${day.date}`} className="hover:bg-[#fffafa]"><td className="px-5 py-3 font-semibold">{day.employee.name}</td><td className="px-3 py-3 text-xs text-muted">{shifts.find((shift) => shift.id === day.employee.shift_id)?.name ?? "Not assigned"}</td><td className="px-3 py-3"><Badge tone={day.arrival_status === "late" ? "warning" : day.arrival_status ? "success" : "neutral"}>{day.arrival_status ? labelStatus(day.arrival_status) : "No punch"}</Badge></td><td className="px-3 py-3 text-xs text-muted">{day.session_start ? new Date(day.session_start).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "-"} → {day.session_end ? new Date(day.session_end).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Open"}</td><td className="px-3 py-3 text-muted">{day.hours_worked != null ? `${day.hours_worked}h` : "-"}</td><td className="px-5 py-3"><Badge tone={statusTone[day.status] ?? "neutral"}>{labelStatus(day.status)}</Badge></td></tr>)}</tbody></table>{!days.length ? <div className="px-6 py-14 text-center text-sm text-muted">{loading ? "Loading attendance..." : "No attendance records for this filter."}</div> : null}</div>;
}

function HistoryList({ summaries, month }: { summaries: { employee: Employee; present: number; late: number; absent: number; halfDay: number; leave: number }[]; month: string }) {
  return <div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="bg-[#fcfaf9] text-[10px] uppercase tracking-[0.11em] text-stone-400"><tr><th className="px-5 py-3 font-bold">Employee</th><th className="px-3 py-3 font-bold">Present</th><th className="px-3 py-3 font-bold">Late</th><th className="px-3 py-3 font-bold">Absent</th><th className="px-3 py-3 font-bold">Half day</th><th className="px-3 py-3 font-bold">Leave</th><th className="px-5 py-3 text-right font-bold">View</th></tr></thead><tbody className="divide-y divide-border">{summaries.map((summary) => <tr key={summary.employee.id} className="transition hover:bg-primary-soft/30"><td className="px-5 py-3 font-semibold">{summary.employee.name}</td><td className="px-3 py-3 text-emerald-700">{summary.present}</td><td className="px-3 py-3 text-amber-700">{summary.late}</td><td className="px-3 py-3 text-rose-700">{summary.absent}</td><td className="px-3 py-3 text-amber-700">{summary.halfDay}</td><td className="px-3 py-3 text-primary">{summary.leave}</td><td className="px-5 py-3 text-right"><Link href={`/dashboard/attendance/${summary.employee.id}?month=${month}`} className="text-xs font-semibold text-primary hover:underline">Open details →</Link></td></tr>)}</tbody></table>{!summaries.length ? <div className="px-6 py-14 text-center text-sm text-muted">No employees found.</div> : null}</div>;
}
