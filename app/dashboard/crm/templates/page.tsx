"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { IconArrowRight, IconBuilding, IconCalendar, IconEdit, IconFile, IconMail, IconPlus, IconSearch, IconSparkles, IconTrash } from "@/components/icons";
import { Alert } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, SelectInput, TextInput } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";

type Company = { id: number; name: string };
type Template = { id: number; company_id: number; name: string; subject: string; html_body: string; text_body: string | null; content_mode?: "html" | "plain"; variables: string[]; status: string; updated_at: string };

const templateAccents = [
  { stripe: "bg-rose-500", surface: "from-rose-50/80", icon: "bg-rose-100 text-rose-700" },
  { stripe: "bg-sky-500", surface: "from-sky-50/80", icon: "bg-sky-100 text-sky-700" },
  { stripe: "bg-amber-500", surface: "from-amber-50/80", icon: "bg-amber-100 text-amber-700" },
  { stripe: "bg-emerald-500", surface: "from-emerald-50/80", icon: "bg-emerald-100 text-emerald-700" },
  { stripe: "bg-cyan-500", surface: "from-cyan-50/80", icon: "bg-cyan-100 text-cyan-700" },
];

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
  }

  async function loadTemplates() {
    setLoading(true);
    try {
      const query = companyId ? `?company_id=${companyId}` : "";
      const response = await fetch(`/api/crm/templates${query}`, { cache: "no-store" });
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
  const activeTemplates = templates.filter((template) => template.status === "active").length;

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
    <div className="space-y-6 pb-10">
      <PageHeader eyebrow="Business CRM / Email Marketing" title="Email templates" description="Build reusable emails and find templates across all your companies." actions={<Link href="/dashboard/crm/templates/new" className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(228,90,90,0.2)] transition hover:bg-primary-hover"><IconPlus className="h-4 w-4" />New template</Link>} />
      {message ? <div><Alert tone={message.tone}>{message.text}</Alert></div> : null}

      <section className="relative isolate overflow-hidden rounded-2xl bg-gradient-to-r from-[#743e3a] via-[#a44e45] to-[#d95c50] px-6 py-6 text-white shadow-[0_18px_45px_rgba(140,65,58,0.18)] sm:px-8">
        <div className="absolute -right-10 -top-24 -z-10 h-64 w-64 rounded-full border-[34px] border-white/10" />
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <span className="grid h-14 w-14 place-items-center rounded-2xl border border-white/20 bg-white/10"><IconSparkles className="h-7 w-7" /></span>
            <div><p className="text-sm font-semibold text-white/75">Template library</p><p className="mt-1 text-2xl font-bold">{templates.length} template{templates.length === 1 ? "" : "s"}</p></div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-2">{companies.length} companies</span>
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-2">{activeTemplates} active</span>
          </div>
        </div>
      </section>

      <Card className="border-stone-200 bg-white p-4 shadow-[0_10px_30px_rgba(28,20,18,0.04)] sm:p-5">
        <div className="grid gap-4 sm:grid-cols-[minmax(220px,0.8fr)_minmax(240px,1.5fr)_auto] sm:items-end">
          <Field label="Company filter"><SelectInput value={companyId} onChange={(event) => setCompanyId(event.target.value)}><option value="">All companies</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</SelectInput></Field>
          <label className="block"><span className="mb-1.5 block text-sm font-medium text-stone-600">Search templates</span><span className="relative block"><IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"/><TextInput value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name or subject" className="pl-9" /></span></label>
          <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-3.5 py-3 text-sm font-medium text-rose-800"><IconFile className="h-4 w-4" /><span>{filteredTemplates.length} shown · {activeTemplates} active</span></div>
        </div>
      </Card>

      <div className="flex items-end justify-between gap-3"><div><h2 className="text-lg font-bold text-stone-900">Saved templates</h2><p className="mt-1 text-sm text-muted">Select a template to edit its content and live preview.</p></div><span className="text-xs font-medium text-stone-500">{companyId ? companies.find((company) => String(company.id) === companyId)?.name : "All companies"}</span></div>

      {loading ? <Card className="p-8 text-sm text-muted">Loading templates…</Card> : filteredTemplates.length ? (
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {filteredTemplates.map((template, index) => {
            const accent = templateAccents[index % templateAccents.length];
            return <Card key={template.id} className="group relative overflow-hidden border-stone-200 bg-white p-0 shadow-[0_10px_30px_rgba(28,20,18,0.04)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(28,20,18,0.1)]">
              <div className={`absolute inset-x-0 top-0 h-1.5 ${accent.stripe}`} />
              <Link href={`/dashboard/crm/templates/${template.id}`} className={`block bg-gradient-to-br ${accent.surface} to-white p-5 outline-none focus-visible:ring-2 focus-visible:ring-primary/40`}>
                <div className="flex items-start justify-between gap-3">
                  <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${accent.icon}`}><IconMail className="h-5 w-5" /></span>
                  <div className="flex flex-wrap justify-end gap-2">
                    <Badge tone={template.status === "active" ? "success" : template.status === "archived" ? "neutral" : "warning"}>{template.status}</Badge>
                    <Badge tone="primary">{template.content_mode === "plain" ? "Plain text" : "HTML"}</Badge>
                  </div>
                </div>
                <div className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-stone-600"><IconBuilding className="h-3.5 w-3.5" />{companies.find((company) => company.id === template.company_id)?.name ?? `Company ${template.company_id}`}</div>
                <h3 className="mt-2 truncate text-lg font-bold text-stone-900">{template.name}</h3>
                <p className="mt-3 min-h-12 rounded-xl border border-white/80 bg-white/80 px-3.5 py-3 text-sm font-medium text-stone-700 shadow-sm">{template.subject}</p>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-500">
                  <span>{template.variables?.length ?? 0} personalization field{template.variables?.length === 1 ? "" : "s"}</span>
                  <span className="inline-flex items-center gap-1.5"><IconCalendar className="h-3.5 w-3.5" />Updated {formatDate(template.updated_at) || "recently"}</span>
                </div>
                <p className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-primary">Open template <IconArrowRight className="h-4 w-4 transition group-hover:translate-x-1" /></p>
              </Link>
              <div className="flex flex-wrap gap-2 border-t border-stone-200 bg-white px-5 py-3">
                <Link href={`/dashboard/crm/templates/${template.id}`} className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold transition hover:border-primary/30 hover:bg-primary-soft"><IconEdit className="h-4 w-4" />Edit</Link>
                <Button variant="secondary" disabled={busy} onClick={() => void duplicateTemplate(template)}>Duplicate</Button>
                <Button variant="ghost" className="text-rose-600 hover:bg-rose-50 hover:text-rose-700" disabled={busy} onClick={() => void removeTemplate(template)}><IconTrash className="h-4 w-4" />Delete</Button>
              </div>
            </Card>;
          })}
        </div>
      ) : (
        <Card className="border-dashed border-stone-300 bg-white py-14 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-rose-600"><IconMail className="h-7 w-7" /></span>
          <p className="mt-4 text-lg font-bold text-stone-900">{search ? "No matching templates" : "No templates yet"}</p>
          <p className="mt-2 text-sm text-muted">{search ? "Try a different name or subject." : "Create a reusable HTML or plain-text email for your company."}</p>
          {!search ? <Link href="/dashboard/crm/templates/new" className="mt-5 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white hover:bg-primary-hover"><IconPlus className="h-4 w-4" />Create template</Link> : null}
        </Card>
      )}
    </div>
  </>;
}
