"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { IconArrowRight, IconBuilding, IconEdit, IconMail, IconRefresh } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

type Contact = {
  id: number;
  company_id: number;
  full_name: string;
  email: string;
  phone: string | null;
  status: string;
  source: string | null;
  custom_data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  crm_companies?: { name: string } | null;
  crm_contact_tag_links?: Array<{ crm_contact_tags?: { id: number; name: string } | null }>;
  crm_contact_list_members?: Array<{ contact_list_id: number; crm_contact_lists?: { id: number; name: string } | null }>;
};

type EmailEvent = { id: number; event_type: string; event_time: string; metadata: Record<string, unknown> };
type CampaignMessage = {
  id: number;
  status: string;
  sent_at: string | null;
  scheduled_at: string;
  error_message: string | null;
  attempt_count: number;
  events: EmailEvent[];
};
type CampaignHistory = {
  id: number;
  status: string;
  created_at: string;
  campaign: { id: number; name: string; subject: string | null; status: string } | null;
  messages: CampaignMessage[];
};
type TimelineEvent = { id: number; event_type: string; event_data: Record<string, unknown>; created_at: string };
type Profile = { contact: Contact; campaigns: CampaignHistory[]; timeline: TimelineEvent[] };

function formatDate(value?: string | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : new Intl.DateTimeFormat("en", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

function eventTone(status: string): "success" | "warning" | "danger" | "neutral" {
  if (["sent", "delivered", "opened", "clicked", "replied"].includes(status)) return "success";
  if (["failed", "bounced", "complained"].includes(status)) return "danger";
  if (["queued", "processing"].includes(status)) return "warning";
  return "neutral";
}

export default function ContactProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load(id: string) {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/crm/contacts/${id}/profile`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load contact profile.");
      setProfile(result);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load contact profile.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    params.then(({ id }) => {
      if (!cancelled) void load(id);
    }).catch((cause) => {
      if (!cancelled) {
        setError(cause instanceof Error ? cause.message : "Could not load contact profile.");
        setLoading(false);
      }
    });
    return () => { cancelled = true; };
  }, [params]);

  if (loading) return <div className="p-8"><EmptyState text="Loading contact profile…" /></div>;
  if (error || !profile) return <div><PageHeader eyebrow="Business CRM / Contacts" title="Contact profile" /><Alert tone="danger">{error || "Contact was not found."}</Alert><Link className="mt-5 inline-block text-sm font-semibold text-primary hover:underline" href="/dashboard/crm/contacts">Back to contacts</Link></div>;

  const { contact, campaigns, timeline } = profile;
  const messages = campaigns.flatMap((campaign) => campaign.messages);
  const countEvents = (eventType: string) => messages.filter((message) => message.events.some((event) => event.event_type === eventType)).length;
  const sentCount = messages.filter((message) => message.sent_at || ["sent", "delivered", "opened", "clicked", "replied"].includes(message.status)).length;
  const deliveredCount = messages.filter((message) => message.events.some((event) => event.event_type === "delivered") || ["delivered", "opened", "clicked", "replied"].includes(message.status)).length;
  const bouncedCount = messages.filter((message) => message.events.some((event) => event.event_type === "bounced") || message.status === "bounced").length;
  const customFields = Object.entries(contact.custom_data ?? {}).filter(([, value]) => value !== null && value !== "");

  return <div className="space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Link href="/dashboard/crm/contacts" className="inline-flex items-center gap-2 text-sm font-semibold text-muted transition hover:text-primary"><IconArrowRight className="h-4 w-4 rotate-180" />Back to contacts</Link>
      <Button variant="secondary" onClick={() => void load(String(contact.id))}><IconRefresh className="h-4 w-4" />Refresh profile</Button>
    </div>
    <section className="relative overflow-hidden rounded-[2rem] bg-[#211b27] px-6 py-7 text-white shadow-[0_25px_60px_rgba(40,24,38,0.16)] sm:px-9 sm:py-9">
      <div className="pointer-events-none absolute -right-12 -top-32 h-80 w-80 rounded-full bg-rose-400/20 blur-3xl" />
      <div className="relative flex flex-col justify-between gap-6 md:flex-row md:items-center">
        <div className="flex min-w-0 items-center gap-5">
          <span className="grid h-20 w-20 shrink-0 place-items-center rounded-[1.7rem] border border-white/20 bg-white/10 text-2xl font-bold text-rose-100">{contact.full_name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-rose-200">CONTACT PROFILE</p>
            <h1 className="mt-2 truncate text-3xl font-bold tracking-tight sm:text-4xl">{contact.full_name}</h1>
            <p className="mt-2 break-all text-sm text-white/65">{contact.email}{contact.phone ? ` · ${contact.phone}` : ""}</p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Badge tone={contact.status === "active" ? "success" : contact.status === "archived" ? "neutral" : "warning"}>{contact.status}</Badge>
              <span className="inline-flex items-center gap-1.5 text-xs text-white/60"><IconBuilding className="h-3.5 w-3.5" />{contact.crm_companies?.name ?? "Company not set"}</span>
            </div>
          </div>
        </div>
        <Link href={`/dashboard/crm/contacts?edit=${contact.id}`} className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 text-sm font-semibold text-[#2c202b] transition hover:bg-rose-50"><IconEdit className="h-4 w-4" />Edit contact</Link>
      </div>
    </section>

    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
      {[
        { label: "Campaigns", value: campaigns.length, help: "campaigns this contact entered" },
        { label: "Emails sent", value: sentCount, help: "tracked campaign messages" },
        { label: "Delivered", value: deliveredCount, help: "messages confirmed delivered" },
        { label: "Opened", value: countEvents("opened"), help: "messages with an open event" },
        { label: "Clicked", value: countEvents("clicked"), help: "messages with a click event" },
        { label: "Bounced", value: bouncedCount, help: "messages not delivered" },
      ].map((metric) => <Card key={metric.label} className="relative overflow-hidden">
        <span className="absolute right-0 top-0 h-20 w-20 rounded-bl-full bg-primary-soft/70" />
        <p className="relative text-sm font-medium text-muted">{metric.label}</p><p className="relative mt-3 text-3xl font-bold tracking-tight">{metric.value.toLocaleString()}</p><p className="relative mt-1 text-xs text-muted">{metric.help}</p>
      </Card>)}
    </section>

    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(300px,0.8fr)]">
      <Card className="overflow-hidden p-0">
        <div className="border-b border-border px-5 py-5 sm:px-6">
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">EMAIL ENGAGEMENT</p>
          <h2 className="mt-1 text-xl font-bold">Campaign history</h2>
          <p className="mt-1 text-sm text-muted">What was sent to this contact and how they interacted.</p>
        </div>
        {campaigns.length ? <div className="divide-y divide-border">{campaigns.map((item) => {
          const campaignMessages = item.messages;
          const latestSent = campaignMessages.find((message) => message.sent_at)?.sent_at;
          const opened = campaignMessages.some((message) => message.events.some((event) => event.event_type === "opened")) || campaignMessages.some((message) => message.status === "opened" || message.status === "clicked");
          const clicked = campaignMessages.some((message) => message.events.some((event) => event.event_type === "clicked")) || campaignMessages.some((message) => message.status === "clicked");
          const currentStatus = campaignMessages[0]?.status ?? item.status;
          const totalAttempts = campaignMessages.reduce((attempts, message) => attempts + message.attempt_count, 0);
          return <article key={item.id} className="px-5 py-5 transition hover:bg-[#fffdfc] sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                {item.campaign ? <Link href={`/dashboard/crm/campaigns/${item.campaign.id}?company_id=${contact.company_id}`} className="font-bold hover:text-primary">{item.campaign.name}</Link> : <h3 className="font-bold">Campaign</h3>}
                <p className="mt-1 text-sm text-muted">{item.campaign?.subject || "No subject recorded"}</p>
              </div>
              <Badge tone={eventTone(currentStatus)}>{currentStatus}</Badge>
            </div>
            <div className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
              <div className="rounded-xl bg-[#fbf9f8] p-3"><p className="text-muted">Sent</p><p className="mt-1 font-semibold">{formatDate(latestSent)}</p></div>
              <div className="rounded-xl bg-[#fbf9f8] p-3"><p className="text-muted">Opened</p><p className={`mt-1 font-semibold ${opened ? "text-emerald-700" : ""}`}>{opened ? formatDate(campaignMessages.flatMap((message) => message.events).find((event) => event.event_type === "opened")?.event_time) : "Not opened"}</p></div>
              <div className="rounded-xl bg-[#fbf9f8] p-3"><p className="text-muted">Clicked</p><p className={`mt-1 font-semibold ${clicked ? "text-emerald-700" : ""}`}>{clicked ? formatDate(campaignMessages.flatMap((message) => message.events).find((event) => event.event_type === "clicked")?.event_time) : "No click recorded"}</p></div>
            </div>
            <p className="mt-3 text-xs text-muted">Added to campaign {formatDate(item.created_at)}{campaignMessages.length ? ` · ${campaignMessages.length} message record${campaignMessages.length === 1 ? "" : "s"} · ${totalAttempts} total send attempt${totalAttempts === 1 ? "" : "s"}` : ""}</p>
            {campaignMessages.some((message) => message.error_message) ? <p className="mt-3 text-xs text-rose-700">Delivery issue: {campaignMessages.find((message) => message.error_message)?.error_message}</p> : null}
            {campaignMessages.flatMap((message) => message.events).length ? <details className="mt-3">
              <summary className="cursor-pointer text-xs font-semibold text-primary">View all email events ({campaignMessages.flatMap((message) => message.events).length})</summary>
              <div className="mt-3 space-y-2">{campaignMessages.flatMap((message) => message.events).map((event) => <div key={event.id} className="rounded-lg border border-border/70 px-3 py-2 text-xs"><div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold capitalize">{event.event_type}</span><span className="text-muted">{formatDate(event.event_time)}</span></div>{Object.entries(event.metadata ?? {}).length ? <p className="mt-1 break-all text-muted">{Object.entries(event.metadata).map(([key, value]) => `${key.replaceAll("_", " ")}: ${typeof value === "object" ? JSON.stringify(value) : String(value)}`).join(" · ")}</p> : null}</div>)}</div>
            </details> : null}
          </article>;
        })}</div> : <div className="p-7 text-center"><IconMail className="mx-auto h-8 w-8 text-stone-300" /><p className="mt-3 font-semibold">No campaign activity yet</p><p className="mt-1 text-sm text-muted">When this contact is included in campaigns, delivery and engagement will appear here.</p></div>}
      </Card>

      <div className="space-y-6">
        <Card>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">CONTACT INFORMATION</p>
          <h2 className="mt-1 text-lg font-bold">Details</h2>
          <dl className="mt-4 divide-y divide-border">
            {[
              ["Email address", contact.email],
              ["Phone number", contact.phone || "Not provided"],
              ["Company", contact.crm_companies?.name ?? "Not provided"],
              ["Source", contact.source || "Not recorded"],
              ["Added", formatDate(contact.created_at)],
              ["Last updated", formatDate(contact.updated_at)],
            ].map(([label, value]) => <div key={label} className="flex flex-col gap-1 py-3 sm:flex-row sm:justify-between"><dt className="text-xs text-muted">{label}</dt><dd className="break-all text-sm font-medium sm:max-w-[65%] sm:text-right">{value}</dd></div>)}
          </dl>
        </Card>

        <Card>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">ORGANIZATION</p>
          <h2 className="mt-1 text-lg font-bold">Lists & tags</h2>
          <div className="mt-4"><p className="mb-2 text-xs font-semibold text-muted">CONTACT LISTS</p><div className="flex flex-wrap gap-2">{(contact.crm_contact_list_members ?? []).map((item) => item.crm_contact_lists ? <Badge key={item.contact_list_id} tone="neutral">{item.crm_contact_lists.name}</Badge> : null)}{!contact.crm_contact_list_members?.length ? <span className="text-sm text-muted">No lists</span> : null}</div></div>
          <div className="mt-5"><p className="mb-2 text-xs font-semibold text-muted">TAGS</p><div className="flex flex-wrap gap-2">{(contact.crm_contact_tag_links ?? []).map((item) => item.crm_contact_tags ? <Badge key={item.crm_contact_tags.id} tone="primary">{item.crm_contact_tags.name}</Badge> : null)}{!contact.crm_contact_tag_links?.length ? <span className="text-sm text-muted">No tags</span> : null}</div></div>
        </Card>

        {customFields.length ? <Card>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">EXTRA DATA</p><h2 className="mt-1 text-lg font-bold">Custom fields</h2>
          <dl className="mt-3 divide-y divide-border">{customFields.map(([key, value]) => <div key={key} className="py-3"><dt className="text-xs capitalize text-muted">{key.replaceAll("_", " ")}</dt><dd className="mt-1 break-words text-sm font-medium">{typeof value === "object" ? JSON.stringify(value) : String(value)}</dd></div>)}</dl>
        </Card> : null}

        <Card>
          <p className="text-xs font-bold uppercase tracking-[0.15em] text-primary">CONTACT TIMELINE</p><h2 className="mt-1 text-lg font-bold">Recent activity</h2>
          {timeline.length ? <ol className="mt-4 space-y-4 border-l border-border pl-4">{timeline.map((event) => <li key={event.id} className="relative"><span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-primary ring-1 ring-primary/20" /><p className="text-sm font-semibold capitalize">{event.event_type.replaceAll("_", " ")}</p><p className="mt-1 text-xs text-muted">{formatDate(event.created_at)}</p>{Object.keys(event.event_data ?? {}).length ? <p className="mt-1 break-words text-xs text-muted">{Object.entries(event.event_data).map(([key, value]) => `${key.replaceAll("_", " ")}: ${String(value)}`).join(" · ")}</p> : null}</li>)}</ol> : <p className="mt-4 text-sm text-muted">No other activity recorded.</p>}
        </Card>
      </div>
    </div>
  </div>;
}
