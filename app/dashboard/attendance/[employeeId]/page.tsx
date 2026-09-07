"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { IconArrowRight, IconDownload, IconFile, IconRefresh } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/empty-state";
import { TextInput } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";

type Employee = { id: number; name: string; employee_id?: string; shift_id?: number | null };
type AttendanceDay = { date: string; employee: Employee; status: string; arrival_status?: string | null; hours_worked?: number | null; worked_minutes?: number | null; session_start?: string | null; session_end?: string | null };
const tone: Record<string, "success" | "warning" | "danger" | "primary" | "neutral"> = { present: "success", late: "warning", half_day: "warning", absent: "danger", leave: "primary" };
const statusLabel = (value: string) => value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());

export default function AttendanceEmployeeDetailPage() {
  const params = useParams<{ employeeId: string }>();
  const searchParams = useSearchParams();
  const [month, setMonth] = useState(searchParams.get("month") ?? new Date().toISOString().slice(0, 7));
  const [days, setDays] = useState<AttendanceDay[]>([]);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadDetails() {
    setLoading(true); setError(null);
    try {
      const response = await fetch(`/api/attendance?view=history&month=${month}`, { cache: "no-store" });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Could not load attendance.");
      const selected = (result.days ?? []).filter((day: AttendanceDay) => day.employee.id === Number(params.employeeId));
      setDays(selected); setEmployee(selected[0]?.employee ?? (result.employees ?? []).find((item: Employee) => item.id === Number(params.employeeId)) ?? null);
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Could not load attendance."); } finally { setLoading(false); }
  }

  useEffect(() => { loadDetails(); }, [month, params.employeeId]);

  const stats = useMemo(() => ({ present: days.filter((day) => day.status === "present").length, late: days.filter((day) => day.arrival_status === "late").length, absent: days.filter((day) => day.status === "absent").length, halfDay: days.filter((day) => day.status === "half_day").length, leave: days.filter((day) => day.status === "leave").length }), [days]);

  function exportCsv() {
    const rows = days.map((day) => [day.date, employee?.name ?? "", statusLabel(day.status), statusLabel(day.arrival_status ?? "-"), day.hours_worked ?? "", day.session_start ?? "", day.session_end ?? ""]);
    const csv = [["Date", "Employee", "Day status", "Arrival", "Hours", "Session start", "Session end"], ...rows].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\n");
    const link = document.createElement("a"); link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); link.download = `${employee?.name ?? "employee"}-attendance-${month}.csv`; link.click(); URL.revokeObjectURL(link.href);
  }

  return <>
    <PageHeader eyebrow="Attendance history" title={employee?.name ?? "Employee attendance"} description={employee ? `Monthly attendance details for ${month}. Sundays are weekly holidays.` : "Loading employee attendance details."} actions={<div className="flex items-center gap-2"><Link href="/dashboard/attendance" className="inline-flex items-center gap-1 rounded-xl border border-border bg-white px-3 py-2.5 text-sm font-semibold text-muted hover:bg-primary-soft hover:text-primary"><IconArrowRight className="h-4 w-4 rotate-180" />Back</Link><Button variant="secondary" onClick={loadDetails} disabled={loading}><IconRefresh className="h-4 w-4" />Refresh</Button></div>} />
    {error ? <div className="mb-5"><Alert tone="danger">{error}</Alert></div> : null}
    <Card className="mb-5 p-4 sm:p-5"><div className="flex flex-nowrap items-center gap-2 overflow-x-auto"><TextInput className="h-10 w-40 shrink-0 text-xs" type="month" value={month} onChange={(event) => setMonth(event.target.value)} /><Button variant="secondary" className="h-10 shrink-0 text-xs" onClick={exportCsv}><IconDownload className="h-3.5 w-3.5" />Excel</Button><Button variant="secondary" className="h-10 shrink-0 text-xs" onClick={() => window.print()}><IconFile className="h-3.5 w-3.5" />PDF</Button></div></Card>
    <div className="mb-5 grid grid-cols-2 gap-3 sm:grid-cols-5"><Stat label="Present" value={stats.present} tone="text-emerald-700" /><Stat label="Late" value={stats.late} tone="text-amber-700" /><Stat label="Absent" value={stats.absent} tone="text-rose-700" /><Stat label="Half day" value={stats.halfDay} tone="text-amber-700" /><Stat label="Leave" value={stats.leave} tone="text-primary" /></div>
    <Card className="overflow-hidden p-0 sm:p-0"><div className="border-b border-border bg-[#fcfaf9] px-5 py-4"><h2 className="font-semibold">Daily attendance</h2><p className="mt-1 text-xs text-muted">{days.length} working days shown · Sundays excluded as holidays</p></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="text-[10px] uppercase tracking-[0.11em] text-stone-400"><tr><th className="px-5 py-3 font-bold">Date</th><th className="px-3 py-3 font-bold">Arrival</th><th className="px-3 py-3 font-bold">Worked</th><th className="px-5 py-3 font-bold">Day status</th></tr></thead><tbody className="divide-y divide-border">{days.map((day) => <tr key={day.date} className="hover:bg-[#fffafa]"><td className="px-5 py-3"><p className="font-semibold">{new Date(`${day.date}T00:00:00`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</p><p className="text-xs text-muted">{day.date}</p></td><td className="px-3 py-3"><Badge tone={day.arrival_status === "late" ? "warning" : day.arrival_status ? "success" : "neutral"}>{day.arrival_status ? statusLabel(day.arrival_status) : "No punch"}</Badge></td><td className="px-3 py-3 font-medium">{day.worked_minutes != null ? `${Math.floor(day.worked_minutes / 60)}h ${day.worked_minutes % 60}m` : day.session_start ? "In progress" : "-"}</td><td className="px-5 py-3"><Badge tone={tone[day.status] ?? "neutral"}>{statusLabel(day.status)}</Badge></td></tr>)}</tbody></table>{!days.length ? <div className="px-6 py-14 text-center text-sm text-muted">{loading ? "Loading attendance..." : "No attendance records for this month."}</div> : null}</div></Card>
  </>;
}

function Stat({ label, value, tone: textTone }: { label: string; value: number; tone: string }) { return <Card className="p-4"><p className="text-xs text-muted">{label}</p><p className={`mt-1 text-2xl font-bold ${textTone}`}>{value}</p></Card>; }
