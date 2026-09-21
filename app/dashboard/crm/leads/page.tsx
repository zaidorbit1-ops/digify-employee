"use client";

import { useEffect, useMemo, useState } from "react";
import { IconRefresh, IconSearch } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/empty-state";
import { Field, SelectInput, TextInput } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";

type Website = { id: number; name: string; website_url: string; custom_fields?: Array<{ name?: string; label?: string; aliases?: string[] }> | null };
type Company = { id: number; name: string; crm_websites?: Website[] };
type Lead = {
  id: number;
  company_id: number;
  website_id?: number | null;
  converted_contact_id?: number | null;
  name: string;
  email: string;
  phone?: string | null;
  message?: string | null;
  form_name?: string | null;
  source_url?: string | null;
  status: string;
  custom_data?: Record<string, unknown> | { notes?: { text: string; created_at: string }[] };
  created_at: string;
  crm_websites?: { name: string; website_url: string } | null;
  crm_contacts?: { id: number; full_name: string; email: string } | null;
  crm_contact_timeline?: { event_type: string; created_at: string; event_data: Record<string, unknown> }[];
};
type Message = { text: string; tone?: "success" | "danger" };
type Stage = { id: string; label: string; hint: string; tone: string; ring: string; fill: string };

const hiddenTableColumns = new Set(["email", "form"]);

const defaultColumnOptions = [
  { id: "name", label: "Name" },
  { id: "phone", label: "Phone" },
  { id: "website", label: "Website" },
  { id: "received", label: "Received" },
];

const stages: Stage[] = [
  { id: "new", label: "New", hint: "Fresh enquiries", tone: "text-primary", ring: "ring-primary/30", fill: "bg-primary" },
  { id: "contacted", label: "Contacted", hint: "Follow-up in progress", tone: "text-amber-700", ring: "ring-amber-200", fill: "bg-amber-500" },
  { id: "qualified", label: "Qualified", hint: "Ready for conversion", tone: "text-sky-700", ring: "ring-sky-200", fill: "bg-sky-500" },
  { id: "converted", label: "Converted", hint: "Now in contacts", tone: "text-emerald-700", ring: "ring-emerald-200", fill: "bg-emerald-500" },
  { id: "lost", label: "Lost", hint: "Closed without a win", tone: "text-rose-700", ring: "ring-rose-200", fill: "bg-rose-500" },
];

const statuses = stages.map((stage) => stage.id);
const defaultVisibleColumns = ["name", "phone", "website", "received"];

function statusTone(status: string): "primary" | "success" | "warning" | "danger" | "neutral" {
  if (status === "new") return "primary";
  if (status === "qualified") return "neutral";
  if (status === "converted") return "success";
  if (status === "lost") return "danger";
  return "warning";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatRelative(value: string) {
  const delta = Date.now() - new Date(value).getTime();
  const minutes = Math.max(1, Math.round(delta / 60000));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 14) return `${days}d ago`;
  return formatDate(value);
}

function getCustomEntries(customData: Record<string, unknown> | undefined): Array<[string, unknown]> {
  if (!customData || typeof customData !== "object" || Array.isArray(customData)) return [];
  return Object.entries(customData).filter(([key, value]) => key !== "notes" && value !== undefined && value !== null && value !== "");
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? "L") + (parts[1]?.[0] ?? "")).toUpperCase();
}

function stageIndex(status: string) {
  const index = statuses.indexOf(status);
  return index === -1 ? 0 : index;
}

