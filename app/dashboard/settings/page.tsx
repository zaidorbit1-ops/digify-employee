"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { IconRefresh } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/empty-state";
import { Field, TextInput } from "@/components/ui/field";
import { EmployeePicker } from "@/components/ui/employee-picker";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth } from "@/components/auth/auth-provider";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type Employee = { id: number; name: string; employee_id?: string | null; email?: string | null; status?: string | null };
type Company = { id: number; name: string };
type CompanyAccess = { employee_id: number; company_id: number };
type Permission = { id?: number; employee_id: number; module: string; can_read: boolean; can_add: boolean; can_edit: boolean; can_delete: boolean };
type Message = { text: string; tone?: "danger" | "success" };
type ProfileForm = { name: string; email: string; password: string };
type PermissionKey = "can_read" | "can_add" | "can_edit" | "can_delete";

const modules = [
  ["devices", "Devices"], ["employees", "Employees"], ["attendance", "Attendance"], ["leave", "Leave"], ["holidays", "Holidays"], ["salary", "Salary"], ["company_accounts", "Company accounts"], ["payment_tracking", "Payment tracking"], ["lookups", "Lookup lists"],
] as const;
const permissionKeys: PermissionKey[] = ["can_read", "can_add", "can_edit", "can_delete"];

export default function SettingsPage() {
  const { user, profile } = useAuth();
  const [form, setForm] = useState<ProfileForm>({ name: profile?.full_name ?? "", email: user?.email ?? "", password: "" });
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyAccess, setCompanyAccess] = useState<CompanyAccess[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [accessLoading, setAccessLoading] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const passwordEdited = useRef(false);

  const filteredEmployees = useMemo(() => {
    const query = employeeSearch.trim().toLowerCase();
    return employees.filter((employee) => `${employee.name} ${employee.employee_id ?? employee.id} ${employee.email ?? ""}`.toLowerCase().includes(query));
  }, [employeeSearch, employees]);
  const selectedEmployee = employees.find((employee) => String(employee.id) === selectedEmployeeId);

  const grantedAccess = useMemo(() => permissions.filter((permission) => permission.can_read || permission.can_add || permission.can_edit || permission.can_delete), [permissions]);

  function employeeName(employeeId: number) {
    return employees.find((employee) => employee.id === employeeId)?.name ?? `Employee #${employeeId}`;
  }

  useEffect(() => {
    setForm({ name: profile?.full_name ?? "", email: user?.email ?? "", password: "" });
    passwordEdited.current = false;
  }, [profile, user]);

  async function loadAccess() {
    if (profile?.role !== "superadmin") return;
    setAccessLoading(true);
    try {
      const response = await fetch("/api/permissions", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load permissions.");
      setEmployees(result.employees ?? []);
      setCompanies(result.companies ?? []);
      setCompanyAccess(result.companyAccess ?? []);
      setPermissions(result.permissions ?? []);
      if (!selectedEmployeeId && result.employees?.length) setSelectedEmployeeId(String(result.employees[0].id));
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not load permissions.", tone: "danger" });
    } finally {
      setAccessLoading(false);
    }
  }

  useEffect(() => { loadAccess(); }, [profile?.role]);

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    try {
      const supabase = getSupabaseBrowserClient();
      const { error: authError } = await supabase.auth.updateUser({ email: form.email.trim().toLowerCase() });
      if (authError) throw authError;
      if (passwordEdited.current && form.password.trim()) {
        const { error: passwordError } = await supabase.auth.updateUser({ password: form.password.trim() });
        if (passwordError) throw passwordError;
      }
      if (!user?.id) throw new Error("Your session is not ready.");
      const { error: profileError } = await supabase.from("profiles").update({ full_name: form.name.trim() }).eq("user_id", user.id);
      if (profileError) throw profileError;
      setForm((current) => ({ ...current, password: "" }));
      passwordEdited.current = false;
      setMessage({ text: "Profile settings updated.", tone: "success" });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not update profile settings.", tone: "danger" });
    } finally {
      setLoading(false);
    }
  }

  function currentPermission(module: string): Permission {
    return permissions.find((permission) => permission.employee_id === Number(selectedEmployeeId) && permission.module === module) ?? { employee_id: Number(selectedEmployeeId), module, can_read: false, can_add: false, can_edit: false, can_delete: false };
  }

  async function savePermission(next: Permission) {
    const response = await fetch("/api/permissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(next) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not save permission.");
  }

  function selectedCompanyIds() {
    return companyAccess.filter((access) => access.employee_id === Number(selectedEmployeeId)).map((access) => access.company_id);
  }

  async function updateCompanyAccess(companyId: number, checked: boolean) {
    const employeeId = Number(selectedEmployeeId);
    const nextCompanyIds = checked ? [...new Set([...selectedCompanyIds(), companyId])] : selectedCompanyIds().filter((id) => id !== companyId);
    setCompanyAccess((current) => [...current.filter((access) => access.employee_id !== employeeId), ...nextCompanyIds.map((id) => ({ employee_id: employeeId, company_id: id }))]);
    try {
      const response = await fetch("/api/permissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employee_id: employeeId, company_ids: nextCompanyIds }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save company access.");
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not save company access.", tone: "danger" });
    }
  }

  async function updatePermission(module: string, key: PermissionKey, checked: boolean) {
    const next = { ...currentPermission(module), [key]: checked };
    if (key === "can_read" && checked) {
      next.can_add = false;
      next.can_edit = false;
      next.can_delete = false;
    }
    if (key !== "can_read" && checked) next.can_read = true;
    if (key === "can_read" && !checked) {
      next.can_add = false;
      next.can_edit = false;
      next.can_delete = false;
    }
    setPermissions((current) => [...current.filter((permission) => !(permission.employee_id === next.employee_id && permission.module === module)), next]);
    try {
      await savePermission(next);
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not save permission.", tone: "danger" });
    }
  }

  async function toggleAll(module: string, checked: boolean) {
    const next = { ...currentPermission(module), can_read: checked, can_add: checked, can_edit: checked, can_delete: checked };
    setPermissions((current) => [...current.filter((permission) => !(permission.employee_id === next.employee_id && permission.module === module)), next]);
    try {
      await savePermission(next);
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not save all permissions.", tone: "danger" });
    }
  }

  return (
    <>
      <PageHeader eyebrow="Settings" title="Workspace settings" description="Update your profile and control employee access to each CRM module." actions={profile?.role === "superadmin" ? <Button variant="secondary" onClick={loadAccess} disabled={accessLoading}><IconRefresh className="h-4 w-4" />Refresh access</Button> : undefined} />
      {message ? <div className="mb-5"><Alert tone={message.tone}>{message.text}</Alert></div> : null}

      <Card className="mb-5 p-5 sm:p-6"><div className="mb-5"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary">Profile</p><h2 className="mt-1 text-lg font-bold">Your account</h2><p className="mt-1 text-sm text-muted">Change your name, email, or login password.</p></div><form onSubmit={saveProfile} className="grid gap-4 md:grid-cols-3"><Field label="Full name"><TextInput required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></Field><Field label="Email address"><TextInput required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} /></Field><Field label="New password (optional)"><TextInput type="password" autoComplete="new-password" minLength={6} value={form.password} onChange={(event) => { passwordEdited.current = true; setForm({ ...form, password: event.target.value }); }} placeholder="Leave empty to keep current" /></Field><div className="md:col-span-3 flex justify-end"><Button type="submit" disabled={loading}>{loading ? "Saving..." : "Save profile"}</Button></div></form></Card>

      {profile?.role === "superadmin" ? <>
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-primary/15 bg-primary-soft/40 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"><div><p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">Editing access for</p><p className="mt-1 text-base font-bold">{selectedEmployee?.name ?? "Select an employee"}</p><p className="mt-1 text-xs text-muted">{selectedEmployee ? `Employee ID ${selectedEmployee.employee_id ?? selectedEmployee.id} · ${selectedEmployee.email ?? "Permissions are saved instantly"}` : "Choose an employee below to manage module access."}</p></div><div className="rounded-xl bg-white px-3 py-2 text-right shadow-sm"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-400">Active staff</p><p className="mt-0.5 text-lg font-bold text-primary">{employees.length}</p></div></div>
          <Card className="overflow-visible p-0 sm:p-0"><div className="flex flex-col gap-5 border-b border-border bg-[#fffaf9] p-5 sm:p-6"><div><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary">Access management</p><h2 className="mt-1 text-lg font-bold">Employee permissions</h2><p className="mt-1 text-sm text-muted">Choose an employee, then control exactly what they can access.</p></div><div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]"><Field label="Search employee"><TextInput placeholder="Search by name, ID, or email" value={employeeSearch} onChange={(event) => setEmployeeSearch(event.target.value)} /></Field><Field label="Selected employee"><EmployeePicker employees={filteredEmployees} value={selectedEmployeeId} onChange={setSelectedEmployeeId} /></Field></div><div className="rounded-xl border border-primary/15 bg-white/80 px-4 py-3 text-xs text-muted"><span className="font-semibold text-foreground">Permission levels:</span> Read lets an employee view a module. Add, Edit, and Delete automatically include Read.</div><details className="rounded-xl border border-border bg-white"><summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold">Company accounts access</summary><div className="grid gap-2 border-t border-border p-4 sm:grid-cols-2 lg:grid-cols-3">{companies.length ? companies.map((company) => <label key={company.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-primary-soft"><input type="checkbox" checked={selectedCompanyIds().includes(company.id)} onChange={(event) => updateCompanyAccess(company.id, event.target.checked)} />{company.name}</label>) : <p className="text-sm text-muted">No companies available.</p>}</div></details></div><div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-[#fcfaf9] text-[10px] uppercase tracking-[0.11em] text-stone-400"><tr><th className="px-5 py-3 font-bold">Module</th><th className="px-3 py-3 text-center font-bold">Read</th><th className="px-3 py-3 text-center font-bold">Add</th><th className="px-3 py-3 text-center font-bold">Edit</th><th className="px-3 py-3 text-center font-bold">Delete</th><th className="px-3 py-3 text-center font-bold">All</th></tr></thead><tbody className="divide-y divide-border">{modules.map(([module, label]) => { const permission = currentPermission(module); const allChecked = permissionKeys.every((key) => permission[key]); return <tr key={module} className="hover:bg-[#fffafa]"><td className="px-5 py-4 font-semibold">{label}</td>{permissionKeys.map((key) => <td key={key} className="px-3 py-4 text-center"><input type="checkbox" checked={permission[key]} onChange={(event) => updatePermission(module, key, event.target.checked)} disabled={!selectedEmployeeId} className="h-4 w-4 accent-primary transition-transform duration-150 checked:scale-110" /></td>)}<td className="px-3 py-4 text-center"><input type="checkbox" checked={allChecked} onChange={(event) => toggleAll(module, event.target.checked)} disabled={!selectedEmployeeId} className="h-4 w-4 accent-primary transition-transform duration-150 checked:scale-110" aria-label={`Grant all permissions for ${label}`} /></td></tr>; })}</tbody></table></div></Card>
        <Card className="mt-5 overflow-hidden p-0 sm:p-0"><div className="border-b border-border p-5 sm:p-6"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary">Granted access overview</p><h2 className="mt-1 text-lg font-bold">Who has access to what</h2><p className="mt-1 text-sm text-muted">Every active permission grant is listed below.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[#fcfaf9] text-[10px] uppercase tracking-[0.11em] text-stone-400"><tr><th className="px-5 py-3 font-bold">Employee</th><th className="px-3 py-3 font-bold">Module</th><th className="px-3 py-3 font-bold">Permissions</th></tr></thead><tbody className="divide-y divide-border">{grantedAccess.length ? grantedAccess.map((permission) => <tr key={`${permission.employee_id}-${permission.module}`} className="hover:bg-[#fffafa]"><td className="px-5 py-4 font-semibold">{employeeName(permission.employee_id)}</td><td className="px-3 py-4 text-muted">{modules.find(([module]) => module === permission.module)?.[1] ?? permission.module}</td><td className="px-3 py-4"><div className="flex flex-wrap gap-1.5">{permissionKeys.filter((key) => permission[key]).map((key) => <Badge key={key} tone={key === "can_read" ? "primary" : "neutral"}>{key.replace("can_", "")}</Badge>)}</div></td></tr>) : <tr><td colSpan={3} className="px-6 py-14 text-center text-sm text-muted">No permissions granted yet.</td></tr>}</tbody></table></div></Card>
      </> : null}
    </>
  );
}
