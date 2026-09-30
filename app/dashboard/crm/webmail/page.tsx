"use client";

import { useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { IconArrowRight, IconBuilding, IconCheckCircle, IconMail, IconPlus, IconRefresh, IconSettings } from "@/components/icons";
import { Alert } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Field, SelectInput, TextInput } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/components/auth/auth-provider";

type Company = { id: number; name: string; status: string };
type Mailbox = { id: number; company_id: number; email_address: string; display_name: string | null; status: string; last_webhook_at?: string | null; last_error?: string | null };
type MailboxForm = { company_id: string; email_address: string; display_name: string };

const blank: MailboxForm = { company_id: "", email_address: "", display_name: "" };

export default function CrmWebmailPage() {
  const { profile } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [mailboxes, setMailboxes] = useState<Mailbox[]>([]);
  const [form, setForm] = useState(blank);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone: "success" | "danger" } | null>(null);
  const [canAdd, setCanAdd] = useState(true);

  async function loadCompanies() {
    const response = await fetch("/api/crm/companies?module=crm_webmail", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not load companies.");
    setCompanies(result.companies ?? []);
    if (!companyId && result.companies?.[0]) setCompanyId(String(result.companies[0].id));
  }

  async function loadMailboxes(companyIds = companies.map((company) => company.id)) {
    if (!companyIds.length) return setMailboxes([]);
    const results = await Promise.all(companyIds.map(async (id) => {
      const response = await fetch(`/api/crm/mailboxes?company_id=${id}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load mailboxes.");
      return result.mailboxes ?? [];
    }));
    setMailboxes(results.flat().sort((first, second) => first.email_address.localeCompare(second.email_address)));
  }

  useEffect(() => { loadCompanies().catch((error) => setMessage({ text: error.message, tone: "danger" })); }, []);
  useEffect(() => { loadMailboxes().catch((error) => setMessage({ text: error.message, tone: "danger" })); }, [companies]);
  useEffect(() => {
    if (profile?.role !== "employee") return;
    fetch("/api/me/permissions", { cache: "no-store" }).then((response) => response.json()).then((result) => {
      const permission = (result.permissions ?? []).find((item: { module: string }) => item.module === "crm_webmail");
      setCanAdd(permission?.can_add ?? false);
    }).catch(() => setCanAdd(false));
  }, [profile?.role]);

  function openAdd() { setForm({ ...blank, company_id: companyId || String(companies[0]?.id ?? "") }); setModalOpen(true); }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage(null);
    try {
      const response = await fetch("/api/crm/mailboxes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, status: "pending", company_id: Number(form.company_id) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save mailbox.");
      setModalOpen(false); setMessage(result.warning ? { text: `Mailbox saved, but webhook delivery failed: ${result.warning}`, tone: "danger" } : { text: "Hostinger mailbox saved and webhook delivery verified.", tone: "success" }); await loadMailboxes();
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : "Could not save mailbox.", tone: "danger" }); }
    finally { setBusy(false); }
  }

  return <>
    <PageHeader eyebrow="Business CRM / Webmail" title="Your mail, in one place." description="Choose a mailbox to open its inbox. Your CRM-connected mailboxes are ready whenever you are." actions={<><Link href="/dashboard/crm/webmail/debugging" className="inline-flex items-center justify-center gap-2 rounded-xl border border-border bg-white px-4 py-2.5 text-sm font-semibold text-foreground transition hover:border-primary/30 hover:bg-primary-soft"><IconSettings className="h-4 w-4" />Debugging</Link><Button onClick={openAdd} disabled={!companies.length || !canAdd}><IconPlus className="h-4 w-4" />Add mailbox</Button></>} />
    {message ? <div className="mb-5"><Alert tone={message.tone}>{message.text}</Alert></div> : null}
    <section className="mb-8 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Mailbox overview">
      <article className="rounded-xl border border-border bg-white p-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-rose-50 text-primary"><IconMail className="h-5 w-5" /></span><div><p className="text-2xl font-bold text-foreground">{mailboxes.length}</p><p className="text-xs font-medium text-muted">Total mailboxes</p></div></div></article>
      <article className="rounded-xl border border-border bg-white p-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-50 text-emerald-700"><IconCheckCircle className="h-5 w-5" /></span><div><p className="text-2xl font-bold text-foreground">{mailboxes.filter((mailbox) => mailbox.status === "connected").length}</p><p className="text-xs font-medium text-muted">Connected</p></div></div></article>
      <article className="rounded-xl border border-border bg-white p-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-sky-50 text-sky-700"><IconBuilding className="h-5 w-5" /></span><div><p className="text-2xl font-bold text-foreground">{companies.length}</p><p className="text-xs font-medium text-muted">Companies</p></div></div></article>
      <article className="rounded-xl border border-border bg-white p-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-lg bg-amber-50 text-amber-700"><IconRefresh className="h-5 w-5" /></span><div><p className="text-2xl font-bold text-foreground">{mailboxes.filter((mailbox) => mailbox.status === "error" || mailbox.last_error).length}</p><p className="text-xs font-medium text-muted">Needs attention</p></div></div></article>
    </section>
    <div className="mb-4 flex items-center justify-between gap-4"><div><h2 className="text-base font-bold text-foreground">Mailboxes</h2><p className="mt-1 text-sm text-muted">{mailboxes.length} accounts across {companies.length} companies</p></div></div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {mailboxes.map((mailbox, index) => {
        const company = companies.find((item) => item.id === mailbox.company_id);
        const accents = ["bg-primary", "bg-emerald-500", "bg-sky-600", "bg-amber-500"];
        return <article key={mailbox.id} className="group flex min-h-56 flex-col overflow-hidden rounded-xl border border-border bg-white shadow-[0_8px_24px_rgba(28,20,18,0.035)] transition duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_14px_32px_rgba(28,20,18,0.09)]">
          <div className={`h-1 ${accents[index % accents.length]}`} />
          <div className="flex flex-1 flex-col p-4">
            <div className="mb-5 flex items-start justify-between gap-3"><span className="grid h-11 w-11 place-items-center rounded-lg bg-slate-50 text-slate-700"><IconMail className="h-5 w-5" /></span><Badge tone={mailbox.status === "connected" ? "success" : mailbox.status === "error" ? "danger" : "warning"}>{mailbox.status}</Badge></div>
            <p className="mb-1 truncate text-[11px] font-bold uppercase text-muted">{company?.name ?? "Company"}</p>
            <p className="truncate text-base font-bold text-foreground" title={mailbox.display_name || mailbox.email_address}>{mailbox.display_name || mailbox.email_address}</p>
            <p className="mt-1 truncate text-sm text-muted" title={mailbox.email_address}>{mailbox.email_address}</p>
            <Link href={`/dashboard/crm/webmail/${mailbox.id}`} target="_blank" rel="noopener noreferrer" aria-label={`Open ${mailbox.email_address} in a new tab`} className="mt-auto flex items-center justify-between border-t border-border pt-4 text-sm font-semibold text-foreground transition group-hover:text-primary">
              <span>Open inbox</span><IconArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </article>;
      })}
    </div>
    {!mailboxes.length && companies.length ? <div className="mt-4 rounded-xl border border-dashed border-border bg-white px-6 py-12 text-center"><span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-lg bg-rose-50 text-primary"><IconMail className="h-6 w-6" /></span><h3 className="font-bold text-foreground">No mailboxes connected yet</h3><p className="mt-1 text-sm text-muted">Add a mailbox to start working from your CRM.</p><Button className="mt-5" onClick={openAdd} disabled={!canAdd}><IconPlus className="h-4 w-4" />Add mailbox</Button></div> : null}
    {!mailboxes.length && !companies.length && !message ? <div className="rounded-xl border border-border bg-white px-6 py-12 text-center text-sm text-muted">Loading your mailboxes...</div> : null}
    <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Connect Hostinger mailbox" description="The API token and webhook secret stay on the server. Only the mailbox address is stored here.">
      <form className="space-y-4" onSubmit={save}><Field label="Company"><SelectInput value={form.company_id} onChange={(event) => { setCompanyId(event.target.value); setForm({ ...form, company_id: event.target.value }); }}>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</SelectInput></Field><Field label="Mailbox email address"><TextInput required type="email" value={form.email_address} onChange={(event) => setForm({ ...form, email_address: event.target.value })} placeholder="info@example.com" /></Field><Field label="Display name"><TextInput value={form.display_name} onChange={(event) => setForm({ ...form, display_name: event.target.value })} placeholder="Support" /></Field><div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button><Button type="submit" loading={busy}>Save mailbox</Button></div></form>
    </Modal>
  </>;
}
