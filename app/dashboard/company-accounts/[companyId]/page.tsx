"use client";

import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { IconArrowRight, IconCopy, IconEdit, IconPlus, IconTrash } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/empty-state";
import { Field, SelectInput, TextInput } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth } from "@/components/auth/auth-provider";

type Company = { id: number; name: string; logo_url?: string | null; notes?: string | null };
type Account = { id: number; company_id: number; platform_name: string; login: string; created_at: string; updated_at: string };
type Message = { text: string; tone?: "danger" | "success" };
type AccountForm = { platform_name: string; login: string; password: string };

const emptyAccount: AccountForm = { platform_name: "", login: "", password: "" };

export default function CompanyAccountsDetailPage() {
  const params = useParams<{ companyId: string }>();
  const companyId = Number(params.companyId);
  const [company, setCompany] = useState<Company | null>(null);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [accountForm, setAccountForm] = useState<AccountForm>(emptyAccount);
  const [editingAccountId, setEditingAccountId] = useState<number | null>(null);
  const [accountModal, setAccountModal] = useState(false);
  const [revealed, setRevealed] = useState<Record<number, string>>({});
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const { profile } = useAuth();
  const [permissions, setPermissions] = useState({ can_read: true, can_add: true, can_edit: true, can_delete: true });

  useEffect(() => {
    if (profile?.role !== "employee") return;
    fetch("/api/me/permissions", { cache: "no-store" }).then((response) => response.json()).then((result) => {
      const permission = (result.permissions ?? []).find((item: { module: string }) => item.module === "company_accounts");
      setPermissions(permission ?? { can_read: false, can_add: false, can_edit: false, can_delete: false });
    }).catch(() => setPermissions({ can_read: false, can_add: false, can_edit: false, can_delete: false }));
  }, [profile?.role]);

  async function loadData() {
    const response = await fetch("/api/company-accounts", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not load company accounts.");
    const selected = (result.companies ?? []).find((item: Company) => item.id === companyId) ?? null;
    setCompany(selected);
    const companyAccounts = (result.accounts ?? []).filter((account: Account) => account.company_id === companyId);
    setAccounts(companyAccounts);
    const passwords: Record<number, string> = {};
    await Promise.all(companyAccounts.map(async (account: Account) => {
      try {
        const passwordResponse = await fetch(`/api/company-accounts/${account.id}/reveal`, { cache: "no-store" });
        if (!passwordResponse.ok) return;
        const passwordResult = await passwordResponse.json();
        passwords[account.id] = passwordResult.password;
      } catch {
        // Keep the account row visible if one credential cannot be loaded.
      }
    }));
    setRevealed(passwords);
    if (!selected) setMessage({ text: "Company was not found.", tone: "danger" });
  }

  useEffect(() => {
    if (Number.isInteger(companyId) && companyId > 0) loadData().catch((error) => setMessage({ text: error instanceof Error ? error.message : "Could not load company accounts.", tone: "danger" }));
  }, [companyId]);

  function openAddAccount() {
    setEditingAccountId(null);
    setAccountForm(emptyAccount);
    setAccountModal(true);
  }

  function openEditAccount(account: Account) {
    setEditingAccountId(account.id);
    setAccountForm({ platform_name: account.platform_name, login: account.login, password: "" });
    setAccountModal(true);
  }

  async function saveAccount(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/company-accounts", { method: editingAccountId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...accountForm, id: editingAccountId, company_id: companyId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save account.");
      setAccountModal(false);
      setMessage({ text: editingAccountId ? "Account updated." : "Account added.", tone: "success" });
      await loadData();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not save account.", tone: "danger" });
    } finally {
      setLoading(false);
    }
  }

  async function deleteAccount(account: Account) {
    if (!window.confirm(`Delete the ${account.platform_name} account?`)) return;
    const response = await fetch(`/api/company-accounts?id=${account.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) { setMessage({ text: result.error ?? "Could not delete account.", tone: "danger" }); return; }
    setMessage({ text: "Account deleted.", tone: "success" });
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

  if (!company) {
    return <Card className="p-8 text-center"><p className="text-sm text-muted">{message?.text ?? "Loading company..."}</p><Link href="/dashboard/company-accounts" className="mt-4 inline-flex text-sm font-semibold text-primary">Back to companies</Link></Card>;
  }

  return (
    <>
      <PageHeader eyebrow="Company accounts" title={company.name} description={company.notes || "Manage this company's digital platforms and secure login credentials."} actions={permissions.can_add ? <Button onClick={openAddAccount}><IconPlus className="h-4 w-4" />Add account</Button> : undefined} />
      {message ? <div className="mb-5"><Alert tone={message.tone}>{message.text}</Alert></div> : null}
      <div className="mb-5 flex items-center justify-between gap-3"><Link href="/dashboard/company-accounts" className="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-primary"><IconArrowRight className="h-4 w-4 rotate-180" />All companies</Link><Badge tone="neutral">{accounts.length} accounts</Badge></div>

      <Card className="overflow-hidden p-0 sm:p-0"><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-[#fcfaf9] text-[10px] uppercase tracking-[0.11em] text-stone-400"><tr><th className="px-5 py-3 font-bold">Platform</th><th className="px-3 py-3 font-bold">Email / login</th><th className="px-3 py-3 font-bold">Password</th><th className="px-5 py-3 text-right font-bold">Actions</th></tr></thead><tbody className="divide-y divide-border">{accounts.length ? accounts.map((account) => <tr key={account.id} className="hover:bg-[#fffafa]"><td className="px-5 py-4 font-semibold">{account.platform_name}</td><td className="px-3 py-3"><div className="flex items-center gap-2"><span className="max-w-72 truncate text-muted">{account.login}</span><button type="button" onClick={() => copyValue(account.login, `login-${account.id}`)} title="Copy email or login" aria-label={`Copy login for ${account.platform_name}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-primary-soft hover:text-primary">{copiedField === `login-${account.id}` ? <span className="text-[10px] font-bold">Done</span> : <IconCopy className="h-4 w-4" />}</button></div></td><td className="px-3 py-3"><div className="flex items-center gap-2"><span className="max-w-72 break-all font-mono text-xs">{revealed[account.id] ?? "Loading..."}</span><button type="button" disabled={!revealed[account.id]} onClick={() => copyValue(revealed[account.id], `password-${account.id}`)} title="Copy password" aria-label={`Copy password for ${account.platform_name}`} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-muted hover:bg-primary-soft hover:text-primary disabled:opacity-40">{copiedField === `password-${account.id}` ? <span className="text-[10px] font-bold">Done</span> : <IconCopy className="h-4 w-4" />}</button></div></td><td className="px-5 py-4"><div className="flex justify-end gap-2">{permissions.can_edit ? <Button variant="ghost" className="h-9 px-2 text-xs" onClick={() => openEditAccount(account)} aria-label={`Edit ${account.platform_name}`}><IconEdit className="h-4 w-4" /></Button> : null}{permissions.can_delete ? <Button variant="ghost" className="h-9 px-2 text-xs text-rose-600" onClick={() => deleteAccount(account)} aria-label={`Delete ${account.platform_name}`}><IconTrash className="h-4 w-4" /></Button> : null}</div></td></tr>) : <tr><td colSpan={4} className="px-6 py-16 text-center text-sm text-muted">No accounts added for this company yet.</td></tr>}</tbody></table></div></Card>

      <Modal open={accountModal} onClose={() => setAccountModal(false)} title={editingAccountId ? "Edit company account" : "Add company account"} description="Credentials are encrypted at rest and shown only to users with access to this company."><form className="space-y-5" onSubmit={saveAccount}><Field label="Platform / account name"><TextInput required value={accountForm.platform_name} onChange={(event) => setAccountForm({ ...accountForm, platform_name: event.target.value })} placeholder="Facebook" /></Field><Field label="Login username or email"><TextInput required value={accountForm.login} onChange={(event) => setAccountForm({ ...accountForm, login: event.target.value })} placeholder="social@company.com" /></Field><Field label={editingAccountId ? "New password (optional)" : "Password"}><TextInput required={!editingAccountId} type="password" value={accountForm.password} onChange={(event) => setAccountForm({ ...accountForm, password: event.target.value })} placeholder={editingAccountId ? "Leave empty to keep current password" : "Enter account password"} /></Field><div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Credentials are encrypted at rest. Account access is limited by company permissions.</div><div className="flex justify-end gap-3 border-t border-border pt-5"><Button type="button" variant="secondary" onClick={() => setAccountModal(false)}>Cancel</Button><Button type="submit" disabled={loading}>{loading ? "Saving..." : editingAccountId ? "Update account" : "Add account"}</Button></div></form></Modal>
    </>
  );
}
