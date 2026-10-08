"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { IconArrowRight, IconBuilding, IconCheckCircle, IconEmployees, IconRefresh } from "@/components/icons";
import { Alert } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, SelectInput, TextInput } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";

type Company = { id: number; name: string };
type Campaign = { id: number; company_id: number; name: string; status: string };
type Event = { id: number; event_type: string; event_time: string };
type Message = { id: number; status: string };
type Contact = { id: number; full_name: string | null; email: string; status: string };
type Recipient = { contact_id: number; status: string; crm_contacts: Contact | Contact[] | null; messages: Message[]; events: Event[] };
type Outcome = "opened" | "clicked" | "delivered" | "delivered_not_opened" | "opened_not_clicked" | "replied" | "failed";
type SavedAudience = { id: number; name: string; recipient_count: number };

const outcomes: { value: Outcome; label: string; description: string }[] = [
  { value: "opened", label: "Opened", description: "Recipients with an open event." },
  { value: "clicked", label: "Clicked", description: "Recipients with a click event." },
  { value: "delivered", label: "Delivered", description: "Recipients with a delivered event." },
  { value: "delivered_not_opened", label: "Sent, not opened", description: "Sent or delivered, with no recorded open." },
  { value: "opened_not_clicked", label: "Opened, not clicked", description: "Opened the email but did not click a tracked link." },
  { value: "replied", label: "Replied", description: "Recipients with a reply event." },
  { value: "failed", label: "Failed", description: "Recipients whose campaign email failed after delivery retries." },
];

function normalizeContact(recipient: Recipient) {
  return Array.isArray(recipient.crm_contacts) ? recipient.crm_contacts[0] ?? null : recipient.crm_contacts;
}

function matchesOutcome(recipient: Recipient, outcome: Outcome) {
  const contact = normalizeContact(recipient);
  if (!contact || contact.status !== "active" || !contact.email) return false;
  const statuses = [recipient.status, ...(recipient.messages ?? []).map((message) => message.status)];
  const eventTypes = new Set((recipient.events ?? []).map((event) => event.event_type));
  if (outcome === "failed") return statuses.includes("failed") || eventTypes.has("failed");
  if (statuses.some((status) => ["failed", "bounced", "unsubscribed"].includes(status)) || ["bounced", "complained", "unsubscribed"].some((type) => eventTypes.has(type))) return false;
  const opened = eventTypes.has("opened") || statuses.some((status) => ["opened", "clicked", "replied"].includes(status));
  const clicked = eventTypes.has("clicked") || statuses.includes("clicked");
  const delivered = eventTypes.has("delivered") || statuses.some((status) => ["delivered", "opened", "clicked", "replied"].includes(status));
  const sentOrDelivered = eventTypes.has("sent") || delivered || statuses.includes("sent");
  if (outcome === "opened") return opened;
  if (outcome === "clicked") return clicked;
  if (outcome === "delivered") return delivered;
  if (outcome === "delivered_not_opened") return sentOrDelivered && !opened;
  if (outcome === "opened_not_clicked") return opened && !clicked;
  return eventTypes.has("replied") || statuses.includes("replied");
}

