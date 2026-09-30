"use client";

import { useEffect, useState, type FormEvent } from "react";
import { IconEdit, IconPlus, IconTrash } from "@/components/icons";
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
type Campaign = { id: number; company_id: number; name: string; segment_id: number | null; contact_list_id: number | null; template_id: number; mailbox_id: number; from_name: string | null; reply_to: string | null; subject: string | null; schedule_at: string | null; interval_seconds: number; batch_size: number; status: string; crm_email_templates?: { name?: string; subject?: string } | null; crm_mailboxes?: { email_address?: string } | null; crm_contact_lists?: { name?: string } | null };
type CampaignForm = { company_id: string; name: string; audience_type: "list" | "segment" | "all"; contact_list_id: string; segment_id: string; template_id: string; mailbox_id: string; from_name: string; reply_to: string; subject: string; schedule_at: string; interval_seconds: string; batch_size: string; status: string };

const blankForm: CampaignForm = { company_id: "", name: "", audience_type: "list", contact_list_id: "", segment_id: "", template_id: "", mailbox_id: "", from_name: "", reply_to: "", subject: "", schedule_at: "", interval_seconds: "180", batch_size: "1", status: "draft" };

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
  const [message, setMessage] = useState<{ text: string; tone: "success" | "danger" } | null>(null);

  async function loadCompanies() {
    const response = await fetch("/api/crm/companies", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not load companies.");
    setCompanies(result.companies ?? []);
    if (result.companies?.length) setCompanyId((current) => current || String(result.companies[0].id));
  }

  async function loadCampaignData() {
    if (!companyId) return;
    const responses = await Promise.all([
      fetch(`/api/crm/campaigns?company_id=${companyId}`, { cache: "no-store" }),
      fetch(`/api/crm/templates?company_id=${companyId}`, { cache: "no-store" }),
      fetch(`/api/crm/mailboxes?company_id=${companyId}`, { cache: "no-store" }),
      fetch(`/api/crm/segments?company_id=${companyId}`, { cache: "no-store" }),
      fetch(`/api/crm/contact-lists?company_id=${companyId}`, { cache: "no-store" }),
    ]);
    const results = await Promise.all(responses.map((response) => response.json()));
    if (!responses[0].ok) throw new Error(results[0].error ?? "Could not load campaigns.");
    setCampaigns(results[0].campaigns ?? []);
    setTemplates(results[1].templates ?? []);
    setMailboxes(results[2].mailboxes ?? []);
    setSegments(results[3].segments ?? []);
    setContactLists(results[4].lists ?? []);
  }

  useEffect(() => { loadCompanies().catch((error) => setMessage({ text: error.message, tone: "danger" })); }, []);
  useEffect(() => { loadCampaignData().catch((error) => setMessage({ text: error.message, tone: "danger" })); }, [companyId]);

  function openNew() {
    setEditingId(null);
    setForm({ ...blankForm, company_id: companyId, audience_type: "list", contact_list_id: contactLists[0] ? String(contactLists[0].id) : "", segment_id: segments[0] ? String(segments[0].id) : "", template_id: templates.find((item) => item.status === "active")?.id.toString() ?? templates[0]?.id.toString() ?? "", mailbox_id: mailboxes.find((item) => item.status === "connected")?.id.toString() ?? "" });
    setEditorOpen(true);
  }

  function openEdit(campaign: Campaign) {
    setEditingId(campaign.id);
    setForm({ company_id: String(campaign.company_id), name: campaign.name, audience_type: campaign.contact_list_id ? "list" : campaign.segment_id ? "segment" : "all", contact_list_id: campaign.contact_list_id ? String(campaign.contact_list_id) : "", segment_id: campaign.segment_id ? String(campaign.segment_id) : "", template_id: String(campaign.template_id), mailbox_id: String(campaign.mailbox_id), from_name: campaign.from_name ?? "", reply_to: campaign.reply_to ?? "", subject: campaign.subject ?? "", schedule_at: campaign.schedule_at ? new Date(new Date(campaign.schedule_at).getTime() - new Date(campaign.schedule_at).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "", interval_seconds: String(campaign.interval_seconds), batch_size: String(campaign.batch_size), status: campaign.status });
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

  return <>
    <PageHeader eyebrow="Business CRM / Email Marketing" title="Campaigns" description="Choose a company audience, message, sender, and delivery schedule." actions={<Button onClick={openNew} disabled={!companyId}><IconPlus className="h-4 w-4" />New campaign</Button>} />
    {message ? <div className="mb-5"><Alert tone={message.tone}>{message.text}</Alert></div> : null}
    <Card className="mb-5"><Field label="Company"><SelectInput value={companyId} onChange={(event) => setCompanyId(event.target.value)}><option value="">Select company</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</SelectInput></Field></Card>
    {campaigns.length ? <div className="grid gap-4 xl:grid-cols-2">{campaigns.map((campaign) => <Card key={campaign.id}>
      <div className="flex items-start justify-between gap-4"><div><Badge tone={campaign.status === "completed" ? "success" : campaign.status === "failed" ? "danger" : campaign.status === "draft" || campaign.status === "paused" ? "neutral" : "warning"}>{campaign.status}</Badge><h2 className="mt-3 text-lg font-bold">{campaign.name}</h2><p className="mt-1 text-sm text-muted">{campaign.crm_email_templates?.name ?? "Template"} · {campaign.crm_mailboxes?.email_address ?? "Mailbox"}</p></div><span className="text-right text-xs text-muted">{campaign.contact_list_id ? campaign.crm_contact_lists?.name ?? "Contact list" : campaign.segment_id ? segments.find((item) => item.id === campaign.segment_id)?.name ?? "Dynamic segment" : "All active contacts"}</span></div>
      <p className="mt-4 rounded-lg bg-[#f5f7f5] p-3 text-sm text-muted">{campaign.subject || campaign.crm_email_templates?.subject || "No subject override"}</p>
      <p className="mt-3 text-xs text-muted">{campaign.schedule_at ? `Scheduled ${new Date(campaign.schedule_at).toLocaleString()}` : "No scheduled start"} · Batch {campaign.batch_size} every {campaign.interval_seconds}s</p>
      <div className="mt-4 flex gap-2 border-t border-border pt-4"><Button variant="secondary" onClick={() => openEdit(campaign)}><IconEdit className="h-4 w-4" />Edit</Button><Button variant="ghost" className="text-rose-600" onClick={() => removeCampaign(campaign)}><IconTrash className="h-4 w-4" />Delete</Button></div>
    </Card>)}</div> : <Card><div className="py-12 text-center"><p className="text-lg font-bold">No campaigns yet</p><p className="mt-2 text-sm text-muted">Create a draft, test it, then schedule delivery to a saved audience.</p><Button className="mt-5" onClick={openNew} disabled={!companyId}><IconPlus className="h-4 w-4" />Create campaign</Button></div></Card>}

    <Modal size="wide" open={editorOpen} onClose={() => setEditorOpen(false)} title={editingId ? "Edit campaign" : "Create campaign"} description="A scheduled campaign is picked up by the server-side delivery worker.">
      <form className="grid gap-7 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]" onSubmit={saveCampaign}>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Company"><SelectInput required disabled value={form.company_id}>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</SelectInput></Field><Field label="Campaign name"><TextInput required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="September product update" /></Field></div>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Audience type"><SelectInput value={form.audience_type} onChange={(event) => setForm({ ...form, audience_type: event.target.value as CampaignForm["audience_type"] })}><option value="list">Named contact list</option><option value="segment">Dynamic segment</option><option value="all">All active contacts</option></SelectInput></Field><Field label="Connected sender"><SelectInput required value={form.mailbox_id} onChange={(event) => setForm({ ...form, mailbox_id: event.target.value })}><option value="">Select connected mailbox</option>{mailboxes.filter((mailbox) => mailbox.status === "connected").map((mailbox) => <option key={mailbox.id} value={mailbox.id}>{mailbox.email_address}</option>)}</SelectInput></Field></div>
          {form.audience_type === "list" ? <Field label="Contact list"><SelectInput required value={form.contact_list_id} onChange={(event) => setForm({ ...form, contact_list_id: event.target.value })}><option value="">Select a contact list</option>{contactLists.map((list) => <option key={list.id} value={list.id}>{list.name} ({list.contact_count} contacts)</option>)}</SelectInput></Field> : form.audience_type === "segment" ? <Field label="Dynamic segment"><SelectInput required value={form.segment_id} onChange={(event) => setForm({ ...form, segment_id: event.target.value })}><option value="">Select a dynamic segment</option>{segments.map((segment) => <option key={segment.id} value={segment.id}>{segment.name}</option>)}</SelectInput></Field> : <p className="text-sm text-muted">Targets every active contact in this company.</p>}
          {form.audience_type === "list" ? <p className="-mt-2 text-xs text-muted">Only active contacts in “{selectedContactList?.name ?? "the selected list"}” receive this campaign.</p> : form.audience_type === "segment" && selectedSegment ? <p className="-mt-2 text-xs text-muted">{selectedSegment.description || `${selectedSegment.rules?.length ?? 0} audience rule${selectedSegment.rules?.length === 1 ? "" : "s"}`} · Only active contacts are included.</p> : null}
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Email template"><SelectInput required value={form.template_id} onChange={(event) => selectTemplate(event.target.value)}><option value="">Select template</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}{template.status !== "active" ? ` (${template.status})` : ""}</option>)}</SelectInput></Field><Field label="Status"><SelectInput value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="draft">Draft</option><option value="scheduled">Scheduled / send</option><option value="paused">Paused</option><option value="cancelled">Cancelled</option></SelectInput></Field></div>
          <Field label="Subject override"><TextInput value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} placeholder={selectedTemplate?.subject || "Uses template subject"} /></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="From name"><TextInput value={form.from_name} onChange={(event) => setForm({ ...form, from_name: event.target.value })} placeholder="Your company" /></Field><Field label="Reply-to address"><TextInput type="email" value={form.reply_to} onChange={(event) => setForm({ ...form, reply_to: event.target.value })} placeholder="hello@example.com" /></Field></div>
          <Field label="Start at"><TextInput type="datetime-local" value={form.schedule_at} onChange={(event) => setForm({ ...form, schedule_at: event.target.value })} /><span className="mt-1 block text-xs text-muted">Leave blank to start as soon as the delivery worker picks up the campaign.</span></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="Emails per batch"><TextInput required type="number" min="1" max="500" value={form.batch_size} onChange={(event) => setForm({ ...form, batch_size: event.target.value })} /></Field><Field label="Seconds between batches"><TextInput required type="number" min="1" value={form.interval_seconds} onChange={(event) => setForm({ ...form, interval_seconds: event.target.value })} /></Field></div>
          <div className="flex flex-wrap justify-between gap-3 border-t border-border pt-4"><Button type="button" variant="secondary" disabled={!selectedTemplate || !form.mailbox_id} onClick={() => setTestOpen(true)}>Send test</Button><div className="flex gap-2"><Button type="button" variant="secondary" onClick={() => setEditorOpen(false)}>Cancel</Button><Button type="submit" loading={saving}>{form.status === "scheduled" ? "Save and schedule" : "Save campaign"}</Button></div></div>
        </div>
        <aside className="min-w-0"><div className="mb-2 flex items-center justify-between"><p className="text-sm font-semibold">Email preview</p><div className="flex rounded-lg border border-border p-1"><button type="button" onClick={() => setPreviewMode("html")} aria-pressed={previewMode === "html"} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${previewMode === "html" ? "bg-[#e8f0ec] text-[#24583f]" : "text-muted"}`}>HTML</button><button type="button" onClick={() => setPreviewMode("text")} aria-pressed={previewMode === "text"} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${previewMode === "text" ? "bg-[#e8f0ec] text-[#24583f]" : "text-muted"}`}>Plain text</button></div></div><div className="overflow-hidden rounded-lg border border-border bg-white">{previewMode === "html" ? <iframe title="Campaign HTML email preview" sandbox="" srcDoc={preview(selectedTemplate?.html_body ?? "<p>Select a template to preview the email.</p>")} className="h-[520px] w-full" /> : <pre className="h-[520px] overflow-auto whitespace-pre-wrap p-6 text-sm leading-6 text-foreground">{selectedTemplate?.text_body?.trim() || "No plain-text version is set for this template."}</pre>}</div><p className="mt-3 text-xs text-muted">Personalization variables are rendered for each recipient.</p></aside>
      </form>
    </Modal>
    <Modal open={testOpen} onClose={() => setTestOpen(false)} title="Test campaign" description="Send a test through the selected connected mailbox only."><div className="space-y-4"><Field label="Send test to"><TextInput type="email" required value={testTo} onChange={(event) => setTestTo(event.target.value)} placeholder="you@example.com" /></Field><div className="flex justify-end gap-2 border-t border-border pt-4"><Button variant="secondary" onClick={() => setTestOpen(false)}>Cancel</Button><Button loading={saving} onClick={sendTest}>Send test</Button></div></div></Modal>
  </>;
}
