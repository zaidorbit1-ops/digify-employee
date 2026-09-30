"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { IconArrowRight, IconRefresh } from "@/components/icons";
import { Alert, EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

type Campaign = { id: number; company_id: number; name: string; status: string; subject: string | null; schedule_at: string | null; batch_size: number; interval_seconds: number; crm_email_templates?: { name?: string; subject?: string } | null; crm_mailboxes?: { email_address?: string } | null; crm_contact_lists?: { name?: string } | null };
type Message = { id: number; status: string; error_message: string | null; sent_at: string | null; scheduled_at: string; next_attempt_at: string | null; attempt_count: number; provider_message_id: string | null; updated_at: string };
type Event = { id: number; event_type: string; event_time: string; metadata: Record<string, unknown> };
type Recipient = { id: number; contact_id: number; status: string; crm_contacts?: { full_name: string | null; email: string } | null; messages: Message[]; events: Event[] };
type Summary = { recipients: number; sent: number; pending: number; queued: number; processing: number; failed: number; delivered: number; bounced: number; opened: number; clicked: number; replied: number; unsubscribed: number };
type Report = { campaigns: { id: number; name: string; status: string; company_id: number }[]; summary: Summary; recipients: Recipient[] };

const emptySummary: Summary = { recipients: 0, sent: 0, pending: 0, queued: 0, processing: 0, failed: 0, delivered: 0, bounced: 0, opened: 0, clicked: 0, replied: 0, unsubscribed: 0 };

function date(value?: string | null) {
  if (!value) return "Not yet";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "Not available" : new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(parsed);
}

function tone(status: string): "success" | "warning" | "danger" | "neutral" | "primary" {
  if (["sent", "delivered", "completed", "opened", "clicked"].includes(status)) return "success";
  if (["failed", "bounced", "complained"].includes(status)) return "danger";
  if (["queued", "processing", "running", "scheduled"].includes(status)) return "warning";
  return "neutral";
}

export default function CampaignDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ company_id?: string }> }) {
  const [campaignId, setCampaignId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadReport(id: string, company: string, quiet = false) {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const [campaignResponse, reportResponse] = await Promise.all([
        fetch(`/api/crm/campaigns?company_id=${company}`, { cache: "no-store" }),
        fetch(`/api/crm/analytics?company_id=${company}&campaign_id=${id}`, { cache: "no-store" }),
      ]);
      const campaignResult = await campaignResponse.json();
      const reportResult = await reportResponse.json();
      if (!campaignResponse.ok) throw new Error(campaignResult.error ?? "Could not load campaign.");
      if (!reportResponse.ok) throw new Error(reportResult.error ?? "Could not load campaign report.");
      const found = (campaignResult.campaigns ?? []).find((item: Campaign) => String(item.id) === id);
      if (!found) throw new Error("Campaign was not found in this company.");
      setCampaign(found);
      setSummary({ ...emptySummary, ...(reportResult.summary ?? {}) });
      setRecipients(reportResult.recipients ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load campaign report.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([params, searchParams]).then(([route, query]) => {
      if (cancelled) return;
      const id = route.id;
      const company = query.company_id ?? "";
      if (!/^\d+$/.test(id) || !/^\d+$/.test(company)) {
        setError("Campaign or company is missing from this report link.");
        setLoading(false);
        return;
      }
      setCampaignId(id);
      setCompanyId(company);
      void loadReport(id, company);
    }).catch((cause) => {
      if (!cancelled) {
        setError(cause instanceof Error ? cause.message : "Could not load campaign report.");
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [params, searchParams]);

  useEffect(() => {
    if (campaign?.status !== "running" || !campaignId || !companyId) return;
    const timer = window.setInterval(() => { void loadReport(campaignId, companyId, true); }, 15000);
    return () => window.clearInterval(timer);
  }, [campaign?.status, campaignId, companyId]);

  if (loading) return <div className="p-8"><EmptyState text="Loading campaign delivery report..." /></div>;

  const cards: [keyof Summary, string][] = [
    ["recipients", "Recipients"], ["queued", "Queued"], ["processing", "Processing"], ["sent", "Sent"], ["failed", "Failed"],
    ["delivered", "Delivered"], ["bounced", "Bounced"], ["opened", "Opened"], ["clicked", "Clicked"], ["replied", "Replied"],
  ];

  return <>
    <PageHeader eyebrow="Business CRM / Campaign report" title={campaign?.name ?? "Campaign report"} description="Recipient-by-recipient delivery status, retry history, and failure details." actions={<div className="flex gap-2"><Button variant="secondary" loading={refreshing} onClick={() => void loadReport(campaignId, companyId, true)}><IconRefresh className="h-4 w-4" />Refresh</Button><Link href="/dashboard/crm/campaigns" className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-muted hover:text-foreground"><IconArrowRight className="h-4 w-4 rotate-180" />Campaigns</Link></div>} />
    {error ? <div className="mb-5"><Alert tone="danger">{error}</Alert></div> : null}
    {campaign ? <>
      <Card className="mb-5"><div className="flex flex-wrap items-center justify-between gap-4"><div><div className="flex flex-wrap items-center gap-3"><Badge tone={tone(campaign.status)}>{campaign.status}</Badge><span className="text-sm text-muted">{campaign.crm_email_templates?.name ?? "Template"} · {campaign.crm_mailboxes?.email_address ?? "Sender unavailable"}</span></div><p className="mt-3 text-sm font-semibold">{campaign.subject || campaign.crm_email_templates?.subject || "No subject"}</p><p className="mt-1 text-xs text-muted">Audience: {campaign.crm_contact_lists?.name ?? "Selected campaign audience"} · {campaign.schedule_at ? `Started/scheduled ${date(campaign.schedule_at)}` : "No start time recorded"}</p></div><span className="text-right text-xs text-muted">Batch {campaign.batch_size} every {campaign.interval_seconds}s</span></div></Card>
  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">{cards.map(([key, label]) => <Card key={key} className="p-4"><p className="text-xs font-semibold uppercase text-muted">{label}</p><p className="mt-2 text-2xl font-bold">{summary[key]}</p></Card>)}</div>
      <Card className="mt-5 overflow-hidden p-0"><div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="font-semibold">Recipient delivery</h2><p className="mt-1 text-xs text-muted">Refreshes every 15 seconds while the campaign is running.</p></div><span className="text-xs text-muted">{recipients.length} rows</span></div>{!recipients.length ? <div className="p-8"><Alert tone="info">No recipients have been queued. Check that the campaign audience contains active contacts and that the latest campaign Edge Function and database changes are deployed.</Alert></div> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-[#f7f9f7] text-xs uppercase text-muted"><tr><th className="px-5 py-3">Recipient</th><th className="px-5 py-3">Status</th><th className="px-5 py-3">Last attempt</th><th className="px-5 py-3">Sent</th><th className="px-5 py-3">Failure</th><th className="px-5 py-3">History</th></tr></thead><tbody>{recipients.map((recipient) => {
        const latest = [...(recipient.messages ?? [])].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];
        return <tr key={recipient.id} className="border-t border-border align-top"><td className="px-5 py-4"><p className="font-semibold">{recipient.crm_contacts?.full_name || "Unknown contact"}</p><p className="mt-1 text-xs text-muted">{recipient.crm_contacts?.email || "No email"}</p></td><td className="px-5 py-4"><Badge tone={tone(recipient.status)}>{recipient.status}</Badge>{latest ? <p className="mt-1 text-xs text-muted">Message: {latest.status}</p> : null}</td><td className="px-5 py-4 text-xs text-muted">{latest?.attempt_count ?? 0} attempt{latest?.attempt_count === 1 ? "" : "s"}<p className="mt-1">Next: {date(latest?.next_attempt_at)}</p></td><td className="px-5 py-4 text-xs text-muted">{date(latest?.sent_at)}</td><td className="max-w-[320px] px-5 py-4 text-xs text-rose-700">{latest?.error_message || "No delivery error recorded"}</td><td className="px-5 py-4"><details className="max-w-[360px]"><summary className="cursor-pointer text-xs font-semibold text-primary">{recipient.messages?.length ?? 0} message(s) · {recipient.events?.length ?? 0} event(s)</summary><div className="mt-3 space-y-3">{(recipient.messages ?? []).map((message) => <div key={message.id} className="rounded-lg bg-[#f7f9f7] p-3 text-xs"><div className="flex justify-between gap-2"><Badge tone={tone(message.status)}>{message.status}</Badge><span className="text-muted">{message.attempt_count} attempt{message.attempt_count === 1 ? "" : "s"}</span></div><p className="mt-2 text-muted">Scheduled: {date(message.scheduled_at)}</p><p className="mt-1 text-muted">Updated: {date(message.updated_at)}</p>{message.error_message ? <p className="mt-2 break-words text-rose-700">{message.error_message}</p> : null}</div>)}{(recipient.events ?? []).map((event) => <p key={event.id} className="text-xs text-muted">{event.event_type} · {date(event.event_time)}</p>)}</div></details></td></tr>;
      })}</tbody></table></div>}</Card>
    </> : null}
  </>;
}
