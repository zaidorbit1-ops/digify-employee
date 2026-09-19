"use client";

import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/empty-state";
import { Field, SelectInput, TextInput } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";

export default function CrmLeadsPage() {
  type Website = { id: number; name: string; website_url: string };
  type Company = { id: number; name: string; crm_websites?: Website[] };
  type Lead = { id: number; company_id: number; website_id?: number | null; converted_contact_id?: number | null; name: string; email: string; phone?: string | null; message?: string | null; form_name?: string | null; source_url?: string | null; status: string; custom_data?: { notes?: { text: string; created_at: string }[] }; created_at: string; crm_websites?: { name: string; website_url: string } | null; crm_contacts?: { id: number; full_name: string; email: string } | null; crm_contact_timeline?: { event_type: string; created_at: string; event_data: Record<string, unknown> }[] };
  type Message = { text: string; tone?: "success" | "danger" };

  const statuses = ["new", "contacted", "qualified", "converted", "lost"];

  function statusTone(status: string): "primary" | "success" | "warning" | "danger" | "neutral" {
    if (status === "new") return "primary";
    if (status === "qualified" || status === "converted") return "success";
    if (status === "lost") return "danger";
    return "warning";
  }

  function formatDate(value: string) {
    return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
  }

  const [companies, setCompanies] = useState<Company[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [status, setStatus] = useState("");
  const [websiteId, setWebsiteId] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [note, setNote] = useState("");
  const [detailMessage, setDetailMessage] = useState<Message | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const selectedCompany = companies.find((company) => String(company.id) === companyId);

  async function loadCompanies() {
    const response = await fetch("/api/crm/companies", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not load companies.");
    setCompanies(result.companies ?? []);
  }

  async function loadLeads() {
    setLoading(true);
    const params = new URLSearchParams();
    if (companyId) params.set("company_id", companyId);
    if (status) params.set("status", status);
    if (websiteId) params.set("website_id", websiteId);
    if (search.trim()) params.set("search", search.trim());
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    try {
      const response = await fetch(`/api/crm/leads?${params}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load leads.");
      setLeads(result.leads ?? []);
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not load leads.", tone: "danger" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCompanies().catch((error) => setMessage({ text: error instanceof Error ? error.message : "Could not load companies.", tone: "danger" }));
  }, []);

  useEffect(() => {
    loadLeads();
  }, [companyId, status, websiteId, from, to]);

  async function openLead(id: number) {
    setDetailMessage(null);
    setNote("");
    const response = await fetch(`/api/crm/leads/${id}`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) {
      setMessage({ text: result.error ?? "Could not load lead.", tone: "danger" });
      return;
    }
    setSelectedLead(result.lead);
  }

  async function updateLead(action: "status" | "note" | "convert", value?: string) {
    if (!selectedLead) return;
    setDetailLoading(true);
    setDetailMessage(null);
    try {
      const response = await fetch(`/api/crm/leads/${selectedLead.id}`, { method: action === "status" ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(action === "status" ? { status: value } : action === "note" ? { action: "note", note: value } : { action: "convert" }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not update lead.");
      setSelectedLead(result.lead);
      setNote("");
      setDetailMessage({ text: action === "convert" ? (result.already_existing ? "Lead linked to the existing contact." : "Lead converted to a new contact.") : action === "note" ? "Note added to the lead." : "Lead status updated.", tone: "success" });
      await loadLeads();
    } catch (error) {
      setDetailMessage({ text: error instanceof Error ? error.message : "Could not update lead.", tone: "danger" });
    } finally {
      setDetailLoading(false);
    }
  }

  return <>
    <PageHeader eyebrow="Business CRM / Leads" title="Leads" description="Review website enquiries, track their progress, and convert qualified leads into contacts." />
    {message ? <div className="mb-5"><Alert tone={message.tone}>{message.text}</Alert></div> : null}
    <Card className="mb-5"><div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6"><Field label="Company"><SelectInput value={companyId} onChange={(event) => { setCompanyId(event.target.value); setWebsiteId(""); }}><option value="">All companies</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</SelectInput></Field><Field label="Status"><SelectInput value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{item}</option>)}</SelectInput></Field><Field label="Website"><SelectInput value={websiteId} onChange={(event) => setWebsiteId(event.target.value)}><option value="">All websites</option>{(selectedCompany?.crm_websites ?? companies.flatMap((company) => company.crm_websites ?? [])).map((website) => <option key={website.id} value={website.id}>{website.name}</option>)}</SelectInput></Field><Field label="From"><TextInput type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></Field><Field label="To"><TextInput type="date" value={to} onChange={(event) => setTo(event.target.value)} /></Field><Field label="Search"><TextInput value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") loadLeads(); }} placeholder="Name or email" /></Field></div></Card>
    <Card className="overflow-hidden p-0"><div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="font-semibold">Lead enquiries</h2><p className="mt-1 text-sm text-muted">{loading ? "Loading leads..." : `${leads.length} lead${leads.length === 1 ? "" : "s"} found`}</p></div><Button variant="secondary" onClick={loadLeads}>Refresh</Button></div>{leads.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[#fffaf9] text-xs uppercase tracking-[0.12em] text-stone-400"><tr><th className="px-5 py-3 font-semibold">Lead</th><th className="px-5 py-3 font-semibold">Website</th><th className="px-5 py-3 font-semibold">Status</th><th className="px-5 py-3 font-semibold">Received</th><th className="px-5 py-3" /></tr></thead><tbody>{leads.map((lead) => <tr key={lead.id} className="border-t border-border transition hover:bg-[#fffdfc]"><td className="px-5 py-4"><button type="button" className="text-left" onClick={() => openLead(lead.id)}><p className="font-semibold text-foreground hover:text-primary">{lead.name}</p><p className="mt-1 text-xs text-muted">{lead.email}{lead.phone ? ` · ${lead.phone}` : ""}</p></button></td><td className="px-5 py-4"><p className="font-medium">{lead.crm_websites?.name ?? "Unknown website"}</p><p className="mt-1 max-w-[210px] truncate text-xs text-muted">{lead.form_name || "Website form"}</p></td><td className="px-5 py-4"><Badge tone={statusTone(lead.status)}>{lead.status}</Badge></td><td className="px-5 py-4 text-xs text-muted">{formatDate(lead.created_at)}</td><td className="px-5 py-4 text-right"><Button variant="ghost" onClick={() => openLead(lead.id)}>View</Button></td></tr>)}</tbody></table></div> : <div className="p-6"><EmptyState text="No leads match the current filters." /></div>}</Card>
    <Modal open={Boolean(selectedLead)} onClose={() => setSelectedLead(null)} title={selectedLead?.name ?? "Lead detail"} description={selectedLead?.email}><div className="space-y-5">{detailMessage ? <Alert tone={detailMessage.tone}>{detailMessage.text}</Alert> : null}<div className="flex flex-wrap items-center justify-between gap-3"><Badge tone={statusTone(selectedLead?.status ?? "new")}>{selectedLead?.status}</Badge><div className="flex flex-wrap gap-2"><a href={`mailto:${selectedLead?.email ?? ""}`} className="inline-flex items-center justify-center rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm font-semibold text-foreground hover:border-primary/30 hover:bg-primary-soft">Send email</a>{selectedLead?.converted_contact_id ? <Badge tone="success">Contact linked</Badge> : <Button onClick={() => updateLead("convert")} disabled={detailLoading}>{detailLoading ? "Working..." : "Convert to contact"}</Button>}</div></div><div className="grid gap-4 rounded-xl bg-[#fffaf9] p-4 sm:grid-cols-2"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-400">Phone</p><p className="mt-1 text-sm">{selectedLead?.phone || "Not provided"}</p></div><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-400">Received</p><p className="mt-1 text-sm">{selectedLead ? formatDate(selectedLead.created_at) : ""}</p></div><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-400">Source website</p><p className="mt-1 text-sm">{selectedLead?.crm_websites?.name || "Not recorded"}</p></div><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-400">Form</p><p className="mt-1 text-sm">{selectedLead?.form_name || "Not recorded"}</p></div></div><div><p className="mb-2 text-sm font-semibold">Change status</p><div className="flex flex-wrap gap-2">{statuses.map((item) => <button key={item} type="button" disabled={detailLoading} onClick={() => updateLead("status", item)} className={`rounded-lg px-3 py-2 text-xs font-semibold capitalize transition ${selectedLead?.status === item ? "bg-primary text-white" : "bg-stone-100 text-stone-600 hover:bg-primary-soft hover:text-primary"}`}>{item}</button>)}</div></div>{selectedLead?.message ? <div><p className="mb-2 text-sm font-semibold">Message</p><p className="rounded-xl border border-border p-4 text-sm leading-6 text-muted">{selectedLead.message}</p></div> : null}{selectedLead?.source_url ? <div><p className="mb-2 text-sm font-semibold">Source URL</p><a href={selectedLead.source_url} target="_blank" rel="noreferrer" className="break-all text-sm text-primary hover:underline">{selectedLead.source_url}</a></div> : null}<div><p className="mb-2 text-sm font-semibold">Notes</p><div className="space-y-2">{selectedLead?.custom_data?.notes?.map((item) => <div key={item.created_at} className="rounded-lg bg-[#fffaf9] p-3 text-sm"><p>{item.text}</p><p className="mt-1 text-[11px] text-muted">{formatDate(item.created_at)}</p></div>)}{!selectedLead?.custom_data?.notes?.length ? <p className="text-sm text-muted">No notes yet.</p> : null}</div><div className="mt-3 flex gap-2"><TextInput value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a note" /><Button onClick={() => updateLead("note", note)} disabled={detailLoading || !note.trim()}>Add note</Button></div></div><div><p className="mb-2 text-sm font-semibold">Activity timeline</p>{selectedLead?.crm_contact_timeline?.length ? selectedLead.crm_contact_timeline.map((event) => <div key={`${event.event_type}-${event.created_at}`} className="flex items-center justify-between border-t border-border py-3 text-sm"><span className="capitalize">{event.event_type.replaceAll("_", " ")}</span><span className="text-xs text-muted">{formatDate(event.created_at)}</span></div>) : <p className="text-sm text-muted">Timeline events will appear after contact conversion.</p>}</div></div></Modal>
  </>;
}
