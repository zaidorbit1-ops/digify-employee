"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { IconEdit, IconPlus, IconSearch, IconTrash } from "@/components/icons";
import { Alert } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, SelectInput, TextInput } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";

type Company = { id: number; name: string };
type Template = { id: number; company_id: number; name: string; subject: string; html_body: string; text_body: string | null; content_mode?: "html" | "plain"; variables: string[]; status: string; updated_at: string };

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString();
}

export default function CrmTemplatesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "success" | "danger" } | null>(null);

  async function loadCompanies() {
    const response = await fetch("/api/crm/companies", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not load companies.");
    setCompanies(result.companies ?? []);
    if (!companyId && result.companies?.length) setCompanyId(String(result.companies[0].id));
  }

  async function loadTemplates() {
    if (!companyId) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/crm/templates?company_id=${companyId}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load templates.");
      setTemplates(result.templates ?? []);
    } catch (cause) {
      setMessage({ text: cause instanceof Error ? cause.message : "Could not load templates.", tone: "danger" });
    } finally { setLoading(false); }
  }

  useEffect(() => { void loadCompanies().catch((cause) => setMessage({ text: cause instanceof Error ? cause.message : "Could not load companies.", tone: "danger" })); }, []);
  useEffect(() => { void loadTemplates(); }, [companyId]);

  const filteredTemplates = useMemo(() => templates.filter((template) => `${template.name} ${template.subject}`.toLowerCase().includes(search.toLowerCase().trim())), [templates, search]);

  async function removeTemplate(template: Template) {
    if (!window.confirm(`Delete ${template.name}?`)) return;
    setBusy(true);
    try {
      const response = await fetch(`/api/crm/templates?id=${template.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not delete template.");
      setMessage({ text: "Template deleted.", tone: "success" });
      await loadTemplates();
    } catch (cause) { setMessage({ text: cause instanceof Error ? cause.message : "Could not delete template.", tone: "danger" }); }
    finally { setBusy(false); }
  }

  async function duplicateTemplate(template: Template) {
    setBusy(true);
    try {
      const response = await fetch("/api/crm/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "duplicate", template_id: template.id }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not duplicate template.");
      setMessage({ text: "Template duplicated as a draft.", tone: "success" });
      await loadTemplates();
    } catch (cause) { setMessage({ text: cause instanceof Error ? cause.message : "Could not duplicate template.", tone: "danger" }); }
    finally { setBusy(false); }
  }

  return <>
    <PageHeader eyebrow="Business CRM / Email Marketing" title="Email templates" description="Build reusable emails in a dedicated editor with live rendering and contact personalization." actions={<Link href="/dashboard/crm/templates/new" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover"><IconPlus className="h-4 w-4" />New template</Link>} />
    {message ? <div className="mb-5"><Alert tone={message.tone}>{message.text}</Alert></div> : null}
    <section className="mb-5 grid gap-4 border-y border-border py-4 sm:grid-cols-[minmax(220px,320px)_minmax(240px,1fr)_auto] sm:items-end">
      <Field label="Company"><SelectInput value={companyId} onChange={(event) => setCompanyId(event.target.value)}>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</SelectInput></Field>
      <label className="block"><span className="mb-1.5 block text-sm font-medium text-stone-600">Search templates</span><span className="relative block"><IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"/><TextInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or subject" className="pl-9" /></span></label>
      <p className="pb-2 text-sm text-muted">{templates.length} saved · {templates.filter((template) => template.status === "active").length} active</p>
    </section>
    {loading ? <Card className="p-8 text-sm text-muted">Loading templates…</Card> : filteredTemplates.length ? <div className="divide-y divide-border border-y border-border">{filteredTemplates.map((template) => <article key={template.id} className="grid gap-4 py-5 lg:grid-cols-[minmax(0,1fr)_minmax(180px,0.45fr)_auto] lg:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><Badge tone={template.status === "active" ? "success" : template.status === "archived" ? "neutral" : "warning"}>{template.status}</Badge><Badge tone="primary">{template.content_mode === "plain" ? "Plain text" : "HTML"}</Badge></div><h2 className="mt-2 truncate text-base font-bold">{template.name}</h2><p className="mt-1 truncate text-sm text-muted">{template.subject}</p></div><div className="text-xs text-muted"><p>{template.variables?.length ?? 0} personalization field(s)</p><p className="mt-1">Updated {formatDate(template.updated_at)}</p></div><div className="flex flex-wrap gap-2"><Link href={`/dashboard/crm/templates/${template.id}`} className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold hover:border-primary/30 hover:bg-primary-soft"><IconEdit className="h-4 w-4" />Edit</Link><Button variant="secondary" disabled={busy} onClick={() => void duplicateTemplate(template)}>Duplicate</Button><Button variant="ghost" className="text-rose-600 hover:bg-rose-50 hover:text-rose-700" disabled={busy} onClick={() => void removeTemplate(template)}><IconTrash className="h-4 w-4" />Delete</Button></div></article>)}</div> : <div className="py-16 text-center"><p className="text-lg font-bold">{search ? "No matching templates" : "No templates yet"}</p><p className="mt-2 text-sm text-muted">{search ? "Try a different name or subject." : "Create a reusable HTML or plain-text email for this company."}</p>{!search ? <Link href="/dashboard/crm/templates/new" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover"><IconPlus className="h-4 w-4"/>Create template</Link> : null}</div>}
  </>;
}
