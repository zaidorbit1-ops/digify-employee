"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { IconEdit, IconPlus, IconRefresh, IconTrash } from "@/components/icons";
import { Alert } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, SelectInput, TextInput } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";

type Company = { id: number; name: string; status: string };
type Mailbox = {
  id: number;
  company_id: number;
  email_address: string;
  display_name: string | null;
  provider: string;
  imap_host: string;
  imap_port: number;
  imap_security: string;
  smtp_host: string;
  smtp_port: number;
  smtp_security: string;
  status: string;
  last_sync_at?: string | null;
  last_error?: string | null;
  created_at: string;
  updated_at: string;
};

type MailboxForm = {
  company_id: string;
  email_address: string;
  display_name: string;
  provider: string;
  imap_host: string;
  imap_port: string;
  imap_security: string;
  smtp_host: string;
  smtp_port: string;
  smtp_security: string;
  username: string;
  password: string;
  status: string;
};

const emptyForm: MailboxForm = {
  company_id: "",
  email_address: "",
  display_name: "",
  provider: "other",
  imap_host: "",
  imap_port: "993",
  imap_security: "ssl",
  smtp_host: "",
  smtp_port: "465",
  smtp_security: "ssl",
  username: "",
  password: "",
  status: "pending",
};

function formatDate(value?: string | null) {
  if (!value) return "Not synced yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not synced yet";
  return date.toLocaleString();
}

