"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { IconArrowRight, IconBell, IconCheckCircle, IconClock, IconClose, IconEmployees, IconGlobe, IconMail, IconRefresh, IconSearch } from "@/components/icons";
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

function recipientMatchesMetric(recipient: Recipient, metric: keyof Summary) {
  if (metric === "recipients") return true;
  const statuses = (recipient.messages ?? []).map((message) => message.status);
  const eventTypes = new Set((recipient.events ?? []).map((event) => event.event_type));
  if (metric === "queued" || metric === "processing" || metric === "sent" || metric === "failed") {
    return recipient.status === metric || statuses.includes(metric);
  }
  return eventTypes.has(metric) || statuses.includes(metric);
}

export default function CampaignDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ company_id?: string }> }) {
  const [campaignId, setCampaignId] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [selectedMetric, setSelectedMetric] = useState<keyof Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadReport(id: string, company: string, quiet = false, syncBounces = false) {
    if (quiet) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      if (syncBounces) {
        const syncResponse = await fetch("/api/crm/analytics", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ company_id: Number(company), campaign_id: Number(id) }),
        });
        const syncResult = await syncResponse.json();
        if (!syncResponse.ok) throw new Error(syncResult.error ?? "Could not synchronize bounce notifications.");
      }
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
      void loadReport(id, company, false, true);
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

  const visibleRecipients = selectedMetric ? recipients.filter((recipient) => recipientMatchesMetric(recipient, selectedMetric)) : recipients;

  const cards: { key: keyof Summary; label: string; icon: typeof IconEmployees; style: string; stripe: string; iconStyle: string }[] = [
    { key: "recipients", label: "Recipients", icon: IconEmployees, style: "border-sky-200 from-white to-sky-50/70", stripe: "bg-sky-500", iconStyle: "bg-sky-100 text-sky-700 ring-sky-200/80" },
    { key: "queued", label: "Queued", icon: IconClock, style: "border-amber-200 from-white to-amber-50/70", stripe: "bg-amber-500", iconStyle: "bg-amber-100 text-amber-700 ring-amber-200/80" },
    { key: "processing", label: "Processing", icon: IconRefresh, style: "border-cyan-200 from-white to-cyan-50/70", stripe: "bg-cyan-500", iconStyle: "bg-cyan-100 text-cyan-700 ring-cyan-200/80" },
    { key: "sent", label: "Sent", icon: IconMail, style: "border-emerald-200 from-white to-emerald-50/70", stripe: "bg-emerald-500", iconStyle: "bg-emerald-100 text-emerald-700 ring-emerald-200/80" },
    { key: "failed", label: "Failed", icon: IconClose, style: "border-rose-200 from-white to-rose-50/70", stripe: "bg-rose-500", iconStyle: "bg-rose-100 text-rose-700 ring-rose-200/80" },
    { key: "delivered", label: "Delivered", icon: IconCheckCircle, style: "border-teal-200 from-white to-teal-50/70", stripe: "bg-teal-500", iconStyle: "bg-teal-100 text-teal-700 ring-teal-200/80" },
    { key: "bounced", label: "Bounced", icon: IconGlobe, style: "border-orange-200 from-white to-orange-50/70", stripe: "bg-orange-500", iconStyle: "bg-orange-100 text-orange-700 ring-orange-200/80" },
    { key: "opened", label: "Opened", icon: IconSearch, style: "border-indigo-200 from-white to-indigo-50/70", stripe: "bg-indigo-500", iconStyle: "bg-indigo-100 text-indigo-700 ring-indigo-200/80" },
    { key: "clicked", label: "Clicked", icon: IconArrowRight, style: "border-lime-200 from-white to-lime-50/70", stripe: "bg-lime-500", iconStyle: "bg-lime-100 text-lime-700 ring-lime-200/80" },
    { key: "replied", label: "Replied", icon: IconBell, style: "border-pink-200 from-white to-pink-50/70", stripe: "bg-pink-500", iconStyle: "bg-pink-100 text-pink-700 ring-pink-200/80" },
  ];

  return <>
    <div className="space-y-6 pb-10">
      <PageHeader
        eyebrow="Business CRM / Campaign report"
        title={campaign?.name ?? "Campaign report"}
        description="Recipient-by-recipient delivery status, retry history, and failure details."
        actions={
          <div className="flex gap-2">
            <Button variant="secondary" loading={refreshing} onClick={() => void loadReport(campaignId, companyId, true, true)} className="rounded-xl bg-white/90 shadow-sm">
              <IconRefresh className="h-4 w-4" />
              Refresh
            </Button>
            <Link href="/dashboard/crm/campaigns" className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm font-semibold text-muted shadow-sm transition hover:border-primary/20 hover:text-foreground">
              <IconArrowRight className="h-4 w-4 rotate-180" />
              Campaigns
            </Link>
          </div>
        }
      />

      {error ? <div className="mb-2"><Alert tone="danger">{error}</Alert></div> : null}

      {campaign ? <>
        <Card className="relative isolate overflow-hidden border-0 bg-gradient-to-br from-[#d94e4e] via-[#e85c50] to-[#f18452] p-0 text-white shadow-[0_20px_45px_rgba(192,70,62,0.2)]">
          <div className="absolute -right-12 -top-20 -z-10 h-64 w-64 rounded-full border-[36px] border-white/10" />
          <div className="absolute right-24 top-24 -z-10 h-24 w-24 rounded-full bg-amber-300/20 blur-2xl" />
          <div className="flex flex-wrap items-center justify-between gap-6 p-6 sm:p-8">
            <div className="flex min-w-0 flex-1 items-start gap-4">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl border border-white/25 bg-white/15 shadow-inner backdrop-blur-sm">
                <IconMail className="h-7 w-7" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <Badge tone={tone(campaign.status)} className="!bg-white !px-3 !py-1.5 !text-emerald-700">{campaign.status}</Badge>
                  <span className="text-sm font-medium text-white/85">{campaign.crm_email_templates?.name ?? "Template"}</span>
                </div>
                <p className="mt-3 text-xl font-bold text-white">{campaign.subject || campaign.crm_email_templates?.subject || "No subject"}</p>
                <p className="mt-1 break-all text-sm text-white/80">{campaign.crm_mailboxes?.email_address ?? "Sender unavailable"}</p>
                <p className="mt-3 text-xs text-white/75">Audience: {campaign.crm_contact_lists?.name ?? "Selected campaign audience"} · {campaign.schedule_at ? `Started/scheduled ${date(campaign.schedule_at)}` : "No start time recorded"}</p>
              </div>
            </div>

            <div className="flex items-center gap-3 rounded-xl border border-white/25 bg-black/10 px-4 py-3 backdrop-blur-sm">
              <IconClock className="h-5 w-5 text-white/90" />
              <div>
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-white/70">Batch schedule</p>
                <p className="mt-1 text-sm font-semibold text-white">{campaign.batch_size} every {campaign.interval_seconds}s</p>
              </div>
            </div>
          </div>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {cards.map(({ key, label, icon: MetricIcon, style, stripe, iconStyle }) => (
            <button
              key={key}
              type="button"
              aria-pressed={selectedMetric === key}
              onClick={() => {
                setSelectedMetric((current) => current === key ? null : key);
                requestAnimationFrame(() => document.getElementById("recipient-delivery")?.scrollIntoView({ behavior: "smooth", block: "start" }));
              }}
              className={`group relative overflow-hidden rounded-2xl border bg-gradient-to-br ${style} p-4 text-left shadow-[0_10px_25px_rgba(15,23,42,0.04)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_18px_35px_rgba(15,23,42,0.09)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary ${selectedMetric === key ? "ring-2 ring-primary ring-offset-2" : ""}`}
            >
              <div className={`absolute inset-x-0 top-0 h-1 ${stripe}`} />
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-[0.17em] text-stone-500">{label}</p>
                  <p className="mt-3 text-3xl font-bold tracking-tight text-stone-900">{summary[key]}</p>
                </div>
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ring-1 ${iconStyle}`}>
                  <MetricIcon className="h-5 w-5" />
                </span>
              </div>
            </button>
          ))}
        </div>

        <div id="recipient-delivery" className="scroll-mt-6">
        <Card className="overflow-hidden border-stone-200 bg-white/90 p-0 shadow-[0_14px_40px_rgba(17,24,39,0.04)]">
          <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50/70 px-5 py-4">
            <div>
              <h2 className="text-lg font-semibold text-stone-900">{selectedMetric ? `${cards.find((card) => card.key === selectedMetric)?.label} recipients` : "Recipient delivery"}</h2>
              <p className="mt-1 text-xs text-stone-500">Refreshes every 15 seconds while the campaign is running.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-600">{visibleRecipients.length} of {recipients.length}</span>
              {selectedMetric ? <button type="button" onClick={() => setSelectedMetric(null)} className="text-xs font-semibold text-primary hover:underline">Clear filter</button> : null}
            </div>
          </div>

          {!recipients.length ? (
            <div className="p-8">
              <Alert tone="info">No recipients have been queued. Check that the campaign audience contains active contacts and that the latest campaign Edge Function and database changes are deployed.</Alert>
            </div>
          ) : !visibleRecipients.length ? (
            <div className="p-8 text-center text-sm text-stone-500">No recipients match this campaign outcome.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-stone-50 text-[11px] font-bold uppercase tracking-[0.18em] text-stone-500">
                  <tr>
                    <th className="px-5 py-3">Recipient</th>
                    <th className="px-5 py-3">Status</th>
                    <th className="px-5 py-3">Last attempt</th>
                    <th className="px-5 py-3">Sent</th>
                    <th className="px-5 py-3">Failure</th>
                    <th className="px-5 py-3">History</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleRecipients.map((recipient) => {
                    const latest = [...(recipient.messages ?? [])].sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())[0];
                    return (
                      <tr key={recipient.id} className="border-t border-stone-200 align-top transition hover:bg-stone-50/60">
                        <td className="px-5 py-4">
                          <p className="font-semibold text-stone-900">{recipient.crm_contacts?.full_name || "Unknown contact"}</p>
                          <p className="mt-1 text-xs text-stone-500">{recipient.crm_contacts?.email || "No email"}</p>
                        </td>

                        <td className="px-5 py-4">
                          <Badge tone={tone(recipient.status)}>{recipient.status}</Badge>
                          {latest ? <p className="mt-2 text-xs text-stone-500">Message: {latest.status}</p> : null}
                        </td>

                        <td className="px-5 py-4 text-xs text-stone-600">
                          <div className="font-medium">{latest?.attempt_count ?? 0} attempt{latest?.attempt_count === 1 ? "" : "s"}</div>
                          <p className="mt-1 text-stone-500">Next: {date(latest?.next_attempt_at)}</p>
                        </td>

                        <td className="px-5 py-4 text-xs text-stone-600">{date(latest?.sent_at)}</td>

                        <td className="max-w-[320px] px-5 py-4 text-xs text-rose-700">{latest?.error_message || "No delivery error recorded"}</td>

                        <td className="px-5 py-4">
                          <details className="max-w-[360px]">
                            <summary className="cursor-pointer text-xs font-semibold text-primary">{recipient.messages?.length ?? 0} message(s) · {recipient.events?.length ?? 0} event(s)</summary>
                            <div className="mt-3 space-y-3">
                              {(recipient.messages ?? []).map((message) => (
                                <div key={message.id} className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs">
                                  <div className="flex justify-between gap-2">
                                    <Badge tone={tone(message.status)}>{message.status}</Badge>
                                    <span className="text-stone-500">{message.attempt_count} attempt{message.attempt_count === 1 ? "" : "s"}</span>
                                  </div>
                                  <p className="mt-2 text-stone-500">Scheduled: {date(message.scheduled_at)}</p>
                                  <p className="mt-1 text-stone-500">Updated: {date(message.updated_at)}</p>
                                  {message.error_message ? <p className="mt-2 break-words text-rose-700">{message.error_message}</p> : null}
                                </div>
                              ))}
                              {(recipient.events ?? []).map((event) => (
                                <p key={event.id} className="text-xs text-stone-500">{event.event_type} · {date(event.event_time)}</p>
                              ))}
                            </div>
                          </details>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        </div>
      </> : null}
    </div>
  </>;
}
