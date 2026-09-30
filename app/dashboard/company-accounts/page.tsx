"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { IconCopy, IconEdit, IconPin, IconPlus, IconSearch, IconTrash } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/empty-state";
import { Field, TextInput } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth } from "@/components/auth/auth-provider";

type Company = { id: number; name: string; logo_url?: string | null; notes?: string | null };
type AccountSearchResult = { id: number; company_id: number; company_name: string; platform_name: string; login: string; password: string };
type Message = { text: string; tone?: "danger" | "success" };
type CompanyForm = { name: string; logo_url: string; notes: string };

const emptyCompany: CompanyForm = { name: "", logo_url: "", notes: "" };

function CompanyLogo({ company }: { company: Company }) {
  const [imageFailed, setImageFailed] = useState(false);
  const showImage = Boolean(company.logo_url) && !imageFailed;

  return (
    <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-2xl border border-transparent bg-transparent text-2xl font-bold text-primary">
      {showImage ? (
        <img
          src={company.logo_url ?? ""}
          alt={`${company.name} logo`}
          className="h-full w-full object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        company.name.slice(0, 1).toUpperCase()
      )}
    </div>
  );
}

export default function CompanyAccountsPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [accountCounts, setAccountCounts] = useState<Record<number, number>>({});
  const [companyForm, setCompanyForm] = useState<CompanyForm>(emptyCompany);
  const [editingCompanyId, setEditingCompanyId] = useState<number | null>(null);
  const [companyModal, setCompanyModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AccountSearchResult[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [pinnedCompanyIds, setPinnedCompanyIds] = useState<number[]>([]);
  const [pinsLoaded, setPinsLoaded] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const { profile } = useAuth();
  const [permissions, setPermissions] = useState({ can_add: true, can_edit: true, can_delete: true });

  useEffect(() => {
    if (profile?.role !== "employee") return;
    fetch("/api/me/permissions", { cache: "no-store" }).then((response) => response.json()).then((result) => {
      const permission = (result.permissions ?? []).find((item: { module: string }) => item.module === "company_accounts");
      setPermissions(permission ?? { can_add: false, can_edit: false, can_delete: false });
    }).catch(() => setPermissions({ can_add: false, can_edit: false, can_delete: false }));
  }, [profile?.role]);

  useEffect(() => {
    try {
      const savedPins = JSON.parse(window.localStorage.getItem("company-accounts-pinned") ?? "[]");
      setPinnedCompanyIds(Array.isArray(savedPins) ? savedPins.filter((id): id is number => Number.isInteger(id)) : []);
    } catch {
      setPinnedCompanyIds([]);
    } finally {
      setPinsLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (pinsLoaded) window.localStorage.setItem("company-accounts-pinned", JSON.stringify(pinnedCompanyIds));
  }, [pinnedCompanyIds, pinsLoaded]);

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

  useEffect(() => {
    const query = searchQuery.trim();
    if (query.length < 2) {
      setSearchResults([]);
      setSearchLoading(false);
      return;
    }
    const controller = new AbortController();
    setSearchResults([]);
    setSearchLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/company-accounts?search=${encodeURIComponent(query)}`, { cache: "no-store", signal: controller.signal });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? "Could not search company accounts.");
        setSearchResults(result.results ?? []);
      } catch (error) {
        if (error instanceof Error && error.name !== "AbortError") setMessage({ text: error.message, tone: "danger" });
      } finally {
        if (!controller.signal.aborted) setSearchLoading(false);
      }
    }, 220);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [searchQuery]);

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

  async function copyValue(value: string, field: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedField(field);
      window.setTimeout(() => setCopiedField((current) => current === field ? null : current), 1400);
    } catch {
      setMessage({ text: "Clipboard access is not available in this browser.", tone: "danger" });
    }
  }

  function togglePinned(companyId: number) {
    setPinnedCompanyIds((current) => current.includes(companyId) ? current.filter((id) => id !== companyId) : [companyId, ...current]);
  }

  const orderedCompanies = [...companies].sort((first, second) => {
    const firstPinned = pinnedCompanyIds.includes(first.id);
    const secondPinned = pinnedCompanyIds.includes(second.id);
    return Number(secondPinned) - Number(firstPinned) || first.name.localeCompare(second.name);
  });
  const searching = searchQuery.trim().length >= 2;

  return (
    <>
      <PageHeader eyebrow="Company accounts" title="Companies" description="Search accounts across every company, copy credentials, and pin your most-used workspaces." actions={<div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row"><label className="relative block w-full sm:w-72"><span className="sr-only">Search all company accounts</span><IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" /><input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Search accounts, email, company..." className="h-11 w-full rounded-xl border border-border bg-white pl-9 pr-3 text-sm outline-none transition focus:border-primary/50 focus:ring-4 focus:ring-primary/10" /></label>{permissions.can_add ? <Button onClick={openAddCompany}><IconPlus className="h-4 w-4" />Add company</Button> : null}</div>} />
      {message ? <div className="mb-5"><Alert tone={message.tone}>{message.text}</Alert></div> : null}

      {searching ? <Card className="mb-5 overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="font-bold">Account search</h2><p className="mt-1 text-xs text-muted">Matching credentials across every company</p></div><Badge tone="neutral">{searchLoading ? "Searching..." : `${searchResults.length} results`}</Badge></div>
        {searchLoading && !searchResults.length ? <p className="p-8 text-center text-sm text-muted">Searching accounts...</p> : searchResults.length ? <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-[#fcfaf9] text-[10px] uppercase tracking-[0.11em] text-muted"><tr><th className="px-5 py-3 font-bold">Company</th><th className="px-4 py-3 font-bold">Account</th><th className="px-4 py-3 font-bold">Email / login</th><th className="px-4 py-3 font-bold">Password</th></tr></thead><tbody className="divide-y divide-border">{searchResults.map((account) => <tr key={account.id} className="hover:bg-primary-soft/20"><td className="px-5 py-3.5 font-semibold">{account.company_name}</td><td className="px-4 py-3.5">{account.platform_name}</td><td className="px-4 py-3.5"><div className="flex items-center gap-2"><span className="max-w-72 truncate">{account.login}</span><button type="button" onClick={() => copyValue(account.login, `login-${account.id}`)} title="Copy email or login" aria-label={`Copy login for ${account.platform_name}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-white hover:text-primary">{copiedField === `login-${account.id}` ? <span className="text-[10px] font-bold">Done</span> : <IconCopy className="h-4 w-4" />}</button></div></td><td className="px-4 py-3.5"><div className="flex items-center gap-2"><span className="max-w-64 truncate font-mono text-xs">{account.password}</span><button type="button" onClick={() => copyValue(account.password, `password-${account.id}`)} title="Copy password" aria-label={`Copy password for ${account.platform_name}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-white hover:text-primary">{copiedField === `password-${account.id}` ? <span className="text-[10px] font-bold">Done</span> : <IconCopy className="h-4 w-4" />}</button></div></td></tr>)}</tbody></table></div> : <div className="p-10 text-center"><p className="font-semibold">No matching accounts</p><p className="mt-1 text-sm text-muted">Try another company, platform, or email address.</p></div>}
      </Card> : null}

      {!searching && companies.length ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {orderedCompanies.map((company) => (
            <Link key={company.id} href={`/dashboard/company-accounts/${company.id}`} className="group block">
              <Card className="h-full min-h-[255px] overflow-hidden p-0 transition duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_18px_40px_rgba(28,20,18,0.1)]">
                <div className="h-1.5 bg-primary" />
                <div className="flex min-h-[253px] flex-col p-4">
                  <div className="flex items-start justify-between gap-3">
                    <CompanyLogo company={company} />
                    <div className="flex items-center gap-2">{pinnedCompanyIds.includes(company.id) ? <Badge tone="primary">Pinned</Badge> : null}<Badge tone="neutral">{accountCounts[company.id] ?? 0} accounts</Badge></div>
                  </div>
                  <div className="mt-6 flex-1"><h2 className="text-xl font-bold tracking-tight group-hover:text-primary">{company.name}</h2><p className="mt-2 line-clamp-3 text-sm leading-6 text-muted">{company.notes || "Manage this company's social media, tools, and digital accounts."}</p></div>
                  <div className="mt-5 flex items-center justify-between border-t border-border pt-3"><span className="text-sm font-semibold text-primary">Open accounts <span aria-hidden>→</span></span><div className="flex gap-1"><button type="button" className={`grid h-8 w-8 place-items-center rounded-lg transition ${pinnedCompanyIds.includes(company.id) ? "bg-primary-soft text-primary" : "text-muted hover:bg-primary-soft hover:text-primary"}`} onClick={(event) => { event.preventDefault(); event.stopPropagation(); togglePinned(company.id); }} aria-label={pinnedCompanyIds.includes(company.id) ? `Unpin ${company.name}` : `Pin ${company.name} to top`} title={pinnedCompanyIds.includes(company.id) ? "Unpin company" : "Pin company to top"}><IconPin className="h-4 w-4" /></button>{permissions.can_edit ? <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-primary-soft hover:text-primary" onClick={(event) => openEditCompany(event, company)} aria-label={`Edit ${company.name}`}><IconEdit className="h-4 w-4" /></button> : null}{permissions.can_delete ? <button type="button" className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-rose-50 hover:text-rose-600" onClick={(event) => deleteCompany(event, company)} aria-label={`Delete ${company.name}`}><IconTrash className="h-4 w-4" /></button> : null}</div></div>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : !searching ? (
        <Card className="p-10 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary-soft text-primary"><IconPlus className="h-6 w-6" /></div><h2 className="mt-5 text-lg font-bold">No companies yet</h2><p className="mt-2 text-sm text-muted">Add a company first, then manage its accounts inside the company page.</p><Button className="mt-5" onClick={openAddCompany}><IconPlus className="h-4 w-4" />Add company</Button></Card>
      ) : null}

      <Modal open={companyModal} onClose={() => setCompanyModal(false)} title={editingCompanyId ? "Edit company" : "Add company"} description="Create the company card used to organize its digital accounts."><form className="space-y-5" onSubmit={saveCompany}><Field label="Company name"><TextInput required value={companyForm.name} onChange={(event) => setCompanyForm({ ...companyForm, name: event.target.value })} placeholder="Digify IT Solution" /></Field><Field label="Logo URL (optional)"><TextInput type="url" value={companyForm.logo_url} onChange={(event) => setCompanyForm({ ...companyForm, logo_url: event.target.value })} placeholder="https://..." /></Field><Field label="Notes (optional)"><TextInput value={companyForm.notes} onChange={(event) => setCompanyForm({ ...companyForm, notes: event.target.value })} placeholder="Company account notes" /></Field><div className="flex justify-end gap-3 border-t border-border pt-5"><Button type="button" variant="secondary" onClick={() => setCompanyModal(false)}>Cancel</Button><Button type="submit" disabled={loading}>{loading ? "Saving..." : editingCompanyId ? "Update company" : "Add company"}</Button></div></form></Modal>
    </>
  );
}
