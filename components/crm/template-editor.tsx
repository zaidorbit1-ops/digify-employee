"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { IconArrowRight, IconCopy, IconMail } from "@/components/icons";
import { Alert } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, SelectInput, TextInput } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";

type Company = { id: number; name: string };
type Mailbox = { id: number; email_address: string; status: string };
type Template = { id: number; company_id: number; name: string; subject: string; html_body: string; text_body: string | null; content_mode?: "html" | "plain"; variables: string[]; status: string };
type TemplateForm = { company_id: string; name: string; subject: string; html_body: string; text_body: string; content_mode: "html" | "plain"; status: string };
type Props = { templateId?: string };

const variableDefinitions = [
  { key: "first_name", label: "First name", sample: "Sam", description: "Contact's given name" },
  { key: "last_name", label: "Last name", sample: "Wilson", description: "Contact's family name" },
  { key: "email", label: "Email", sample: "sam@example.com", description: "Contact email address" },
  { key: "company_name", label: "Company", sample: "Acme Studio", description: "Company associated with the contact" },
] as const;

const defaultHtml = "<h1>Hello {{first_name}},</h1>\n<p>Write your email content here.</p>";
const defaultText = "Hello {{first_name}},\n\nWrite your email content here.";
const starterBlocks = [
  { label: "Heading", html: "<h1 style=\"margin:0 0 16px;font-size:28px;line-height:1.25;color:#19384a\">Your headline</h1>" },
  { label: "Paragraph", html: "<p style=\"margin:0 0 16px;font-size:16px;line-height:1.65;color:#344b57\">Add a clear, useful message for your reader.</p>" },
  { label: "Call to action", html: "<p style=\"margin:24px 0\"><a href=\"https://example.com\" style=\"display:inline-block;padding:13px 20px;background:#d54d46;color:#fff;text-decoration:none;border-radius:6px;font-weight:700\">View details</a></p>" },
  { label: "Divider", html: "<hr style=\"border:0;border-top:1px solid #dce5e8;margin:24px 0\">" },
];

