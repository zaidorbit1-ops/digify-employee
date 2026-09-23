"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { IconArrowRight, IconEdit, IconTrash } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/empty-state";
import { Field, SelectInput, TextInput } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";

type Lead = { id: number; name: string; email: string; phone?: string | null; message?: string | null; source?: string | null; form_name?: string | null; source_url?: string | null; status: string; company_id: number; website_id?: number | null; converted_contact_id?: number | null; custom_data?: Record<string, unknown>; created_at: string; updated_at?: string; deleted_at?: string | null; crm_companies?: { name: string } | null; crm_websites?: { name: string; website_url: string } | null; crm_contacts?: { id: number; full_name: string; email: string } | null; crm_contact_timeline?: { event_type: string; created_at: string; event_data: Record<string, unknown> }[] };
type Order = { id: number; public_order_id: string; service_name: string; service_charges?: string | null; service_deadline: string; status: string; completed_at?: string | null; crm_experts?: { name: string; service_area?: string | null } | null };
type Message = { text: string; tone?: "success" | "danger" };

function date(value?: string | null) { return value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not provided"; }
function tone(status: string): "primary" | "success" | "warning" | "danger" | "neutral" { return status === "converted" ? "success" : status === "lost" ? "danger" : status === "new" ? "primary" : status === "qualified" ? "neutral" : "warning"; }
const stageOptions = [
  { id: "new", label: "New", hint: "Fresh lead", color: "bg-primary" },
  { id: "contacted", label: "Contacted", hint: "Follow-up started", color: "bg-amber-500" },
  { id: "qualified", label: "Qualified", hint: "Ready to convert", color: "bg-sky-500" },
  { id: "converted", label: "Converted", hint: "Moved to contact", color: "bg-emerald-500" },
  { id: "lost", label: "Lost", hint: "Closed", color: "bg-rose-500" },
];

export default function LeadProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const [leadId, setLeadId] = useState("");
  const [lead, setLead] = useState<Lead | null>(null);
  const [orders, setOrders] = useState<Order[]>([]);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<Message | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  async function load(id: string) {
    setLoading(true);
    try {
      const [leadResponse, ordersResponse] = await Promise.all([fetch(`/api/crm/leads/${id}`, { cache: "no-store" }), fetch(`/api/crm/orders?lead_id=${id}`, { cache: "no-store" })]);
      const leadResult = await leadResponse.json();
      const orderResult = await ordersResponse.json();
      if (!leadResponse.ok) throw new Error(leadResult.error ?? "Could not load lead.");
      setLead(leadResult.lead); setOrders(orderResult.orders ?? []);
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : "Could not load lead.", tone: "danger" }); } finally { setLoading(false); }
  }

  useEffect(() => { params.then((value) => { setLeadId(value.id); load(value.id); }); }, [params]);

  async function action(body: Record<string, unknown>, method = "POST") {
    setSaving(true); setMessage(null);
    try { const response = await fetch(`/api/crm/leads/${leadId}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Could not update lead."); setLead(result.lead ?? lead); setMessage({ text: body.action === "convert" ? "Lead converted to contact." : body.action === "note" ? "Note added." : "Lead status updated.", tone: "success" }); setNote(""); await load(leadId); } catch (error) { setMessage({ text: error instanceof Error ? error.message : "Could not update lead.", tone: "danger" }); } finally { setSaving(false); }
  }

  async function trash() { if (!window.confirm("Are you sure you want to move this lead to Trash?")) return; const response = await fetch(`/api/crm/leads/${leadId}`, { method: "DELETE" }); const result = await response.json(); if (!response.ok) { setMessage({ text: result.error ?? "Could not move lead to Trash.", tone: "danger" }); return; } window.location.href = "/dashboard/crm/leads"; }
  async function addNote(event: FormEvent) { event.preventDefault(); if (note.trim()) await action({ action: "note", note }); }

  if (loading) return <div className="p-8"><EmptyState text="Loading lead profile..." /></div>;
  if (!lead) return <div className="p-8"><Alert tone="danger">Lead not found.</Alert></div>;
  const customData = Object.entries(lead.custom_data ?? {}).filter(([key, value]) => key !== "notes" && value !== null && value !== "");
  const notes = Array.isArray(lead.custom_data?.notes) ? lead.custom_data?.notes as { text: string; created_at: string; author_name?: string }[] : [];

  const timeline = [...(lead.crm_contact_timeline ?? [])].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const latestOrder = orders[0];
  const infoItems = [
    { label: "Email", value: lead.email, tone: "border-sky-200 bg-sky-50/70", link: `mailto:${lead.email}` },
    { label: "Phone", value: lead.phone, tone: "border-emerald-200 bg-emerald-50/70", link: lead.phone ? `tel:${lead.phone}` : undefined },
    { label: "Company", value: lead.crm_companies?.name, tone: "border-violet-200 bg-violet-50/70" },
    { label: "Website", value: lead.crm_websites?.name, tone: "border-amber-200 bg-amber-50/70", link: lead.crm_websites?.website_url },
    { label: "Form", value: lead.form_name, tone: "border-rose-200 bg-rose-50/70" },
    { label: "Source page", value: lead.source_url, tone: "border-cyan-200 bg-cyan-50/70", link: lead.source_url },
    { label: "Created", value: date(lead.created_at), tone: "border-stone-200 bg-stone-50/80" },
    { label: "Last updated", value: date(lead.updated_at), tone: "border-stone-200 bg-stone-50/80" },
    { label: "Contact", value: lead.crm_contacts?.full_name, tone: "border-indigo-200 bg-indigo-50/70" },
  ];
  const statItems = [
    { label: "Lead status", value: lead.status, kind: "badge" },
    { label: "Orders", value: String(orders.length), kind: "text" },
    { label: "Source", value: lead.source || (lead.crm_websites ? "Website" : "Manual"), kind: "text" },
    { label: "Created", value: date(lead.created_at), kind: "text" },
  ];

  return <div className="mx-auto max-w-[1500px]">
    <div className="mb-5 flex items-center gap-2 text-xs font-semibold text-muted"><Link href="/dashboard/crm/leads" className="hover:text-primary">Leads</Link><span>/</span><span className="text-foreground">{lead.name}</span></div>
    <section className="mb-5 rounded-2xl border border-border bg-white shadow-[0_8px_28px_rgba(28,20,18,0.04)]">
      <div className="flex flex-col gap-5 border-b border-border px-6 py-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 items-center gap-4"><div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary text-lg font-bold text-white shadow-[0_10px_22px_rgba(228,90,90,0.2)]">{lead.name.split(/\s+/).map((part) => part[0]).join("").slice(0, 2).toUpperCase()}</div><div className="min-w-0"><div className="flex flex-wrap items-center gap-3"><h1 className="truncate text-2xl font-bold tracking-tight text-foreground">{lead.name}</h1><Badge tone={tone(lead.status)}>{lead.status}</Badge></div><p className="mt-1 truncate text-sm text-muted">{lead.email}{lead.phone ? ` · ${lead.phone}` : ""}</p><p className="mt-2 text-xs text-muted">{lead.crm_companies?.name || "Company not provided"} · {lead.crm_websites?.name || "Website not provided"}</p></div></div>
        <div className="flex flex-wrap gap-2"><Link href={`/dashboard/crm/leads?edit=${lead.id}`} className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-muted hover:border-primary/30 hover:text-primary"><IconEdit className="h-4 w-4" />Edit</Link><Link href={`/dashboard/crm/orders?lead_id=${lead.id}`} className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-primary-hover">Create order<IconArrowRight className="h-4 w-4" /></Link><button type="button" onClick={trash} className="inline-flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 hover:bg-rose-100"><IconTrash className="h-4 w-4" />Trash</button></div>
      </div>
      <div className="grid grid-cols-2 divide-x divide-border lg:grid-cols-4">{statItems.map((item) => <div key={item.label} className="min-w-0 px-6 py-4"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-400">{item.label}</p>{item.kind === "badge" ? <div className="mt-2"><Badge tone={tone(lead.status)}>{item.value}</Badge></div> : <p className="mt-2 truncate text-sm font-semibold text-foreground">{item.value}</p>}</div>)}</div>
    </section>
    {message ? <div className="mb-5"><Alert tone={message.tone}>{message.text}</Alert></div> : null}
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
      <main className="min-w-0 space-y-5">
        <section className="rounded-2xl border border-border bg-white p-5 shadow-[0_8px_28px_rgba(28,20,18,0.03)]"><div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-primary" /><h2 className="font-semibold">Pipeline stage</h2></div><p className="mt-1 text-xs text-muted">Update the lead stage as your team follows up.</p></div><Badge tone={tone(lead.status)}>{lead.status}</Badge></div><div className="mt-5 grid gap-2 sm:grid-cols-5">{stageOptions.map((stage, index) => { const active = lead.status === stage.id; const currentIndex = stageOptions.findIndex((item) => item.id === lead.status); const complete = index < currentIndex && lead.status !== "lost"; return <button key={stage.id} type="button" disabled={saving || active} onClick={() => action({ status: stage.id }, "PATCH")} className={`group relative rounded-xl border px-3 py-3 text-left transition ${active ? "border-primary bg-primary-soft ring-2 ring-primary/10" : complete ? "border-emerald-200 bg-emerald-50/60" : "border-border bg-[#fcfaf9] hover:border-primary/30 hover:bg-primary-soft/50"}`}><span className={`mb-2 block h-1.5 w-8 rounded-full ${active || complete ? stage.color : "bg-stone-200"}`} /><span className={`block text-sm font-semibold ${active ? "text-primary" : "text-foreground"}`}>{stage.label}</span><span className="mt-0.5 block text-[10px] text-muted">{stage.hint}</span></button>; })}</div></section>
        <section className="overflow-hidden rounded-2xl border border-border bg-white shadow-[0_8px_28px_rgba(28,20,18,0.03)]"><div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4"><div><div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-primary" /><h2 className="font-semibold">Lead information</h2></div><p className="mt-1 text-xs text-muted">A quick view of the client, source, and contact context.</p></div><SelectInput className="w-40" value={lead.status} disabled={saving} onChange={(event) => action({ status: event.target.value }, "PATCH")}><option value="new">New</option><option value="contacted">Contacted</option><option value="qualified">Qualified</option><option value="converted">Converted</option><option value="lost">Lost</option></SelectInput></div><div className="grid gap-3 bg-[#fcfaf9] p-4 sm:grid-cols-2 lg:grid-cols-3">{infoItems.map((item) => <div key={item.label} className={`min-w-0 rounded-xl border px-4 py-3 ${item.tone}`}><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-500">{item.label}</p>{item.link && item.value ? <a href={item.link} target={item.label === "Source page" || item.label === "Website" ? "_blank" : undefined} rel={item.label === "Source page" || item.label === "Website" ? "noreferrer" : undefined} className="mt-1.5 block truncate text-sm font-semibold text-foreground hover:text-primary hover:underline" title={item.value}>{item.value}</a> : <p className="mt-1.5 truncate text-sm font-semibold text-foreground" title={item.value || "Not provided"}>{item.value || "Not provided"}</p>}</div>)}</div></section>
        <div className="grid gap-5 lg:grid-cols-2"><section className="rounded-2xl border border-border bg-white p-5 shadow-[0_8px_28px_rgba(28,20,18,0.03)]"><div className="flex items-center justify-between"><h2 className="font-semibold">Original message</h2><span className="text-xs text-muted">{lead.form_name || "Website enquiry"}</span></div><p className="mt-4 min-h-24 whitespace-pre-wrap text-sm leading-7 text-muted">{lead.message || "No message was captured with this lead."}</p></section><section className="rounded-2xl border border-border bg-white p-5 shadow-[0_8px_28px_rgba(28,20,18,0.03)]"><h2 className="font-semibold">Custom fields</h2>{customData.length ? <div className="mt-4 grid gap-2">{customData.map(([key, value]) => <div key={key} className="flex items-start justify-between gap-4 border-b border-border py-2 last:border-0"><span className="text-xs font-semibold text-muted">{key}</span><span className="max-w-[65%] break-words text-right text-sm">{typeof value === "string" || typeof value === "number" ? String(value) : JSON.stringify(value)}</span></div>)}</div> : <p className="mt-4 text-sm text-muted">No custom fields were captured.</p>}</section></div>
        <section className="rounded-2xl border border-border bg-white shadow-[0_8px_28px_rgba(28,20,18,0.03)]"><div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="font-semibold">Orders</h2><p className="mt-0.5 text-xs text-muted">Services requested by this lead.</p></div><Link href={`/dashboard/crm/orders?lead_id=${lead.id}`} className="text-sm font-semibold text-primary hover:underline">Create order</Link></div>{orders.length ? <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="bg-[#fffaf8] text-[10px] uppercase tracking-[0.14em] text-stone-400"><tr><th className="px-5 py-3">Order</th><th className="px-5 py-3">Service</th><th className="px-5 py-3">Expert</th><th className="px-5 py-3">Deadline</th><th className="px-5 py-3">Status</th><th /></tr></thead><tbody>{orders.map((order) => <tr key={order.id} className="border-t border-border"><td className="px-5 py-3"><Link className="font-semibold text-primary hover:underline" href={`/dashboard/crm/orders/${order.id}`}>#{order.public_order_id}</Link></td><td className="px-5 py-3"><span className="font-medium">{order.service_name}</span><p className="text-xs text-muted">PKR {order.service_charges}</p></td><td className="px-5 py-3 text-muted">{order.crm_experts?.name || "Not assigned"}</td><td className="px-5 py-3 text-muted">{date(order.service_deadline)}</td><td className="px-5 py-3"><Badge tone={order.status === "completed" ? "success" : order.status === "cancelled" ? "danger" : "warning"}>{order.status}</Badge></td><td className="px-5 py-3 text-right"><Link href={`/dashboard/crm/orders/${order.id}`} className="text-xs font-semibold text-primary">View</Link></td></tr>)}</tbody></table></div> : <div className="px-5 py-8"><EmptyState text="No orders have been created for this lead yet." /></div>}</section>
      </main>
      <aside className="space-y-5"><section className="rounded-2xl border border-border bg-white p-5 shadow-[0_8px_28px_rgba(28,20,18,0.03)]"><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-stone-400">Quick actions</p><div className="mt-4 space-y-2">{lead.converted_contact_id ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-semibold text-emerald-800">Linked to contact</div> : <Button className="w-full" variant="secondary" onClick={() => action({ action: "convert" })} disabled={saving}>Convert to contact</Button>}<a href={`mailto:${lead.email}`} className="block rounded-lg border border-border px-3 py-2.5 text-center text-sm font-semibold text-muted hover:border-primary/30 hover:text-primary">Send email</a></div></section><section className="rounded-2xl border border-border bg-white p-5 shadow-[0_8px_28px_rgba(28,20,18,0.03)]"><div className="flex items-center justify-between"><h2 className="font-semibold">Notes</h2><span className="text-xs text-muted">{notes.length}</span></div><div className="mt-4 max-h-64 space-y-3 overflow-y-auto">{notes.map((item) => <div key={item.created_at} className="border-l-2 border-primary/30 pl-3"><p className="text-sm leading-6">{item.text}</p><p className="mt-1 text-[11px] text-muted">{date(item.created_at)}</p></div>)}{!notes.length ? <p className="text-sm text-muted">No notes yet.</p> : null}</div><form className="mt-4 flex gap-2" onSubmit={addNote}><TextInput className="min-w-0" value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add note" /><Button type="submit" disabled={saving || !note.trim()}>Add</Button></form></section><section className="rounded-2xl border border-border bg-white p-5 shadow-[0_8px_28px_rgba(28,20,18,0.03)]"><div className="flex items-center justify-between"><h2 className="font-semibold">Activity</h2><span className="text-xs text-muted">{timeline.length} events</span></div><div className="mt-4 space-y-4">{timeline.map((event) => <div key={`${event.event_type}-${event.created_at}`} className="flex gap-3"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary" /><div><p className="text-sm capitalize">{event.event_type.replaceAll("_", " ")}</p><p className="mt-0.5 text-[11px] text-muted">{date(event.created_at)}</p></div></div>)}{!timeline.length ? <p className="text-sm text-muted">No activity recorded yet.</p> : null}</div></section></aside>
    </div>
  </div>;
}