export default function CrmWebmailPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<string>("");
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "success" | "danger" } | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [testingMailboxId, setTestingMailboxId] = useState<number | null>(null);
  const [form, setForm] = useState<MailboxForm>(emptyForm);

  const selectedCompany = useMemo(
    () => companies.find((company) => String(company.id) === selectedCompanyId) ?? null,
    [companies, selectedCompanyId],
  );

  async function loadCompanies() {
    const response = await fetch("/api/crm/companies", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not load companies.");
    const nextCompanies = result.companies ?? [];
    setCompanies(nextCompanies);
    if (nextCompanies.length && !selectedCompanyId) {
      setSelectedCompanyId(String(nextCompanies[0].id));
    }
    if (selectedCompanyId && !nextCompanies.some((company: Company) => String(company.id) === selectedCompanyId)) {
      setSelectedCompanyId(nextCompanies.length ? String(nextCompanies[0].id) : "");
    }
  }

  async function loadMailboxes() {
    if (!selectedCompanyId) {
      setMailboxes([]);
      return;
    }
    const response = await fetch(`/api/crm/mailboxes?company_id=${selectedCompanyId}`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not load mailboxes.");
    setMailboxes(result.mailboxes ?? []);
  }

  useEffect(() => {
    loadCompanies().catch((error) => setMessage({ text: error instanceof Error ? error.message : "Could not load companies.", tone: "danger" }));
  }, []);

  useEffect(() => {
    if (!selectedCompanyId) return;
    setLoading(true);
    loadMailboxes().catch((error) => setMessage({ text: error instanceof Error ? error.message : "Could not load mailboxes.", tone: "danger" })).finally(() => setLoading(false));
  }, [selectedCompanyId]);

  function openAdd() {
    if (!selectedCompanyId) {
      setMessage({ text: "Create a CRM company before adding a mailbox.", tone: "danger" });
      return;
    }
    setEditingId(null);
    setForm({ ...emptyForm, company_id: selectedCompanyId, username: "", password: "" });
    setModalOpen(true);
  }

  function openEdit(mailbox: Mailbox) {
    setEditingId(mailbox.id);
    setForm({
      company_id: String(mailbox.company_id),
      email_address: mailbox.email_address,
      display_name: mailbox.display_name ?? "",
      provider: mailbox.provider,
      imap_host: mailbox.imap_host,
      imap_port: String(mailbox.imap_port),
      imap_security: mailbox.imap_security,
      smtp_host: mailbox.smtp_host,
      smtp_port: String(mailbox.smtp_port),
      smtp_security: mailbox.smtp_security,
      username: mailbox.email_address,
      password: "",
      status: mailbox.status,
    });
    setModalOpen(true);
  }

  async function saveMailbox(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedCompanyId && !form.company_id) {
      setMessage({ text: "Please pick a company for this mailbox.", tone: "danger" });
      return;
    }
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        id: editingId ?? undefined,
        company_id: Number(form.company_id || selectedCompanyId),
        email_address: form.email_address,
        display_name: form.display_name,
        provider: form.provider,
        imap_host: form.imap_host,
        imap_port: Number(form.imap_port || 993),
        imap_security: form.imap_security,
        smtp_host: form.smtp_host,
        smtp_port: Number(form.smtp_port || 465),
        smtp_security: form.smtp_security,
        username: form.username || form.email_address,
        password: form.password || undefined,
        status: form.status,
      };
      const response = await fetch("/api/crm/mailboxes", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save mailbox.");
      setModalOpen(false);
      setMessage({ text: editingId ? "Mailbox updated." : "Mailbox saved.", tone: "success" });
      await loadMailboxes();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not save mailbox.", tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  async function testMailbox(mailbox: Mailbox) {
    setLoading(true);
    setTestingMailboxId(mailbox.id);
    setMessage(null);
    try {
      const response = await fetch("/api/crm/mailboxes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: mailbox.id, action: "test" }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Mailbox connection test failed.");
      setMessage({ text: result.message ?? "Mailbox connection successful.", tone: "success" });
      await loadMailboxes();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Mailbox connection test failed.", tone: "danger" });
    } finally {
      setTestingMailboxId(null);
      setLoading(false);
    }
  }

  async function disconnectMailbox(mailbox: Mailbox) {
    setLoading(true);
    try {
      const response = await fetch("/api/crm/mailboxes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: mailbox.id,
          company_id: mailbox.company_id,
          email_address: mailbox.email_address,
          display_name: mailbox.display_name ?? "",
          provider: mailbox.provider,
          imap_host: mailbox.imap_host,
          imap_port: mailbox.imap_port,
          imap_security: mailbox.imap_security,
          smtp_host: mailbox.smtp_host,
          smtp_port: mailbox.smtp_port,
          smtp_security: mailbox.smtp_security,
          username: mailbox.email_address,
          status: "disconnected",
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not disconnect mailbox.");
      setMessage({ text: "Mailbox disconnected.", tone: "success" });
      await loadMailboxes();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not disconnect mailbox.", tone: "danger" });
    } finally {
      setLoading(false);
    }
  }

  async function deleteMailbox(mailbox: Mailbox) {
    if (!window.confirm(`Delete ${mailbox.email_address}?`)) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/crm/mailboxes?id=${mailbox.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not delete mailbox.");
      setMessage({ text: "Mailbox removed.", tone: "success" });
      await loadMailboxes();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not delete mailbox.", tone: "danger" });
    } finally {
      setLoading(false);
    }
  }

  return <>
    <PageHeader eyebrow="Business CRM / Webmail" title="Webmail mailboxes" description="Connect and validate company mailboxes using IMAP and SMTP, while keeping credentials encrypted on the server." actions={<Button onClick={openAdd} disabled={!selectedCompanyId}><IconPlus className="h-4 w-4" />Add mailbox</Button>} />
    {message ? <div className="mb-5"><Alert tone={message.tone}>{message.text}</Alert></div> : null}

    <Card className="mb-5">
      <div className="grid gap-5 md:grid-cols-[1.5fr_1fr]">
        <Field label="Company">
          <SelectInput value={selectedCompanyId} onChange={(event) => setSelectedCompanyId(event.target.value)}>
            {companies.map((company) => (
              <option key={company.id} value={String(company.id)}>{company.name}</option>
            ))}
          </SelectInput>
        </Field>
        {selectedCompany ? <div className="rounded-xl border border-border bg-[#fcfaf9] p-3"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Selected company</p><p className="mt-2 text-lg font-bold">{selectedCompany.name}</p><Badge tone={selectedCompany.status === "active" ? "success" : "warning"}>{selectedCompany.status}</Badge></div> : null}
      </div>
    </Card>

    {loading && !mailboxes.length ? <Card><p className="text-sm text-muted">Loading mailboxes…</p></Card> : null}

    {!selectedCompanyId ? <Card><p className="text-sm text-muted">Create a CRM company to start connecting mailboxes.</p></Card> : null}

    {selectedCompanyId && !loading && !mailboxes.length ? (
      <Card className="overflow-hidden p-0">
        <div className="h-1.5 bg-primary" />
        <div className="p-6 sm:p-8">
          <p className="text-lg font-bold">No mailboxes connected yet</p>
          <p className="mt-2 max-w-xl text-sm leading-6 text-muted">Add the first mailbox for this company and test IMAP/SMTP connectivity before syncing inbound or sending outbound mail.</p>
          <Button className="mt-5" onClick={openAdd}><IconPlus className="h-4 w-4" />Add mailbox</Button>
        </div>
      </Card>
    ) : null}

    {mailboxes.length ? <div className="grid gap-5 xl:grid-cols-2">{mailboxes.map((mailbox) => (
      <Card key={mailbox.id} className="overflow-hidden p-0">
        <div className="border-b border-border px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Link href={`/dashboard/crm/webmail/${mailbox.id}`} className="text-xl font-bold tracking-tight hover:text-primary">{mailbox.display_name || mailbox.email_address}</Link>
              <p className="mt-1 text-sm text-muted">{mailbox.email_address}</p>
            </div>
            <Badge tone={mailbox.status === "connected" ? "success" : mailbox.status === "error" ? "danger" : mailbox.status === "disconnected" ? "neutral" : "warning"}>{mailbox.status}</Badge>
          </div>
        </div>
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap gap-2 text-xs text-muted">
            <span className="rounded-full bg-primary-soft px-2.5 py-1 font-semibold text-primary">{mailbox.provider}</span>
            <span className="rounded-full border border-border px-2.5 py-1">IMAP {mailbox.imap_host}:{mailbox.imap_port}</span>
            <span className="rounded-full border border-border px-2.5 py-1">SMTP {mailbox.smtp_host}:{mailbox.smtp_port}</span>
          </div>
          <div className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-[#fcfaf9] p-3"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Last sync</p><p className="mt-2 font-medium">{formatDate(mailbox.last_sync_at)}</p></div>
            <div className="rounded-xl border border-border bg-[#fcfaf9] p-3"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted">Status</p><p className="mt-2 font-medium">{mailbox.last_error ? "Needs attention" : "Healthy"}</p></div>
          </div>
          {mailbox.last_error ? <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{mailbox.last_error}</div> : null}
          <div className="flex flex-wrap gap-2 border-t border-border pt-4">
            <Button variant="secondary" loading={testingMailboxId === mailbox.id} disabled={loading} onClick={() => testMailbox(mailbox)}><IconRefresh className="h-4 w-4" />{testingMailboxId === mailbox.id ? "Testing IMAP/SMTP..." : "Test"}</Button>
            <Button variant="secondary" onClick={() => openEdit(mailbox)}><IconEdit className="h-4 w-4" />Edit</Button>
            {mailbox.status === "connected" || mailbox.status === "pending" ? <Button variant="secondary" onClick={() => disconnectMailbox(mailbox)}>Disconnect</Button> : null}
            <Button variant="ghost" className="text-rose-600 hover:bg-rose-50 hover:text-rose-700" onClick={() => deleteMailbox(mailbox)}><IconTrash className="h-4 w-4" />Delete</Button>
          </div>
          {testingMailboxId === mailbox.id ? <p className="text-sm font-medium text-primary" role="status">Testing IMAP and SMTP connection. Please wait for the final result...</p> : null}
        </div>
      </Card>
    ))}</div> : null}

    <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? "Edit mailbox" : "Add mailbox"} description="Server-side encryption keeps the mailbox credentials protected. Browser JavaScript never receives the password value.">
      <form className="space-y-5" onSubmit={saveMailbox}>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Company">
            <SelectInput value={form.company_id} onChange={(event) => setForm({ ...form, company_id: event.target.value })}>
              {companies.map((company) => <option key={company.id} value={String(company.id)}>{company.name}</option>)}
            </SelectInput>
          </Field>
          <Field label="Status">
            <SelectInput value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              <option value="pending">Pending</option>
              <option value="connected">Connected</option>
              <option value="error">Error</option>
              <option value="disconnected">Disconnected</option>
            </SelectInput>
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Mailbox email">
            <TextInput required value={form.email_address} onChange={(event) => setForm({ ...form, email_address: event.target.value })} placeholder="info@company.com" />
          </Field>
          <Field label="Display name">
            <TextInput value={form.display_name} onChange={(event) => setForm({ ...form, display_name: event.target.value })} placeholder="Customer Support" />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Provider">
            <SelectInput value={form.provider} onChange={(event) => setForm({ ...form, provider: event.target.value })}>
              <option value="hostinger">Hostinger</option>
              <option value="orangehost">OrangeHost</option>
              <option value="gmail">Gmail</option>
              <option value="outlook">Outlook</option>
              <option value="office365">Office 365</option>
              <option value="other">Other</option>
            </SelectInput>
          </Field>
          <Field label="Username">
            <TextInput required value={form.username} onChange={(event) => setForm({ ...form, username: event.target.value })} placeholder="info@company.com" />
          </Field>
        </div>

        <div className="rounded-xl border border-primary/20 bg-primary-soft/40 p-3">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-primary">Credentials</p>
          <p className="mt-2 text-sm text-muted">Leave the password blank when editing an existing mailbox to keep the current stored password.</p>
        </div>

        <Field label="Password">
          <TextInput type="password" value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder={editingId ? "Leave blank to keep current password" : "Enter mailbox password"} />
        </Field>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="IMAP host">
            <TextInput required value={form.imap_host} onChange={(event) => setForm({ ...form, imap_host: event.target.value })} placeholder="mail.company.com" />
          </Field>
          <Field label="IMAP port">
            <TextInput type="number" min={1} max={65535} value={form.imap_port} onChange={(event) => setForm({ ...form, imap_port: event.target.value })} placeholder="993" />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="IMAP security">
            <SelectInput value={form.imap_security} onChange={(event) => setForm({ ...form, imap_security: event.target.value })}>
              <option value="ssl">SSL</option>
              <option value="starttls">STARTTLS</option>
              <option value="none">None</option>
            </SelectInput>
          </Field>
          <Field label="SMTP host">
            <TextInput required value={form.smtp_host} onChange={(event) => setForm({ ...form, smtp_host: event.target.value })} placeholder="mail.company.com" />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="SMTP port">
            <TextInput type="number" min={1} max={65535} value={form.smtp_port} onChange={(event) => setForm({ ...form, smtp_port: event.target.value })} placeholder="465" />
          </Field>
          <Field label="SMTP security">
            <SelectInput value={form.smtp_security} onChange={(event) => setForm({ ...form, smtp_security: event.target.value })}>
              <option value="ssl">SSL</option>
              <option value="starttls">STARTTLS</option>
              <option value="none">None</option>
            </SelectInput>
          </Field>
        </div>

        <div className="flex justify-end gap-3 border-t border-border pt-5">
          <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button>
          <Button type="submit" loading={saving}>{editingId ? "Save mailbox" : "Create mailbox"}</Button>
        </div>
      </form>
    </Modal>
  </>;
}