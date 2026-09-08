"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import { IconArrowRight, IconEdit, IconPlus, IconTrash } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/empty-state";
import { Field, SelectInput, TextInput } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth } from "@/components/auth/auth-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

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
  const [verificationAccount, setVerificationAccount] = useState<Account | null>(null);
  const [verificationPassword, setVerificationPassword] = useState("");
  const [verificationAction, setVerificationAction] = useState<"reveal" | "copy">("reveal");
  const [verifying, setVerifying] = useState(false);
  const [revealed, setRevealed] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const { user, profile } = useAuth();
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
    setAccounts((result.accounts ?? []).filter((account: Account) => account.company_id === companyId));
    if (!selected) setMessage({ text: "Company was not found.", tone: "danger" });
  }

  useEffect(() => {
    if (Number.isInteger(companyId) && companyId > 0) loadData().catch((error) => setMessage({ text: error instanceof Error ? error.message : "Could not load company accounts.", tone: "danger" }));
  }, [companyId]);

  const maskedCount = useMemo(() => accounts.filter((account) => !revealed[account.id]).length, [accounts, revealed]);

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

  function requestPasswordVerification(account: Account, action: "reveal" | "copy") {
    if (revealed[account.id]) {
      if (action === "reveal") setRevealed((current) => ({ ...current, [account.id]: "" }));
      return;
    }
    setVerificationAccount(account);
    setVerificationAction(action);
    setVerificationPassword("");
  }

  async function verifyAndReveal(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!verificationAccount || !user?.email) return;
    setVerifying(true);
    setMessage(null);
    try {
      const { error } = await getSupabaseBrowserClient().auth.signInWithPassword({ email: user.email, password: verificationPassword });
      if (error) throw new Error("Password verification failed.");
      const response = await fetch(`/api/company-accounts/${verificationAccount.id}/reveal`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not reveal password.");
      setRevealed((current) => ({ ...current, [verificationAccount.id]: result.password }));
      if (verificationAction === "copy") {
        await navigator.clipboard.writeText(result.password);
        setMessage({ text: "Password copied to clipboard.", tone: "success" });
      }
      setVerificationAccount(null);
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not verify password.", tone: "danger" });
    } finally {
      setVerifying(false);
    }
  }

  async function revealPassword(account: Account) {
    requestPasswordVerification(account, "reveal");
  }

  async function copyPassword(account: Account) {
    if (!revealed[account.id]) {
      requestPasswordVerification(account, "copy");
      return;
    }
    await navigator.clipboard.writeText(revealed[account.id]);
    setMessage({ text: "Password copied to clipboard.", tone: "success" });
  }

  if (!company) {
    return <Card className="p-8 text-center"><p className="text-sm text-muted">{message?.text ?? "Loading company..."}</p><Link href="/dashboard/company-accounts" className="mt-4 inline-flex text-sm font-semibold text-primary">Back to companies</Link></Card>;
  }

  return (
    <>
      <PageHeader eyebrow="Company accounts" title={company.name} description={company.notes || "Manage this company's digital platforms and secure login credentials."} actions={permissions.can_add ? <Button onClick={openAddAccount}><IconPlus className="h-4 w-4" />Add account</Button> : undefined} />
      {message ? <div className="mb-5"><Alert tone={message.tone}>{message.text}</Alert></div> : null}
      <div className="mb-5 flex items-center justify-between gap-3"><Link href="/dashboard/company-accounts" className="inline-flex items-center gap-2 text-sm font-semibold text-muted hover:text-primary"><IconArrowRight className="h-4 w-4 rotate-180" />All companies</Link><Badge tone="neutral">{accounts.length} accounts · {maskedCount} masked</Badge></div>

      <Card className="overflow-hidden p-0 sm:p-0"><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[#fcfaf9] text-[10px] uppercase tracking-[0.11em] text-stone-400"><tr><th className="px-5 py-3 font-bold">Platform</th><th className="px-3 py-3 font-bold">Login</th><th className="px-3 py-3 font-bold">Password</th><th className="px-5 py-3 text-right font-bold">Actions</th></tr></thead><tbody className="divide-y divide-border">{accounts.length ? accounts.map((account) => <tr key={account.id} className="hover:bg-[#fffafa]"><td className="px-5 py-4 font-semibold">{account.platform_name}</td><td className="px-3 py-4 text-muted">{account.login}</td><td className="px-3 py-4 font-mono text-xs">{revealed[account.id] || "••••••••••"}</td><td className="px-5 py-4"><div className="flex justify-end gap-2"><Button variant="secondary" className="h-9 px-3 text-xs" onClick={() => revealPassword(account)}>{revealed[account.id] ? "Mask" : "Reveal"}</Button><Button variant="secondary" className="h-9 px-3 text-xs" onClick={() => copyPassword(account)}>Copy</Button>{permissions.can_edit ? <Button variant="ghost" className="h-9 px-2 text-xs" onClick={() => openEditAccount(account)} aria-label={`Edit ${account.platform_name}`}><IconEdit className="h-4 w-4" /></Button> : null}{permissions.can_delete ? <Button variant="ghost" className="h-9 px-2 text-xs text-rose-600" onClick={() => deleteAccount(account)} aria-label={`Delete ${account.platform_name}`}><IconTrash className="h-4 w-4" /></Button> : null}</div></td></tr>) : <tr><td colSpan={4} className="px-6 py-16 text-center text-sm text-muted">No accounts added for this company yet.</td></tr>}</tbody></table></div></Card>

      <Modal open={accountModal} onClose={() => setAccountModal(false)} title={editingAccountId ? "Edit company account" : "Add company account"} description="Passwords are encrypted before storage and remain masked in the account list."><form className="space-y-5" onSubmit={saveAccount}><Field label="Platform / account name"><TextInput required value={accountForm.platform_name} onChange={(event) => setAccountForm({ ...accountForm, platform_name: event.target.value })} placeholder="Facebook" /></Field><Field label="Login username or email"><TextInput required value={accountForm.login} onChange={(event) => setAccountForm({ ...accountForm, login: event.target.value })} placeholder="social@company.com" /></Field><Field label={editingAccountId ? "New password (optional)" : "Password"}><TextInput required={!editingAccountId} type="password" value={accountForm.password} onChange={(event) => setAccountForm({ ...accountForm, password: event.target.value })} placeholder={editingAccountId ? "Leave empty to keep current password" : "Enter account password"} /></Field><div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">Passwords are encrypted at rest and never returned in the normal account list.</div><div className="flex justify-end gap-3 border-t border-border pt-5"><Button type="button" variant="secondary" onClick={() => setAccountModal(false)}>Cancel</Button><Button type="submit" disabled={loading}>{loading ? "Saving..." : editingAccountId ? "Update account" : "Add account"}</Button></div></form></Modal>
      <Modal open={Boolean(verificationAccount)} onClose={() => setVerificationAccount(null)} title="Verify admin password" description={`Enter your CRM password to ${verificationAction} this account password.`}><form className="space-y-5" onSubmit={verifyAndReveal}><Field label={`Password for ${user?.email ?? "your admin account"}`}><TextInput required type="password" autoFocus value={verificationPassword} onChange={(event) => setVerificationPassword(event.target.value)} placeholder="Enter your login password" /></Field><div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">The laptop password is not accessible to websites. This verifies your Digify CRM account instead.</div><div className="flex justify-end gap-3 border-t border-border pt-5"><Button type="button" variant="secondary" onClick={() => setVerificationAccount(null)}>Cancel</Button><Button type="submit" disabled={verifying}>{verifying ? "Verifying..." : "Verify and continue"}</Button></div></form></Modal>
    </>
  );
}
