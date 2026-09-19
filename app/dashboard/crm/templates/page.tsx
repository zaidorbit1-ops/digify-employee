"use client";

import { useEffect, useMemo, useState } from "react";
import { IconEdit, IconPlus, IconTrash } from "@/components/icons";
import { Alert } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, SelectInput, TextInput } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";

type Company = { id: number; name: string };
type Mailbox = { id: number; email_address: string; status: string };
type Template = { id: number; company_id: number; name: string; subject: string; html_body: string; text_body: string | null; variables: string[]; status: string; updated_at: string };
type TemplateForm = { company_id: string; name: string; subject: string; html_body: string; text_body: string; status: string; variables: string[] };

const variables = ["first_name", "last_name", "email", "company_name"];
const emptyForm: TemplateForm = { company_id: "", name: "", subject: "", html_body: "<h1>Hello {{first_name}},</h1>\n<p>Write your email content here.</p>", text_body: "Hello {{first_name}},\n\nWrite your email content here.", status: "draft", variables: [] };
const designBlocks = {
  announcement: "<div style=\"padding:28px;background:#18324a;color:#ffffff;border-radius:14px;text-align:center\"><p style=\"margin:0 0 8px;color:#b8d5e5;font-size:12px;text-transform:uppercase;letter-spacing:2px\">Announcement</p><h1 style=\"margin:0;font-size:28px\">Your headline here</h1></div>",
  callout: "<div style=\"padding:20px;background:#eef6f8;border-left:4px solid #e45a5a;border-radius:8px\"><strong>Important update</strong><p style=\"margin:8px 0 0\">Add a short, useful message for your reader.</p></div>",
  button: "<p style=\"margin:24px 0\"><a href=\"https://example.com\" style=\"display:inline-block;padding:13px 22px;background:#e45a5a;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:bold\">View details</a></p>",
};

function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleDateString();
}

function previewHtml(html: string) {
  const sample = html.replace(/\{\{\s*first_name\s*\}\}/g, "Test").replace(/\{\{\s*last_name\s*\}\}/g, "Recipient").replace(/\{\{\s*email\s*\}\}/g, "recipient@example.com").replace(/\{\{\s*company_name\s*\}\}/g, "Your company");
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:28px;background:#f7fafb;color:#304654;font-family:Arial,sans-serif;line-height:1.65}main{max-width:600px;margin:auto;background:white;padding:28px;border:1px solid #e5ecef;border-radius:12px}h1{color:#18324a;font-size:25px}</style></head><body><main>${sample}</main></body></html>`;
}

