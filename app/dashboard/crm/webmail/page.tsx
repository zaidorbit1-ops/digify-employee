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
  provider: "hostinger",
  imap_host: "imap.hostinger.com",
  imap_port: "993",
  imap_security: "ssl",
  smtp_host: "smtp.hostinger.com",
  smtp_port: "465",
  smtp_security: "ssl",
  username: "",
  password: "",
  status: "pending",
};

const PROVIDER_PRESETS: Record<string, Partial<MailboxForm>> = {
  hostinger: {
    imap_host: "imap.hostinger.com",
    imap_port: "993",
    imap_security: "ssl",
    smtp_host: "smtp.hostinger.com",
    smtp_port: "465",
    smtp_security: "ssl",
  },
  orangehost: {
    imap_host: "mail.orangehost.com",
    imap_port: "993",
    imap_security: "ssl",
    smtp_host: "mail.orangehost.com",
    smtp_port: "465",
    smtp_security: "ssl",
  },
  gmail: {
    imap_host: "imap.gmail.com",
    imap_port: "993",
    imap_security: "ssl",
    smtp_host: "smtp.gmail.com",
    smtp_port: "465",
    smtp_security: "ssl",
  },
  outlook: {
    imap_host: "outlook.office365.com",
    imap_port: "993",
    imap_security: "ssl",
    smtp_host: "smtp.office365.com",
    smtp_port: "587",
    smtp_security: "starttls",
  },
  office365: {
    imap_host: "outlook.office365.com",
    imap_port: "993",
    imap_security: "ssl",
    smtp_host: "smtp.office365.com",
    smtp_port: "587",
    smtp_security: "starttls",
  },
  other: {
    imap_host: "",
    imap_port: "993",
    imap_security: "ssl",
    smtp_host: "",
    smtp_port: "465",
    smtp_security: "ssl",
  },
};