export default function CrmRetargetingPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignId, setCampaignId] = useState("");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [outcome, setOutcome] = useState<Outcome>("opened");
  const [audienceName, setAudienceName] = useState("");
  const [savedAudience, setSavedAudience] = useState<SavedAudience | null>(null);
  const [loadingCompanies, setLoadingCompanies] = useState(true);
  const [loadingCampaigns, setLoadingCampaigns] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/crm/companies", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not load companies.");
        if (cancelled) return;
        const rows = result.companies ?? [];
        setCompanies(rows);
        if (rows.length) setCompanyId(String(rows[0].id));
      })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load companies."); })
      .finally(() => { if (!cancelled) setLoadingCompanies(false); });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!companyId) {
      setCampaigns([]);
      setCampaignId("");
      setRecipients([]);
      return;
    }
    let cancelled = false;
    setLoadingCampaigns(true);
    setCampaignId("");
    setRecipients([]);
    fetch(`/api/crm/campaigns?company_id=${companyId}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not load campaigns.");
        if (cancelled) return;
        const rows = (result.campaigns ?? []).filter((campaign: Campaign) => campaign.status !== "draft" && campaign.status !== "cancelled");
        setCampaigns(rows);
        if (rows.length) setCampaignId(String(rows[0].id));
      })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load campaigns."); })
      .finally(() => { if (!cancelled) setLoadingCampaigns(false); });
    return () => { cancelled = true; };
  }, [companyId]);

  useEffect(() => {
    if (!companyId || !campaignId) {
      setRecipients([]);
      return;
    }
    let cancelled = false;
    setLoadingReport(true);
    setError(null);
    setSavedAudience(null);
    fetch(`/api/crm/analytics?company_id=${companyId}&campaign_id=${campaignId}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not load campaign outcomes.");
        if (!cancelled) setRecipients(result.recipients ?? []);
      })
      .catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Could not load campaign outcomes."); })
      .finally(() => { if (!cancelled) setLoadingReport(false); });
    return () => { cancelled = true; };
  }, [companyId, campaignId]);

  const selectedCampaign = campaigns.find((campaign) => String(campaign.id) === campaignId);
  const selectedOutcome = outcomes.find((item) => item.value === outcome) ?? outcomes[0];
  const matchedRecipients = useMemo(() => recipients.filter((recipient) => matchesOutcome(recipient, outcome)), [recipients, outcome]);
  const defaultAudienceName = selectedCampaign ? `Retarget: ${selectedCampaign.name} - ${selectedOutcome.label}`.slice(0, 150) : "";

  async function createAudience() {
    setSaving(true);
    setError(null);
    setSavedAudience(null);
    try {
      const response = await fetch("/api/crm/retargeting", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: Number(companyId), campaign_id: Number(campaignId), metric: outcome, name: audienceName.trim() || defaultAudienceName }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not create retargeting audience.");
      setSavedAudience({ id: result.list.id, name: result.list.name, recipient_count: result.recipient_count });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create retargeting audience.");
    } finally {
      setSaving(false);
    }
  }

  const followUpHref = savedAudience
    ? `/dashboard/crm/campaigns?company_id=${companyId}&retarget_contact_list_id=${savedAudience.id}&retarget_name=${encodeURIComponent(savedAudience.name)}`
    : "#";

  return <div className="space-y-6 pb-10">
    <PageHeader eyebrow="Business CRM / Email Marketing" title="Retargeting" description="Build a follow-up audience from real outcomes in a previous campaign." />
    {error ? <Alert tone="danger">{error}</Alert> : null}

    <Card className="border-stone-200 bg-white p-5 shadow-[0_10px_30px_rgba(28,20,18,0.04)]">
      <div className="grid gap-4 md:grid-cols-3">
        <Field label="Company"><SelectInput value={companyId} disabled={loadingCompanies} onChange={(event) => { setCompanyId(event.target.value); setSavedAudience(null); }}><option value="">Select company</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</SelectInput></Field>
        <Field label="Source campaign"><SelectInput value={campaignId} disabled={loadingCampaigns || !campaigns.length} onChange={(event) => { setCampaignId(event.target.value); setSavedAudience(null); }}><option value="">{loadingCampaigns ? "Loading campaigns…" : "Select campaign"}</option>{campaigns.map((campaign) => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</SelectInput></Field>
        <Field label="Campaign outcome"><SelectInput value={outcome} onChange={(event) => { setOutcome(event.target.value as Outcome); setSavedAudience(null); }} disabled={!campaignId}>{outcomes.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</SelectInput></Field>
      </div>
      <p className="mt-3 text-xs text-stone-500">{selectedOutcome.description} Only active contacts with a usable email address are included; bounced and unsubscribed contacts are excluded.</p>
    </Card>

    <div className="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(280px,0.6fr)]">
      <Card className="overflow-hidden border-stone-200 bg-white p-0 shadow-[0_10px_30px_rgba(28,20,18,0.04)]">
        <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50/80 px-5 py-4">
          <div><h2 className="font-semibold text-stone-900">Matching recipients</h2><p className="mt-1 text-xs text-stone-500">{selectedCampaign?.name ?? "Choose a source campaign"}</p></div>
          <Badge tone="primary">{loadingReport ? "Loading…" : `${matchedRecipients.length} eligible`}</Badge>
        </div>
        {!campaignId ? <div className="p-8 text-sm text-stone-500">Select a campaign to inspect its recipient outcomes.</div> : loadingReport ? <div className="p-8 text-sm text-stone-500">Loading recipient events…</div> : matchedRecipients.length ? (
          <div className="max-h-[480px] divide-y divide-stone-100 overflow-auto">
            {matchedRecipients.map((recipient) => {
              const contact = normalizeContact(recipient);
              if (!contact) return null;
              return <div key={recipient.contact_id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="flex min-w-0 items-center gap-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sky-50 text-sky-700"><IconEmployees className="h-4 w-4" /></span><div className="min-w-0"><p className="truncate text-sm font-semibold text-stone-900">{contact.full_name || "Unknown contact"}</p><p className="truncate text-xs text-stone-500">{contact.email}</p></div></div>
                <span className="text-xs font-medium capitalize text-stone-500">{recipient.status}</span>
              </div>;
            })}
          </div>
        ) : <div className="p-8 text-sm text-stone-500">No active recipients match this outcome.</div>}
      </Card>

      <Card className="border-emerald-200 bg-gradient-to-br from-white to-emerald-50/70 p-5 shadow-[0_10px_30px_rgba(28,20,18,0.04)]">
        <span className="grid h-11 w-11 place-items-center rounded-xl bg-emerald-100 text-emerald-700"><IconBuilding className="h-5 w-5" /></span>
        <h2 className="mt-4 text-lg font-bold text-stone-900">Save this audience</h2>
        <p className="mt-1 text-sm text-stone-600">Create a contact list from the matching recipients, then use it in a follow-up campaign.</p>
        <Field label="Audience name"><TextInput value={audienceName} onChange={(event) => setAudienceName(event.target.value)} placeholder={defaultAudienceName || "Campaign outcome audience"} maxLength={150} /></Field>
        <Button className="mt-4 w-full" loading={saving} disabled={!campaignId || loadingReport || matchedRecipients.length === 0} onClick={() => void createAudience()}><IconRefresh className="h-4 w-4" />Create retarget audience</Button>
        {savedAudience ? <div className="mt-4 rounded-xl border border-emerald-200 bg-white p-4">
          <div className="flex items-start gap-2 text-emerald-800"><IconCheckCircle className="mt-0.5 h-4 w-4 shrink-0" /><div><p className="text-sm font-semibold">Audience saved</p><p className="mt-1 text-xs">{savedAudience.name} · {savedAudience.recipient_count} contacts</p></div></div>
          <Link href={followUpHref} className="mt-3 inline-flex items-center gap-1.5 text-sm font-bold text-primary hover:underline">Create follow-up campaign <IconArrowRight className="h-4 w-4" /></Link>
        </div> : null}
      </Card>
    </div>
  </div>;
}