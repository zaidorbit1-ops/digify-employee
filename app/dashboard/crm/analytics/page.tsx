"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, SelectInput } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";

type Company = { id: number; name: string; status: string };
type Campaign = { id: number; company_id: number; name: string; status: string };
type Website = { id: number; name: string; website_url: string; company_name: string; leads: number };
type Summary = { leads_today: number; leads_month: number; new_contacts: number; campaigns_running: number; emails_sent: number; failed_emails: number; delivery_rate: number; open_rate: number; clicks: number; replies: number };
const emptySummary: Summary = { leads_today: 0, leads_month: 0, new_contacts: 0, campaigns_running: 0, emails_sent: 0, failed_emails: 0, delivery_rate: 0, open_rate: 0, clicks: 0, replies: 0 };

export default function CrmAnalyticsPage() {
  const [companies, setCompanies] = useState<Company[]>([]); const [companyId, setCompanyId] = useState("all"); const [campaigns, setCampaigns] = useState<Campaign[]>([]); const [websites, setWebsites] = useState<Website[]>([]); const [summary, setSummary] = useState<Summary>(emptySummary); const [loading, setLoading] = useState(false); const [message, setMessage] = useState<string | null>(null);
  async function load() { setLoading(true); setMessage(null); try { const response = await fetch(`/api/crm/command-center?company_id=${companyId}`, { cache: "no-store" }); const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Could not load command center."); setCompanies(result.companies ?? []); setSummary(result.summary ?? emptySummary); setCampaigns(result.campaigns ?? []); setWebsites(result.website_stats ?? []); } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load command center."); } finally { setLoading(false); } }
  useEffect(() => { load(); }, [companyId]);
  const cards: [keyof Summary, string, string][] = [["leads_today", "Leads today", ""], ["leads_month", "Leads this month", ""], ["new_contacts", "New contacts", ""], ["campaigns_running", "Campaigns running", ""], ["emails_sent", "Emails sent", ""], ["delivery_rate", "Delivery rate", "%"], ["open_rate", "Tracked open rate", "%"], ["clicks", "Clicks", ""], ["replies", "Replies", ""], ["failed_emails", "Failed emails", ""]];
  return <>
    <PageHeader eyebrow="Business CRM / Command Center" title="CRM command center" description="Company-level and global Superadmin visibility across leads, contacts, campaigns, websites, and measured email activity." actions={<Button variant="secondary" loading={loading} onClick={load}>Refresh</Button>} />
    {message ? <div className="mb-5"><Alert tone="danger">{message}</Alert></div> : null}
    <Card className="mb-5"><Field label="Company scope"><SelectInput value={companyId} onChange={(event) => setCompanyId(event.target.value)}><option value="all">All companies</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</SelectInput></Field></Card>
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{cards.map(([key, label, suffix]) => <Card key={key} className="p-4"><p className="text-xs font-semibold uppercase tracking-[0.13em] text-muted">{label}</p><p className="mt-3 text-2xl font-bold">{summary[key]}{suffix}</p></Card>)}</div>
    <div className="mt-5 grid gap-5 xl:grid-cols-2"><Card className="overflow-hidden p-0"><div className="border-b border-border px-5 py-4"><h2 className="font-bold">Campaign activity</h2><p className="mt-1 text-sm text-muted">Every row retains its company label.</p></div>{campaigns.length ? <div className="divide-y divide-border">{campaigns.map((campaign) => <div key={campaign.id} className="flex items-center justify-between gap-3 px-5 py-4"><div><p className="font-semibold">{campaign.name}</p><p className="mt-1 text-xs text-muted">{companies.find((company) => company.id === campaign.company_id)?.name ?? "Unknown company"}</p></div><Badge tone={campaign.status === "running" ? "success" : "neutral"}>{campaign.status}</Badge></div>)}</div> : <p className="p-8 text-sm text-muted">No campaign activity yet.</p>}</Card><Card className="overflow-hidden p-0"><div className="border-b border-border px-5 py-4"><h2 className="font-bold">Website performance</h2><p className="mt-1 text-sm text-muted">Lead volume by company website.</p></div>{websites.length ? <div className="divide-y divide-border">{websites.map((website) => <div key={website.id} className="flex items-center justify-between gap-3 px-5 py-4"><div className="min-w-0"><p className="truncate font-semibold">{website.name}</p><p className="mt-1 truncate text-xs text-muted">{website.company_name} · {website.website_url}</p></div><span className="shrink-0 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-bold text-primary">{website.leads} leads</span></div>)}</div> : <p className="p-8 text-sm text-muted">No website performance data yet.</p>}</Card></div>
    <p className="mt-4 text-xs leading-5 text-muted">Delivery and open rates are based on recorded provider/tracking events. Open tracking is not a guaranteed human-read signal.</p>
  </>;
}
