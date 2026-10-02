"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { IconArrowRight, IconBuilding, IconCalendar, IconEdit, IconEmployees, IconMail, IconPlus, IconTrash } from "@/components/icons";
import { Alert } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, SelectInput, TextInput } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";

type Company = { id: number; name: string };
type ContactList = { id: number; name: string; contact_count: number };
type Template = { id: number; name: string; subject: string; html_body: string; text_body: string | null; status: string };
type Mailbox = { id: number; email_address: string; status: string };
type SegmentRule = { field: string; operator: string; value: string };
type Segment = { id: number; name: string; description?: string | null; rules: SegmentRule[] };
type Campaign = { id: number; company_id: number; name: string; segment_id: number | null; contact_list_id: number | null; template_id: number; mailbox_id: number; from_name: string | null; subject: string | null; schedule_at: string | null; interval_seconds: number; batch_size: number; status: string; crm_email_templates?: { name?: string; subject?: string } | null; crm_mailboxes?: { email_address?: string } | null; crm_contact_lists?: { name?: string } | null };
type CampaignForm = { company_id: string; name: string; audience_type: "list" | "segment" | "all"; contact_list_id: string; segment_id: string; template_id: string; mailbox_id: string; from_name: string; subject: string; schedule_at: string; interval_seconds: string; batch_size: string; status: string };

const blankForm: CampaignForm = { company_id: "", name: "", audience_type: "list", contact_list_id: "", segment_id: "", template_id: "", mailbox_id: "", from_name: "", subject: "", schedule_at: "", interval_seconds: "180", batch_size: "1", status: "draft" };

function preview(html: string) {
  const sample = html.replace(/\{\{\s*first_name\s*\}\}/g, "Alex").replace(/\{\{\s*last_name\s*\}\}/g, "Morgan").replace(/\{\{\s*email\s*\}\}/g, "alex@example.com").replace(/\{\{\s*company_name\s*\}\}/g, "Your company");
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:24px;background:#f3f5f4;color:#25302c;font:15px/1.6 Arial,sans-serif}main{max-width:620px;margin:auto;background:#fff;padding:24px;border:1px solid #e1e7e3}</style></head><body><main>${sample}</main></body></html>`;
}

