"use client";

import { useEffect, useMemo, useState } from "react";
import { IconAttendance, IconCalendar, IconCheck, IconRefresh } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/empty-state";
import { TextInput } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";

type AttendanceRecord = { id: number; check_in: string; status?: string | null; day_status?: string | null; arrival_status?: string | null; worked_minutes?: number | null; session_end?: string | null };
const monthNow = new Date().toISOString().slice(0, 7);
const label = (value?: string | null) => value ? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "-";
const time = (value?: string | null) => value ? new Date(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "--:--";
const date = (value: string) => new Date(value).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" });

export default function MyAttendancePage() {
  const [month, setMonth] = useState(monthNow);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadAttendance() {
    setError(null);
    try {
      const response = await fetch(`/api/me/attendance?month=${month}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load attendance.");
      setRecords(result.attendance ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load attendance.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    loadAttendance();
    const timer = window.setInterval(loadAttendance, 30000);
    return () => window.clearInterval(timer);
  }, [month]);

  const summary = useMemo(() => {
    const days = new Set(records.map((record) => record.check_in.slice(0, 10))).size;
    const late = records.filter((record) => record.arrival_status === "late").length;
    const worked = records.reduce((total, record) => total + (record.worked_minutes ?? 0), 0);
    const completed = records.filter((record) => record.session_end || record.worked_minutes != null).length;
    return { days, late, worked, completed };
  }, [records]);

  const latest = records[0];
  const workingNow = latest && !latest.session_end && latest.check_in.slice(0, 7) === month;
  return <>
    <PageHeader eyebrow="Employee portal" title="My attendance" description="A clear view of your punches, working hours, and arrival rhythm." actions={<Button variant="secondary" onClick={() => { setRefreshing(true); loadAttendance(); }} disabled={loading || refreshing}><IconRefresh className="h-4 w-4" />{refreshing ? "Refreshing..." : "Refresh"}</Button>} />
    {error ? <div className="mb-5"><Alert tone="danger">{error}</Alert></div> : null}
    <section className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={<IconCalendar className="h-5 w-5" />} label="Days present" value={summary.days} detail="Unique attendance days" tone="coral" />
      <Metric icon={<IconAttendance className="h-5 w-5" />} label="Hours logged" value={`${Math.floor(summary.worked / 60)}h ${summary.worked % 60}m`} detail={`${summary.completed} completed sessions`} tone="sky" />
      <Metric icon={<IconCheck className="h-5 w-5" />} label="On-time rhythm" value={summary.days ? Math.max(0, summary.days - summary.late) : "0"} detail={`${summary.late} late arrival${summary.late === 1 ? "" : "s"}`} tone="emerald" />
      <Metric icon={<IconCalendar className="h-5 w-5" />} label="Selected month" value={new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, { month: "short" })} detail={new Date(`${month}-01T00:00:00`).getFullYear().toString()} tone="amber" />
    </section>
    <section className="grid gap-6 xl:grid-cols-[0.82fr_1.18fr]">
      <Card className="overflow-hidden bg-[#241b19] p-0 text-white"><div className="relative overflow-hidden p-6 sm:p-7"><div className="absolute -right-16 -top-20 h-56 w-56 rounded-full border-[28px] border-primary/25 blur-sm" /><div className="relative"><div className="flex items-center justify-between"><span className="text-xs font-bold uppercase tracking-[0.16em] text-[#ffaaa2]">Current pulse</span><span className="flex items-center gap-2 text-xs text-stone-300"><span className={`h-2 w-2 rounded-full ${workingNow ? "bg-emerald-400" : "bg-stone-500"}`} />{workingNow ? "In progress" : "No open session"}</span></div><h2 className="mt-10 max-w-xs text-3xl font-bold leading-tight">Your workday, at a glance.</h2><p className="mt-3 max-w-sm text-sm leading-6 text-stone-300">{workingNow ? `Clocked in at ${time(latest?.check_in)}. Your next device punch will close this session.` : "Your latest attendance activity will appear here as soon as the device syncs."}</p><div className="mt-8 grid grid-cols-2 gap-3"><div className="rounded-xl bg-white/10 p-3"><p className="text-[10px] uppercase tracking-[0.12em] text-stone-400">Latest in</p><p className="mt-1 text-lg font-semibold">{time(latest?.check_in)}</p></div><div className="rounded-xl bg-white/10 p-3"><p className="text-[10px] uppercase tracking-[0.12em] text-stone-400">Latest out</p><p className="mt-1 text-lg font-semibold">{time(latest?.session_end)}</p></div></div></div></div></Card>
      <Card className="overflow-hidden p-0 sm:p-0"><div className="flex flex-col gap-3 border-b border-border p-5 sm:flex-row sm:items-end sm:justify-between"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Attendance journal</p><h2 className="mt-1 text-lg font-bold">Your punch history</h2></div><label className="block"><span className="sr-only">Select month</span><TextInput type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label></div><div className="divide-y divide-border">{loading ? <LoadingRows /> : records.length ? records.map((record) => <AttendanceRow key={record.id} record={record} />) : <div className="px-6 py-16 text-center text-sm text-muted">No attendance records for this month.</div>}</div></Card>
    </section>
  </>;
}

function Metric({ icon, label: metricLabel, value, detail, tone }: { icon: React.ReactNode; label: string; value: string | number; detail: string; tone: "coral" | "sky" | "emerald" | "amber" }) {
  const colors = { coral: "bg-primary-soft text-primary", sky: "bg-sky-50 text-sky-600", emerald: "bg-emerald-50 text-emerald-600", amber: "bg-amber-50 text-amber-600" };
  return <Card className="p-4 sm:p-5"><div className="flex items-start justify-between"><div><p className="text-xs font-medium text-muted">{metricLabel}</p><p className="mt-2 text-2xl font-bold tracking-tight">{value}</p></div><div className={`grid h-10 w-10 place-items-center rounded-xl ${colors[tone]}`}>{icon}</div></div><p className="mt-3 text-xs text-muted">{detail}</p></Card>;
}

function AttendanceRow({ record }: { record: AttendanceRecord }) {
  const status = record.day_status ?? record.status;
  return <div className="flex items-center gap-4 px-5 py-4 transition hover:bg-[#fffafa] sm:px-6"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary"><IconCalendar className="h-4 w-4" /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{date(record.check_in)}</p><Badge tone={record.arrival_status === "late" ? "warning" : "success"}>{label(record.arrival_status ?? "on_time")}</Badge></div><p className="mt-1 text-xs text-muted">Check-in {time(record.check_in)} <span className="px-1 text-stone-300">·</span> Check-out {time(record.session_end)}</p></div><div className="hidden text-right sm:block"><p className="text-sm font-semibold">{record.worked_minutes != null ? `${Math.floor(record.worked_minutes / 60)}h ${record.worked_minutes % 60}m` : "In progress"}</p><p className="mt-1 text-xs text-muted">{label(status)}</p></div></div>;
}

function LoadingRows() { return <>{[1, 2, 3, 4].map((item) => <div key={item} className="flex animate-pulse items-center gap-4 px-5 py-5 sm:px-6"><div className="h-10 w-10 rounded-xl bg-stone-100" /><div className="flex-1"><div className="h-3 w-32 rounded bg-stone-100" /><div className="mt-2 h-2.5 w-48 rounded bg-stone-100" /></div></div>)}</>; }
