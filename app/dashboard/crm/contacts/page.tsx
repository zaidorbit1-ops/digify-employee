"use client";

import { useEffect, useState, type FormEvent } from "react";
import * as XLSX from "xlsx";
import { IconEdit, IconPlus, IconTrash } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/empty-state";
import { Field, SelectInput, TextInput } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";

type Company = { id: number; name: string };
type ContactList = { id: number; company_id: number; name: string; description?: string | null; contact_count: number };
type TagLink = { crm_contact_tags?: { id: number; name: string } | null };
type Contact = { id: number; company_id: number; full_name: string; email: string; phone?: string | null; status: string; source?: string | null; created_at: string; crm_contact_tag_links?: TagLink[]; crm_contact_list_members?: { contact_list_id: number }[] };
type TimelineEvent = { id: number; event_type: string; event_data: Record<string, unknown>; created_at: string };
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
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<ContactForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [contactModal, setContactModal] = useState(false);
  const [detailContact, setDetailContact] = useState<Contact | null>(null);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [timelineLoading, setTimelineLoading] = useState(false);
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
    if (status) params.set("status", status);
    if (search.trim()) params.set("search", search.trim());
    const response = await fetch(`/api/crm/contacts?${params}`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not load contacts.");
    setContacts(result.contacts ?? []);
  }

  useEffect(() => { loadCompanies().catch((error) => setMessage({ text: error instanceof Error ? error.message : "Could not load companies.", tone: "danger" })); }, []);
  useEffect(() => { loadContactLists().catch((error) => setMessage({ text: error instanceof Error ? error.message : "Could not load contact lists.", tone: "danger" })); }, [companyId]);
  useEffect(() => { loadContacts().catch((error) => setMessage({ text: error instanceof Error ? error.message : "Could not load contacts.", tone: "danger" })); }, [companyId, contactListId, status]);

  function openAdd() { const targetList = contactLists.find((list) => String(list.id) === contactListId) ?? contactLists[0]; setEditingId(null); setForm({ ...emptyForm, company_id: companyId, contact_list_id: targetList?.id.toString() ?? "" }); setFormMessage({ text: targetList ? `This contact will be added to ${targetList.name}.` : "Select or create a contact list first.", tone: targetList ? "success" : "danger" }); setContactModal(true); }
  function openEdit(contact: Contact) { setEditingId(contact.id); setForm({ company_id: String(contact.company_id), contact_list_id: contact.crm_contact_list_members?.[0]?.contact_list_id.toString() ?? "", full_name: contact.full_name, email: contact.email, phone: contact.phone ?? "", status: contact.status, source: contact.source ?? "manual", tags: (contact.crm_contact_tag_links ?? []).map((link) => link.crm_contact_tags?.name).filter(Boolean).join(", ") }); setFormMessage(null); setContactModal(true); }
  async function openContactDetail(contact: Contact) {
    setDetailContact(contact); setTimeline([]); setTimelineLoading(true);
    try { const response = await fetch(`/api/crm/contacts/${contact.id}/timeline`, { cache: "no-store" }); const result = await response.json(); if (response.ok) setTimeline(result.timeline ?? []); }
    finally { setTimelineLoading(false); }
  }

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
    const response = await fetch(`/api/crm/contacts/${contact.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) { setMessage({ text: result.error ?? "Could not archive contact.", tone: "danger" }); return; }
    setMessage({ text: "Contact archived.", tone: "success" }); await loadContacts();
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
    <PageHeader eyebrow="Business CRM / Contacts" title="Contacts" description="Create named lists, add contacts, and import a spreadsheet directly into the selected list." actions={<div className="flex flex-wrap gap-2"><Button variant="secondary" disabled={!companyId} onClick={() => openNewList()}>New contact list</Button><Button variant="secondary" disabled={!companyId || !contactListId} onClick={() => { setImportListId(contactListId); setImportMessage(null); setImportRows([]); setImportModal(true); }}>Import into list</Button><Button onClick={openAdd} disabled={!companyId || !contactListId}><IconPlus className="h-4 w-4" />Add contact</Button></div>} />
    {message ? <div className="mb-5"><Alert tone={message.tone}>{message.text}</Alert></div> : null}
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-muted">Exporting {contacts.length} currently filtered contact{contacts.length === 1 ? "" : "s"}.</p><div className="flex gap-2"><Button variant="secondary" onClick={() => exportContacts("csv")} disabled={!contacts.length}>Export CSV</Button><Button variant="secondary" onClick={() => exportContacts("xlsx")} disabled={!contacts.length}>Export Excel</Button></div></div>
    <Card className="mb-5"><div className="grid gap-4 md:grid-cols-4"><Field label="Company"><SelectInput value={companyId} onChange={(event) => { setCompanyId(event.target.value); setContactListId(""); setImportListId(""); }}><option value="">All companies</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</SelectInput></Field><Field label="Contact list / destination"><SelectInput disabled={!companyId} value={contactListId} onChange={(event) => setContactListId(event.target.value)}><option value="">All contacts (choose a list to add/import)</option>{contactLists.map((list) => <option key={list.id} value={list.id}>{list.name} ({list.contact_count})</option>)}</SelectInput></Field><Field label="Status"><SelectInput value={status} onChange={(event) => setStatus(event.target.value)}><option value="">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option><option value="unsubscribed">Unsubscribed</option><option value="archived">Archived</option></SelectInput></Field><Field label="Search"><TextInput value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") loadContacts(); }} placeholder="Name, email, or phone" /></Field></div></Card>
    <Card className="overflow-hidden p-0"><div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="font-semibold">Contact database</h2><p className="mt-1 text-sm text-muted">{contacts.length} contact{contacts.length === 1 ? "" : "s"} found</p></div><Button variant="secondary" onClick={loadContacts}>Refresh</Button></div>{contacts.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[#fffaf9] text-xs uppercase tracking-[0.12em] text-stone-400"><tr><th className="px-5 py-3">Contact</th><th className="px-5 py-3">Company</th><th className="px-5 py-3">Tags</th><th className="px-5 py-3">Status</th><th className="px-5 py-3" /></tr></thead><tbody>{contacts.map((contact) => <tr key={contact.id} className="border-t border-border hover:bg-[#fffdfc]"><td className="px-5 py-4"><button type="button" className="text-left" onClick={() => setDetailContact(contact)}><p className="font-semibold hover:text-primary">{contact.full_name}</p><p className="mt-1 text-xs text-muted">{contact.email}{contact.phone ? ` · ${contact.phone}` : ""}</p></button></td><td className="px-5 py-4 text-sm text-muted">{companies.find((company) => company.id === contact.company_id)?.name ?? "Unknown"}</td><td className="px-5 py-4"><div className="flex flex-wrap gap-1">{(contact.crm_contact_tag_links ?? []).map((link) => link.crm_contact_tags ? <Badge key={link.crm_contact_tags.id} tone="primary">{link.crm_contact_tags.name}</Badge> : null)}</div></td><td className="px-5 py-4"><Badge tone={contact.status === "active" ? "success" : contact.status === "archived" ? "neutral" : "warning"}>{contact.status}</Badge></td><td className="px-5 py-4 text-right"><button type="button" onClick={() => openEdit(contact)} className="mr-2 inline-grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-primary-soft hover:text-primary" aria-label={`Edit ${contact.full_name}`}><IconEdit className="h-4 w-4" /></button><button type="button" onClick={() => archiveContact(contact)} className="inline-grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-rose-50 hover:text-rose-600" aria-label={`Archive ${contact.full_name}`}><IconTrash className="h-4 w-4" /></button></td></tr>)}</tbody></table></div> : <div className="p-6"><EmptyState text="No contacts match the current filters." /></div>}</Card>
    <Modal open={contactModal} onClose={() => setContactModal(false)} title={editingId ? "Edit contact" : "Add contact"} description="Keep each contact connected to the correct CRM company."><form className="space-y-5" onSubmit={saveContact}>{formMessage ? <Alert tone={formMessage.tone}>{formMessage.text}</Alert> : null}<div className="grid gap-5 sm:grid-cols-2"><Field label="Company"><SelectInput required disabled={Boolean(editingId)} value={form.company_id} onChange={(event) => setForm({ ...form, company_id: event.target.value })}><option value="">Select company</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</SelectInput></Field><Field label="Status"><SelectInput value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option><option value="unsubscribed">Unsubscribed</option><option value="archived">Archived</option></SelectInput></Field></div><div className="grid gap-5 sm:grid-cols-2"><Field label="Full name"><TextInput required value={form.full_name} onChange={(event) => setForm({ ...form, full_name: event.target.value })} placeholder="Ali Khan" /></Field><Field label="Email"><TextInput required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="ali@example.com" /></Field></div><div className="grid gap-5 sm:grid-cols-2"><Field label="Phone"><TextInput value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="0300..." /></Field><Field label="Source"><TextInput value={form.source} onChange={(event) => setForm({ ...form, source: event.target.value })} placeholder="Website, referral, import" /></Field></div><Field label="Tags"><TextInput value={form.tags} onChange={(event) => setForm({ ...form, tags: event.target.value })} placeholder="customer, uk, education" /></Field><div className="flex justify-end gap-3 border-t border-border pt-5"><Button type="button" variant="secondary" onClick={() => setContactModal(false)}>Cancel</Button><Button type="submit" disabled={formLoading}>{formLoading ? "Saving..." : editingId ? "Update contact" : "Add contact"}</Button></div></form></Modal>
    <Modal open={Boolean(detailContact)} onClose={() => setDetailContact(null)} title={detailContact?.full_name ?? "Contact detail"} description={detailContact?.email}><div className="space-y-4"><div className="grid gap-4 rounded-xl bg-[#fffaf9] p-4 sm:grid-cols-2"><div><p className="text-xs uppercase tracking-[0.12em] text-stone-400">Phone</p><p className="mt-1 text-sm">{detailContact?.phone || "Not provided"}</p></div><div><p className="text-xs uppercase tracking-[0.12em] text-stone-400">Source</p><p className="mt-1 text-sm">{detailContact?.source || "Not recorded"}</p></div></div><div><p className="mb-2 text-sm font-semibold">Tags</p><div className="flex flex-wrap gap-2">{(detailContact?.crm_contact_tag_links ?? []).map((link) => link.crm_contact_tags ? <Badge key={link.crm_contact_tags.id} tone="primary">{link.crm_contact_tags.name}</Badge> : null)}{!detailContact?.crm_contact_tag_links?.length ? <p className="text-sm text-muted">No tags.</p> : null}</div></div><Button onClick={() => { if (detailContact) { setDetailContact(null); openEdit(detailContact); } }}>Edit contact</Button></div></Modal>
    <Modal open={importModal} onClose={() => setImportModal(false)} title={`Import into ${contactLists.find((list) => String(list.id) === importListId)?.name ?? "contact list"}`} description="Upload a spreadsheet. New contacts are created; existing contacts are added to this list without duplication."><div className="space-y-5">{importMessage ? <Alert tone={importMessage.tone}>{importMessage.text}</Alert> : null}<Field label="Company"><SelectInput disabled value={companyId}>{companies.filter((company) => String(company.id) === companyId).map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</SelectInput></Field><Field label="Contact list"><SelectInput required value={importListId} onChange={(event) => { setImportListId(event.target.value); setImportRows([]); setImportMessage(null); }}><option value="">Select contact list</option>{contactLists.map((list) => <option key={list.id} value={list.id}>{list.name}</option>)}</SelectInput></Field><Button type="button" variant="secondary" onClick={() => openNewList("import")}>Create a new list</Button><Field label="CSV / Excel file"><TextInput type="file" accept=".csv,.xls,.xlsx" onChange={(event) => { const file = event.target.files?.[0]; if (file) readImportFile(file); }} /></Field>{importFile ? <p className="text-xs text-muted">Selected: {importFile}</p> : null}{importRows.length ? <div className="max-h-64 overflow-auto rounded-xl border border-border"><table className="w-full text-left text-xs"><thead className="sticky top-0 bg-[#fffaf9]"><tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Email</th><th className="px-3 py-2">Result</th></tr></thead><tbody>{importRows.map((item) => <tr key={item.rowNumber} className="border-t border-border"><td className="px-3 py-2">{item.rowNumber}</td><td className="px-3 py-2">{item.fullName || "-"}</td><td className="px-3 py-2">{item.email || "-"}</td><td className="px-3 py-2 text-rose-700">{item.errors.length ? item.errors.join(", ") : item.existingContactId ? "Existing contact, add to list" : "New contact"}</td></tr>)}</tbody></table></div> : null}<div className="flex justify-end gap-3 border-t border-border pt-5"><Button type="button" variant="secondary" onClick={() => setImportModal(false)}>Close</Button><Button onClick={confirmImport} disabled={importLoading || !importListId || !importRows.some((row) => !row.errors.length)}>{importLoading ? "Processing..." : "Confirm import"}</Button></div></div></Modal>
    <Modal open={listModal} onClose={() => { setListModal(false); if (listModalReturnTo === "import") setImportModal(true); if (listModalReturnTo === "contact") setContactModal(true); setListModalReturnTo(null); }} title="Create contact list" description={`Create a named list for ${companies.find((company) => String(company.id) === companyId)?.name ?? "this company"}.`}><form className="space-y-4" onSubmit={createContactList}><Field label="List name"><TextInput required value={newListName} onChange={(event) => setNewListName(event.target.value)} placeholder="Test 1" /></Field><Field label="Description"><TextInput value={newListDescription} onChange={(event) => setNewListDescription(event.target.value)} placeholder="Optional note" /></Field><div className="flex justify-end gap-2 border-t border-border pt-4"><Button type="button" variant="secondary" onClick={() => setListModal(false)}>Cancel</Button><Button type="submit" loading={listSaving}>Create list</Button></div></form></Modal>
  </>;
}