export default function CrmCampaignsPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [contactLists, setContactLists] = useState<ContactList[]>([]);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [segments, setSegments] = useState<Segment[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [form, setForm] = useState<CampaignForm>(blankForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [previewMode, setPreviewMode] = useState<"html" | "text">("html");
  const [saving, setSaving] = useState(false);
  const [loadingResources, setLoadingResources] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "success" | "danger" } | null>(null);

  async function loadCompanies() {
    const response = await fetch("/api/crm/companies", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not load companies.");
    setCompanies(result.companies ?? []);
  }

  async function loadCampaignData() {
    const query = companyId ? `?company_id=${companyId}` : "";
    const response = await fetch(`/api/crm/campaigns${query}`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not load campaigns.");
    setCampaigns(result.campaigns ?? []);
  }

  useEffect(() => { loadCompanies().catch((error) => setMessage({ text: error.message, tone: "danger" })); }, []);
  useEffect(() => { loadCampaignData().catch((error) => setMessage({ text: error.message, tone: "danger" })); }, [companyId]);

  useEffect(() => {
    if (!editorOpen || !form.company_id) {
      setTemplates([]);
      setMailboxes([]);
      setSegments([]);
      setContactLists([]);
      return;
    }
    let cancelled = false;
    setLoadingResources(true);
    const company = form.company_id;
    Promise.all([
      fetch(`/api/crm/templates?company_id=${company}`, { cache: "no-store" }),
      fetch(`/api/crm/mailboxes?company_id=${company}`, { cache: "no-store" }),
      fetch(`/api/crm/segments?company_id=${company}`, { cache: "no-store" }),
      fetch(`/api/crm/contact-lists?company_id=${company}`, { cache: "no-store" }),
    ]).then(async (responses) => {
      const results = await Promise.all(responses.map((response) => response.json()));
      const failed = responses.findIndex((response) => !response.ok);
      if (failed >= 0) throw new Error(results[failed].error ?? "Could not load company campaign options.");
      if (cancelled) return;
      const nextTemplates = results[0].templates ?? [];
      const nextMailboxes = results[1].mailboxes ?? [];
      const nextSegments = results[2].segments ?? [];
      const nextLists = results[3].lists ?? [];
      setTemplates(nextTemplates);
      setMailboxes(nextMailboxes);
      setSegments(nextSegments);
      setContactLists(nextLists);
      setForm((current) => current.company_id !== company || editingId !== null ? current : ({
        ...current,
        contact_list_id: current.contact_list_id || (nextLists[0] ? String(nextLists[0].id) : ""),
        segment_id: current.segment_id || (nextSegments[0] ? String(nextSegments[0].id) : ""),
        template_id: current.template_id || nextTemplates.find((item: Template) => item.status === "active")?.id.toString() || nextTemplates[0]?.id.toString() || "",
        mailbox_id: current.mailbox_id || nextMailboxes.find((item: Mailbox) => item.status === "connected")?.id.toString() || "",
      }));
    }).catch((error) => {
      if (!cancelled) setMessage({ text: error instanceof Error ? error.message : "Could not load company campaign options.", tone: "danger" });
    }).finally(() => {
      if (!cancelled) setLoadingResources(false);
    });
    return () => { cancelled = true; };
  }, [editorOpen, form.company_id, editingId]);

  function openNew() {
    setEditingId(null);
    setForm({ ...blankForm, company_id: companyId });
    setEditorOpen(true);
  }

  function openEdit(campaign: Campaign) {
    setEditingId(campaign.id);
    setForm({ company_id: String(campaign.company_id), name: campaign.name, audience_type: campaign.contact_list_id ? "list" : campaign.segment_id ? "segment" : "all", contact_list_id: campaign.contact_list_id ? String(campaign.contact_list_id) : "", segment_id: campaign.segment_id ? String(campaign.segment_id) : "", template_id: String(campaign.template_id), mailbox_id: String(campaign.mailbox_id), from_name: campaign.from_name ?? "", subject: campaign.subject ?? "", schedule_at: campaign.schedule_at ? new Date(new Date(campaign.schedule_at).getTime() - new Date(campaign.schedule_at).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "", interval_seconds: String(campaign.interval_seconds), batch_size: String(campaign.batch_size), status: campaign.status });
    setEditorOpen(true);
  }

  function selectTemplate(id: string) {
    const selected = templates.find((template) => String(template.id) === id);
    setForm((current) => ({ ...current, template_id: id, subject: selected?.subject ?? current.subject }));
  }

  async function saveCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/crm/campaigns", { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editingId ?? undefined, ...form, company_id: Number(form.company_id), contact_list_id: form.audience_type === "list" && form.contact_list_id ? Number(form.contact_list_id) : null, segment_id: form.audience_type === "segment" && form.segment_id ? Number(form.segment_id) : null, template_id: Number(form.template_id), mailbox_id: Number(form.mailbox_id), interval_seconds: Number(form.interval_seconds), batch_size: Number(form.batch_size), schedule_at: form.schedule_at ? new Date(form.schedule_at).toISOString() : null }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save campaign.");
      setEditorOpen(false);
      setMessage({ text: editingId ? "Campaign updated." : "Campaign saved.", tone: "success" });
      await loadCampaignData();
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : "Could not save campaign.", tone: "danger" }); }
    finally { setSaving(false); }
  }

  async function removeCampaign(campaign: Campaign) {
    if (!window.confirm(`Delete ${campaign.name}?`)) return;
    const response = await fetch(`/api/crm/campaigns?id=${campaign.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) { setMessage({ text: result.error ?? "Could not delete campaign.", tone: "danger" }); return; }
    setMessage({ text: "Campaign deleted.", tone: "success" });
    await loadCampaignData();
  }

  async function sendTest() {
    const template = templates.find((item) => String(item.id) === form.template_id);
    if (!template) return;
    setSaving(true);
    try {
      const response = await fetch("/api/crm/campaigns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test", mailbox_id: Number(form.mailbox_id), to: testTo, subject: form.subject || template.subject, html_body: template.html_body, text_body: template.text_body }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not send test.");
      setTestOpen(false);
      setMessage({ text: result.message, tone: "success" });
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : "Could not send test.", tone: "danger" }); }
    finally { setSaving(false); }
  }

  const selectedTemplate = templates.find((item) => String(item.id) === form.template_id);
  const selectedSegment = segments.find((item) => String(item.id) === form.segment_id);
  const selectedContactList = contactLists.find((item) => String(item.id) === form.contact_list_id);
  const selectedCompany = companies.find((company) => String(company.id) === companyId);
  const campaignAccents = [
    { line: "bg-rose-500", tile: "bg-rose-50 text-rose-700", frame: "from-rose-50/80" },
    { line: "bg-sky-500", tile: "bg-sky-50 text-sky-700", frame: "from-sky-50/80" },
    { line: "bg-amber-500", tile: "bg-amber-50 text-amber-700", frame: "from-amber-50/80" },
    { line: "bg-emerald-500", tile: "bg-emerald-50 text-emerald-700", frame: "from-emerald-50/80" },
    { line: "bg-cyan-500", tile: "bg-cyan-50 text-cyan-700", frame: "from-cyan-50/80" },
  ];

  function changeFormCompany(nextCompanyId: string) {
    setTemplates([]);
    setMailboxes([]);
    setSegments([]);
    setContactLists([]);
    setForm((current) => ({ ...current, company_id: nextCompanyId, contact_list_id: "", segment_id: "", template_id: "", mailbox_id: "", subject: "" }));
  }

  return <>
    <div className="space-y-6 pb-10">
      <PageHeader eyebrow="Business CRM / Email Marketing" title="Campaigns" description="Browse campaigns across your companies and manage every send from one place." actions={<Button onClick={openNew} disabled={!companies.length}><IconPlus className="h-4 w-4" />New campaign</Button>} />
      {message ? <div><Alert tone={message.tone}>{message.text}</Alert></div> : null}

      <section className="relative isolate overflow-hidden rounded-2xl bg-gradient-to-r from-[#263f35] via-[#315946] to-[#39765d] px-6 py-6 text-white shadow-[0_18px_45px_rgba(33,73,54,0.18)] sm:px-8">
        <div className="absolute -right-10 -top-24 -z-10 h-64 w-64 rounded-full border-[34px] border-white/10" />
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="flex items-center gap-4">
            <span className="grid h-14 w-14 place-items-center rounded-2xl border border-white/15 bg-white/10"><IconMail className="h-7 w-7" /></span>
            <div><p className="text-sm font-semibold text-white/70">Campaign workspace</p><p className="mt-1 text-2xl font-bold">{campaigns.length} campaign{campaigns.length === 1 ? "" : "s"}</p></div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs font-semibold">
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-2">{companies.length} companies</span>
            <span className="rounded-full border border-white/20 bg-white/10 px-3 py-2">{campaigns.filter((campaign) => campaign.status === "scheduled" || campaign.status === "running").length} active or scheduled</span>
          </div>
        </div>
      </section>

      <Card className="border-stone-200 bg-white p-4 shadow-[0_10px_30px_rgba(28,20,18,0.04)] sm:p-5">
        <div className="grid gap-4 sm:grid-cols-[minmax(220px,1fr)_auto] sm:items-end">
          <Field label="Company filter">
            <SelectInput value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
              <option value="">All companies</option>
              {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
            </SelectInput>
          </Field>
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-3.5 py-3 text-sm font-medium text-emerald-800">
            <IconBuilding className="h-4 w-4" />
            <span>{selectedCompany?.name ?? "Showing every company"}</span>
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-between gap-3">
        <div><h2 className="text-lg font-bold text-stone-900">Your campaigns</h2><p className="mt-1 text-sm text-muted">Each card includes its sender, audience, and delivery schedule.</p></div>
        <span className="rounded-full border border-stone-200 bg-white px-3 py-1.5 text-xs font-semibold text-stone-600">{campaigns.length} shown</span>
      </div>

      {campaigns.length ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {campaigns.map((campaign, index) => {
            const accent = campaignAccents[index % campaignAccents.length];
            const statusTone = campaign.status === "completed" ? "success" : campaign.status === "failed" ? "danger" : campaign.status === "draft" || campaign.status === "paused" ? "neutral" : "warning";
            return <Card key={campaign.id} className="group relative overflow-hidden border-stone-200 bg-white p-0 shadow-[0_10px_30px_rgba(28,20,18,0.04)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_20px_40px_rgba(28,20,18,0.1)]">
              <div className={`absolute inset-x-0 top-0 h-1.5 ${accent.line}`} />
              <Link href={`/dashboard/crm/campaigns/${campaign.id}?company_id=${campaign.company_id}`} className={`block bg-gradient-to-br ${accent.frame} to-white p-5 outline-none focus-visible:ring-2 focus-visible:ring-primary/40 sm:p-6`}>
                <div className="flex items-start justify-between gap-4">
                  <div className="flex min-w-0 items-start gap-3.5">
                    <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl ${accent.tile}`}><IconMail className="h-5 w-5" /></span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2"><Badge tone={statusTone}>{campaign.status}</Badge><span className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-600"><IconBuilding className="h-3.5 w-3.5" />{companies.find((company) => company.id === campaign.company_id)?.name ?? `Company ${campaign.company_id}`}</span></div>
                      <h3 className="mt-3 truncate text-lg font-bold text-stone-900">{campaign.name}</h3>
                      <p className="mt-1 truncate text-sm text-stone-600">{campaign.crm_email_templates?.name ?? "Email template"} · {campaign.crm_mailboxes?.email_address ?? "Mailbox unavailable"}</p>
                    </div>
                  </div>
                  <IconArrowRight className="mt-1 h-5 w-5 shrink-0 text-stone-400 transition group-hover:translate-x-1 group-hover:text-primary" />
                </div>
                <p className="mt-5 rounded-xl border border-white/80 bg-white/80 px-4 py-3 text-sm font-medium text-stone-700 shadow-sm">{campaign.subject || campaign.crm_email_templates?.subject || "No subject override"}</p>
                <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-stone-600">
                  <span className="inline-flex items-center gap-1.5"><IconEmployees className="h-4 w-4" />{campaign.contact_list_id ? campaign.crm_contact_lists?.name ?? "Contact list" : campaign.segment_id ? "Dynamic segment" : "All active contacts"}</span>
                  <span className="inline-flex items-center gap-1.5"><IconCalendar className="h-4 w-4" />{campaign.schedule_at ? new Date(campaign.schedule_at).toLocaleString() : "No scheduled start"}</span>
                  <span>Batch {campaign.batch_size} / {campaign.interval_seconds}s</span>
                </div>
                <p className="mt-4 inline-flex items-center gap-1.5 text-xs font-bold text-primary">View delivery report <IconArrowRight className="h-4 w-4" /></p>
              </Link>
              <div className="flex gap-2 border-t border-stone-200 bg-white px-5 py-3 sm:px-6">
                <Button variant="secondary" onClick={() => openEdit(campaign)}><IconEdit className="h-4 w-4" />Edit</Button>
                <Button variant="ghost" className="text-rose-600" onClick={() => removeCampaign(campaign)}><IconTrash className="h-4 w-4" />Delete</Button>
              </div>
            </Card>;
          })}
        </div>
      ) : (
        <Card className="border-dashed border-stone-300 bg-white py-12 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-rose-50 text-rose-600"><IconMail className="h-7 w-7" /></span>
          <p className="mt-4 text-lg font-bold text-stone-900">No campaigns found</p>
          <p className="mt-2 text-sm text-muted">Create a draft, choose its company and template, then schedule delivery.</p>
          <Button className="mt-5" onClick={openNew} disabled={!companies.length}><IconPlus className="h-4 w-4" />Create campaign</Button>
        </Card>
      )}
    </div>

    <Modal size="wide" open={editorOpen} onClose={() => setEditorOpen(false)} title={editingId ? "Edit campaign" : "Create campaign"} description="A scheduled campaign is picked up by the server-side delivery worker.">
      <form className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]" onSubmit={saveCampaign}>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Company"><SelectInput required value={form.company_id} onChange={(event) => changeFormCompany(event.target.value)}><option value="">Choose a company first</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</SelectInput></Field><Field label="Campaign name"><TextInput required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="September product update" /></Field></div>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Audience type"><SelectInput value={form.audience_type} onChange={(event) => setForm({ ...form, audience_type: event.target.value as CampaignForm["audience_type"] })}><option value="list">Named contact list</option><option value="segment">Dynamic segment</option><option value="all">All active contacts</option></SelectInput></Field><Field label="Connected sender"><SelectInput required value={form.mailbox_id} onChange={(event) => setForm({ ...form, mailbox_id: event.target.value })}><option value="">Select connected mailbox</option>{mailboxes.filter((mailbox) => mailbox.status === "connected").map((mailbox) => <option key={mailbox.id} value={mailbox.id}>{mailbox.email_address}</option>)}</SelectInput></Field></div>
          {form.audience_type === "list" ? <Field label="Contact list"><SelectInput required value={form.contact_list_id} onChange={(event) => setForm({ ...form, contact_list_id: event.target.value })}><option value="">Select a contact list</option>{contactLists.map((list) => <option key={list.id} value={list.id}>{list.name} ({list.contact_count} contacts)</option>)}</SelectInput></Field> : form.audience_type === "segment" ? <Field label="Dynamic segment"><SelectInput required value={form.segment_id} onChange={(event) => setForm({ ...form, segment_id: event.target.value })}><option value="">Select a dynamic segment</option>{segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.name}</option>)}</SelectInput></Field> : <p className="text-sm text-muted">Targets every active contact in this company.</p>}
          {form.audience_type === "list" ? <p className="-mt-2 text-xs text-muted">Only active contacts in “{selectedContactList?.name ?? "the selected list"}” receive this campaign.</p> : form.audience_type === "segment" && selectedSegment ? <p className="-mt-2 text-xs text-muted">{selectedSegment.description || `${selectedSegment.rules?.length ?? 0} audience rule${selectedSegment.rules?.length === 1 ? "" : "s"}`} · Only active contacts are included.</p> : null}
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Email template"><SelectInput required value={form.template_id} onChange={(event) => selectTemplate(event.target.value)}><option value="">Select template</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}{template.status !== "active" ? ` (${template.status})` : ""}</option>)}</SelectInput></Field><Field label="Status"><SelectInput value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="draft">Draft</option><option value="scheduled">Scheduled / send</option><option value="paused">Paused</option><option value="cancelled">Cancelled</option></SelectInput></Field></div>
          <Field label="Subject override"><TextInput value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} placeholder={selectedTemplate?.subject || "Uses template subject"} /><span className="mt-1 block text-xs text-muted">Leave blank to use the template subject. Enter text here to replace it for every recipient.</span></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="From name"><TextInput value={form.from_name} onChange={(event) => setForm({ ...form, from_name: event.target.value })} placeholder="Your company" /><span className="mt-1 block text-xs text-muted">Display name recipients see; the selected mailbox remains the sender.</span></Field><div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"><p className="font-semibold">Replies go to the sender</p><p className="mt-1 text-xs leading-5 text-emerald-800">Emails are sent from the selected mailbox. Replies and sent copies stay with that mailbox.</p></div></div>
          <Field label="Start at"><TextInput type="datetime-local" value={form.schedule_at} onChange={(event) => setForm({ ...form, schedule_at: event.target.value })} /><span className="mt-1 block text-xs text-muted">Leave blank to start as soon as the delivery worker picks up the campaign.</span></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Emails per batch"><TextInput required type="number" min="1" max="500" value={form.batch_size} onChange={(event) => setForm({ ...form, batch_size: event.target.value })} /><span className="mt-1 block text-xs text-muted">How many messages become due together.</span></Field><Field label="Seconds between batches"><TextInput required type="number" min="1" value={form.interval_seconds} onChange={(event) => setForm({ ...form, interval_seconds: event.target.value })} /><span className="mt-1 block text-xs text-muted">For example, batch 1 + 60 seconds schedules one email each minute. Actual sending also depends on worker polling.</span></Field></div>
          <div className="flex flex-wrap justify-between gap-3 border-t border-border pt-4"><Button type="button" variant="secondary" disabled={!selectedTemplate || !form.mailbox_id} onClick={() => setTestOpen(true)}>Send test</Button><div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => setEditorOpen(false)}>Cancel</Button><Button type="submit" loading={saving}>{form.status === "scheduled" ? "Save and schedule" : "Save campaign"}</Button></div></div>
        </div>
        <aside className="min-w-0"><div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold">Email preview</p><div className="flex rounded-lg border border-border p-1"><button type="button" onClick={() => setPreviewMode("html")} aria-pressed={previewMode === "html"} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${previewMode === "html" ? "bg-[#e8f0ec] text-[#24583f]" : "text-muted"}`}>HTML</button><button type="button" onClick={() => setPreviewMode("text")} aria-pressed={previewMode === "text"} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${previewMode === "text" ? "bg-[#e8f0ec] text-[#24583f]" : "text-muted"}`}>Plain text</button></div></div><div className="overflow-hidden rounded-lg border border-border bg-white">{previewMode === "html" ? <iframe title="Campaign HTML email preview" sandbox="" srcDoc={preview(selectedTemplate?.html_body ?? "<p>Select a template to preview the email.</p>")} className="h-[520px] w-full" /> : <pre className="h-[520px] overflow-auto whitespace-pre-wrap p-6 text-sm leading-6 text-foreground">{selectedTemplate?.text_body?.trim() || "No plain-text version is set for this template."}</pre>}</div><p className="mt-3 text-xs text-muted">Personalization variables are rendered for each recipient.</p></aside>
      </form>
    </Modal>
    <Modal open={testOpen} onClose={() => setTestOpen(false)} title="Test campaign" description="Send a test through the selected connected mailbox only."><div className="space-y-4"><Field label="Send test to"><TextInput type="email" required value={testTo} onChange={(event) => setTestTo(event.target.value)} placeholder="you@example.com" /></Field><div className="flex justify-end gap-2 border-t border-border pt-4"><Button variant="secondary" onClick={() => setTestOpen(false)}>Cancel</Button><Button loading={saving} onClick={sendTest}>Send test</Button></div></div></Modal>
  </>;
}
