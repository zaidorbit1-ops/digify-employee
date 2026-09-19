"use client";

import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/empty-state";
import { Field, SelectInput, TextInput } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";

export default function CrmLeadsPage() {
  type Website = { id: number; name: string; website_url: string; custom_fields?: Array<{ name?: string; label?: string; aliases?: string[] }> | null };
  type Company = { id: number; name: string; crm_websites?: Website[] };
  type Lead = { id: number; company_id: number; website_id?: number | null; converted_contact_id?: number | null; name: string; email: string; phone?: string | null; message?: string | null; form_name?: string | null; source_url?: string | null; status: string; custom_data?: Record<string, unknown> | { notes?: { text: string; created_at: string }[] }; created_at: string; crm_websites?: { name: string; website_url: string } | null; crm_contacts?: { id: number; full_name: string; email: string } | null; crm_contact_timeline?: { event_type: string; created_at: string; event_data: Record<string, unknown> }[] };
  type Message = { text: string; tone?: "success" | "danger" };

  const defaultColumnOptions = [
    { id: "name", label: "Name" },
    { id: "email", label: "Email" },
    { id: "phone", label: "Phone" },
    { id: "status", label: "Status" },
    { id: "website", label: "Website" },
    { id: "form", label: "Form" },
    { id: "received", label: "Received" },
  ];

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

  function getCustomEntries(customData: Record<string, unknown> | undefined): Array<[string, unknown]> {
    if (!customData || typeof customData !== "object" || Array.isArray(customData)) return [];
    return Object.entries(customData).filter(([key, value]) => key !== "notes" && value !== undefined && value !== null && value !== "");
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
  const [visibleColumns, setVisibleColumns] = useState<string[]>(["name", "email", "phone", "status", "website", "received"]);
  const [columnModalOpen, setColumnModalOpen] = useState(false);
  const [pendingColumns, setPendingColumns] = useState<string[]>(["name", "email", "phone", "status", "website", "received"]);
  const [websiteColumnSelections, setWebsiteColumnSelections] = useState<Record<string, string[]>>({});

  const selectedCompany = companies.find((company) => String(company.id) === companyId);
  const activeWebsite = (selectedCompany?.crm_websites ?? []).find((website) => String(website.id) === websiteId) ?? null;
  const customFieldColumns = useMemo(
    () => Array.isArray(activeWebsite?.custom_fields)
      ? activeWebsite.custom_fields
          .map((field: { name?: string; label?: string; aliases?: string[] }) => ({ id: String(field.name ?? field.label ?? "").trim(), label: String(field.label ?? field.name ?? "").trim() }))
          .filter((field: { id: string; label: string }) => field.id && field.label)
          .filter((field: { id: string; label: string }, index: number, list: Array<{ id: string; label: string }>) => list.findIndex((item: { id: string; label: string }) => item.id === field.id) === index)
      : [],
    [activeWebsite],
  );

  const allAvailableColumns = useMemo(
    () => [
      ...defaultColumnOptions,
      ...customFieldColumns.map((column: { id: string; label: string }) => ({ id: column.id, label: column.label })),
    ],
    [customFieldColumns],
  );
  const summary = {
    total: leads.length,
    new: leads.filter((lead) => lead.status === "new").length,
    contacted: leads.filter((lead) => lead.status === "contacted").length,
    qualified: leads.filter((lead) => lead.status === "qualified").length,
  };

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

  useEffect(() => {
    if (!websiteId) {
      const defaults = defaultColumnOptions.map((column) => column.id);
      setVisibleColumns(defaults);
      setPendingColumns(defaults);
      return;
    }
    const savedColumns = websiteColumnSelections[websiteId];
    const allColumns = allAvailableColumns.map((option) => option.id);
    const nextColumns = savedColumns && savedColumns.some((column) => allColumns.includes(column))
      ? savedColumns.filter((column) => allColumns.includes(column))
      : allColumns;
    setVisibleColumns(nextColumns);
    setPendingColumns(nextColumns);
  }, [websiteId, allAvailableColumns]);

  function openColumnCustomizer() {
    const selected = websiteId ? websiteColumnSelections[websiteId] ?? visibleColumns : visibleColumns;
    const allColumns = allAvailableColumns.map((option) => option.id);
    const normalized = selected.filter((column) => allColumns.includes(column));
    setPendingColumns(normalized.length ? normalized : allColumns);
    setColumnModalOpen(true);
  }

  function saveColumnSelection() {
    if (!websiteId) {
      setVisibleColumns(pendingColumns);
      setColumnModalOpen(false);
      return;
    }
    const uniqueColumns = Array.from(new Set(pendingColumns.filter((column) => allAvailableColumns.some((option) => option.id === column))));
    setWebsiteColumnSelections((current) => ({ ...current, [websiteId]: uniqueColumns.length ? uniqueColumns : allAvailableColumns.map((option) => option.id) }));
    setVisibleColumns(uniqueColumns.length ? uniqueColumns : allAvailableColumns.map((option) => option.id));
    setColumnModalOpen(false);
  }

  function toggleColumn(columnId: string) {
    setPendingColumns((current) => current.includes(columnId) ? current.filter((column) => column !== columnId) : [...current, columnId]);
  }

  const customEntryList = selectedLead ? getCustomEntries(selectedLead.custom_data as Record<string, unknown> | undefined) : [];
  const noteEntries = selectedLead && typeof selectedLead.custom_data === "object" && selectedLead.custom_data !== null && "notes" in selectedLead.custom_data
    ? (selectedLead.custom_data.notes as Array<{ text: string; created_at: string }> | undefined) ?? []
    : [];
  const timelineEntries = selectedLead?.crm_contact_timeline ?? [];

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

    <div className="mb-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
      <Card className="bg-gradient-to-br from-[#fff7f4] to-[#fff] p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">Total</p><p className="mt-4 text-3xl font-bold text-foreground">{summary.total}</p><p className="mt-2 text-sm text-muted">All captured leads</p></Card>
      <Card className="bg-gradient-to-br from-[#fffaf1] to-white p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">New</p><p className="mt-4 text-3xl font-bold text-foreground">{summary.new}</p><p className="mt-2 text-sm text-muted">Fresh enquiries</p></Card>
      <Card className="bg-gradient-to-br from-[#f0f9f4] to-white p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">Contacted</p><p className="mt-4 text-3xl font-bold text-foreground">{summary.contacted}</p><p className="mt-2 text-sm text-muted">Follow-up in progress</p></Card>
      <Card className="bg-gradient-to-br from-[#f2f4ff] to-white p-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">Qualified</p><p className="mt-4 text-3xl font-bold text-foreground">{summary.qualified}</p><p className="mt-2 text-sm text-muted">Ready for conversion</p></Card>
    </div>

    <Card className="mb-5 border-[#f1e6e1] bg-[#fffcfb] p-4"><div className="grid gap-4 md:grid-cols-3 xl:grid-cols-6"><Field label="Company"><SelectInput value={companyId} onChange={(event) => { setCompanyId(event.target.value); setWebsiteId(""); }}><option value="">All companies</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</SelectInput></Field><Field label="Status"><SelectInput value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option>{statuses.map((item) => <option key={item} value={item}>{item}</option>)}</SelectInput></Field><Field label="Website"><SelectInput value={websiteId} onChange={(event) => setWebsiteId(event.target.value)}><option value="">All websites</option>{(selectedCompany?.crm_websites ?? companies.flatMap((company) => company.crm_websites ?? [])).map((website) => <option key={website.id} value={website.id}>{website.name}</option>)}</SelectInput></Field><Field label="From"><TextInput type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></Field><Field label="To"><TextInput type="date" value={to} onChange={(event) => setTo(event.target.value)} /></Field><Field label="Search"><TextInput value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") loadLeads(); }} placeholder="Name or email" /></Field></div><div className="mt-4 flex items-center justify-between gap-3 border-t border-border pt-4"><div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">Visible columns</p><div className="flex flex-wrap gap-2">{visibleColumns.map((columnId) => <span key={columnId} className="rounded-full border border-primary bg-primary-soft px-3 py-1.5 text-xs font-semibold text-primary">{allAvailableColumns.find((option) => option.id === columnId)?.label ?? columnId}</span>)}</div></div><Button type="button" variant="secondary" onClick={openColumnCustomizer}>Edit columns</Button></div></Card>
    <Card className="overflow-hidden border-[#f2e9e5] p-0"><div className="flex items-center justify-between border-b border-border bg-[#fffaf8] px-5 py-4"><div><h2 className="text-lg font-semibold">Lead enquiries</h2><p className="mt-1 text-sm text-muted">{loading ? "Loading leads..." : `${leads.length} lead${leads.length === 1 ? "" : "s"} found`}</p></div><Button variant="secondary" onClick={loadLeads}>Refresh</Button></div>{leads.length ? <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left text-sm"><thead className="bg-[#fff7f4] text-xs uppercase tracking-[0.14em] text-stone-400"><tr>{visibleColumns.map((columnId) => { const option = allAvailableColumns.find((entry) => entry.id === columnId); if (!option) return null; const label = option.label; if (columnId === "name") return <th key={columnId} className="px-5 py-3 font-semibold">{label}</th>; if (columnId === "email") return <th key={columnId} className="px-5 py-3 font-semibold">{label}</th>; if (columnId === "phone") return <th key={columnId} className="px-5 py-3 font-semibold">{label}</th>; if (columnId === "status") return <th key={columnId} className="px-5 py-3 font-semibold">{label}</th>; if (columnId === "website") return <th key={columnId} className="px-5 py-3 font-semibold">{label}</th>; if (columnId === "form") return <th key={columnId} className="px-5 py-3 font-semibold">{label}</th>; if (columnId === "received") return <th key={columnId} className="px-5 py-3 font-semibold">{label}</th>; return <th key={columnId} className="px-5 py-3 font-semibold">{label}</th>; })}<th className="px-5 py-3" /></tr></thead><tbody>{leads.map((lead) => <tr key={lead.id} className="border-t border-border transition hover:bg-[#fffdfc]">{visibleColumns.map((columnId) => { if (columnId === "name") return <td key={columnId} className="px-5 py-4"><button type="button" className="text-left" onClick={() => openLead(lead.id)}><p className="font-semibold text-foreground hover:text-primary">{lead.name}</p><p className="mt-1 text-xs text-muted">{lead.email}{lead.phone ? ` · ${lead.phone}` : ""}</p></button></td>; if (columnId === "email") return <td key={columnId} className="px-5 py-4 text-muted">{lead.email || "-"}</td>; if (columnId === "phone") return <td key={columnId} className="px-5 py-4 text-muted">{lead.phone || "-"}</td>; if (columnId === "status") return <td key={columnId} className="px-5 py-4"><Badge tone={statusTone(lead.status)}>{lead.status}</Badge></td>; if (columnId === "website") return <td key={columnId} className="px-5 py-4"><p className="font-medium">{lead.crm_websites?.name ?? "Unknown website"}</p></td>; if (columnId === "form") return <td key={columnId} className="px-5 py-4"><p className="max-w-[210px] truncate text-muted">{lead.form_name || "Website form"}</p></td>; if (columnId === "received") return <td key={columnId} className="px-5 py-4 text-xs text-muted">{formatDate(lead.created_at)}</td>; const value = (lead.custom_data as Record<string, unknown> | undefined)?.[columnId]; return <td key={columnId} className="px-5 py-4 text-muted">{value !== undefined && value !== null && value !== "" ? String(value) : "-"}</td>; })}<td className="px-5 py-4 text-right"><Button variant="ghost" onClick={() => openLead(lead.id)}>View</Button></td></tr>)}</tbody></table></div> : <div className="p-6"><EmptyState text="No leads match the current filters." /></div>}</Card>
    <Modal open={columnModalOpen} onClose={() => setColumnModalOpen(false)} title="Customize columns" description={websiteId ? "Choose which columns to show for this website." : "Choose which base columns to show in the leads table."}><div className="space-y-5"><div className="space-y-3"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">Default fields</p><div className="grid gap-2 sm:grid-cols-2">{defaultColumnOptions.map((option) => <label key={option.id} className="flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-[#fffaf9] px-3 py-2 text-sm"><input type="checkbox" checked={pendingColumns.includes(option.id)} onChange={() => toggleColumn(option.id)} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />{option.label}</label>)}</div></div>{customFieldColumns.length ? <div className="space-y-3 border-t border-border pt-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">Website custom fields</p><div className="grid gap-2 sm:grid-cols-2">{customFieldColumns.map((option) => <label key={option.id} className="flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-[#fffaf9] px-3 py-2 text-sm"><input type="checkbox" checked={pendingColumns.includes(option.id)} onChange={() => toggleColumn(option.id)} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />{option.label}</label>)}</div></div> : null}<div className="flex justify-end gap-3 border-t border-border pt-4"><Button type="button" variant="secondary" onClick={() => setColumnModalOpen(false)}>Cancel</Button><Button type="button" onClick={saveColumnSelection}>Save columns</Button></div></div></Modal>
    <Modal open={Boolean(selectedLead)} onClose={() => setSelectedLead(null)} title={selectedLead?.name ?? "Lead detail"} description={selectedLead?.email}><div className="space-y-5">{detailMessage ? <Alert tone={detailMessage.tone}>{detailMessage.text}</Alert> : null}<div className="flex flex-wrap items-center justify-between gap-3"><Badge tone={statusTone(selectedLead?.status ?? "new")}>{selectedLead?.status}</Badge><div className="flex flex-wrap gap-2"><a href={`mailto:${selectedLead?.email ?? ""}`} className="inline-flex items-center justify-center rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm font-semibold text-foreground hover:border-primary/30 hover:bg-primary-soft">Send email</a>{selectedLead?.converted_contact_id ? <Badge tone="success">Contact linked</Badge> : <Button onClick={() => updateLead("convert")} disabled={detailLoading}>{detailLoading ? "Working..." : "Convert to contact"}</Button>}</div></div><div className="grid gap-4 rounded-xl bg-[#fffaf9] p-4 sm:grid-cols-2"><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-400">Phone</p><p className="mt-1 text-sm">{selectedLead?.phone || "Not provided"}</p></div><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-400">Received</p><p className="mt-1 text-sm">{selectedLead ? formatDate(selectedLead.created_at) : ""}</p></div><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-400">Source website</p><p className="mt-1 text-sm">{selectedLead?.crm_websites?.name || "Not recorded"}</p></div><div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-stone-400">Form</p><p className="mt-1 text-sm">{selectedLead?.form_name || "Not recorded"}</p></div></div>{selectedLead && customEntryList.length ? <div className="rounded-xl border border-border bg-white p-4"><p className="mb-3 text-sm font-semibold">Custom fields</p><div className="grid gap-3 sm:grid-cols-2">{customEntryList.map(([key, value]) => <div key={key} className="rounded-lg border border-border bg-[#fffaf8] p-3"><p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-stone-400">{key}</p><p className="mt-1 break-words text-sm text-foreground">{typeof value === "string" || typeof value === "number" ? String(value) : JSON.stringify(value)}</p></div>)}</div></div> : null}<div><p className="mb-2 text-sm font-semibold">Change status</p><div className="flex flex-wrap gap-2">{statuses.map((item) => <button key={item} type="button" disabled={detailLoading} onClick={() => updateLead("status", item)} className={`rounded-lg px-3 py-2 text-xs font-semibold capitalize transition ${selectedLead?.status === item ? "bg-primary text-white" : "bg-stone-100 text-stone-600 hover:bg-primary-soft hover:text-primary"}`}>{item}</button>)}</div></div>{selectedLead?.message ? <div><p className="mb-2 text-sm font-semibold">Message</p><p className="rounded-xl border border-border p-4 text-sm leading-6 text-muted">{selectedLead.message}</p></div> : null}{selectedLead?.source_url ? <div><p className="mb-2 text-sm font-semibold">Source URL</p><a href={selectedLead.source_url} target="_blank" rel="noreferrer" className="break-all text-sm text-primary hover:underline">{selectedLead.source_url}</a></div> : null}<div><p className="mb-2 text-sm font-semibold">Notes</p><div className="space-y-2">{noteEntries.map((item) => <div key={item.created_at} className="rounded-lg bg-[#fffaf9] p-3 text-sm"><p>{item.text}</p><p className="mt-1 text-[11px] text-muted">{formatDate(item.created_at)}</p></div>)}{!noteEntries.length ? <p className="text-sm text-muted">No notes yet.</p> : null}</div><div className="mt-3 flex gap-2"><TextInput value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a note" /><Button onClick={() => updateLead("note", note)} disabled={detailLoading || !note.trim()}>Add note</Button></div></div><div><p className="mb-2 text-sm font-semibold">Activity timeline</p>{timelineEntries.length ? timelineEntries.map((event) => <div key={`${event.event_type}-${event.created_at}`} className="flex items-center justify-between border-t border-border py-3 text-sm"><span className="capitalize">{event.event_type.replaceAll("_", " ")}</span><span className="text-xs text-muted">{formatDate(event.created_at)}</span></div>) : <p className="text-sm text-muted">Timeline events will appear after contact conversion.</p>}</div></div></Modal>
  </>;
}
