"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { IconEdit, IconPlus, IconTrash } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/empty-state";
import { Field, TextInput } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth } from "@/components/auth/auth-provider";

type Company = { id: number; name: string; logo_url?: string | null; notes?: string | null };
type Message = { text: string; tone?: "danger" | "success" };
type CompanyForm = { name: string; logo_url: string; notes: string };

const emptyCompany: CompanyForm = { name: "", logo_url: "", notes: "" };

export default function CompanyAccountsPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [accountCounts, setAccountCounts] = useState<Record<number, number>>({});
  const [companyForm, setCompanyForm] = useState<CompanyForm>(emptyCompany);
  const [editingCompanyId, setEditingCompanyId] = useState<number | null>(null);
  const [companyModal, setCompanyModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const { profile } = useAuth();
  const [permissions, setPermissions] = useState({ can_add: true, can_edit: true, can_delete: true });

  useEffect(() => {
    if (profile?.role !== "employee") return;
    fetch("/api/me/permissions", { cache: "no-store" }).then((response) => response.json()).then((result) => {
      const permission = (result.permissions ?? []).find((item: { module: string }) => item.module === "company_accounts");
      setPermissions(permission ?? { can_add: false, can_edit: false, can_delete: false });
    }).catch(() => setPermissions({ can_add: false, can_edit: false, can_delete: false }));
  }, [profile?.role]);

  async function loadData() {
    const response = await fetch("/api/company-accounts", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not load companies.");
    setCompanies(result.companies ?? []);
    const counts: Record<number, number> = {};
    (result.accounts ?? []).forEach((account: { company_id: number }) => {
      counts[account.company_id] = (counts[account.company_id] ?? 0) + 1;
    });
    setAccountCounts(counts);
  }

  useEffect(() => {
    loadData().catch((error) => setMessage({ text: error instanceof Error ? error.message : "Could not load companies.", tone: "danger" }));
  }, []);

  function openAddCompany() {
    setEditingCompanyId(null);
    setCompanyForm(emptyCompany);
    setCompanyModal(true);
  }

  function openEditCompany(event: React.MouseEvent, company: Company) {
    event.preventDefault();
    event.stopPropagation();
    setEditingCompanyId(company.id);
    setCompanyForm({ name: company.name, logo_url: company.logo_url ?? "", notes: company.notes ?? "" });
    setCompanyModal(true);
  }

  async function saveCompany(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/companies", { method: editingCompanyId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...companyForm, id: editingCompanyId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save company.");
      setCompanyModal(false);
      setMessage({ text: editingCompanyId ? "Company updated." : "Company added.", tone: "success" });
      await loadData();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not save company.", tone: "danger" });
    } finally {
      setLoading(false);
    }
  }

  async function deleteCompany(event: React.MouseEvent, company: Company) {
    event.preventDefault();
    event.stopPropagation();
    if (!window.confirm(`Delete ${company.name} and all its accounts?`)) return;
    const response = await fetch(`/api/companies?id=${company.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) { setMessage({ text: result.error ?? "Could not delete company.", tone: "danger" }); return; }
    setMessage({ text: "Company deleted.", tone: "success" });
    await loadData();
  }

  return (
    <>
      <PageHeader eyebrow="Company accounts" title="Companies" description="Select a company to manage its digital platforms and secure login credentials." actions={permissions.can_add ? <Button onClick={openAddCompany}><IconPlus className="h-4 w-4" />Add company</Button> : undefined} />
      {message ? <div className="mb-5"><Alert tone={message.tone}>{message.text}</Alert></div> : null}

      {companies.length ? (
        <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {companies.map((company) => (
            <Link key={company.id} href={`/dashboard/company-accounts/${company.id}`} className="group block">
              <Card className="h-full overflow-hidden p-0 transition duration-200 hover:-translate-y-1 hover:border-primary/30 hover:shadow-[0_18px_40px_rgba(28,20,18,0.1)]">
                <div className="h-1.5 bg-primary" />
                <div className="flex min-h-[250px] flex-col p-5 sm:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl border border-border bg-primary-soft text-2xl font-bold text-primary">
                      {company.logo_url ? <img src={company.logo_url} alt={`${company.name} logo`} className="h-full w-full object-cover" onError={(event) => { event.currentTarget.style.display = "none"; }} /> : company.name.slice(0, 1).toUpperCase()}
                    </div>
                    <Badge tone="neutral">{accountCounts[company.id] ?? 0} accounts</Badge>
                  </div>
                  <div className="mt-6 flex-1"><h2 className="text-xl font-bold tracking-tight group-hover:text-primary">{company.name}</h2><p className="mt-2 line-clamp-3 text-sm leading-6 text-muted">{company.notes || "Manage this company's social media, tools, and digital accounts."}</p></div>
                  <div className="mt-6 flex items-center justify-between border-t border-border pt-4"><span className="text-sm font-semibold text-primary">Open accounts <span aria-hidden>→</span></span><div className="flex gap-1">{permissions.can_edit ? <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-primary-soft hover:text-primary" onClick={(event) => openEditCompany(event, company)} aria-label={`Edit ${company.name}`}><IconEdit className="h-4 w-4" /></button> : null}{permissions.can_delete ? <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-rose-50 hover:text-rose-600" onClick={(event) => deleteCompany(event, company)} aria-label={`Delete ${company.name}`}><IconTrash className="h-4 w-4" /></button> : null}</div></div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card className="p-10 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary-soft text-primary"><IconPlus className="h-6 w-6" /></div><h2 className="mt-5 text-lg font-bold">No companies yet</h2><p className="mt-2 text-sm text-muted">Add a company first, then manage its accounts inside the company page.</p><Button className="mt-5" onClick={openAddCompany}><IconPlus className="h-4 w-4" />Add company</Button></Card>
      )}

      <Modal open={companyModal} onClose={() => setCompanyModal(false)} title={editingCompanyId ? "Edit company" : "Add company"} description="Create the company card used to organize its digital accounts."><form className="space-y-5" onSubmit={saveCompany}><Field label="Company name"><TextInput required value={companyForm.name} onChange={(event) => setCompanyForm({ ...companyForm, name: event.target.value })} placeholder="Digify IT Solution" /></Field><Field label="Logo URL (optional)"><TextInput type="url" value={companyForm.logo_url} onChange={(event) => setCompanyForm({ ...companyForm, logo_url: event.target.value })} placeholder="https://..." /></Field><Field label="Notes (optional)"><TextInput value={companyForm.notes} onChange={(event) => setCompanyForm({ ...companyForm, notes: event.target.value })} placeholder="Company account notes" /></Field><div className="flex justify-end gap-3 border-t border-border pt-5"><Button type="button" variant="secondary" onClick={() => setCompanyModal(false)}>Cancel</Button><Button type="submit" disabled={loading}>{loading ? "Saving..." : editingCompanyId ? "Update company" : "Add company"}</Button></div></form></Modal>
    </>
  );
}
