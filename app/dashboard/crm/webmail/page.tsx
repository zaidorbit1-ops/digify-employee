"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { IconEdit, IconPlus, IconRefresh, IconTrash } from "@/components/icons";
import { Alert } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, SelectInput, TextInput } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/components/auth/auth-provider";

type Company = { id: number; name: string; status: string };
type Mailbox = { id: number; company_id: number; email_address: string; display_name: string | null; status: string; last_webhook_at?: string | null; last_error?: string | null };
type MailboxForm = { company_id: string; email_address: string; display_name: string; status: string };

const blank: MailboxForm = { company_id: "", email_address: "", display_name: "", status: "pending" };

function formatDate(value?: string | null) {
  if (!value) return "No webhook received yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "No webhook received yet" : date.toLocaleString();
}

export default function CrmWebmailPage() {
  const { profile } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [form, setForm] = useState(blank);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "success" | "danger" } | null>(null);
  const [permissions, setPermissions] = useState({ can_add: true, can_edit: true, can_delete: true });

  async function loadCompanies() {
    const response = await fetch("/api/crm/companies?module=crm_webmail", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not load companies.");
    setCompanies(result.companies ?? []);
    if (!companyId && result.companies?.[0]) setCompanyId(String(result.companies[0].id));
  }

  async function loadMailboxes() {
    if (!companyId) return setMailboxes([]);
    const response = await fetch(`/api/crm/mailboxes?company_id=${companyId}`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not load mailboxes.");
    setMailboxes(result.mailboxes ?? []);
  }

  useEffect(() => { loadCompanies().catch((error) => setMessage({ text: error.message, tone: "danger" })); }, []);
  useEffect(() => { loadMailboxes().catch((error) => setMessage({ text: error.message, tone: "danger" })); }, [companyId]);
  useEffect(() => {
    if (profile?.role !== "employee") return;
    fetch("/api/me/permissions", { cache: "no-store" }).then((response) => response.json()).then((result) => {
      const permission = (result.permissions ?? []).find((item: { module: string }) => item.module === "crm_webmail");
      setPermissions(permission ?? { can_add: false, can_edit: false, can_delete: false });
    }).catch(() => setPermissions({ can_add: false, can_edit: false, can_delete: false }));
  }, [profile?.role]);

  function openAdd() { setEditingId(null); setForm({ ...blank, company_id: companyId }); setModalOpen(true); }
  function openEdit(mailbox: Mailbox) { setEditingId(mailbox.id); setForm({ company_id: String(mailbox.company_id), email_address: mailbox.email_address, display_name: mailbox.display_name ?? "", status: mailbox.status }); setModalOpen(true); }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/crm/mailboxes", { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, id: editingId ?? undefined, company_id: Number(form.company_id) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save mailbox.");
      setModalOpen(false); setMessage({ text: "Hostinger mailbox saved.", tone: "success" }); await loadMailboxes();
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : "Could not save mailbox.", tone: "danger" }); }
    finally { setBusy(false); }
  }

  async function update(mailbox: Mailbox, values: Record<string, unknown>) {
    setBusy(true);
    try {
      const response = await fetch("/api/crm/mailboxes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: mailbox.id, ...values }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not update mailbox.");
      await loadMailboxes(); setMessage({ text: "Mailbox updated.", tone: "success" });
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : "Could not update mailbox.", tone: "danger" }); }
    finally { setBusy(false); }
  }

  async function test(mailbox: Mailbox) {
    setBusy(true);
    try {
      const response = await fetch("/api/crm/mailboxes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: mailbox.id, action: "test" }) });
      const result = await response.json();
      const details = Array.isArray(result.checks) ? result.checks.map((check: { ok: boolean; name: string; reason: string }) => `${check.ok ? "OK" : "FAIL"} ${check.name}: ${check.reason}`).join(" | ") : "";
      if (!response.ok) throw new Error(details || result.error || "Could not test mailbox.");
      setMessage({ text: `${result.message} ${details}`, tone: "success" });
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : "Could not test mailbox.", tone: "danger" }); }
    finally { setBusy(false); }
  }
  async function remove(mailbox: Mailbox) {
    if (!window.confirm(`Delete ${mailbox.email_address}?`)) return;
    setBusy(true);
    try { const response = await fetch(`/api/crm/mailboxes?id=${mailbox.id}`, { method: "DELETE" }); if (!response.ok) throw new Error("Could not delete mailbox."); await loadMailboxes(); setMessage({ text: "Mailbox removed.", tone: "success" }); }
    catch (error) { setMessage({ text: error instanceof Error ? error.message : "Could not delete mailbox.", tone: "danger" }); }
    finally { setBusy(false); }
  }

  return <>
    <PageHeader eyebrow="Business CRM / Webmail" title="Hostinger Mailboxes" description="Manage the Hostinger mailbox used by CRM inboxes, replies, and campaigns." actions={<Button onClick={openAdd} disabled={!companyId || !permissions.can_add}><IconPlus className="h-4 w-4" />Add mailbox</Button>} />
    {message ? <div className="mb-5"><Alert tone={message.tone}>{message.text}</Alert></div> : null}
    <Card className="mb-6 p-5"><Field label="Company"><SelectInput value={companyId} onChange={(event) => setCompanyId(event.target.value)}>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</SelectInput></Field></Card>
    <div className="grid gap-5 md:grid-cols-2">
      {mailboxes.map((mailbox) => <Card key={mailbox.id} className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3"><div><Link href={`/dashboard/crm/webmail/${mailbox.id}`} className="text-lg font-bold text-slate-900 hover:text-primary">{mailbox.display_name || mailbox.email_address}</Link><p className="text-sm text-slate-500">{mailbox.email_address}</p></div><Badge tone={mailbox.status === "connected" ? "success" : mailbox.status === "error" ? "danger" : "warning"}>{mailbox.status}</Badge></div>
        <div className="rounded-xl bg-slate-50 p-3 text-sm text-slate-600"><p className="font-semibold text-slate-800">Webhook delivery</p><p className="mt-1">{formatDate(mailbox.last_webhook_at)}</p>{mailbox.last_error ? <p className="mt-2 text-rose-700">{mailbox.last_error}</p> : null}</div>
        <div className="flex flex-wrap gap-2"><Button variant="secondary" loading={busy} onClick={() => test(mailbox)} disabled={!permissions.can_edit}><IconRefresh className="h-4 w-4" />Test</Button><Button variant="secondary" onClick={() => openEdit(mailbox)} disabled={!permissions.can_edit}><IconEdit className="h-4 w-4" />Edit</Button><Button variant="ghost" onClick={() => update(mailbox, { status: mailbox.status === "disconnected" ? "pending" : "disconnected" })} disabled={!permissions.can_edit}>{mailbox.status === "disconnected" ? "Reconnect" : "Disconnect"}</Button><Button variant="ghost" className="text-rose-600" onClick={() => remove(mailbox)} disabled={!permissions.can_delete}><IconTrash className="h-4 w-4" />Delete</Button></div>
      </Card>)}
    </div>
    {!mailboxes.length && companyId ? <Card className="p-10 text-center text-sm text-slate-500">No Hostinger mailboxes connected for this company.</Card> : null}
    <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? "Edit Hostinger mailbox" : "Connect Hostinger mailbox"} description="The API token and webhook secret stay on the server. Only the mailbox address is stored here.">
      <form className="space-y-4" onSubmit={save}><Field label="Company"><SelectInput value={form.company_id} onChange={(event) => setForm({ ...form, company_id: event.target.value })}>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</SelectInput></Field><Field label="Mailbox email address"><TextInput required type="email" value={form.email_address} onChange={(event) => setForm({ ...form, email_address: event.target.value })} placeholder="info@example.com" /></Field><Field label="Display name"><TextInput value={form.display_name} onChange={(event) => setForm({ ...form, display_name: event.target.value })} placeholder="Support" /></Field><div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button><Button type="submit" loading={busy}>Save mailbox</Button></div></form>
    </Modal>
  </>;
}