function replaceVariables(value: string) {
  return variableDefinitions.reduce((result, variable) => result.replace(new RegExp(`\\{\\{\\s*${variable.key}\\s*\\}\\}`, "g"), variable.sample), value);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function makePreviewDocument(html: string) {
  return `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>*,*:before,*:after{box-sizing:border-box}body{margin:0;padding:24px;background:#f2f5f3;color:#253943;font-family:Arial,Helvetica,sans-serif;line-height:1.6}.email{width:100%;max-width:600px;min-height:240px;margin:0 auto;padding:32px;background:#fff;border:1px solid #e0e7e3}img{max-width:100%;height:auto}a{color:#bd423c}</style></head><body><main class="email">${replaceVariables(html)}</main></body></html>`;
}

function extractVariables(value: string) {
  return variableDefinitions.filter(({ key }) => new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`).test(value)).map(({ key }) => key);
}

export function TemplateEditor({ templateId }: Props) {
  const router = useRouter();
  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [form, setForm] = useState<TemplateForm>({ company_id: "", name: "", subject: "", html_body: defaultHtml, text_body: defaultText, content_mode: "html", status: "draft" });
  const [previewSize, setPreviewSize] = useState<"desktop" | "mobile">("desktop");
  const [previewTab, setPreviewTab] = useState<"rendered" | "source">("rendered");
  const [insertTarget, setInsertTarget] = useState<"subject" | "body">("body");
  const [loading, setLoading] = useState(Boolean(templateId));
  const [saving, setSaving] = useState(false);
  const [loadedTemplate, setLoadedTemplate] = useState<Template | null>(null);
  const [message, setMessage] = useState<{ text: string; tone: "success" | "danger" } | null>(null);
  const [testOpen, setTestOpen] = useState(false);
  const [testTo, setTestTo] = useState("");
  const [testMailboxId, setTestMailboxId] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const companyResponse = await fetch("/api/crm/companies", { cache: "no-store" });
        const companyResult = await companyResponse.json();
        if (!companyResponse.ok) throw new Error(companyResult.error ?? "Could not load companies.");
        if (cancelled) return;
        const companyRows = companyResult.companies ?? [];
        setCompanies(companyRows);
        if (templateId) {
          const response = await fetch(`/api/crm/templates?id=${encodeURIComponent(templateId)}`, { cache: "no-store" });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error ?? "Could not load email template.");
          if (cancelled) return;
          const template = result.template as Template;
          setLoadedTemplate(template);
          setForm({ company_id: String(template.company_id), name: template.name, subject: template.subject, html_body: template.html_body, text_body: template.text_body ?? "", content_mode: template.content_mode ?? "html", status: template.status });
          await loadMailboxes(template.company_id, cancelled);
        } else if (companyRows[0]) {
          setForm((current) => ({ ...current, company_id: String(companyRows[0].id) }));
          await loadMailboxes(companyRows[0].id, cancelled);
        }
      } catch (cause) {
        if (!cancelled) setMessage({ text: cause instanceof Error ? cause.message : "Could not load template editor.", tone: "danger" });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [templateId]);

  async function loadMailboxes(company: number, cancelled = false) {
    if (!company) return;
    const response = await fetch(`/api/crm/mailboxes?company_id=${company}`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not load connected mailboxes.");
    if (!cancelled) {
      const rows = result.mailboxes ?? [];
      setMailboxes(rows);
      if (!testMailboxId && rows.find((mailbox: Mailbox) => mailbox.status === "connected")) setTestMailboxId(String(rows.find((mailbox: Mailbox) => mailbox.status === "connected").id));
    }
  }

  useEffect(() => {
    if (templateId || !form.company_id) return;
    void loadMailboxes(Number(form.company_id)).catch((cause) => setMessage({ text: cause instanceof Error ? cause.message : "Could not load connected mailboxes.", tone: "danger" }));
  }, [form.company_id, templateId]);

  const renderedVariables = useMemo(() => extractVariables(`${form.subject}\n${form.content_mode === "html" ? form.html_body : form.text_body}`), [form]);
  const bodyValue = form.content_mode === "html" ? form.html_body : form.text_body;
  const renderedSubject = replaceVariables(form.subject || "Your email subject");
  const renderedPlain = replaceVariables(form.text_body);
  const previewDocument = useMemo(() => makePreviewDocument(form.content_mode === "html" ? form.html_body : `<div style="white-space:pre-wrap">${escapeHtml(form.text_body)}</div>`), [form.content_mode, form.html_body, form.text_body]);

  function insertToken(key: string) {
    const token = `{{${key}}}`;
    if (insertTarget === "subject") {
      const input = subjectRef.current;
      const start = input?.selectionStart ?? form.subject.length;
      const end = input?.selectionEnd ?? start;
      const next = `${form.subject.slice(0, start)}${token}${form.subject.slice(end)}`;
      setForm((current) => ({ ...current, subject: next }));
      requestAnimationFrame(() => { input?.focus(); input?.setSelectionRange(start + token.length, start + token.length); });
      return;
    }
    const textarea = bodyRef.current;
    const currentText = form.content_mode === "html" ? form.html_body : form.text_body;
    const start = textarea?.selectionStart ?? currentText.length;
    const end = textarea?.selectionEnd ?? start;
    const next = `${currentText.slice(0, start)}${token}${currentText.slice(end)}`;
    setForm((current) => current.content_mode === "html" ? { ...current, html_body: next } : { ...current, text_body: next });
    requestAnimationFrame(() => { textarea?.focus(); textarea?.setSelectionRange(start + token.length, start + token.length); });
  }

  function insertBlock(html: string) {
    const textarea = bodyRef.current;
    const current = form.html_body;
    const start = textarea?.selectionStart ?? current.length;
    const end = textarea?.selectionEnd ?? start;
    const before = current.slice(0, start).trimEnd();
    const after = current.slice(end).trimStart();
    const next = `${before}${before ? "\n\n" : ""}${html}${after ? `\n\n${after}` : ""}`;
    setForm((value) => ({ ...value, html_body: next }));
    requestAnimationFrame(() => { textarea?.focus(); textarea?.setSelectionRange(start + html.length + (before ? 2 : 0), start + html.length + (before ? 2 : 0)); });
  }

  function changeContentMode(contentMode: "html" | "plain") {
    setPreviewTab("rendered");
    setForm((current) => ({ ...current, content_mode: contentMode }));
  }

  async function saveTemplate() {
    setSaving(true); setMessage(null);
    try {
      const variables = extractVariables(`${form.subject}\n${form.content_mode === "html" ? form.html_body : form.text_body}`);
      const response = await fetch("/api/crm/templates", {
        method: templateId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, id: templateId ? Number(templateId) : undefined, company_id: Number(form.company_id), variables }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save email template.");
      const saved = result.template as Template;
      setLoadedTemplate(saved);
      setMessage({ text: templateId ? "Template saved." : "Template created. You can now send a test email." , tone: "success" });
      if (!templateId) router.replace(`/dashboard/crm/templates/${saved.id}`);
    } catch (cause) {
      setMessage({ text: cause instanceof Error ? cause.message : "Could not save email template.", tone: "danger" });
    } finally { setSaving(false); }
  }

  async function sendTest() {
    if (!loadedTemplate && !templateId) return;
    setSaving(true);
    try {
      const response = await fetch("/api/crm/templates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "test", template_id: loadedTemplate?.id ?? Number(templateId), mailbox_id: Number(testMailboxId), to: testTo }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not send test email.");
      setTestOpen(false); setMessage({ text: result.message, tone: "success" });
    } catch (cause) {
      setMessage({ text: cause instanceof Error ? cause.message : "Could not send test email.", tone: "danger" });
    } finally { setSaving(false); }
  }

  return <>
    <PageHeader eyebrow="Business CRM / Email Marketing / Editor" title={templateId ? form.name || "Edit template" : "New email template"} description="Compose in HTML or plain text, personalize with contact fields, and review the result before sending." actions={<div className="flex flex-wrap gap-2"><Link href="/dashboard/crm/templates" className="inline-flex items-center gap-2 rounded-lg border border-border bg-white px-3 py-2 text-sm font-semibold text-muted hover:text-foreground"><IconArrowRight className="h-4 w-4 rotate-180" />All templates</Link><Button variant="secondary" onClick={() => setTestOpen(true)} disabled={!loadedTemplate && !templateId}><IconMail className="h-4 w-4" />Test email</Button><Button loading={saving} onClick={() => void saveTemplate()}>{templateId ? "Save changes" : "Save template"}</Button></div>} />
    {message ? <div className="mb-5"><Alert tone={message.tone}>{message.text}</Alert></div> : null}
    {loading ? <Card className="p-8 text-sm text-muted">Loading template…</Card> : <>
      <section className="mb-5 grid gap-3 sm:grid-cols-[minmax(220px,1fr)_minmax(220px,1fr)_180px]">
        <Field label="Company"><SelectInput value={form.company_id} onChange={(event) => setForm({ ...form, company_id: event.target.value })}>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</SelectInput></Field>
        <Field label="Template name"><TextInput required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Welcome email" /></Field>
        <Field label="Status"><SelectInput value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="draft">Draft</option><option value="active">Active</option><option value="archived">Archived</option></SelectInput></Field>
      </section>
      <div className="mb-5 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,0.55fr)]">
        <Field label="Subject line"><input ref={subjectRef} value={form.subject} onFocus={() => setInsertTarget("subject")} onChange={(event) => setForm({ ...form, subject: event.target.value })} placeholder="A useful subject for {{first_name}}" className="w-full rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm text-foreground outline-none transition placeholder:text-stone-400 focus:border-primary focus:ring-4 focus:ring-primary/12" /></Field>
        <div className="flex items-end gap-2 rounded-lg border border-border bg-white px-3 py-2"><span className="text-xs font-semibold uppercase text-muted">Preview subject</span><span className="min-w-0 truncate text-sm font-medium">{renderedSubject}</span></div>
      </div>

      <section className="mb-5 border-y border-border py-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><h2 className="text-sm font-bold">Personalization</h2><p className="mt-1 text-xs text-muted">Select a field to insert it at the cursor in the subject or content.</p></div>
          <div className="flex items-center gap-1 rounded-lg border border-border bg-white p-1"><button type="button" onClick={() => setInsertTarget("subject")} aria-pressed={insertTarget === "subject"} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${insertTarget === "subject" ? "bg-primary-soft text-primary" : "text-muted hover:text-foreground"}`}>Subject</button><button type="button" onClick={() => setInsertTarget("body")} aria-pressed={insertTarget === "body"} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${insertTarget === "body" ? "bg-primary-soft text-primary" : "text-muted hover:text-foreground"}`}>Content</button></div>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">{variableDefinitions.map((variable) => <button type="button" key={variable.key} onClick={() => insertToken(variable.key)} className="flex min-w-0 items-center justify-between gap-3 rounded-lg border border-border bg-white px-3 py-2.5 text-left transition hover:border-primary/40 hover:bg-[#fbf8f6]"><span className="min-w-0"><span className="block text-sm font-semibold">{variable.label}</span><span className="block truncate text-xs text-muted">{variable.description}</span></span><code className="shrink-0 rounded bg-[#f2f5f3] px-2 py-1 text-[11px] text-primary">{`{{${variable.key}}}`}</code></button>)}</div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-xs"><span className="font-semibold text-muted">Used in this template:</span>{renderedVariables.length ? renderedVariables.map((key) => <Badge key={key} tone="primary">{key}</Badge>) : <span className="text-muted">No variables yet</span>}</div>
      </section>

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.95fr)]">
        <section className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-bold">Email content</h2><p className="mt-1 text-xs text-muted">Changes appear in the preview as you type.</p></div><div role="tablist" aria-label="Email content format" className="flex rounded-lg border border-border bg-white p-1"><button type="button" role="tab" aria-selected={form.content_mode === "html"} onClick={() => changeContentMode("html")} className={`rounded-md px-4 py-2 text-sm font-semibold ${form.content_mode === "html" ? "bg-primary text-white" : "text-muted hover:text-foreground"}`}>HTML</button><button type="button" role="tab" aria-selected={form.content_mode === "plain"} onClick={() => changeContentMode("plain")} className={`rounded-md px-4 py-2 text-sm font-semibold ${form.content_mode === "plain" ? "bg-primary text-white" : "text-muted hover:text-foreground"}`}>Plain text</button></div></div>
          {form.content_mode === "html" ? <div className="mb-3 flex flex-wrap items-center gap-2"><span className="mr-1 text-xs font-semibold text-muted">Insert block</span>{starterBlocks.map((block) => <Button type="button" key={block.label} variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => insertBlock(block.html)}>{block.label}</Button>)}</div> : null}
          <label className="sr-only" htmlFor="template-content">{form.content_mode === "html" ? "HTML email source" : "Plain-text email content"}</label>
          <textarea id="template-content" ref={bodyRef} value={bodyValue} onFocus={() => setInsertTarget("body")} onChange={(event) => setForm((current) => current.content_mode === "html" ? { ...current, html_body: event.target.value } : { ...current, text_body: event.target.value })} spellCheck={form.content_mode === "plain"} className={`min-h-[440px] w-full resize-y rounded-lg border border-border bg-[#fbfcfa] p-4 text-sm leading-6 text-foreground outline-none focus:border-primary focus:ring-4 focus:ring-primary/10 ${form.content_mode === "html" ? "font-mono" : "font-sans"}`} placeholder={form.content_mode === "html" ? "Write or paste email-safe HTML…" : "Write a clear plain-text email…"} />
          <p className="mt-2 text-xs text-muted">{form.content_mode === "html" ? "Paste email-compatible HTML. Inline styles are recommended for consistent inbox rendering." : "Plain text works in every email client and is sent as both text and a simple HTML fallback."}</p>
        </section>

        <section className="min-w-0 xl:sticky xl:top-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-bold">Live preview</h2><p className="mt-1 text-xs text-muted">Sample values are substituted for personalization fields.</p></div>{form.content_mode === "html" && previewTab === "rendered" ? <div className="flex items-center gap-1 rounded-lg border border-border bg-white p-1"><button type="button" onClick={() => setPreviewSize("desktop")} aria-pressed={previewSize === "desktop"} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${previewSize === "desktop" ? "bg-primary-soft text-primary" : "text-muted"}`}>Desktop</button><button type="button" onClick={() => setPreviewSize("mobile")} aria-pressed={previewSize === "mobile"} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${previewSize === "mobile" ? "bg-primary-soft text-primary" : "text-muted"}`}>Mobile</button></div> : null}</div>
          {previewTab === "rendered" ? <>
            <div className="mb-3 rounded-lg border border-border bg-white px-3 py-2"><p className="text-[10px] font-bold uppercase text-muted">Subject</p><p className="mt-1 truncate text-sm">{renderedSubject}</p></div>
            {form.content_mode === "plain" ? <div className="min-h-[440px] overflow-auto rounded-lg border border-border bg-white p-5"><div className="mx-auto min-h-[380px] border border-[#e3e8e4] bg-white p-5" style={{ maxWidth: previewSize === "mobile" ? 360 : 600 }}><pre className="whitespace-pre-wrap break-words font-sans text-sm leading-6 text-foreground">{renderedPlain}</pre></div></div> : <div className="min-h-[440px] overflow-hidden rounded-lg border border-border bg-[#f2f5f3] p-3"><div className="mx-auto overflow-hidden rounded-md border border-[#dce3df] bg-white shadow-sm transition-[width]" style={{ width: previewSize === "mobile" ? "min(100%, 375px)" : "100%" }}><div className="flex h-8 items-center gap-1.5 border-b border-border px-3"><span className="h-2 w-2 rounded-full bg-rose-300"/><span className="h-2 w-2 rounded-full bg-amber-300"/><span className="h-2 w-2 rounded-full bg-emerald-300"/><span className="ml-2 text-[10px] text-muted">Email preview</span></div><iframe title="Rendered HTML email preview" sandbox="" srcDoc={previewDocument} className="h-[400px] w-full border-0 bg-white" /></div></div>}
          </> : <pre className="min-h-[440px] max-h-[600px] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-border bg-[#fbfcfa] p-4 font-mono text-xs leading-5">{previewDocument}</pre>}
          {form.content_mode === "html" ? <button type="button" onClick={() => setPreviewTab((current) => current === "rendered" ? "source" : "rendered")} className="mt-3 inline-flex items-center gap-2 text-xs font-semibold text-primary hover:underline"><IconCopy className="h-3.5 w-3.5" />{previewTab === "rendered" ? "View generated preview HTML" : "Return to rendered preview"}</button> : null}
        </section>
      </div>
      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5"><p className="text-xs text-muted">{loadedTemplate ? `Last saved template · ${loadedTemplate.status}` : "Unsaved template"}</p><div className="flex gap-2"><Link href="/dashboard/crm/templates" className="inline-flex items-center rounded-lg px-4 py-2.5 text-sm font-semibold text-muted hover:bg-stone-50">Cancel</Link><Button loading={saving} onClick={() => void saveTemplate()}>{templateId ? "Save changes" : "Save template"}</Button></div></div>
    </>}

    <Modal open={testOpen} onClose={() => setTestOpen(false)} title="Send test email" description="Send this saved template through a connected Hostinger mailbox."><div className="space-y-4"><Field label="Connected mailbox"><SelectInput value={testMailboxId} onChange={(event) => setTestMailboxId(event.target.value)}><option value="">Select mailbox</option>{mailboxes.filter((mailbox) => mailbox.status === "connected").map((mailbox) => <option key={mailbox.id} value={mailbox.id}>{mailbox.email_address}</option>)}</SelectInput></Field><Field label="Send test to"><TextInput type="email" value={testTo} onChange={(event) => setTestTo(event.target.value)} placeholder="you@example.com" /></Field><div className="flex justify-end gap-2 border-t border-border pt-4"><Button variant="secondary" onClick={() => setTestOpen(false)}>Cancel</Button><Button loading={saving} onClick={() => void sendTest()} disabled={!testMailboxId || !testTo}>Send test</Button></div></div></Modal>
  </>;
}
