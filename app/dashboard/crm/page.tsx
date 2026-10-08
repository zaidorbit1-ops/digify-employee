"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  IconArrowRight,
  IconBuilding,
  IconCalendar,
  IconCheckCircle,
  IconEmployees,
  IconMail,
  IconOverview,
  IconPlus,
  IconRefresh,
  IconWallet,
} from "@/components/icons";
import { Alert } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, SelectInput } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";

type Company = { id: number; name: string; status: string };
type Campaign = { id: number; company_id: number; name: string; status: string };
type Website = { id: number; name: string; website_url: string; company_name: string; leads: number };
type Summary = {
  leads_today: number;
  leads_month: number;
  new_contacts: number;
  campaigns_running: number;
  emails_sent: number;
  failed_emails: number;
  delivery_rate: number;
  open_rate: number;
  clicks: number;
  replies: number;
};
type DashboardData = { companies: Company[]; campaigns: Campaign[]; website_stats: Website[]; summary: Summary };

const emptySummary: Summary = {
  leads_today: 0,
  leads_month: 0,
  new_contacts: 0,
  campaigns_running: 0,
  emails_sent: 0,
  failed_emails: 0,
  delivery_rate: 0,
  open_rate: 0,
  clicks: 0,
  replies: 0,
};

const modules = [
  { label: "Leads", detail: "Capture and qualify prospects", href: "/dashboard/crm/leads", icon: IconEmployees, tone: "bg-rose-50 text-rose-700" },
  { label: "Contacts", detail: "People and customer records", href: "/dashboard/crm/contacts", icon: IconBuilding, tone: "bg-sky-50 text-sky-700" },
  { label: "Companies", detail: "Your CRM workspaces", href: "/dashboard/crm/companies", icon: IconOverview, tone: "bg-emerald-50 text-emerald-700" },
  { label: "Orders", detail: "Track work and fulfilment", href: "/dashboard/crm/orders", icon: IconWallet, tone: "bg-amber-50 text-amber-700" },
  { label: "Webmail", detail: "Shared business inboxes", href: "/dashboard/crm/webmail", icon: IconMail, tone: "bg-cyan-50 text-cyan-700" },
  { label: "Campaigns", detail: "Email outreach and results", href: "/dashboard/crm/campaigns", icon: IconCalendar, tone: "bg-orange-50 text-orange-700" },
  { label: "Segments", detail: "Organize your audience", href: "/dashboard/crm/segments", icon: IconEmployees, tone: "bg-violet-50 text-violet-700" },
  { label: "Experts", detail: "Manage assigned specialists", href: "/dashboard/crm/experts", icon: IconCheckCircle, tone: "bg-lime-50 text-lime-700" },
  { label: "Analytics", detail: "Review CRM performance", href: "/dashboard/crm/analytics", icon: IconOverview, tone: "bg-indigo-50 text-indigo-700" },
  { label: "Email templates", detail: "Reusable campaign content", href: "/dashboard/crm/templates", icon: IconMail, tone: "bg-pink-50 text-pink-700" },
  { label: "Automations", detail: "CRM workflows and triggers", href: "/dashboard/crm/automations", icon: IconRefresh, tone: "bg-teal-50 text-teal-700" },
  { label: "CRM settings", detail: "Configure your workspace", href: "/dashboard/crm/settings", icon: IconBuilding, tone: "bg-slate-100 text-slate-700" },
];

function number(value: number) {
  return new Intl.NumberFormat().format(value);
}

