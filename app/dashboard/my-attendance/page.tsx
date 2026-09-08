"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TextInput } from "@/components/ui/field";
import { Alert } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

const monthNow = new Date().toISOString().slice(0, 7);
function label(value?: string | null) { return value ? value.replaceAll("_", " ").replace(/\b\w/g, (letter) => letter.toUpperCase()) : "-"; }
export default function MyAttendancePage() {
  const [month, setMonth] = useState(monthNow);
  const [records, setRecords] = useState<{ id: number; check_in: string; status?: string | null; day_status?: string | null; arrival_status?: string | null; worked_minutes?: number | null }[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { fetch(`/api/me/attendance?month=${month}`, { cache: "no-store" }).then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Could not load attendance."); setRecords(result.attendance ?? []); }).catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load attendance.")); }, [month]);
  return <><PageHeader eyebrow="Employee portal" title="My attendance" description="Review your attendance punches and calculated daily status." /><Card className="mb-5 p-5"><label className="block max-w-xs"><span className="mb-1.5 block text-sm font-medium text-stone-600">Month</span><TextInput type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></label></Card>{error ? <Alert tone="danger">{error}</Alert> : <Card className="overflow-hidden p-0 sm:p-0"><div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-[#fcfaf9] text-[10px] uppercase tracking-[0.11em] text-stone-400"><tr><th className="px-5 py-3 font-bold">Date</th><th className="px-3 py-3 font-bold">Check-in</th><th className="px-3 py-3 font-bold">Arrival</th><th className="px-3 py-3 font-bold">Day status</th><th className="px-5 py-3 font-bold">Worked</th></tr></thead><tbody className="divide-y divide-border">{records.length ? records.map((record) => <tr key={record.id}><td className="px-5 py-4 text-muted">{new Date(record.check_in).toLocaleDateString()}</td><td className="px-3 py-4 font-medium">{new Date(record.check_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</td><td className="px-3 py-4"><Badge tone={record.arrival_status === "late" ? "warning" : "success"}>{label(record.arrival_status)}</Badge></td><td className="px-3 py-4"><Badge tone={record.day_status === "absent" ? "danger" : record.day_status === "half_day" ? "warning" : "success"}>{label(record.day_status ?? record.status)}</Badge></td><td className="px-5 py-4 text-muted">{record.worked_minutes != null ? `${Math.floor(record.worked_minutes / 60)}h ${record.worked_minutes % 60}m` : "-"}</td></tr>) : <tr><td colSpan={5} className="px-6 py-14 text-center text-sm text-muted">No attendance records for this month.</td></tr>}</tbody></table></div></Card>}</>;
}