function StageTrack({
  current,
  disabled,
  compact,
  onSelect,
}: {
  current: string;
  disabled?: boolean;
  compact?: boolean;
  onSelect: (status: string) => void;
}) {
  const currentIndex = stageIndex(current);

  if (compact) {
    return (
      <div className="flex items-center gap-2.5" onClick={(event) => event.stopPropagation()}>
        <Badge tone={statusTone(current)}>{current}</Badge>
        <div className="flex overflow-hidden rounded-full border border-border bg-white">
          {stages.map((stage) => {
            const active = stage.id === current;
            return (
              <button
                key={stage.id}
                type="button"
                title={`Move to ${stage.label}`}
                disabled={disabled || active}
                onClick={() => onSelect(stage.id)}
                className={`h-7 w-7 text-[10px] font-bold transition ${
                  active ? `${stage.fill} text-white` : "text-stone-400 hover:bg-primary-soft hover:text-primary"
                }`}
              >
                {stage.label[0]}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="w-full" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center">
        {stages.map((stage, index) => {
          const done = index <= currentIndex && current !== "lost";
          const lost = current === "lost";
          const active = stage.id === current;
          return (
            <div key={stage.id} className="flex min-w-0 flex-1 items-center last:flex-none">
              <button
                type="button"
                title={`Move to ${stage.label}`}
                disabled={disabled || active}
                onClick={() => onSelect(stage.id)}
                className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border-2 transition ${
                  active
                    ? `${stage.fill} border-transparent text-white shadow-sm`
                    : done
                      ? "border-emerald-400 bg-emerald-50 text-emerald-700"
                      : lost && stage.id === "lost"
                        ? "border-rose-400 bg-rose-500 text-white"
                        : "border-stone-200 bg-white text-stone-400 hover:border-primary/40 hover:text-primary"
                }`}
              >
                {done && !active && current !== "lost" ? (
                  <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4"><path d="M5 12.5l4.2 4.2L19 7.5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                ) : (
                  <span className="text-[11px] font-bold">{index + 1}</span>
                )}
              </button>
              {index < stages.length - 1 ? (
                <div className={`mx-1 h-0.5 flex-1 rounded-full ${done && current !== "lost" ? "bg-emerald-300" : "bg-stone-200"}`} />
              ) : null}
            </div>
          );
        })}
      </div>
      <div className="mt-2 flex">
        {stages.map((stage) => (
          <p key={stage.id} className={`min-w-0 flex-1 text-center text-[11px] font-semibold ${stage.id === current ? stage.tone : "text-stone-400"}`}>
            {stage.label}
          </p>
        ))}
      </div>
    </div>
  );
}

export default function CrmLeadsPage() {
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
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<string[]>(defaultVisibleColumns);
  const [columnModalOpen, setColumnModalOpen] = useState(false);
  const [pendingColumns, setPendingColumns] = useState<string[]>(defaultVisibleColumns);
  const [websiteColumnSelections, setWebsiteColumnSelections] = useState<Record<string, string[]>>({});

  const selectedCompany = companies.find((company) => String(company.id) === companyId);
  const allWebsites = useMemo(() => companies.flatMap((company) => company.crm_websites ?? []), [companies]);
  const activeWebsite = useMemo(() => {
    const candidates = companyId ? (selectedCompany?.crm_websites ?? []) : allWebsites;
    return candidates.find((website) => String(website.id) === websiteId) ?? null;
  }, [allWebsites, companyId, selectedCompany, websiteId]);
  const customFieldColumns = useMemo(
    () =>
      Array.isArray(activeWebsite?.custom_fields)
        ? activeWebsite.custom_fields
            .map((field: { name?: string; label?: string; aliases?: string[] }) => ({ id: String(field.name ?? field.label ?? "").trim(), label: String(field.label ?? field.name ?? "").trim() }))
            .filter((field: { id: string; label: string }) => field.id && field.label)
            .filter((field: { id: string; label: string }, index: number, list: Array<{ id: string; label: string }>) => list.findIndex((item: { id: string; label: string }) => item.id === field.id) === index)
        : [],
    [activeWebsite],
  );
  const allAvailableColumns = useMemo(
    () => [...defaultColumnOptions, ...customFieldColumns.map((column: { id: string; label: string }) => ({ id: column.id, label: column.label }))],
    [customFieldColumns],
  );

  const summary = {
    total: leads.length,
    new: leads.filter((lead) => lead.status === "new").length,
    contacted: leads.filter((lead) => lead.status === "contacted").length,
    qualified: leads.filter((lead) => lead.status === "qualified").length,
    converted: leads.filter((lead) => lead.status === "converted").length,
    lost: leads.filter((lead) => lead.status === "lost").length,
  };
  const visibleLeads = status ? leads.filter((lead) => lead.status === status) : leads;
  const currentStage = stages.find((stage) => stage.id === status);
  const tableColumns = ["name", ...visibleColumns.filter((column) => column !== "name" && !hiddenTableColumns.has(column))];

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
  }, [companyId, websiteId, from, to]);

  useEffect(() => {
    if (!websiteId) {
      setVisibleColumns(defaultVisibleColumns);
      setPendingColumns(defaultVisibleColumns);
      return;
    }
    const savedColumns = websiteColumnSelections[websiteId];
    const allColumns = allAvailableColumns.map((option) => option.id).filter((column) => !hiddenTableColumns.has(column));
    const fallback = [...defaultVisibleColumns, ...customFieldColumns.map((column) => column.id)];
    const nextColumns = savedColumns && savedColumns.some((column) => allColumns.includes(column))
      ? savedColumns.filter((column) => allColumns.includes(column) && !hiddenTableColumns.has(column))
      : fallback;
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
    const cleaned = pendingColumns.filter((column) => !hiddenTableColumns.has(column));
    if (!websiteId) {
      setVisibleColumns(cleaned.length ? cleaned : defaultVisibleColumns);
      setColumnModalOpen(false);
      return;
    }
    const uniqueColumns = Array.from(new Set(cleaned.filter((column) => allAvailableColumns.some((option) => option.id === column))));
    const next = uniqueColumns.length ? uniqueColumns : defaultVisibleColumns;
    setWebsiteColumnSelections((current) => ({ ...current, [websiteId]: next }));
    setVisibleColumns(next);
    setColumnModalOpen(false);
  }

  function toggleColumn(columnId: string) {
    setPendingColumns((current) => (current.includes(columnId) ? current.filter((column) => column !== columnId) : [...current, columnId]));
  }

  const customEntryList = selectedLead ? getCustomEntries(selectedLead.custom_data as Record<string, unknown> | undefined) : [];
  const noteEntries =
    selectedLead && typeof selectedLead.custom_data === "object" && selectedLead.custom_data !== null && "notes" in selectedLead.custom_data
      ? ((selectedLead.custom_data.notes as Array<{ text: string; created_at: string }> | undefined) ?? [])
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

  async function updateLead(action: "status" | "note" | "convert", value?: string, leadId?: number) {
    const id = leadId ?? selectedLead?.id;
    if (!id) return;
    setBusyAction(`${action}:${value ?? id}`);
    setDetailMessage(null);
    try {
      const response = await fetch(`/api/crm/leads/${id}`, {
        method: action === "status" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "status" ? { status: value } : action === "note" ? { action: "note", note: value } : { action: "convert" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not update lead.");
      if (selectedLead?.id === id) setSelectedLead(result.lead);
      setNote("");
      if (selectedLead?.id === id) {
        setDetailMessage({
          text:
            action === "convert"
              ? result.already_existing
                ? "Lead linked to the existing contact."
                : "Lead converted to a new contact."
              : action === "note"
                ? "Note added to the lead."
                : "Lead stage updated.",
          tone: "success",
        });
      }
      await loadLeads();
    } catch (error) {
      const text = error instanceof Error ? error.message : "Could not update lead.";
      if (selectedLead?.id === id) setDetailMessage({ text, tone: "danger" });
      else setMessage({ text, tone: "danger" });
    } finally {
      setBusyAction(null);
    }
  }

  function cellValue(lead: Lead, columnId: string) {
    if (columnId === "name") {
      return (
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-primary to-[#c43d3d] text-xs font-bold text-white shadow-[0_8px_16px_rgba(228,90,90,0.28)]">
            {initials(lead.name)}
          </div>
          <div className="min-w-0">
            <p className="truncate font-semibold text-foreground">{lead.name}</p>
            <p className="mt-0.5 truncate text-xs text-muted">{lead.email}</p>
          </div>
        </div>
      );
    }
    if (columnId === "email") return <span className="text-muted">{lead.email || "—"}</span>;
    if (columnId === "phone") return <span className="text-muted">{lead.phone || "—"}</span>;
    if (columnId === "status") return <Badge tone={statusTone(lead.status)}>{lead.status}</Badge>;
    if (columnId === "website") return <span className="font-medium">{lead.crm_websites?.name ?? "Unknown website"}</span>;
    if (columnId === "form") return <span className="inline-flex max-w-[180px] truncate rounded-full bg-[#fff4f1] px-2.5 py-1 text-xs font-semibold text-primary">{lead.form_name || "Website form"}</span>;
    if (columnId === "received") {
      return (
        <span className="text-xs text-muted" title={formatDate(lead.created_at)}>
          {formatRelative(lead.created_at)}
        </span>
      );
    }
    const value = (lead.custom_data as Record<string, unknown> | undefined)?.[columnId];
    return <span className="text-muted">{value !== undefined && value !== null && value !== "" ? String(value) : "—"}</span>;
  }

  const pipelineCards = [
    { id: "", label: "Total", value: summary.total, detail: "All captured leads", accent: "from-[#fff7f4] to-white", bar: "bg-primary", selected: status === "" },
    { id: "new", label: "New", value: summary.new, detail: "Waiting for first touch", accent: "from-[#fff1ee] to-white", bar: "bg-primary", selected: status === "new" },
    { id: "contacted", label: "Contacted", value: summary.contacted, detail: "Conversation started", accent: "from-[#fff8eb] to-white", bar: "bg-amber-400", selected: status === "contacted" },
    { id: "qualified", label: "Qualified", value: summary.qualified, detail: "Ready to convert", accent: "from-[#eef6ff] to-white", bar: "bg-sky-500", selected: status === "qualified" },
    { id: "converted", label: "Converted", value: summary.converted, detail: "Moved to contacts", accent: "from-[#edfaf3] to-white", bar: "bg-emerald-500", selected: status === "converted" },
    { id: "lost", label: "Lost", value: summary.lost, detail: "Not moving forward", accent: "from-[#fff1f2] to-white", bar: "bg-rose-400", selected: status === "lost" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Business CRM / Pipeline"
        title="Leads"
        description="Review every enquiry across the pipeline, move stages in place, and open a profile when you need the full conversation."
        actions={
          <Button variant="secondary" onClick={loadLeads}>
            <IconRefresh className="h-4 w-4" />
            Refresh
          </Button>
        }
      />
      {message ? (
        <div className="mb-5">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      ) : null}

      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        {pipelineCards.map((card) => (
          <button
            key={card.label}
            type="button"
            onClick={() => setStatus(card.id)}
            className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-br p-4 text-left shadow-[0_10px_30px_rgba(28,20,18,0.04)] transition ${card.accent} ${
              card.selected ? "border-primary/40 ring-2 ring-primary/15" : "border-border hover:-translate-y-0.5 hover:border-primary/25"
            }`}
          >
            <span className={`absolute inset-x-0 top-0 h-1 ${card.bar}`} />
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-stone-400">{card.label}</p>
            <p className="mt-3 text-3xl font-bold tracking-tight text-foreground">{card.value}</p>
            <p className="mt-1.5 text-xs text-muted">{card.detail}</p>
          </button>
        ))}
      </div>

      <Card className="mb-5 overflow-hidden border-[#f1e6e1] bg-[linear-gradient(180deg,#fffdfc_0%,#ffffff_100%)] p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
          <div>
            <p className="text-sm font-semibold">Workspace filters</p>
            <p className="mt-0.5 text-xs text-muted">Company, status, website, dates, and search. Pipeline cards use the same status filter.</p>
          </div>
          <Button type="button" variant="secondary" onClick={openColumnCustomizer}>
            Edit columns
          </Button>
        </div>
        <div className="grid gap-4 p-5 md:grid-cols-2 xl:grid-cols-6">
          <Field label="Company">
            <SelectInput
              value={companyId}
              onChange={(event) => {
                setCompanyId(event.target.value);
                setWebsiteId("");
              }}
            >
              <option value="">All companies</option>
              {companies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Status">
            <SelectInput value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="">All statuses</option>
              {stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.label}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Website">
            <SelectInput value={websiteId} onChange={(event) => setWebsiteId(event.target.value)}>
              <option value="">All websites</option>
              {(selectedCompany?.crm_websites ?? companies.flatMap((company) => company.crm_websites ?? [])).map((website) => (
                <option key={website.id} value={website.id}>
                  {website.name}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="From">
            <TextInput type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          </Field>
          <Field label="To">
            <TextInput type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          </Field>
          <Field label="Search">
            <div className="relative">
              <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
              <TextInput
                className="pl-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") loadLeads();
                }}
                placeholder="Name, email, or phone"
              />
            </div>
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border bg-[#fffaf8] px-5 py-3">
          <p className="mr-1 text-[11px] font-bold uppercase tracking-[0.14em] text-stone-400">Columns</p>
          {tableColumns.map((columnId) => (
            <span key={columnId} className="rounded-full border border-primary/20 bg-white px-2.5 py-1 text-[11px] font-semibold text-primary">
              {allAvailableColumns.find((option) => option.id === columnId)?.label ?? columnId}
            </span>
          ))}
        </div>
      </Card>

      <Card className="overflow-hidden border-[#f2e9e5] p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-[#fffaf8] px-5 py-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-semibold">{currentStage ? `${currentStage.label} leads` : "All leads"}</h2>
              <span className="rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-bold text-primary">{visibleLeads.length}</span>
            </div>
            <p className="mt-1 text-sm text-muted">
              {loading ? "Loading pipeline..." : currentStage ? currentStage.hint : "Every enquiry in the current filters."}
            </p>
          </div>
          <p className="text-xs text-muted">Click a stage to move the lead. Open the profile for notes and conversion.</p>
        </div>
        {visibleLeads.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-[#fff7f4] text-[11px] uppercase tracking-[0.14em] text-stone-400">
                <tr>
                  {tableColumns.map((columnId) => {
                    const option = allAvailableColumns.find((entry) => entry.id === columnId);
                    if (!option) return null;
                    return (
                      <th key={columnId} className={`px-5 py-3 font-semibold ${columnId === "name" ? "sticky left-0 z-10 bg-[#fff7f4]" : ""}`}>
                        {option.label}
                      </th>
                    );
                  })}
                  <th className="px-5 py-3 font-semibold">Stage</th>
                  <th className="px-5 py-3" />
                </tr>
              </thead>
              <tbody>
                {visibleLeads.map((lead) => (
                  <tr
                    key={lead.id}
                    className="group cursor-pointer border-t border-border transition hover:bg-[#fff8f6]"
                    onClick={() => openLead(lead.id)}
                  >
                    {tableColumns.map((columnId) => (
                      <td
                        key={columnId}
                        className={`px-5 py-3.5 align-middle ${columnId === "name" ? "sticky left-0 z-10 bg-white group-hover:bg-[#fff8f6]" : "whitespace-nowrap"}`}
                      >
                        {cellValue(lead, columnId)}
                      </td>
                    ))}
                    <td className="px-5 py-3.5 align-middle">
                      <StageTrack
                        compact
                        current={lead.status}
                        disabled={Boolean(busyAction)}
                        onSelect={(next) => updateLead("status", next, lead.id)}
                      />
                    </td>
                    <td className="px-5 py-3.5 text-right align-middle">
                      <Button
                        variant="secondary"
                        className="px-3 py-2"
                        onClick={(event) => {
                          event.stopPropagation();
                          openLead(lead.id);
                        }}
                      >
                        Profile
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8">
            <EmptyState text={loading ? "Loading leads..." : "No leads match the current filters."} />
          </div>
        )}
      </Card>

      <Modal
        open={columnModalOpen}
        onClose={() => setColumnModalOpen(false)}
        title="Customize columns"
        description={websiteId ? "Choose which columns to show for this website." : "Choose which base columns to show in the leads table."}
      >
        <div className="space-y-5">
          <div className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">Default fields</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {defaultColumnOptions.map((option) => (
                <label key={option.id} className="flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-[#fffaf9] px-3 py-2 text-sm">
                  <input type="checkbox" checked={pendingColumns.includes(option.id)} onChange={() => toggleColumn(option.id)} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
                  {option.label}
                </label>
              ))}
            </div>
          </div>
          {customFieldColumns.length ? (
            <div className="space-y-3 border-t border-border pt-4">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-stone-400">Website custom fields</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {customFieldColumns.map((option) => (
                  <label key={option.id} className="flex cursor-pointer items-center gap-2 rounded-xl border border-border bg-[#fffaf9] px-3 py-2 text-sm">
                    <input type="checkbox" checked={pendingColumns.includes(option.id)} onChange={() => toggleColumn(option.id)} className="h-4 w-4 rounded border-border text-primary focus:ring-primary" />
                    {option.label}
                  </label>
                ))}
              </div>
            </div>
          ) : null}
          <div className="flex justify-end gap-3 border-t border-border pt-4">
            <Button type="button" variant="secondary" onClick={() => setColumnModalOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={saveColumnSelection}>
              Save columns
            </Button>
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(selectedLead)} onClose={() => setSelectedLead(null)} title={selectedLead?.name ?? "Lead profile"} chrome={false} size="wide">
        {selectedLead ? (
          <div className="grid min-h-[70vh] lg:grid-cols-[280px_minmax(0,1fr)]">
            <aside className="border-b border-border bg-[linear-gradient(180deg,#fff7f4_0%,#ffffff_55%)] p-6 lg:border-b-0 lg:border-r">
              <div className="grid h-16 w-16 place-items-center rounded-3xl bg-gradient-to-br from-primary to-[#c43d3d] text-lg font-bold text-white shadow-[0_16px_30px_rgba(228,90,90,0.28)]">
                {initials(selectedLead.name)}
              </div>
              <h2 id="modal-title" className="mt-5 text-2xl font-bold tracking-tight">
                {selectedLead.name}
              </h2>
              <p className="mt-1 text-sm text-muted">{selectedLead.email}</p>
              <div className="mt-4">
                <Badge tone={statusTone(selectedLead.status)}>{selectedLead.status}</Badge>
              </div>
              <div className="mt-6 space-y-3">
                <a
                  href={`mailto:${selectedLead.email}`}
                  className="flex items-center justify-center rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(228,90,90,0.22)] hover:bg-primary-hover"
                >
                  Send email
                </a>
                {selectedLead.converted_contact_id ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-center text-sm font-semibold text-emerald-800">Contact linked</div>
                ) : (
                  <Button className="w-full" variant="secondary" onClick={() => updateLead("convert")} disabled={busyAction?.startsWith("convert")}>
                    {busyAction?.startsWith("convert") ? "Converting..." : "Convert to contact"}
                  </Button>
                )}
              </div>
              <dl className="mt-8 space-y-4">
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-400">Phone</dt>
                  <dd className="mt-1 text-sm font-medium">{selectedLead.phone || "Not provided"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-400">Received</dt>
                  <dd className="mt-1 text-sm font-medium">{formatDate(selectedLead.created_at)}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-400">Source website</dt>
                  <dd className="mt-1 text-sm font-medium">{selectedLead.crm_websites?.name || "Not recorded"}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-bold uppercase tracking-[0.14em] text-stone-400">Form</dt>
                  <dd className="mt-1 text-sm font-medium">{selectedLead.form_name || "Not recorded"}</dd>
                </div>
              </dl>
            </aside>

            <div className="space-y-5 p-5 pr-12 sm:p-6">
              {detailMessage ? <Alert tone={detailMessage.tone}>{detailMessage.text}</Alert> : null}

              <section className="rounded-2xl border border-border bg-[#fffdfc] p-5">
                <div className="mb-4 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold">Pipeline stage</p>
                    <p className="mt-0.5 text-xs text-muted">Move this lead without leaving the profile.</p>
                  </div>
                </div>
                <StageTrack current={selectedLead.status} disabled={Boolean(busyAction)} onSelect={(next) => updateLead("status", next)} />
              </section>

              <div className="grid gap-4 md:grid-cols-2">
                <section className="rounded-2xl border border-border bg-white p-5">
                  <p className="text-sm font-semibold">Enquiry</p>
                  {selectedLead.message ? (
                    <p className="mt-3 text-sm leading-7 text-stone-600">{selectedLead.message}</p>
                  ) : (
                    <p className="mt-3 text-sm text-muted">No message was captured with this enquiry.</p>
                  )}
                  {selectedLead.source_url ? (
                    <a href={selectedLead.source_url} target="_blank" rel="noreferrer" className="mt-4 inline-block break-all text-xs font-semibold text-primary hover:underline">
                      {selectedLead.source_url}
                    </a>
                  ) : null}
                </section>
                <section className="rounded-2xl border border-border bg-white p-5">
                  <p className="text-sm font-semibold">Custom fields</p>
                  {customEntryList.length ? (
                    <div className="mt-3 grid gap-3">
                      {customEntryList.map(([key, value]) => (
                        <div key={key} className="rounded-xl bg-[#fffaf8] px-3 py-2.5">
                          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-stone-400">{key}</p>
                          <p className="mt-1 break-words text-sm">{typeof value === "string" || typeof value === "number" ? String(value) : JSON.stringify(value)}</p>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-muted">No extra fields on this lead.</p>
                  )}
                </section>
              </div>

              <section className="rounded-2xl border border-border bg-white p-5">
                <p className="text-sm font-semibold">Notes</p>
                <div className="mt-3 space-y-2">
                  {noteEntries.map((item) => (
                    <div key={item.created_at} className="rounded-xl border border-border bg-[#fffaf9] p-3 text-sm">
                      <p>{item.text}</p>
                      <p className="mt-1 text-[11px] text-muted">{formatDate(item.created_at)}</p>
                    </div>
                  ))}
                  {!noteEntries.length ? <p className="text-sm text-muted">No notes yet. Capture the next follow-up here.</p> : null}
                </div>
                <div className="mt-3 flex gap-2">
                  <TextInput value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add a note" />
                  <Button onClick={() => updateLead("note", note)} disabled={Boolean(busyAction) || !note.trim()}>
                    Add note
                  </Button>
                </div>
              </section>

              <section className="rounded-2xl border border-border bg-white p-5">
                <p className="text-sm font-semibold">Activity timeline</p>
                {timelineEntries.length ? (
                  <div className="mt-4 space-y-0">
                    {timelineEntries.map((event) => (
                      <div key={`${event.event_type}-${event.created_at}`} className="flex items-start gap-3 border-t border-border py-3 first:border-t-0 first:pt-0">
                        <span className="mt-1 h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />
                        <div className="flex min-w-0 flex-1 items-center justify-between gap-3">
                          <span className="text-sm capitalize">{event.event_type.replaceAll("_", " ")}</span>
                          <span className="text-xs text-muted">{formatDate(event.created_at)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="mt-3 text-sm text-muted">Timeline events will appear after contact conversion.</p>
                )}
              </section>
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
