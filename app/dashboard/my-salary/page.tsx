"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

export default function MySalaryPage() {
  const [records, setRecords] = useState<{ id: number; month: string; base_salary: number; deduction_amount: number; net_pay: number; status: string; paid_at?: string | null; adjustment_note?: string | null }[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { fetch("/api/me/salaries", { cache: "no-store" }).then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Could not load salary history."); setRecords(result.salaries ?? []); }).catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load salary history.")); }, []);
  const money = (value: number) => Number(value || 0).toLocaleString("en-PK", { style: "currency", currency: "PKR" });
  return <><PageHeader eyebrow="Employee portal" title="My salary history" description="Review your monthly salary records, deductions, and paid status." />{error ? <Alert tone="danger">{error}</Alert> : <Card className="overflow-hidden p-0 sm:p-0"><div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm"><thead className="bg-[#fcfaf9] text-[10px] uppercase tracking-[0.11em] text-stone-400"><tr><th className="px-5 py-3 font-bold">Month</th><th className="px-3 py-3 font-bold">Base salary</th><th className="px-3 py-3 font-bold">Deduction</th><th className="px-3 py-3 font-bold">Net pay</th><th className="px-3 py-3 font-bold">Status</th><th className="px-5 py-3 font-bold">Paid on</th></tr></thead><tbody className="divide-y divide-border">{records.length ? records.map((record) => <tr key={record.id}><td className="px-5 py-4 font-semibold">{new Date(record.month).toLocaleDateString(undefined, { month: "long", year: "numeric" })}{record.adjustment_note ? <p className="mt-1 text-xs font-normal text-muted">{record.adjustment_note}</p> : null}</td><td className="px-3 py-4">{money(record.base_salary)}</td><td className="px-3 py-4 text-rose-700">{money(record.deduction_amount)}</td><td className="px-3 py-4 font-semibold text-emerald-700">{money(record.net_pay)}</td><td className="px-3 py-4"><Badge tone={record.status === "paid" ? "success" : "warning"}>{record.status}</Badge></td><td className="px-5 py-4 text-muted">{record.paid_at ? new Date(record.paid_at).toLocaleDateString() : "-"}</td></tr>) : <tr><td colSpan={6} className="px-6 py-14 text-center text-sm text-muted">No salary records yet.</td></tr>}</tbody></table></div></Card>}</>;
}
