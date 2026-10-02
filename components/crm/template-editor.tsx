"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { html } from "@codemirror/lang-html";
import { openSearchPanel } from "@codemirror/search";
import type { EditorView } from "@uiw/react-codemirror";
import { IconArrowRight, IconCopy, IconExpand, IconMail, IconSearch } from "@/components/icons";
import { Alert } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, SelectInput, TextInput } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";

const CodeMirror = dynamic(() => import("@uiw/react-codemirror"), { ssr: false });

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
  const htmlEditorRef = useRef<EditorView | null>(null);
  const expandedHtmlEditorRef = useRef<EditorView | null>(null);
  const htmlSelectionRef = useRef({ anchor: 0, head: 0 });
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
  const [htmlExpanded, setHtmlExpanded] = useState(false);
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

  function activeHtmlEditor() {
    return htmlExpanded ? expandedHtmlEditorRef.current : htmlEditorRef.current;
  }

  function handleHtmlEditorCreated(editor: EditorView, expanded: boolean) {
    const documentLength = editor.state.doc.length;
    const selection = htmlSelectionRef.current;
    editor.dispatch({ selection: {
      anchor: Math.min(selection.anchor, documentLength),
      head: Math.min(selection.head, documentLength),
    } });
    if (expanded) expandedHtmlEditorRef.current = editor;
    else htmlEditorRef.current = editor;
  }

  function handleHtmlEditorUpdate(update: { state: EditorView["state"]; view: EditorView; focusChanged: boolean }) {
    const { anchor, head } = update.state.selection.main;
    htmlSelectionRef.current = { anchor, head };
    if (update.focusChanged && update.view.hasFocus) setInsertTarget("body");
  }

  function findInHtml() {
    const editor = activeHtmlEditor();
    if (!editor) return;
    editor.focus();
    openSearchPanel(editor);
  }

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
    const htmlEditor = form.content_mode === "html" ? activeHtmlEditor() : null;
    if (htmlEditor) {
      const editor = htmlEditor;
      const { from, to } = editor.state.selection.main;
      editor.dispatch({
        changes: { from, to, insert: token },
        selection: { anchor: from + token.length },
      });
      editor.focus();
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
    const htmlEditor = activeHtmlEditor();
    if (htmlEditor) {
      const editor = htmlEditor;
      const { from, to } = editor.state.selection.main;
      const before = editor.state.doc.sliceString(0, from);
      const after = editor.state.doc.sliceString(to);
      const prefix = before && !before.endsWith("\n") ? "\n\n" : "";
      const suffix = after && !after.startsWith("\n") ? "\n\n" : "";
      const insertion = `${prefix}${html}${suffix}`;
      editor.dispatch({
        changes: { from, to, insert: insertion },
        selection: { anchor: from + insertion.length },
      });
      editor.focus();
      return;
    }
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
    if (contentMode !== "html") htmlEditorRef.current = null;
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
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-base font-bold">Email content</h2><p className="mt-1 text-xs text-muted">Changes appear in the preview as you type.</p></div><div className="flex flex-wrap items-center gap-2"><div role="tablist" aria-label="Email content format" className="flex rounded-lg border border-border bg-white p-1"><button type="button" role="tab" aria-selected={form.content_mode === "html"} onClick={() => changeContentMode("html")} className={`rounded-md px-4 py-2 text-sm font-semibold ${form.content_mode === "html" ? "bg-primary text-white" : "text-muted hover:text-foreground"}`}>HTML</button><button type="button" role="tab" aria-selected={form.content_mode === "plain"} onClick={() => changeContentMode("plain")} className={`rounded-md px-4 py-2 text-sm font-semibold ${form.content_mode === "plain" ? "bg-primary text-white" : "text-muted hover:text-foreground"}`}>Plain text</button></div>{form.content_mode === "html" ? <><Button variant="secondary" className="px-3 py-2" onClick={findInHtml} title="Find in HTML (Ctrl+F)"><IconSearch className="h-4 w-4" /><span className="hidden sm:inline">Find</span></Button><Button variant="secondary" className="px-3 py-2" onClick={() => setHtmlExpanded(true)} title="Open full-screen HTML editor"><IconExpand className="h-4 w-4" /><span className="hidden sm:inline">Expand</span></Button></> : null}</div></div>
          {form.content_mode === "html" ? <div className="mb-3 flex flex-wrap items-center gap-2"><span className="mr-1 text-xs font-semibold text-muted">Insert block</span>{starterBlocks.map((block) => <Button type="button" key={block.label} variant="secondary" className="px-3 py-1.5 text-xs" onClick={() => insertBlock(block.html)}>{block.label}</Button>)}</div> : null}
          {form.content_mode === "html" ? htmlExpanded ? (
            <div className="grid min-h-[440px] place-items-center rounded-xl border border-dashed border-border bg-stone-50 text-sm text-muted">HTML editor is open in the expanded workspace.</div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-border bg-white shadow-sm transition focus-within:border-primary focus-within:ring-4 focus-within:ring-primary/10">
              <CodeMirror
                id="template-content"
                value={form.html_body}
                height="520px"
                theme="light"
                extensions={[html({ autoCloseTags: true })]}
                basicSetup
                onCreateEditor={(editor) => handleHtmlEditorCreated(editor, false)}
                onChange={(value) => setForm((current) => ({ ...current, html_body: value }))}
                onUpdate={handleHtmlEditorUpdate}
                aria-label="HTML email source"
                className="text-[13px]"
              />
            </div>
          ) : (
            <textarea id="template-content" ref={bodyRef} value={bodyValue} onFocus={() => setInsertTarget("body")} onChange={(event) => setForm((current) => ({ ...current, text_body: event.target.value }))} spellCheck className="min-h-[440px] w-full resize-y rounded-lg border border-border bg-[#fbfcfa] p-4 font-sans text-sm leading-6 text-foreground outline-none focus:border-primary focus:ring-4 focus:ring-primary/10" placeholder="Write a clear plain-text email…" />
          )}
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

    <Modal size="full" open={htmlExpanded} onClose={() => setHtmlExpanded(false)} title="HTML editor and preview" description="Edit the full email, search HTML, and review the live rendering side by side.">
      <div className="flex h-full min-h-0 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 border-b border-stone-200 pb-3">
          <Button variant="secondary" className="px-3 py-2" onClick={findInHtml}><IconSearch className="h-4 w-4" />Find in HTML</Button>
          <span className="ml-1 text-xs font-semibold text-stone-500">Insert variable at cursor:</span>
          {variableDefinitions.map((variable) => <button type="button" key={variable.key} onMouseDown={(event) => event.preventDefault()} onClick={() => { setInsertTarget("body"); insertToken(variable.key); }} className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 font-mono text-xs font-semibold text-primary transition hover:border-primary/30 hover:bg-rose-50">{`{{${variable.key}}}`}</button>)}
        </div>
        <div className="grid min-h-0 flex-1 grid-rows-2 gap-3 xl:grid-cols-2 xl:grid-rows-1">
          <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-stone-200 bg-white">
            <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50 px-3 py-2"><span className="text-xs font-bold uppercase tracking-wider text-stone-600">HTML source</span><span className="text-xs text-stone-500">Ctrl/Cmd + F to search</span></div>
            <div className="min-h-0 flex-1 overflow-hidden">
              <CodeMirror
                id="template-content-expanded"
                value={form.html_body}
                height="100%"
                theme="light"
                extensions={[html({ autoCloseTags: true })]}
                basicSetup
                onCreateEditor={(editor) => handleHtmlEditorCreated(editor, true)}
                onChange={(value) => setForm((current) => ({ ...current, html_body: value }))}
                onUpdate={handleHtmlEditorUpdate}
                aria-label="Expanded HTML email source"
                className="h-full text-[13px]"
              />
            </div>
          </section>
          <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-stone-200 bg-stone-100">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 bg-white px-3 py-2.5">
              <div><p className="text-xs font-bold uppercase tracking-wider text-stone-700">Live preview</p><p className="mt-0.5 max-w-[50vw] truncate text-xs text-stone-500">{renderedSubject}</p></div>
              <div className="flex rounded-lg border border-stone-200 p-1"><button type="button" onClick={() => setPreviewSize("desktop")} aria-pressed={previewSize === "desktop"} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${previewSize === "desktop" ? "bg-rose-100 text-rose-700" : "text-stone-500"}`}>Desktop</button><button type="button" onClick={() => setPreviewSize("mobile")} aria-pressed={previewSize === "mobile"} className={`rounded-md px-3 py-1.5 text-xs font-semibold ${previewSize === "mobile" ? "bg-rose-100 text-rose-700" : "text-stone-500"}`}>Mobile</button></div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-3">
              <iframe title="Expanded rendered HTML email preview" sandbox="" srcDoc={previewDocument} className="mx-auto h-full min-h-[420px] border-0 bg-white shadow-sm" style={{ width: previewSize === "mobile" ? "min(100%, 390px)" : "100%" }} />
            </div>
          </section>
        </div>
        <div className="flex justify-end border-t border-stone-200 pt-3"><Button variant="secondary" onClick={() => setHtmlExpanded(false)}>Done</Button></div>
      </div>
    </Modal>

    <Modal open={testOpen} onClose={() => setTestOpen(false)} title="Send test email" description="Send this saved template through a connected Hostinger mailbox."><div className="space-y-4"><Field label="Connected mailbox"><SelectInput value={testMailboxId} onChange={(event) => setTestMailboxId(event.target.value)}><option value="">Select mailbox</option>{mailboxes.filter((mailbox) => mailbox.status === "connected").map((mailbox) => <option key={mailbox.id} value={mailbox.id}>{mailbox.email_address}</option>)}</SelectInput></Field><Field label="Send test to"><TextInput type="email" value={testTo} onChange={(event) => setTestTo(event.target.value)} placeholder="you@example.com" /></Field><div className="flex justify-end gap-2 border-t border-border pt-4"><Button variant="secondary" onClick={() => setTestOpen(false)}>Cancel</Button><Button loading={saving} onClick={() => void sendTest()} disabled={!testMailboxId || !testTo}>Send test</Button></div></div></Modal>
  </>;
}
