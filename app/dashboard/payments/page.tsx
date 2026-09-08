"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { IconEdit, IconPlus, IconRefresh, IconTrash } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/empty-state";
import { Field, SelectInput, TextInput } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";

type Expense = { id: number; source: "manual" | "salary"; salary_id?: number | null; amount: number; description: string; expense_date: string };
type Revenue = { id: number; amount: number; description: string; revenue_date: string };
type Entry = { id: number; type: "expense" | "revenue"; source?: "manual" | "salary"; amount: number; description: string; date: string };
type Message = { text: string; tone?: "danger" | "success" };
type Form = { type: "expense" | "revenue"; amount: string; description: string; date: string };

const currentMonth = new Date().toISOString().slice(0, 7);
const today = new Date().toISOString().slice(0, 10);
const emptyForm: Form = { type: "expense", amount: "", description: "", date: today };

function money(value: number) {
  return Number(value || 0).toLocaleString("en-PK", { style: "currency", currency: "PKR" });
}

export default function PaymentsPage() {
  const [month, setMonth] = useState(currentMonth);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [revenues, setRevenues] = useState<Revenue[]>([]);
  const [summary, setSummary] = useState({ total_expenses: 0, total_revenue: 0, net: 0 });
  const [form, setForm] = useState<Form>(emptyForm);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  async function loadData() {
    setLoading(true);
    try {
      const response = await fetch(`/api/payments?month=${month}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load payment tracking.");
      setExpenses(result.expenses ?? []);
      setRevenues(result.revenues ?? []);
      setSummary(result.summary ?? { total_expenses: 0, total_revenue: 0, net: 0 });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not load payment tracking.", tone: "danger" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, [month]);

  const entries = useMemo<Entry[]>(() => [
    ...expenses.map((entry) => ({ id: entry.id, type: "expense" as const, source: entry.source, amount: Number(entry.amount), description: entry.description, date: entry.expense_date })),
    ...revenues.map((entry) => ({ id: entry.id, type: "revenue" as const, amount: Number(entry.amount), description: entry.description, date: entry.revenue_date })),
  ].sort((a, b) => b.date.localeCompare(a.date)), [expenses, revenues]);

  function openAdd(type: "expense" | "revenue") {
    setEditing(null);
    setForm({ ...emptyForm, type });
    setModalOpen(true);
  }

  function openEdit(entry: Entry) {
    setEditing(entry);
    setForm({ type: entry.type, amount: String(entry.amount), description: entry.description, date: entry.date });
    setModalOpen(true);
  }

  async function saveEntry(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/payments", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, id: editing?.id }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save transaction.");
      setModalOpen(false);
      setMessage({ text: editing ? "Transaction updated." : "Transaction added.", tone: "success" });
      await loadData();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not save transaction.", tone: "danger" });
    } finally {
      setLoading(false);
    }
  }

  async function deleteEntry(entry: Entry) {
    if (entry.type === "expense" && entry.source === "salary") return;
    if (!window.confirm(`Delete this ${entry.type}?`)) return;
    const response = await fetch(`/api/payments?id=${entry.id}&type=${entry.type}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) { setMessage({ text: result.error ?? "Could not delete transaction.", tone: "danger" }); return; }
    setMessage({ text: "Transaction deleted.", tone: "success" });
    await loadData();
  }

  return (
    <>
      <PageHeader eyebrow="Finance" title="Payment tracking" description="Track revenue, expenses, salary payouts, and monthly profit or loss." actions={<div className="flex flex-wrap gap-2"><Button variant="secondary" onClick={loadData} disabled={loading}><IconRefresh className="h-4 w-4" />Refresh</Button><Button variant="secondary" onClick={() => openAdd("expense")}><IconPlus className="h-4 w-4" />Expense</Button><Button onClick={() => openAdd("revenue")}><IconPlus className="h-4 w-4" />Revenue</Button></div>} />
      {message ? <div className="mb-5"><Alert tone={message.tone}>{message.text}</Alert></div> : null}

      <Card className="mb-5 p-5 sm:p-6"><div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between"><Field label="Monthly view"><TextInput type="month" value={month} onChange={(event) => setMonth(event.target.value)} /></Field><p className="text-sm text-muted">Showing transactions for {new Date(`${month}-01T00:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</p></div></Card>

      <div className="mb-5 grid gap-4 md:grid-cols-3"><Card className="p-5"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-400">Total revenue</p><p className="mt-2 text-2xl font-bold text-emerald-700">{money(summary.total_revenue)}</p><p className="mt-1 text-xs text-muted">Money received</p></Card><Card className="p-5"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-400">Total expenses</p><p className="mt-2 text-2xl font-bold text-rose-700">{money(summary.total_expenses)}</p><p className="mt-1 text-xs text-muted">Including salary payouts</p></Card><Card className="p-5"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-400">Net result</p><p className={`mt-2 text-2xl font-bold ${summary.net >= 0 ? "text-emerald-700" : "text-rose-700"}`}>{money(summary.net)}</p><p className="mt-1 text-xs text-muted">Revenue minus expenses</p></Card></div>

      <Card className="overflow-hidden p-0 sm:p-0"><div className="flex items-center justify-between border-b border-border p-5"><div><h2 className="text-base font-semibold">Monthly transactions</h2><p className="mt-1 text-xs text-muted">{entries.length} transaction{entries.length === 1 ? "" : "s"}</p></div></div><div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm"><thead className="bg-[#fcfaf9] text-[10px] uppercase tracking-[0.11em] text-stone-400"><tr><th className="px-5 py-3 font-bold">Date</th><th className="px-3 py-3 font-bold">Type</th><th className="px-3 py-3 font-bold">Description</th><th className="px-3 py-3 font-bold">Amount</th><th className="px-5 py-3 text-right font-bold">Actions</th></tr></thead><tbody className="divide-y divide-border">{entries.length ? entries.map((entry) => <tr key={`${entry.type}-${entry.id}`} className="hover:bg-[#fffafa]"><td className="px-5 py-4 text-muted">{new Date(`${entry.date}T00:00:00`).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}</td><td className="px-3 py-4"><div className="flex items-center gap-2"><Badge tone={entry.type === "revenue" ? "success" : "danger"}>{entry.type}</Badge>{entry.source === "salary" ? <Badge tone="primary">salary</Badge> : null}</div></td><td className="px-3 py-4 font-medium">{entry.description}</td><td className={`px-3 py-4 font-semibold ${entry.type === "revenue" ? "text-emerald-700" : "text-rose-700"}`}>{entry.type === "revenue" ? "+" : "-"}{money(entry.amount)}</td><td className="px-5 py-4"><div className="flex justify-end gap-2">{entry.source === "salary" ? <span className="text-xs text-muted">Auto-linked</span> : <><Button variant="ghost" className="h-8 px-2" onClick={() => openEdit(entry)} aria-label="Edit transaction"><IconEdit className="h-4 w-4" /></Button><Button variant="ghost" className="h-8 px-2 text-rose-600" onClick={() => deleteEntry(entry)} aria-label="Delete transaction"><IconTrash className="h-4 w-4" /></Button></>}</div></td></tr>) : <tr><td colSpan={5} className="px-6 py-16 text-center text-sm text-muted">No transactions found for this month.</td></tr>}</tbody></table></div></Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? `Edit ${form.type}` : `Add ${form.type}`} description="Add a finance transaction in PKR."><form className="space-y-5" onSubmit={saveEntry}><Field label="Type"><SelectInput value={form.type} onChange={(event) => setForm({ ...form, type: event.target.value as Form["type"] })} disabled={Boolean(editing)}><option value="expense">Expense</option><option value="revenue">Revenue</option></SelectInput></Field><Field label="Amount (PKR)"><TextInput required type="number" min="0" step="0.01" value={form.amount} onChange={(event) => setForm({ ...form, amount: event.target.value })} placeholder="50000" /></Field><Field label="Description"><TextInput required value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Office supplies" /></Field><Field label="Date"><TextInput required type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></Field><div className="flex justify-end gap-3 border-t border-border pt-5"><Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button><Button type="submit" disabled={loading}>{loading ? "Saving..." : editing ? "Update transaction" : "Add transaction"}</Button></div></form></Modal>
    </>
  );
}