function formatDate(value?: string | null) {
  if (!value) return "Not synced yet";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Not synced yet";
  return date.toLocaleString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
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
    [companies, selectedCompanyId]
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
    loadCompanies().catch((error) =>
      setMessage({
        text: error instanceof Error ? error.message : "Could not load companies.",
        tone: "danger",
      })
    );
  }, []);

  useEffect(() => {
    if (!selectedCompanyId) return;
    setLoading(true);
    loadMailboxes()
      .catch((error) =>
        setMessage({
          text: error instanceof Error ? error.message : "Could not load mailboxes.",
          tone: "danger",
        })
      )
      .finally(() => setLoading(false));
  }, [selectedCompanyId]);

  function handleProviderChange(providerKey: string) {
    const preset = PROVIDER_PRESETS[providerKey] || {};
    setForm((current) => ({
      ...current,
      provider: providerKey,
      ...preset,
    }));
  }

  function openAdd() {
    if (!selectedCompanyId) {
      setMessage({ text: "Create a CRM company before adding a mailbox.", tone: "danger" });
      return;
    }
    setEditingId(null);
    setForm({
      ...emptyForm,
      company_id: selectedCompanyId,
      username: "",
      password: "",
    });
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
      setMessage({ text: editingId ? "Mailbox updated successfully." : "Mailbox created successfully.", tone: "success" });
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
      setMessage({ text: result.message ?? "Mailbox connection verified successfully.", tone: "success" });
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
    if (!window.confirm(`Are you sure you want to delete ${mailbox.email_address}?`)) return;
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

  const connectedCount = mailboxes.filter((m) => m.status === "connected").length;

  return (
    <>
      {/* Header */}
      <PageHeader
        eyebrow="Business CRM / Webmail"
        title="Webmail Mailboxes"
        description="Connect and validate company email accounts using secure IMAP and SMTP, with server-side encrypted credentials."
        actions={
          <Button
            onClick={openAdd}
            disabled={!selectedCompanyId}
            className="bg-primary text-white shadow-md shadow-primary/20 hover:bg-primary-hover active:scale-95 transition"
          >
            <IconPlus className="h-4 w-4" />
            <span>Add mailbox</span>
          </Button>
        }
      />

      {message && (
        <div className="mb-5 animate-in fade-in">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      )}

      {/* Top Company Selector & Overview Metrics */}
      <div className="mb-6 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <Card className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 mb-3">
            <span className="flex h-2 w-2 rounded-full bg-primary animate-pulse" />
            <span className="text-[11px] font-extrabold uppercase tracking-widest text-primary">
              Active Company
            </span>
          </div>
          <Field label="Switch Company">
            <SelectInput
              value={selectedCompanyId}
              onChange={(event) => setSelectedCompanyId(event.target.value)}
              className="mt-1 font-semibold text-slate-800"
            >
              {companies.map((company) => (
                <option key={company.id} value={String(company.id)}>
                  {company.name}
                </option>
              ))}
            </SelectInput>
          </Field>
        </Card>

        {selectedCompany && (
          <Card className="flex flex-col justify-between rounded-2xl border border-primary/20 bg-gradient-to-br from-primary-soft/60 to-white p-5 shadow-sm">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
                  Company Status
                </p>
                <p className="mt-1 text-xl font-black text-slate-900">{selectedCompany.name}</p>
              </div>
              <Badge tone={selectedCompany.status === "active" ? "success" : "warning"}>
                {selectedCompany.status}
              </Badge>
            </div>
            <div className="mt-4 flex items-center gap-4 text-xs font-semibold text-slate-600">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span>{connectedCount} Connected Mailbox{connectedCount === 1 ? "" : "es"}</span>
              </span>
              <span className="flex items-center gap-1.5">
                <span>🔒 TLS/SSL Encrypted</span>
              </span>
            </div>
          </Card>
        )}
      </div>

      {loading && !mailboxes.length ? (
        <Card className="p-8 text-center rounded-2xl border border-slate-200 bg-white">
          <div className="flex justify-center mb-2">
            <span className="text-2xl animate-spin">🔄</span>
          </div>
          <p className="text-sm font-semibold text-slate-600">Loading your mailboxes…</p>
        </Card>
      ) : null}

      {!selectedCompanyId ? (
        <Card className="p-8 text-center rounded-2xl border border-slate-200 bg-white">
          <p className="text-sm font-semibold text-slate-600">
            Create or select a CRM company to start connecting mailboxes.
          </p>
        </Card>
      ) : null}

      {selectedCompanyId && !loading && !mailboxes.length ? (
        <Card className="overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-sm">
          <div className="h-1.5 bg-gradient-to-r from-primary to-primary-hover" />
          <div className="p-8 text-center sm:p-12">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-primary-soft text-3xl">
              ✉️
            </div>
            <h3 className="mt-4 text-xl font-black text-slate-900">No mailboxes connected yet</h3>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">
              Connect your domain email (Hostinger, OrangeHost, Google Workspace, or custom IMAP) to send campaigns and manage customer inbox threads.
            </p>
            <Button
              className="mt-6 bg-primary text-white shadow-md shadow-primary/20 hover:bg-primary-hover"
              onClick={openAdd}
            >
              <IconPlus className="h-4 w-4" />
              <span>Connect First Mailbox</span>
            </Button>
          </div>
        </Card>
      ) : null}

      {/* Mailbox Cards Grid */}
      {mailboxes.length > 0 && (
        <div className="grid gap-6 md:grid-cols-2">
          {mailboxes.map((mailbox) => (
            <Card
              key={mailbox.id}
              className="group overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-0 shadow-sm transition hover:border-primary/40 hover:shadow-lg"
            >
              {/* Card Header */}
              <div className="border-b border-slate-100 bg-slate-50/50 px-6 py-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0 flex-1">
                    <Link
                      href={`/dashboard/crm/webmail/${mailbox.id}`}
                      className="group-hover:text-primary flex items-center gap-2 text-lg font-black tracking-tight text-slate-900 transition"
                    >
                      <span className="truncate">{mailbox.display_name || mailbox.email_address}</span>
                      <span className="text-sm font-normal text-primary">↗</span>
                    </Link>
                    <p className="mt-0.5 truncate text-xs font-medium text-slate-500">
                      {mailbox.email_address}
                    </p>
                  </div>
                  <Badge
                    tone={
                      mailbox.status === "connected"
                        ? "success"
                        : mailbox.status === "error"
                        ? "danger"
                        : mailbox.status === "disconnected"
                        ? "neutral"
                        : "warning"
                    }
                  >
                    {mailbox.status === "connected" ? "🟢 Connected" : mailbox.status}
                  </Badge>
                </div>
              </div>

              {/* Card Body */}
              <div className="space-y-4 p-6">
                {/* Badges / Protocols */}
                <div className="flex flex-wrap gap-2 text-xs">
                  <span className="rounded-full bg-primary-soft px-3 py-1 font-bold text-primary capitalize">
                    {mailbox.provider}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-mono text-slate-600">
                    IMAP: {mailbox.imap_host}:{mailbox.imap_port}
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 font-mono text-slate-600">
                    SMTP: {mailbox.smtp_host}:{mailbox.smtp_port}
                  </span>
                </div>

                {/* Status & Sync Stats */}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Last Sync
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-800">
                      {formatDate(mailbox.last_sync_at)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-3.5">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Connection Health
                    </p>
                    <p className="mt-1 text-sm font-semibold text-slate-800">
                      {mailbox.last_error ? (
                        <span className="text-rose-600 font-bold">Needs attention</span>
                      ) : (
                        <span className="text-emerald-600 font-bold">Verified & Healthy</span>
                      )}
                    </p>
                  </div>
                </div>

                {mailbox.last_error && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-medium text-rose-800">
                    ⚠️ {mailbox.last_error}
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      loading={testingMailboxId === mailbox.id}
                      disabled={loading}
                      onClick={() => testMailbox(mailbox)}
                      className="text-xs"
                    >
                      <IconRefresh className="h-3.5 w-3.5" />
                      <span>{testingMailboxId === mailbox.id ? "Testing…" : "Test"}</span>
                    </Button>
                    <Button
                      variant="secondary"
                      onClick={() => openEdit(mailbox)}
                      className="text-xs"
                    >
                      <IconEdit className="h-3.5 w-3.5" />
                      <span>Edit</span>
                    </Button>
                    {mailbox.status === "connected" || mailbox.status === "pending" ? (
                      <Button
                        variant="secondary"
                        onClick={() => disconnectMailbox(mailbox)}
                        className="text-xs text-slate-600"
                      >
                        Disconnect
                      </Button>
                    ) : null}
                    <Button
                      variant="ghost"
                      className="text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                      onClick={() => deleteMailbox(mailbox)}
                    >
                      <IconTrash className="h-3.5 w-3.5" />
                      <span>Delete</span>
                    </Button>
                  </div>

                  {/* Direct Open Inbox Link */}
                  <Link
                    href={`/dashboard/crm/webmail/${mailbox.id}`}
                    className="flex items-center gap-1.5 rounded-xl bg-primary-soft px-3.5 py-1.5 text-xs font-bold text-primary transition hover:bg-primary hover:text-white"
                  >
                    <span>Open Inbox</span>
                    <span>→</span>
                  </Link>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add / Edit Mailbox Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? "Edit Mailbox" : "Connect Mailbox"}
        description="Credentials are kept secure on the server using AES-256 encryption."
      >
        <form className="space-y-4" onSubmit={saveMailbox}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Company">
              <SelectInput
                value={form.company_id}
                onChange={(event) => setForm({ ...form, company_id: event.target.value })}
              >
                {companies.map((company) => (
                  <option key={company.id} value={String(company.id)}>
                    {company.name}
                  </option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Status">
              <SelectInput
                value={form.status}
                onChange={(event) => setForm({ ...form, status: event.target.value })}
              >
                <option value="pending">Pending</option>
                <option value="connected">Connected</option>
                <option value="error">Error</option>
                <option value="disconnected">Disconnected</option>
              </SelectInput>
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Provider Preset">
              <SelectInput
                value={form.provider}
                onChange={(event) => handleProviderChange(event.target.value)}
              >
                <option value="hostinger">Hostinger (Auto-configured)</option>
                <option value="orangehost">OrangeHost (Auto-configured)</option>
                <option value="gmail">Google Workspace / Gmail</option>
                <option value="outlook">Outlook / Microsoft 365</option>
                <option value="other">Custom IMAP / SMTP</option>
              </SelectInput>
            </Field>
            <Field label="Display Name">
              <TextInput
                value={form.display_name}
                onChange={(event) => setForm({ ...form, display_name: event.target.value })}
                placeholder="e.g. Digify Support"
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Mailbox Email Address">
              <TextInput
                required
                type="email"
                value={form.email_address}
                onChange={(event) =>
                  setForm({
                    ...form,
                    email_address: event.target.value,
                    username: form.username || event.target.value,
                  })
                }
                placeholder="info@yourcompany.com"
              />
            </Field>
            <Field label="IMAP/SMTP Username">
              <TextInput
                required
                value={form.username}
                onChange={(event) => setForm({ ...form, username: event.target.value })}
                placeholder="info@yourcompany.com"
              />
            </Field>
          </div>

          {/* Password field */}
          <div>
            <Field label="Password">
              <TextInput
                type="password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                placeholder={editingId ? "•••••••••••• (Leave blank to keep current)" : "Enter password"}
                required={!editingId}
              />
            </Field>
            <p className="mt-1 text-xs text-slate-500">
              {editingId
                ? "Leave blank to keep your currently stored encrypted password."
                : "Enter the email mailbox password."}
            </p>
          </div>

          {/* IMAP Config */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-600">
              IMAP Configuration (Incoming)
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <Field label="Host">
                  <TextInput
                    required
                    value={form.imap_host}
                    onChange={(event) => setForm({ ...form, imap_host: event.target.value })}
                    placeholder="imap.hostinger.com"
                  />
                </Field>
              </div>
              <div>
                <Field label="Port">
                  <TextInput
                    type="number"
                    value={form.imap_port}
                    onChange={(event) => setForm({ ...form, imap_port: event.target.value })}
                    placeholder="993"
                  />
                </Field>
              </div>
            </div>
            <Field label="Security">
              <SelectInput
                value={form.imap_security}
                onChange={(event) => setForm({ ...form, imap_security: event.target.value })}
              >
                <option value="ssl">SSL / TLS (Recommended - Port 993)</option>
                <option value="starttls">STARTTLS</option>
                <option value="none">None</option>
              </SelectInput>
            </Field>
          </div>

          {/* SMTP Config */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-600">
              SMTP Configuration (Outgoing)
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <Field label="Host">
                  <TextInput
                    required
                    value={form.smtp_host}
                    onChange={(event) => setForm({ ...form, smtp_host: event.target.value })}
                    placeholder="smtp.hostinger.com"
                  />
                </Field>
              </div>
              <div>
                <Field label="Port">
                  <TextInput
                    type="number"
                    value={form.smtp_port}
                    onChange={(event) => setForm({ ...form, smtp_port: event.target.value })}
                    placeholder="465"
                  />
                </Field>
              </div>
            </div>
            <Field label="Security">
              <SelectInput
                value={form.smtp_security}
                onChange={(event) => setForm({ ...form, smtp_security: event.target.value })}
              >
                <option value="ssl">SSL / TLS (Recommended - Port 465)</option>
                <option value="starttls">STARTTLS (Port 587)</option>
                <option value="none">None</option>
              </SelectInput>
            </Field>
          </div>

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={saving}
              className="bg-primary text-white hover:bg-primary-hover"
            >
              {editingId ? "Save Changes" : "Connect Mailbox"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
