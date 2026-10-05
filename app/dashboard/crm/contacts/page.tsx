"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type FormEvent } from "react";
import * as XLSX from "xlsx";
import { IconEdit, IconPlus, IconSearch, IconTrash } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/empty-state";
import { Field, SelectInput, TextInput } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";

type Company = { id: number; name: string };
type ContactList = { id: number; company_id: number; name: string; description?: string | null; contact_count: number };
type TagLink = { crm_contact_tags?: { id: number; name: string } | null };
type ContactCampaign = { campaign_id: number; name: string; status: string; sent_at: string | null };
type Contact = { id: number; company_id: number; full_name: string; email: string; phone?: string | null; status: string; source?: string | null; created_at: string; campaigns?: ContactCampaign[]; crm_contact_tag_links?: TagLink[]; crm_contact_list_members?: { contact_list_id: number }[] };
type Message = { text: string; tone?: "success" | "danger" };
type ContactForm = { company_id: string; contact_list_id: string; full_name: string; email: string; phone: string; status: string; source: string; tags: string };
type ImportRow = { rowNumber: number; row: Record<string, unknown>; fullName: string; email: string; errors: string[]; existingContactId?: number };

const emptyForm: ContactForm = { company_id: "", contact_list_id: "", full_name: "", email: "", phone: "", status: "active", source: "manual", tags: "" };

