"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/empty-state";
import { Field, SelectInput, TextInput } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";

type Expert = { id: number; name: string; service_area?: string | null; status: string };
type Order = { id: number; public_order_id: string; lead_id: number; service_name: string; service_charges?: string | null; service_deadline: string; status: string; crm_leads?: { name: string; email: string; crm_companies?: { name: string } | null } | null; crm_experts?: { name: string; service_area?: string | null } | null };
type SelectedLead = { id: number; name: string; email: string; phone?: string | null };
type FormState = { lead_id: string; expert_id: string; service_name: string; service_charges: string; service_deadline: string; is_writing: boolean; word_count: string; subject_area: string };
const emptyForm: FormState = { lead_id: "", expert_id: "", service_name: "", service_charges: "", service_deadline: "", is_writing: false, word_count: "", subject_area: "" };

function date(value: string) { return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" }).format(new Date(value)); }
function statusTone(value: string): "success" | "warning" | "danger" | "neutral" { return value === "completed" ? "success" : value === "cancelled" ? "danger" : value === "pending" ? "warning" : "neutral"; }

export default function OrdersPage() {
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<Order[]>([]);
  const [experts, setExperts] = useState<Expert[]>([]);
  const [selectedLead, setSelectedLead] = useState<SelectedLead | null>(null);
  const [status, setStatus] = useState("");
  const [form, setForm] = useState<FormState>(emptyForm);
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone?: "success" | "danger" } | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const [orderResponse, expertResponse] = await Promise.all([
      fetch(`/api/crm/orders${status ? `?status=${status}` : ""}`, { cache: "no-store" }),
      fetch("/api/crm/experts?status=active", { cache: "no-store" }),
    ]);
    const orderResult = await orderResponse.json();
    const expertResult = await expertResponse.json();
    if (!orderResponse.ok) throw new Error(orderResult.error ?? "Could not load orders.");
    setOrders(orderResult.orders ?? []);
    setExperts(expertResult.experts ?? []);
  }

  useEffect(() => { load().catch((error) => setMessage({ text: error.message, tone: "danger" })); }, [status]);

  useEffect(() => {
    const leadId = searchParams.get("lead_id");
    if (!leadId) { setSelectedLead(null); setOpen(false); return; }
    fetch(`/api/crm/leads/${leadId}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not load client.");
        setSelectedLead(result.lead);
        setForm((current) => ({ ...current, lead_id: leadId }));
        setOpen(true);
      })
      .catch((error) => setMessage({ text: error instanceof Error ? error.message : "Could not load client.", tone: "danger" }));
  }, [searchParams]);

  async function create(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/crm/orders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not create order.");
      setOpen(false);
      setForm(emptyForm);
      setMessage({ text: `Order #${result.order.public_order_id} created.`, tone: "success" });
      await load();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not create order.", tone: "danger" });
    } finally { setSaving(false); }
  }

  async function complete(order: Order) {
    if (!window.confirm(`Mark order #${order.public_order_id} as completed?`)) return;
    const response = await fetch(`/api/crm/orders/${order.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status: "completed" }) });
    const result = await response.json();
    if (!response.ok) setMessage({ text: result.error ?? "Could not complete order.", tone: "danger" });
    else { setMessage({ text: "Order completed.", tone: "success" }); await load(); }
  }

  return <div>
    <PageHeader eyebrow="Business CRM / Orders" title="Orders" description="Manage services, deadlines, assignments, completion, and order history." />
    {message ? <div className="mb-5"><Alert tone={message.tone}>{message.text}</Alert></div> : null}
    <Card className="mb-5"><Field label="Status"><SelectInput value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option><option value="pending">Pending</option><option value="in_progress">In progress</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></SelectInput></Field></Card>
    <Card className="overflow-hidden p-0">{orders.length ? <div className="overflow-x-auto"><table className="w-full min-w-[980px] text-left text-sm"><thead className="bg-[#fffaf8] text-xs uppercase tracking-[0.12em] text-stone-400"><tr><th className="px-5 py-3">Order</th><th className="px-5 py-3">Lead / company</th><th className="px-5 py-3">Service</th><th className="px-5 py-3">Expert</th><th className="px-5 py-3">Deadline</th><th className="px-5 py-3">Status</th><th /></tr></thead><tbody>{orders.map((order) => <tr key={order.id} className="border-t border-border"><td className="px-5 py-4"><Link href={`/dashboard/crm/orders/${order.id}`} className="font-semibold text-primary">#{order.public_order_id}</Link></td><td className="px-5 py-4"><p className="font-semibold">{order.crm_leads?.name || "Unknown lead"}</p><p className="text-xs text-muted">{order.crm_leads?.crm_companies?.name || "Company not provided"}</p></td><td className="px-5 py-4">{order.service_name}<p className="text-xs text-muted">{order.service_charges ? `PKR ${order.service_charges}` : "Charges not set"}</p></td><td className="px-5 py-4">{order.crm_experts?.name || "Not assigned"}</td><td className="px-5 py-4">{date(order.service_deadline)}</td><td className="px-5 py-4"><Badge tone={statusTone(order.status)}>{order.status}</Badge></td><td className="px-5 py-4 text-right"><Link href={`/dashboard/crm/orders/${order.id}`} className="mr-3 text-xs font-semibold text-primary">View</Link>{order.status !== "completed" && order.status !== "cancelled" ? <button type="button" onClick={() => complete(order)} className="text-xs font-semibold text-emerald-700">Complete</button> : null}</td></tr>)}</tbody></table></div> : <div className="p-8"><EmptyState text="No orders found." /></div>}</Card>
    <Modal open={open} onClose={() => setOpen(false)} title="Create Order" description="Assign an active expert and keep pricing optional until it is confirmed."><form className="space-y-5" onSubmit={create}><div className="rounded-xl border border-primary/15 bg-primary-soft/50 px-4 py-3"><p className="text-xs font-bold uppercase tracking-[0.12em] text-primary">Client</p><p className="mt-1 text-base font-semibold">{selectedLead?.name || "Selected lead"}</p><p className="mt-0.5 text-sm text-muted">{selectedLead?.email}{selectedLead?.phone ? ` · ${selectedLead.phone}` : ""}</p></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Service name"><TextInput required value={form.service_name} onChange={(event) => setForm({ ...form, service_name: event.target.value })} /></Field><Field label="Service charges (optional)"><TextInput type="number" min="0" step="0.01" value={form.service_charges} onChange={(event) => setForm({ ...form, service_charges: event.target.value })} placeholder="Add later if not decided" /></Field></div><div className="grid gap-4 sm:grid-cols-2"><Field label="Service deadline"><TextInput required type="datetime-local" value={form.service_deadline} onChange={(event) => setForm({ ...form, service_deadline: event.target.value })} /></Field><Field label="Expert"><SelectInput required value={form.expert_id} onChange={(event) => setForm({ ...form, expert_id: event.target.value })}><option value="">Select active expert</option>{experts.map((expert) => <option key={expert.id} value={expert.id}>{expert.name} {expert.service_area ? `- ${expert.service_area}` : ""}</option>)}</SelectInput></Field></div><label className="flex items-center gap-3 rounded-xl border border-border bg-[#fffaf9] px-4 py-3 text-sm font-semibold"><input type="checkbox" checked={form.is_writing} onChange={(event) => setForm({ ...form, is_writing: event.target.checked })} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />Is it writing?</label>{form.is_writing ? <div className="grid gap-4 sm:grid-cols-2"><Field label="Word count (optional)"><TextInput type="number" min="0" value={form.word_count} onChange={(event) => setForm({ ...form, word_count: event.target.value })} /></Field><Field label="Subject area (optional)"><TextInput value={form.subject_area} onChange={(event) => setForm({ ...form, subject_area: event.target.value })} /></Field></div> : null}<div className="flex justify-end gap-3 border-t border-border pt-4"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" loading={saving}>Create order</Button></div></form></Modal>
  </div>;
}