export default function CrmTemplatesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [form, setForm] = useState<TemplateForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [previewMode, setPreviewMode] = useState<"desktop" | "mobile">("desktop");
  const [editorOpen, setEditorOpen] = useState(false);
  const [testOpen, setTestOpen] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testMailboxId, setTestMailboxId] = useState("");
  const [saving, setSaving] = useState(false);
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
    const response = await fetch(`/api/crm/templates?company_id=${companyId}`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not load templates.");
    setTemplates(result.templates ?? []);
    const mailboxResponse = await fetch(`/api/crm/mailboxes?company_id=${companyId}`, { cache: "no-store" });
    const mailboxResult = await mailboxResponse.json();
    if (mailboxResponse.ok) setMailboxes(mailboxResult.mailboxes ?? []);
  }

  useEffect(() => { loadCompanies().catch((error) => setMessage({ text: error.message, tone: "danger" })); }, []);
  useEffect(() => { loadTemplates().catch((error) => setMessage({ text: error.message, tone: "danger" })); }, [companyId]);

  const activeTemplate = useMemo(() => templates.find((template) => template.id === editingId) ?? null, [editingId, templates]);

  function openNew() { setEditingId(null); setForm({ ...emptyForm, company_id: companyId }); setEditorOpen(true); setMessage(null); }
  function openEdit(template: Template) { setEditingId(template.id); setForm({ company_id: String(template.company_id), name: template.name, subject: template.subject, html_body: template.html_body, text_body: template.text_body ?? "", status: template.status, variables: template.variables ?? [] }); setEditorOpen(true); setMessage(null); }
  function insertVariable(variable: string) { const token = `{{${variable}}}`; setForm((current) => ({ ...current, html_body: `${current.html_body}${current.html_body ? "\n" : ""}${token}`, text_body: `${current.text_body}${current.text_body ? "\n" : ""}${token}`, variables: [...new Set([...current.variables, variable])] })); }
  function insertDesignBlock(block: keyof typeof designBlocks) { setForm((current) => ({ ...current, html_body: `${current.html_body}${current.html_body ? "\n\n" : ""}${designBlocks[block]}` })); }

  async function saveTemplate() {
    setSaving(true); setMessage(null);
    try {
      const response = await fetch("/api/crm/templates", { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: editingId ?? undefined, ...form, company_id: Number(form.company_id) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save template.");
      setEditorOpen(false); setMessage({ text: editingId ? "Template updated." : "Template created.", tone: "success" }); await loadTemplates();
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : "Could not save template.", tone: "danger" }); } finally { setSaving(false); }
  }

  async function removeTemplate(template: Template) {
    if (!window.confirm(`Delete ${template.name}?`)) return;
    const response = await fetch(`/api/crm/templates?id=${template.id}`, { method: "DELETE" }); const result = await response.json();
    if (!response.ok) { setMessage({ text: result.error ?? "Could not delete template.", tone: "danger" }); return; }
    setMessage({ text: "Template deleted.", tone: "success" }); await loadTemplates();
  }

  async function duplicateTemplate(template: Template) {
    const response = await fetch("/api/crm/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "duplicate", template_id: template.id }) }); const result = await response.json();
    if (!response.ok) { setMessage({ text: result.error ?? "Could not duplicate template.", tone: "danger" }); return; }
    setMessage({ text: "Template duplicated as a draft.", tone: "success" }); await loadTemplates();
  }

  async function sendTest() {
    setSaving(true);
    try {
      const response = await fetch("/api/crm/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test", template_id: activeTemplate?.id ?? editingId, mailbox_id: Number(testMailboxId), to: testTo }) }); const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not send test email.");
      setTestOpen(false); setMessage({ text: result.message, tone: "success" });
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : "Could not send test email.", tone: "danger" }); } finally { setSaving(false); }
  }

  return <>
    <PageHeader eyebrow="Business CRM / Email Marketing" title="Email templates" description="Build reusable operational and marketing emails with safe personalization variables." actions={<Button onClick={openNew}><IconPlus className="h-4 w-4" />New template</Button>} />
    {message ? <div className="mb-5"><Alert tone={message.tone}>{message.text}</Alert></div> : null}
    <Card className="mb-5"><div className="flex flex-wrap items-end justify-between gap-4"><Field label="Company"><SelectInput value={companyId} onChange={(event) => setCompanyId(event.target.value)}>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</SelectInput></Field><div className="rounded-xl border border-border bg-[#fcfaf9] px-4 py-3 text-sm text-muted">{templates.length} saved template{templates.length === 1 ? "" : "s"}</div></div></Card>
    {templates.length ? <div className="grid gap-4 xl:grid-cols-2">{templates.map((template) => <Card key={template.id} className="group transition hover:-translate-y-0.5 hover:shadow-[0_16px_38px_rgba(72,45,38,0.1)]"><div className="flex items-start justify-between gap-4"><div><Badge tone={template.status === "active" ? "success" : template.status === "archived" ? "neutral" : "warning"}>{template.status}</Badge><h2 className="mt-3 text-lg font-bold">{template.name}</h2><p className="mt-1 text-sm text-muted">{template.subject}</p></div><span className="text-xs text-muted">{formatDate(template.updated_at)}</span></div><p className="mt-4 line-clamp-3 whitespace-pre-wrap rounded-xl bg-[#fcfaf9] p-3 text-sm leading-6 text-muted">{template.text_body || "HTML template"}</p><div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4"><Button variant="secondary" onClick={() => openEdit(template)}><IconEdit className="h-4 w-4" />Edit</Button><Button variant="secondary" onClick={() => duplicateTemplate(template)}>Duplicate</Button><Button variant="ghost" onClick={() => { setEditingId(template.id); setTestOpen(true); }}>Test email</Button><Button variant="ghost" className="text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => removeTemplate(template)}><IconTrash className="h-4 w-4" />Delete</Button></div></Card>)}</div> : <Card><div className="py-12 text-center"><p className="text-lg font-bold">No templates yet</p><p className="mt-2 text-sm text-muted">Create your first reusable email template for this company.</p><Button className="mt-5" onClick={openNew}><IconPlus className="h-4 w-4" />Create template</Button></div></Card>}

    <Modal size="wide" open={editorOpen} onClose={() => setEditorOpen(false)} title={editingId ? "Edit email template" : "Create email template"} description="Build a reusable email with safe personalization variables and live design preview."><div className="grid gap-7 xl:grid-cols-[minmax(400px,0.9fr)_minmax(480px,1.1fr)]"><div className="space-y-4"><div className="grid gap-4 sm:grid-cols-2"><Field label="Company"><SelectInput value={form.company_id} onChange={(event) => setForm({ ...form, company_id: event.target.value })}>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</SelectInput></Field><Field label="Status"><SelectInput value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></SelectInput></Field></div><Field label="Template name"><TextInput value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Welcome email" /></Field><Field label="Subject"><TextInput value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} placeholder="Welcome, {{first_name}}" /></Field><div><p className="mb-2 text-sm font-semibold">Personalization variables</p><div className="flex flex-wrap gap-2">{variables.map((variable) => <button type="button" key={variable} className="rounded-full border border-primary/20 bg-primary-soft px-3 py-1.5 text-xs font-semibold text-primary hover:bg-primary-soft/70" onClick={() => insertVariable(variable)}>{`{{${variable}}}`}</button>)}</div></div><div><p className="mb-2 text-sm font-semibold">Design blocks</p><div className="flex flex-wrap gap-2"><button type="button" className="rounded-lg border border-[#dbe5ea] bg-[#f5f8fa] px-3 py-2 text-xs font-semibold text-[#304654] hover:border-primary/30" onClick={() => insertDesignBlock("announcement")}>Announcement header</button><button type="button" className="rounded-lg border border-[#dbe5ea] bg-[#f5f8fa] px-3 py-2 text-xs font-semibold text-[#304654] hover:border-primary/30" onClick={() => insertDesignBlock("callout")}>Callout box</button><button type="button" className="rounded-lg border border-[#dbe5ea] bg-[#f5f8fa] px-3 py-2 text-xs font-semibold text-[#304654] hover:border-primary/30" onClick={() => insertDesignBlock("button")}>CTA button</button></div></div><Field label="HTML / body"><textarea className="min-h-72 w-full rounded-xl border border-border bg-white px-3 py-2.5 font-mono text-xs leading-6 outline-none focus:border-primary" value={form.html_body} onChange={(event) => setForm({ ...form, html_body: event.target.value })} /></Field><Field label="Plain-text fallback"><textarea className="min-h-36 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm leading-6 outline-none focus:border-primary" value={form.text_body} onChange={(event) => setForm({ ...form, text_body: event.target.value })} /></Field><div className="flex justify-end gap-2 border-t border-border pt-4"><Button type="button" variant="secondary" onClick={() => setEditorOpen(false)}>Cancel</Button>{editingId ? <Button type="button" variant="secondary" onClick={() => setTestOpen(true)}>Send test</Button> : null}<Button type="button" loading={saving} onClick={saveTemplate}>Save template</Button></div></div><div className="rounded-2xl border border-border bg-[#f7fafb] p-4"><div className="mb-4 flex items-center justify-between"><div><p className="text-base font-bold">Live preview</p><p className="mt-1 text-xs text-muted">Sample values replace your variables.</p></div><div className="flex rounded-lg border border-border bg-white p-1"><button type="button" className={`rounded-md px-3 py-1.5 text-xs font-semibold ${previewMode === "desktop" ? "bg-primary-soft text-primary" : "text-muted"}`} onClick={() => setPreviewMode("desktop")}>Desktop</button><button type="button" className={`rounded-md px-3 py-1.5 text-xs font-semibold ${previewMode === "mobile" ? "bg-primary-soft text-primary" : "text-muted"}`} onClick={() => setPreviewMode("mobile")}>Mobile</button></div></div><div className="flex min-h-[680px] items-start justify-center rounded-xl border border-[#dfe8ec] bg-[#eaf1f4] p-5"><iframe title="Email template preview" sandbox="" srcDoc={previewHtml(form.html_body)} className={`h-[620px] rounded-xl border border-border bg-white shadow-[0_14px_35px_rgba(24,50,74,0.12)] ${previewMode === "mobile" ? "w-[320px]" : "w-full"}`} /></div></div></div></Modal>
    <Modal open={testOpen} onClose={() => setTestOpen(false)} title="Send test email" description="Test the template through an encrypted connected mailbox."><div className="space-y-4"><Field label="Connected mailbox"><SelectInput value={testMailboxId} onChange={(event) => setTestMailboxId(event.target.value)}><option value="">Select mailbox</option>{mailboxes.filter((mailbox) => mailbox.status === "connected").map((mailbox) => <option key={mailbox.id} value={mailbox.id}>{mailbox.email_address}</option>)}</SelectInput></Field><Field label="Send test to"><TextInput type="email" value={testTo} onChange={(event) => setTestTo(event.target.value)} placeholder="you@example.com" /></Field><div className="flex justify-end gap-2 border-t border-border pt-4"><Button variant="secondary" onClick={() => setTestOpen(false)}>Cancel</Button><Button loading={saving} onClick={sendTest}>Send test</Button></div></div></Modal>
  </>;
}