export default function CrmOverviewPage() {
  const [companyId, setCompanyId] = useState("all");
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadDashboard() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/crm/command-center?company_id=${companyId}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load CRM overview.");
      setData({
        companies: result.companies ?? [],
        campaigns: result.campaigns ?? [],
        website_stats: result.website_stats ?? [],
        summary: { ...emptySummary, ...result.summary },
      });
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load CRM overview.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadDashboard(); }, [companyId]);

  const summary = data?.summary ?? emptySummary;
  const companies = data?.companies ?? [];
  const campaigns = data?.campaigns ?? [];
  const websites = [...(data?.website_stats ?? [])].sort((first, second) => second.leads - first.leads);
  const metrics = [
    { label: "Companies", value: number(companies.length), detail: `${companies.filter((company) => company.status === "active").length} active workspaces`, icon: IconBuilding, tone: "bg-rose-50 text-rose-700" },
    { label: "Websites", value: number(websites.length), detail: "Connected acquisition sources", icon: IconOverview, tone: "bg-sky-50 text-sky-700" },
    { label: "Leads today", value: number(summary.leads_today), detail: "New prospects today", icon: IconPlus, tone: "bg-emerald-50 text-emerald-700" },
    { label: "Leads this month", value: number(summary.leads_month), detail: "Monthly lead volume", icon: IconEmployees, tone: "bg-amber-50 text-amber-700" },
    { label: "New contacts", value: number(summary.new_contacts), detail: "Added this month", icon: IconBuilding, tone: "bg-cyan-50 text-cyan-700" },
    { label: "Live campaigns", value: number(summary.campaigns_running), detail: "Currently running", icon: IconCalendar, tone: "bg-orange-50 text-orange-700" },
    { label: "Emails sent", value: number(summary.emails_sent), detail: "Recorded campaign sends", icon: IconMail, tone: "bg-indigo-50 text-indigo-700" },
    { label: "Delivery rate", value: `${summary.delivery_rate}%`, detail: "Recorded delivery events", icon: IconCheckCircle, tone: "bg-lime-50 text-lime-700" },
    { label: "Tracked opens", value: `${summary.open_rate}%`, detail: "Pixel-based, approximate", icon: IconOverview, tone: "bg-violet-50 text-violet-700" },
    { label: "Link clicks", value: number(summary.clicks), detail: "Campaign link activity", icon: IconArrowRight, tone: "bg-pink-50 text-pink-700" },
    { label: "Replies", value: number(summary.replies), detail: "Recorded campaign replies", icon: IconMail, tone: "bg-teal-50 text-teal-700" },
    { label: "Failed emails", value: number(summary.failed_emails), detail: "Campaign delivery issues", icon: IconRefresh, tone: "bg-red-50 text-red-700" },
  ];

  return <>
    <PageHeader
      eyebrow="Business CRM / Overview"
      title="CRM command center"
      description="A live snapshot of your companies, lead flow, campaigns, and customer activity."
      actions={<>
        <Button variant="secondary" loading={loading} onClick={loadDashboard}><IconRefresh className="h-4 w-4" />Refresh</Button>
        <Link href="/dashboard/crm/leads?new=1" className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white shadow-[0_8px_20px_rgba(228,90,90,0.22)] transition hover:bg-primary-hover"><IconPlus className="h-4 w-4" />Add lead</Link>
      </>}
    />

    {error ? <div className="mb-5"><Alert tone="danger">{error}</Alert></div> : null}

    <section className="mb-5 flex flex-col gap-4 rounded-xl border border-border bg-white p-4 sm:flex-row sm:items-end sm:justify-between" aria-label="Dashboard filters">
      <div>
        <p className="text-xs font-bold uppercase text-muted">Workspace overview</p>
        <p className="mt-1 text-sm text-foreground">{companyId === "all" ? "All accessible companies" : companies.find((company) => String(company.id) === companyId)?.name ?? "Selected company"}</p>
      </div>
      <div className="w-full sm:max-w-xs"><Field label="Company scope"><SelectInput value={companyId} onChange={(event) => setCompanyId(event.target.value)}><option value="all">All companies</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</SelectInput></Field></div>
    </section>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="CRM key performance indicators">
      {metrics.map((metric) => {
        const MetricIcon = metric.icon;
        return <article key={metric.label} className="rounded-xl border border-border bg-white p-4 shadow-[0_8px_24px_rgba(28,20,18,0.025)]">
          <div className="flex items-start justify-between gap-3"><p className="text-xs font-semibold text-muted">{metric.label}</p><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${metric.tone}`}><MetricIcon className="h-4 w-4" /></span></div>
          <p className="mt-3 text-2xl font-bold text-foreground">{loading && !data ? "–" : metric.value}</p>
          <p className="mt-1 text-xs text-muted">{metric.detail}</p>
        </article>;
      })}
    </section>

    <section className="mt-8" aria-labelledby="crm-modules-title">
      <div className="mb-4 flex items-end justify-between gap-3"><div><h2 id="crm-modules-title" className="text-lg font-bold text-foreground">Your CRM workspace</h2><p className="mt-1 text-sm text-muted">Jump straight into the work you need to do.</p></div></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {modules.map((module) => {
          const ModuleIcon = module.icon;
          return <Link key={module.href} href={module.href} className="group flex min-h-24 items-center gap-3 rounded-xl border border-border bg-white p-4 transition hover:border-primary/35 hover:bg-primary-soft/20">
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${module.tone}`}><ModuleIcon className="h-5 w-5" /></span>
            <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-foreground">{module.label}</span><span className="mt-1 block truncate text-xs text-muted">{module.detail}</span></span>
            <IconArrowRight className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-primary" />
          </Link>;
        })}
      </div>
    </section>

    <section className="mt-8 grid gap-5 xl:grid-cols-2" aria-label="Recent CRM activity">
      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4"><div><h2 className="font-bold text-foreground">Campaign activity</h2><p className="mt-1 text-xs text-muted">Recent campaigns across this company scope.</p></div><Link href="/dashboard/crm/campaigns" className="text-xs font-semibold text-primary hover:underline">All campaigns</Link></div>
        {campaigns.length ? <div className="divide-y divide-border">{campaigns.slice(0, 5).map((campaign) => <div key={campaign.id} className="flex items-center justify-between gap-3 px-5 py-3.5"><div className="min-w-0"><p className="truncate text-sm font-semibold text-foreground">{campaign.name}</p><p className="mt-1 truncate text-xs text-muted">{companies.find((company) => company.id === campaign.company_id)?.name ?? "Company"}</p></div><Badge tone={campaign.status === "running" ? "success" : campaign.status === "failed" ? "danger" : "neutral"}>{campaign.status}</Badge></div>)}</div> : <div className="px-5 py-10 text-center"><p className="text-sm font-semibold text-foreground">No campaigns yet</p><p className="mt-1 text-xs text-muted">Create a campaign when your audience is ready.</p><Link href="/dashboard/crm/campaigns" className="mt-3 inline-flex text-xs font-bold text-primary hover:underline">Open campaigns <IconArrowRight className="ml-1 h-4 w-4" /></Link></div>}
      </Card>

      <Card className="overflow-hidden p-0">
        <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-4"><div><h2 className="font-bold text-foreground">Website lead sources</h2><p className="mt-1 text-xs text-muted">Lead volume captured by connected websites.</p></div><Link href="/dashboard/crm/companies" className="text-xs font-semibold text-primary hover:underline">Manage websites</Link></div>
        {websites.length ? <div className="divide-y divide-border">{websites.slice(0, 5).map((website) => <div key={website.id} className="flex items-center justify-between gap-4 px-5 py-3.5"><div className="min-w-0"><p className="truncate text-sm font-semibold text-foreground">{website.name}</p><p className="mt-1 truncate text-xs text-muted">{website.company_name} · {website.website_url}</p></div><span className="shrink-0 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-primary">{number(website.leads)} leads</span></div>)}</div> : <div className="px-5 py-10 text-center"><p className="text-sm font-semibold text-foreground">No websites in this scope</p><p className="mt-1 text-xs text-muted">Connect a website to see incoming lead activity.</p></div>}
      </Card>
    </section>

    <section className="mt-8 mb-6" aria-labelledby="company-workspaces-title">
      <div className="mb-4 flex items-end justify-between gap-3"><div><h2 id="company-workspaces-title" className="text-lg font-bold text-foreground">Company workspaces</h2><p className="mt-1 text-sm text-muted">Jump into a company record.</p></div><Link href="/dashboard/crm/companies" className="text-sm font-semibold text-primary hover:underline">Manage companies</Link></div>
      {companies.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{companies.slice(0, 6).map((company) => <Link key={company.id} href="/dashboard/crm/companies" className="flex items-center justify-between gap-3 rounded-xl border border-border bg-white px-4 py-3.5 transition hover:border-primary/35 hover:bg-primary-soft/20"><div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-slate-50 text-slate-700"><IconBuilding className="h-4 w-4" /></span><span className="truncate text-sm font-semibold text-foreground">{company.name}</span></div><Badge tone={company.status === "active" ? "success" : "neutral"}>{company.status}</Badge></Link>)}</div> : <Card className="p-8 text-center"><p className="font-semibold text-foreground">No companies found</p><p className="mt-1 text-sm text-muted">Create a CRM company workspace to get started.</p><Link href="/dashboard/crm/companies" className="mt-4 inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-white"><IconPlus className="h-4 w-4" />Add company</Link></Card>}
    </section>
  </>;
}