export default function CrmContactsPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [contactLists, setContactLists] = useState<ContactList[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [contactListId, setContactListId] = useState("");
  const [status, setStatus] = useState("");
  const [view, setView] = useState<"contacts" | "archive">("contacts");
  const [layout, setLayout] = useState<"table" | "cards">("table");
  const [selectedContactIds, setSelectedContactIds] = useState<number[]>([]);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<ContactForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [contactModal, setContactModal] = useState(false);
  const [importModal, setImportModal] = useState(false);
  const [importRows, setImportRows] = useState<ImportRow[]>([]);
  const [importFile, setImportFile] = useState("");
  const [importListId, setImportListId] = useState("");
  const [listModal, setListModal] = useState(false);
  const [listModalReturnTo, setListModalReturnTo] = useState<"contact" | "import" | null>(null);
  const [newListName, setNewListName] = useState("");
  const [newListDescription, setNewListDescription] = useState("");
  const [listSaving, setListSaving] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [formLoading, setFormLoading] = useState(false);
  const [formMessage, setFormMessage] = useState<Message | null>(null);
  const [importMessage, setImportMessage] = useState<Message | null>(null);
  const [message, setMessage] = useState<Message | null>(null);

  async function loadCompanies() {
    const response = await fetch("/api/crm/companies", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not load companies.");
    setCompanies(result.companies ?? []);
  }

  async function loadContactLists() {
    if (!companyId) { setContactLists([]); return; }
    const response = await fetch(`/api/crm/contact-lists?company_id=${companyId}`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not load contact lists.");
    setContactLists(result.lists ?? []);
    setContactListId((current) => current || result.lists?.[0]?.id.toString() || "");
  }

  async function loadContacts() {
    const params = new URLSearchParams();
    if (companyId) params.set("company_id", companyId);
    if (contactListId) params.set("contact_list_id", contactListId);
    if (view === "archive") params.set("status", "archived");
    else {
      if (status) params.set("status", status);
      params.set("exclude_archived", "true");
    }
    if (search.trim()) params.set("search", search.trim());
    setContactsLoading(true);
    try {
      const response = await fetch(`/api/crm/contacts?${params}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load contacts.");
      setContacts(result.contacts ?? []);
    } finally {
      setContactsLoading(false);
    }
  }

  useEffect(() => { loadCompanies().catch((error) => setMessage({ text: error instanceof Error ? error.message : "Could not load companies.", tone: "danger" })); }, []);
  useEffect(() => { loadContactLists().catch((error) => setMessage({ text: error instanceof Error ? error.message : "Could not load contact lists.", tone: "danger" })); }, [companyId]);
  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setSelectedContactIds([]);
      loadContacts().catch((error) => setMessage({ text: error instanceof Error ? error.message : "Could not load contacts.", tone: "danger" }));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [companyId, contactListId, status, search, view]);
  function openAdd() { const targetList = contactLists.find((list) => String(list.id) === contactListId) ?? contactLists[0]; setEditingId(null); setForm({ ...emptyForm, company_id: companyId, contact_list_id: targetList?.id.toString() ?? "" }); setFormMessage({ text: targetList ? `This contact will be added to ${targetList.name}.` : "Select or create a contact list first.", tone: targetList ? "success" : "danger" }); setContactModal(true); }
  const openEdit = useCallback((contact: Contact) => { setEditingId(contact.id); setForm({ company_id: String(contact.company_id), contact_list_id: contact.crm_contact_list_members?.[0]?.contact_list_id.toString() ?? "", full_name: contact.full_name, email: contact.email, phone: contact.phone ?? "", status: contact.status, source: contact.source ?? "manual", tags: (contact.crm_contact_tag_links ?? []).map((link) => link.crm_contact_tags?.name).filter(Boolean).join(", ") }); setFormMessage(null); setContactModal(true); }, []);
  useEffect(() => {
    const editId = new URLSearchParams(window.location.search).get("edit");
    const contact = editId ? contacts.find((item) => String(item.id) === editId) : null;
    if (!contact) return;
    openEdit(contact);
    window.history.replaceState(null, "", "/dashboard/crm/contacts");
  }, [contacts, openEdit]);
  async function saveContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormLoading(true); setFormMessage(null);
    try {
      const response = await fetch(editingId ? `/api/crm/contacts/${editingId}` : "/api/crm/contacts", { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, contact_list_id: form.contact_list_id ? Number(form.contact_list_id) : null, tags: form.tags.split(",").map((tag) => tag.trim()).filter(Boolean) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save contact.");
      setFormMessage({ text: editingId ? "Contact updated." : "Contact created.", tone: "success" });
      setContactModal(false); await loadContacts(); await loadContactLists();
    } catch (error) { setFormMessage({ text: error instanceof Error ? error.message : "Could not save contact.", tone: "danger" }); } finally { setFormLoading(false); }
  }

  async function archiveContact(contact: Contact) {
    if (!window.confirm(`Archive ${contact.full_name}? You can find it in the Archive later.`)) return;
    const response = await fetch(`/api/crm/contacts/${contact.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) { setMessage({ text: result.error ?? "Could not archive contact.", tone: "danger" }); return; }
    setSelectedContactIds((current) => current.filter((id) => id !== contact.id));
    setMessage({ text: "Contact archived.", tone: "success" }); await loadContacts();
  }

  async function permanentlyDeleteContact(contact: Contact) {
    if (!window.confirm(`Permanently delete ${contact.full_name}? This cannot be undone.`)) return;
    const response = await fetch(`/api/crm/contacts/${contact.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "permanent_delete" }),
    });
    const result = await response.json();
    if (!response.ok) { setMessage({ text: result.error ?? "Could not permanently delete contact.", tone: "danger" }); return; }
    setSelectedContactIds((current) => current.filter((id) => id !== contact.id));
    setMessage({ text: "Contact permanently deleted.", tone: "success" });
    await loadContacts();
    await loadContactLists();
  }

  async function restoreContact(contact: Contact) {
    const response = await fetch(`/api/crm/contacts/${contact.id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "restore" }),
    });
    const result = await response.json();
    if (!response.ok) { setMessage({ text: result.error ?? "Could not restore contact.", tone: "danger" }); return; }
    setSelectedContactIds((current) => current.filter((id) => id !== contact.id));
    setMessage({ text: "Contact restored.", tone: "success" });
    await loadContacts();
  }

  async function applyBulkAction(action: "archive" | "restore" | "permanent_delete") {
    if (!selectedContactIds.length || bulkActionLoading) return;
    const actionLabel = action === "permanent_delete" ? "permanently delete" : action;
    if (!window.confirm(`${action === "permanent_delete" ? "Permanently delete" : action === "restore" ? "Restore" : "Archive"} ${selectedContactIds.length} selected contact${selectedContactIds.length === 1 ? "" : "s"}${action === "permanent_delete" ? "? This cannot be undone." : "?"}`)) return;

    setBulkActionLoading(true);
    let succeeded = 0;
    const failures: string[] = [];
    try {
      for (const id of selectedContactIds) {
        try {
          const response = await fetch(`/api/crm/contacts/${id}`, action === "archive"
            ? { method: "DELETE" }
            : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action }) });
          const result = await response.json();
          if (!response.ok) throw new Error(result.error ?? `Could not ${actionLabel} contact.`);
          succeeded += 1;
        } catch (error) {
          const contact = contacts.find((item) => item.id === id);
          failures.push(`${contact?.full_name ?? `Contact ${id}`}: ${error instanceof Error ? error.message : `Could not ${actionLabel} contact.`}`);
        }
      }
      setSelectedContactIds([]);
      setMessage({
        text: failures.length
          ? `${succeeded} contact${succeeded === 1 ? "" : "s"} ${action === "permanent_delete" ? "permanently deleted" : action === "restore" ? "restored" : "archived"}; ${failures.length} failed. ${failures.join(" ")}`
          : `${succeeded} contact${succeeded === 1 ? "" : "s"} ${action === "permanent_delete" ? "permanently deleted" : action === "restore" ? "restored" : "archived"}.`,
        tone: failures.length ? "danger" : "success",
      });
      await loadContacts();
      if (action === "permanent_delete") await loadContactLists();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not finish the selected action.", tone: "danger" });
    } finally {
      setBulkActionLoading(false);
    }
  }

  async function deleteContactList() {
    const list = contactLists.find((item) => String(item.id) === contactListId);
    if (!list || !window.confirm(`Delete the "${list.name}" list? Its contacts will remain, but their membership in this list will be removed.`)) return;
    try {
      const response = await fetch(`/api/crm/contact-lists?id=${list.id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not delete contact list.");
      setContactListId("");
      setMessage({ text: `Contact list "${list.name}" deleted. Its contacts were kept.`, tone: "success" });
      await loadContactLists();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not delete contact list.", tone: "danger" });
    }
  }

  async function readImportFile(file: File) {
    setImportFile(file.name); setImportMessage(null); setImportLoading(true);
    try {
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
      if (!rows.length) throw new Error("The selected file has no data rows.");
      if (!companyId || !importListId) throw new Error("Select a company and contact list before importing.");
      const response = await fetch("/api/crm/contacts/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company_id: Number(companyId), contact_list_id: Number(importListId), rows }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not validate import.");
      setImportRows(result.rows ?? []); setImportMessage({ text: `${result.valid} valid rows, ${result.invalid} invalid or duplicate rows. Review before confirming.`, tone: result.invalid ? "danger" : "success" });
    } catch (error) { setImportMessage({ text: error instanceof Error ? error.message : "Could not read import file.", tone: "danger" }); } finally { setImportLoading(false); }
  }

  async function confirmImport() {
    if (!importRows.length || !companyId || !importListId) return;
    setImportLoading(true);
    try {
      const response = await fetch("/api/crm/contacts/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company_id: Number(companyId), contact_list_id: Number(importListId), rows: importRows.map((item) => item.row), confirm: true }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not import contacts.");
      setImportMessage({ text: `Import complete: ${result.imported} new contacts, ${result.added_to_list} existing contacts added to this list, ${result.duplicates} duplicates, ${result.failed} failed.`, tone: result.failed || result.invalid ? "danger" : "success" });
      await loadContacts();
      await loadContactLists();
    } catch (error) { setImportMessage({ text: error instanceof Error ? error.message : "Could not import contacts.", tone: "danger" }); } finally { setImportLoading(false); }
  }

  function exportContacts(format: "csv" | "xlsx") {
    const rows = contacts.map((contact) => ({
      Name: contact.full_name,
      Email: contact.email,
      Phone: contact.phone ?? "",
      Company: companies.find((company) => company.id === contact.company_id)?.name ?? "",
      Status: contact.status,
      Source: contact.source ?? "",
      Lists: (contact.crm_contact_list_members ?? []).map((member) => contactLists.find((list) => list.id === member.contact_list_id)?.name).filter(Boolean).join(", "),
      Tags: (contact.crm_contact_tag_links ?? []).map((link) => link.crm_contact_tags?.name).filter(Boolean).join(", "),
      Created: contact.created_at,
    }));
    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Contacts");
    const suffix = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `contacts-${suffix}.${format}`, format === "csv" ? { bookType: "csv" } : undefined);
  }

  async function createContactList(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!companyId) return;
    setListSaving(true);
    try {
      const response = await fetch("/api/crm/contact-lists", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ company_id: Number(companyId), name: newListName, description: newListDescription }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not create contact list.");
      await loadContactLists();
      setContactListId(String(result.list.id));
      setImportListId(String(result.list.id));
      if (listModalReturnTo === "contact") setForm((current) => ({ ...current, company_id: companyId, contact_list_id: String(result.list.id) }));
      if (listModalReturnTo === "import") setImportListId(String(result.list.id));
      setListModal(false);
      setNewListName("");
      setNewListDescription("");
      if (listModalReturnTo === "contact") setContactModal(true);
      if (listModalReturnTo === "import") setImportModal(true);
      setListModalReturnTo(null);
      setMessage({ text: `Contact list "${result.list.name}" created.`, tone: "success" });
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : "Could not create contact list.", tone: "danger" }); }
    finally { setListSaving(false); }
  }

  function openNewList(returnTo: "contact" | "import" | null = null) {
    setListModalReturnTo(returnTo);
    setNewListName("");
    setNewListDescription("");
    setListModal(true);
    if (returnTo === "contact") setContactModal(false);
    if (returnTo === "import") setImportModal(false);
  }

  return <>
    <section className="relative mb-6 overflow-hidden rounded-[2rem] bg-[#211b27] px-6 py-7 text-white shadow-[0_25px_60px_rgba(40,24,38,0.18)] sm:px-9 sm:py-9">
      <div className="pointer-events-none absolute -right-14 -top-32 h-80 w-80 rounded-full bg-rose-400/20 blur-3xl" />
      <div className="pointer-events-none absolute right-40 top-32 h-44 w-44 rounded-full bg-orange-300/15 blur-3xl" />
      <div className="relative flex flex-col justify-between gap-8 xl:flex-row xl:items-end">
        <div className="max-w-2xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-xs font-semibold tracking-wide text-rose-100">
            <span className="h-2 w-2 rounded-full bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.85)]" />
            BUSINESS CRM <span className="text-white/40">/</span> CONTACTS
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{view === "archive" ? "Your contact archive" : "Your people, in one place."}</h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-white/65 sm:text-base">{view === "archive" ? "Restore contacts whenever you need them, or permanently remove records you no longer need." : "Build your relationships, keep every list organized, and find the right contact in seconds."}</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button className="!bg-white !text-[#2c202b] !shadow-none hover:!bg-rose-50" disabled={!companyId || !contactListId || view === "archive"} onClick={openAdd}><IconPlus className="h-4 w-4" />Add a contact</Button>
            <Button variant="secondary" className="!border-white/20 !bg-white/10 !text-white hover:!bg-white/20" disabled={!companyId || !contactListId || view === "archive"} onClick={() => { setImportListId(contactListId); setImportMessage(null); setImportRows([]); setImportModal(true); }}>Import spreadsheet</Button>
            <Button variant="secondary" className="!border-white/20 !bg-white/10 !text-white hover:!bg-white/20" disabled={!companyId} onClick={() => openNewList()}>Create a list</Button>
          </div>
          {!companyId || !contactListId ? <p className="mt-3 text-xs text-white/50">Choose a company and contact list below to add or import contacts.</p> : null}
        </div>
        <div className="grid grid-cols-2 gap-3 sm:min-w-[360px]">
          <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur-sm"><p className="text-xs font-medium text-white/50">{view === "archive" ? "In archive" : "In this view"}</p><p className="mt-2 text-3xl font-bold tracking-tight">{contactsLoading ? "—" : contacts.length.toLocaleString()}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur-sm"><p className="text-xs font-medium text-white/50">Active here</p><p className="mt-2 text-3xl font-bold tracking-tight">{contactsLoading ? "—" : contacts.filter((contact) => contact.status === "active").length.toLocaleString()}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur-sm"><p className="text-xs font-medium text-white/50">Lists</p><p className="mt-2 text-3xl font-bold tracking-tight">{contactLists.length.toLocaleString()}</p></div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.07] p-4 backdrop-blur-sm"><p className="text-xs font-medium text-white/50">Selected</p><p className="mt-2 text-3xl font-bold tracking-tight">{selectedContactIds.length.toLocaleString()}</p></div>
        </div>
      </div>
    </section>
    {message ? <div className="mb-5"><Alert tone={message.tone}>{message.text}</Alert></div> : null}
    <div className="mb-5 flex flex-wrap items-center justify-between gap-4 border-b border-border">
      <div className="flex gap-2" role="tablist" aria-label="Contact views">
        <button type="button" role="tab" aria-selected={view === "contacts"} onClick={() => { setView("contacts"); setSelectedContactIds([]); }} className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${view === "contacts" ? "border-primary text-primary" : "border-transparent text-muted hover:text-foreground"}`}>All contacts</button>
        <button type="button" role="tab" aria-selected={view === "archive"} onClick={() => { setView("archive"); setSelectedContactIds([]); }} className={`border-b-2 px-4 py-3 text-sm font-semibold transition ${view === "archive" ? "border-primary text-primary" : "border-transparent text-muted hover:text-foreground"}`}>Archive</button>
      </div>
      <div className="mb-2 flex flex-wrap gap-2">
        {view === "contacts" ? <>
          <Button variant="secondary" onClick={() => exportContacts("csv")} disabled={!contacts.length}>Export CSV</Button>
          <Button variant="secondary" onClick={() => exportContacts("xlsx")} disabled={!contacts.length}>Export Excel</Button>
        </> : null}
        <Button variant="secondary" disabled={!companyId} onClick={() => openNewList()}>New list</Button>
      </div>
    </div>
    <Card className="mb-5">
      <div className="mb-4">
        <h2 className="font-semibold">Find contacts</h2>
        <p className="mt-1 text-sm text-muted">Narrow the list by company, list, status, or a name/email/phone search.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Field label="Company">
          <SelectInput value={companyId} onChange={(event) => { setCompanyId(event.target.value); setContactListId(""); setImportListId(""); }}>
            <option value="">All companies</option>
            {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
          </SelectInput>
        </Field>
        <Field label="Contact list">
          <div className="space-y-2">
            <SelectInput disabled={!companyId} value={contactListId} onChange={(event) => setContactListId(event.target.value)}>
              <option value="">All contacts</option>
              {contactLists.map((list) => <option key={list.id} value={list.id}>{list.name} ({list.contact_count})</option>)}
            </SelectInput>
            {contactListId ? <button type="button" onClick={deleteContactList} className="text-xs font-semibold text-rose-700 hover:underline">Delete selected list</button> : null}
          </div>
        </Field>
        {view === "contacts" ? <Field label="Status">
          <SelectInput value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
            <option value="unsubscribed">Unsubscribed</option>
          </SelectInput>
        </Field> : <div className="flex items-end pb-2 text-sm text-muted">Archived contacts only</div>}
        <Field label="Search">
          <div className="relative">
            <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <TextInput className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Name, email, or phone" />
          </div>
        </Field>
      </div>
    </Card>
    <Card className="overflow-hidden p-0">
      <div className="flex flex-col gap-4 border-b border-border px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-primary">{view === "archive" ? "RECOVER OR REMOVE" : "YOUR ADDRESS BOOK"}</p>
          <h2 className="mt-1 text-xl font-bold tracking-tight">{view === "archive" ? "Archived contacts" : "Contacts"}</h2>
          <p className="mt-1 text-sm text-muted">{contactsLoading ? "Finding contacts…" : `${contacts.length} ${contacts.length === 1 ? "person" : "people"}${contactListId ? ` in ${contactLists.find((list) => String(list.id) === contactListId)?.name ?? "this list"}` : ""}`}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-xl border border-border bg-[#fbf9f8] p-1" aria-label="Contact layout">
            <button type="button" aria-pressed={layout === "table"} onClick={() => setLayout("table")} className={`rounded-lg px-3 py-2 text-xs font-semibold ${layout === "table" ? "bg-white text-foreground shadow-sm" : "text-muted"}`}>Table</button>
            <button type="button" aria-pressed={layout === "cards"} onClick={() => setLayout("cards")} className={`rounded-lg px-3 py-2 text-xs font-semibold ${layout === "cards" ? "bg-white text-foreground shadow-sm" : "text-muted"}`}>Cards</button>
          </div>
          <Button variant="secondary" onClick={() => loadContacts().catch((error) => setMessage({ text: error instanceof Error ? error.message : "Could not load contacts.", tone: "danger" }))} disabled={contactsLoading}>Refresh</Button>
        </div>
      </div>
      {selectedContactIds.length ? <div className="flex flex-wrap items-center justify-between gap-3 border-b border-primary/10 bg-primary-soft/60 px-5 py-3">
        <p className="text-sm font-semibold"><span className="mr-2 inline-grid h-6 w-6 place-items-center rounded-full bg-primary text-xs text-white">{selectedContactIds.length}</span>contacts selected</p>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setSelectedContactIds([])} disabled={bulkActionLoading}>Clear selection</Button>
          {view === "archive" ? <>
            <Button variant="secondary" onClick={() => applyBulkAction("restore")} loading={bulkActionLoading}>Restore selected</Button>
            <Button className="!border-rose-200 !text-rose-700 hover:!bg-rose-50" variant="secondary" onClick={() => applyBulkAction("permanent_delete")} loading={bulkActionLoading}><IconTrash className="h-4 w-4" />Delete forever</Button>
          </> : <Button onClick={() => applyBulkAction("archive")} loading={bulkActionLoading}><IconTrash className="h-4 w-4" />Archive selected</Button>}
        </div>
      </div> : null}
      {contactsLoading ? <div className="p-10"><EmptyState text="Loading your contacts…" /></div> : contacts.length ? layout === "table" ? <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] text-left text-sm">
          <thead className="bg-[#fbf9f8] text-[10px] font-bold uppercase tracking-[0.15em] text-stone-400">
            <tr>
              <th className="w-12 px-5 py-4"><input className="h-4 w-4 accent-[#e45a5a]" type="checkbox" aria-label="Select all visible contacts" checked={contacts.length > 0 && selectedContactIds.length === contacts.length} onChange={(event) => setSelectedContactIds(event.target.checked ? contacts.map((contact) => contact.id) : [])} /></th>
              <th className="px-4 py-4">Contact</th><th className="px-4 py-4">Company</th><th className="px-4 py-4">Lists & tags</th><th className="px-4 py-4">Latest campaign</th><th className="px-4 py-4">Status</th><th className="px-5 py-4 text-right">Quick actions</th>
            </tr>
          </thead>
          <tbody>{contacts.map((contact) => <tr key={contact.id} className="group border-t border-border/80 transition hover:bg-[#fffdfc]">
            <td className="px-5 py-4"><input className="h-4 w-4 accent-[#e45a5a]" type="checkbox" aria-label={`Select ${contact.full_name}`} checked={selectedContactIds.includes(contact.id)} onChange={(event) => setSelectedContactIds((current) => event.target.checked ? [...current, contact.id] : current.filter((id) => id !== contact.id))} /></td>
            <td className="px-4 py-4"><Link href={`/dashboard/crm/contacts/${contact.id}`} className="flex items-center gap-3 text-left">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-rose-100 to-orange-50 text-sm font-bold text-rose-700">{contact.full_name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>
              <span><span className="block font-semibold text-foreground group-hover:text-primary">{contact.full_name}</span><span className="mt-1 block text-xs text-muted">{contact.email}{contact.phone ? ` · ${contact.phone}` : ""}</span></span>
            </Link></td>
            <td className="px-4 py-4 text-sm text-muted">{companies.find((company) => company.id === contact.company_id)?.name ?? "Unknown"}</td>
            <td className="px-4 py-4"><div className="flex max-w-[210px] flex-wrap gap-1">{(contact.crm_contact_tag_links ?? []).map((link) => link.crm_contact_tags ? <Badge key={link.crm_contact_tags.id} tone="primary">{link.crm_contact_tags.name}</Badge> : null)}{!contact.crm_contact_tag_links?.length ? <span className="text-xs text-muted">No tags</span> : null}</div></td>
            <td className="px-4 py-4">{contact.campaigns?.length ? <Link href={`/dashboard/crm/contacts/${contact.id}`} className="inline-flex max-w-[210px] flex-col items-start gap-1.5 text-left hover:text-primary"><span className="max-w-full truncate text-xs font-semibold">{contact.campaigns[0].name}</span><Badge tone={["sent", "delivered", "opened", "clicked", "replied"].includes(contact.campaigns[0].status) ? "success" : contact.campaigns[0].status === "failed" ? "danger" : "neutral"}>{contact.campaigns[0].status}{contact.campaigns.length > 1 ? ` · +${contact.campaigns.length - 1}` : ""}</Badge></Link> : <Link href={`/dashboard/crm/contacts/${contact.id}`} className="text-xs text-muted hover:text-primary">No campaigns</Link>}</td>
            <td className="px-4 py-4"><Badge tone={contact.status === "active" ? "success" : contact.status === "archived" ? "neutral" : "warning"}>{contact.status}</Badge></td>
            <td className="px-5 py-4"><div className="flex justify-end gap-1">
              {view === "contacts" ? <>
                <button type="button" onClick={() => openEdit(contact)} className="grid h-9 w-9 place-items-center rounded-xl text-muted transition hover:bg-primary-soft hover:text-primary" aria-label={`Edit ${contact.full_name}`}><IconEdit className="h-4 w-4" /></button>
                <button type="button" onClick={() => archiveContact(contact)} className="grid h-9 w-9 place-items-center rounded-xl text-muted transition hover:bg-rose-50 hover:text-rose-600" aria-label={`Archive ${contact.full_name}`} title="Move to archive"><IconTrash className="h-4 w-4" /></button>
              </> : <>
                <button type="button" onClick={() => restoreContact(contact)} className="rounded-lg px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">Restore</button>
                <button type="button" onClick={() => permanentlyDeleteContact(contact)} className="rounded-lg px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50">Delete</button>
              </>}
            </div></td>
          </tr>)}</tbody>
        </table>
      </div> : <div className="grid gap-4 p-5 sm:grid-cols-2 xl:grid-cols-3">{contacts.map((contact) => <article key={contact.id} className="group rounded-2xl border border-border bg-white p-5 transition hover:-translate-y-0.5 hover:border-primary/25 hover:shadow-[0_16px_40px_rgba(40,24,38,0.08)]">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-rose-100 to-orange-50 font-bold text-rose-700">{contact.full_name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>
            <div className="min-w-0"><Link href={`/dashboard/crm/contacts/${contact.id}`} className="block max-w-full truncate text-left font-bold hover:text-primary">{contact.full_name}</Link><p className="mt-1 truncate text-xs text-muted">{contact.email}</p></div>
          </div>
          <input className="mt-1 h-4 w-4 shrink-0 accent-[#e45a5a]" type="checkbox" aria-label={`Select ${contact.full_name}`} checked={selectedContactIds.includes(contact.id)} onChange={(event) => setSelectedContactIds((current) => event.target.checked ? [...current, contact.id] : current.filter((id) => id !== contact.id))} />
        </div>
        <div className="mt-5 space-y-2 border-t border-border/80 pt-4 text-sm">
          <p className="text-muted">{companies.find((company) => company.id === contact.company_id)?.name ?? "Unknown company"}</p>
          <p className="text-muted">{contact.phone || "No phone number"}</p>
          {contact.campaigns?.length ? <Link href={`/dashboard/crm/contacts/${contact.id}`} className="flex items-center justify-between gap-2 rounded-xl bg-[#fbf9f8] p-3 text-xs transition hover:bg-primary-soft"><span className="min-w-0"><span className="block text-muted">Latest campaign</span><span className="mt-1 block truncate font-semibold text-foreground">{contact.campaigns[0].name}</span></span><Badge tone={["sent", "delivered", "opened", "clicked", "replied"].includes(contact.campaigns[0].status) ? "success" : "neutral"}>{contact.campaigns[0].status}</Badge></Link> : null}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
          <Badge tone={contact.status === "active" ? "success" : contact.status === "archived" ? "neutral" : "warning"}>{contact.status}</Badge>
          <div className="flex gap-1">{view === "contacts" ? <>
            <button type="button" onClick={() => openEdit(contact)} className="grid h-9 w-9 place-items-center rounded-xl text-muted hover:bg-primary-soft hover:text-primary" aria-label={`Edit ${contact.full_name}`}><IconEdit className="h-4 w-4" /></button>
            <button type="button" onClick={() => archiveContact(contact)} className="grid h-9 w-9 place-items-center rounded-xl text-muted hover:bg-rose-50 hover:text-rose-600" aria-label={`Archive ${contact.full_name}`}><IconTrash className="h-4 w-4" /></button>
          </> : <>
            <button type="button" onClick={() => restoreContact(contact)} className="rounded-lg px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-50">Restore</button>
            <button type="button" onClick={() => permanentlyDeleteContact(contact)} className="rounded-lg px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-50">Delete</button>
          </>}</div>
        </div>
      </article>)}</div> : <div className="p-10 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary-soft text-primary"><IconSearch className="h-6 w-6" /></div>
        <h3 className="mt-4 font-bold">{view === "archive" ? "Nothing in the archive" : "No contacts match this view"}</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">{view === "archive" ? "Archived contacts will appear here. You can restore them or permanently delete them." : "Try adjusting your search or filters, or add a new contact to get started."}</p>
        {view === "contacts" ? <Button className="mt-5" disabled={!companyId || !contactListId} onClick={openAdd}><IconPlus className="h-4 w-4" />Add a contact</Button> : null}
      </div>}
    </Card>
    <Modal open={contactModal} onClose={() => setContactModal(false)} title={editingId ? "Edit contact" : "Add contact"} description="Keep each contact connected to the correct CRM company."><form className="space-y-5" onSubmit={saveContact}>{formMessage ? <Alert tone={formMessage.tone}>{formMessage.text}</Alert> : null}<div className="grid gap-5 sm:grid-cols-2"><Field label="Company"><SelectInput required disabled={Boolean(editingId)} value={form.company_id} onChange={(event) => setForm({ ...form, company_id: event.target.value })}><option value="">Select company</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</SelectInput></Field><Field label="Status"><SelectInput value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option><option value="unsubscribed">Unsubscribed</option><option value="archived">Archived</option></SelectInput></Field></div><div className="grid gap-5 sm:grid-cols-2"><Field label="Full name"><TextInput required value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} placeholder="Ali Khan" /></Field><Field label="Email"><TextInput required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="ali@example.com" /></Field></div><div className="grid gap-5 sm:grid-cols-2"><Field label="Phone"><TextInput value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="0300..." /></Field><Field label="Source"><TextInput value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} placeholder="Website, referral, import" /></Field></div><Field label="Tags"><TextInput value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="customer, uk, education" /></Field><div className="flex justify-end gap-3 border-t border-border pt-5"><Button type="button" variant="secondary" onClick={() => setContactModal(false)}>Cancel</Button><Button type="submit" disabled={formLoading}>{formLoading ? "Saving..." : editingId ? "Update contact" : "Add contact"}</Button></div></form></Modal>
    <Modal open={importModal} onClose={() => setImportModal(false)} title={`Import into ${contactLists.find((list) => String(list.id) === importListId)?.name ?? "contact list"}`} description="Upload a spreadsheet. New contacts are created; existing contacts are added to this list without duplication."><div className="space-y-5">{importMessage ? <Alert tone={importMessage.tone}>{importMessage.text}</Alert> : null}<Field label="Company"><SelectInput disabled value={companyId}>{companies.filter((company) => String(company.id) === companyId).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</SelectInput></Field><Field label="Contact list"><SelectInput required value={importListId} onChange={(event) => { setImportListId(event.target.value); setImportRows([]); setImportMessage(null); }}><option value="">Select contact list</option>{contactLists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</SelectInput></Field><Button type="button" variant="secondary" onClick={() => openNewList("import")}>Create a new list</Button><Field label="CSV / Excel file"><TextInput type="file" accept=".csv,.xls,.xlsx" onChange={(event) => { const file = event.target.files?.[0]; if (file) readImportFile(file); }} /></Field>{importFile ? <p className="text-xs text-muted">Selected: {importFile}</p> : null}{importRows.length ? <div className="max-h-64 overflow-auto rounded-xl border border-border"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-[#fffaf9]"><tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Result</th></tr></thead><tbody>{importRows.map((item) => <tr key={item.rowNumber} className="border-t border-border"><td className="px-3 py-2">{item.rowNumber}</td><td className="px-3 py-2">{item.fullName || "-"}</td><td className="px-3 py-2">{item.email || "-"}</td><td className="px-3 py-2 text-rose-700">{item.errors.length ? item.errors.join(", ") : item.existingContactId ? "Existing contact, add to list" : "New contact"}</td></tr>)}</tbody></table></div> : null}<div className="flex justify-end gap-3 border-t border-border pt-5"><Button type="button" variant="secondary" onClick={() => setImportModal(false)}>Close</Button><Button onClick={confirmImport} disabled={importLoading || !importListId || !importRows.some((row) => !row.errors.length)}>{importLoading ? "Processing..." : "Confirm import"}</Button></div></div></Modal>
    <Modal open={listModal} onClose={() => { setListModal(false); if (listModalReturnTo === "import") setImportModal(true); if (listModalReturnTo === "contact") setContactModal(true); setListModalReturnTo(null); }} title="Create contact list" description={`Create a named list for ${companies.find((company) => String(company.id) === companyId)?.name ?? "this company"}.`}><form className="space-y-4" onSubmit={createContactList}><Field label="List name"><TextInput required value={newListName} onChange={(event) => setNewListName(event.target.value)} placeholder="Test 1" /></Field><Field label="Description"><TextInput value={newListDescription} onChange={(event) => setNewListDescription(event.target.value)} placeholder="Optional note" /></Field><div className="flex justify-end gap-2 border-t border-border pt-4"><Button type="button" variant="secondary" onClick={() => setListModal(false)}>Cancel</Button><Button type="submit" loading={listSaving}>Create list</Button></div></form></Modal>
  </>;
}
