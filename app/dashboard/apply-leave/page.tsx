"use client";

import { useEffect, useState, type FormEvent } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/empty-state";
import { Field, TextInput } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";

type Leave = { id: number; start_date: string; end_date: string; reason: string; status: string; created_at: string };
export default function ApplyLeavePage() {
  const [form, setForm] = useState({ start_date: "", end_date: "", reason: "" });
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [message, setMessage] = useState<{ text: string; tone?: "danger" | "success" } | null>(null);
  const [loading, setLoading] = useState(false);
  async function loadLeaves() { const response = await fetch("/api/me/leaves", { cache: "no-store" }); const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Could not load leave requests."); setLeaves(result.leaves ?? []); }
  useEffect(() => { loadLeaves().catch((error) => setMessage({ text: error instanceof Error ? error.message : "Could not load leave requests.", tone: "danger" })); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); setLoading(true); setMessage(null); try { const response = await fetch("/api/me/leaves", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) }); const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Could not submit leave request."); setForm({ start_date: "", end_date: "", reason: "" }); setMessage({ text: "Leave request submitted for admin review.", tone: "success" }); await loadLeaves(); } catch (error) { setMessage({ text: error instanceof Error ? error.message : "Could not submit leave request.", tone: "danger" }); } finally { setLoading(false); } }
  return <><PageHeader eyebrow="Employee portal" title="Apply for leave" description="Submit a date range and reason. Your admin will review the request." />{message ? <div className="mb-5"><Alert tone={message.tone}>{message.text}</Alert></div> : null}<div className="grid gap-5 lg:grid-cols-[0.9fr_1.1fr]"><Card className="p-5 sm:p-6"><h2 className="text-base font-semibold">New request</h2><form className="mt-5 space-y-4" onSubmit={submit}><Field label="Start date"><TextInput required type="date" value={form.start_date} onChange={(event) => setForm({ ...form, start_date: event.target.value })} /></Field><Field label="End date"><TextInput required type="date" value={form.end_date} onChange={(event) => setForm({ ...form, end_date: event.target.value })} /></Field><Field label="Reason"><TextInput required value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} placeholder="Personal leave" /></Field><Button type="submit" disabled={loading} className="w-full">{loading ? "Submitting..." : "Submit request"}</Button></form></Card><Card className="overflow-hidden p-0 sm:p-0"><div className="border-b border-border p-5"><h2 className="text-base font-semibold">My leave requests</h2><p className="mt-1 text-xs text-muted">{leaves.length} request{leaves.length === 1 ? "" : "s"}</p></div><div className="divide-y divide-border">{leaves.length ? leaves.map((leave) => <div key={leave.id} className="p-5"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold">{leave.start_date} to {leave.end_date}</p><p className="mt-1 text-sm text-muted">{leave.reason}</p></div><Badge tone={leave.status === "approved" ? "success" : leave.status === "declined" ? "danger" : "warning"}>{leave.status}</Badge></div></div>) : <div className="px-6 py-14 text-center text-sm text-muted">No leave requests yet.</div>}</div></Card></div></>;
}
