"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { IconRefresh } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/empty-state";
import { Field, TextInput } from "@/components/ui/field";
import { EmployeePicker } from "@/components/ui/employee-picker";
import { PageHeader } from "@/components/ui/page-header";
import { useAuth } from "@/components/auth/auth-provider";

type Employee = { id: number; name: string; employee_id?: string | null; email?: string | null; status?: string | null };
type CrmCompany = { id: number; name: string; status?: string | null };
type CrmModuleCompanyAccess = { employee_id: number; module: string; company_id: number };
type Permission = { id?: number; employee_id: number; module: string; can_read: boolean; can_add: boolean; can_edit: boolean; can_delete: boolean };
type PermissionKey = "can_read" | "can_add" | "can_edit" | "can_delete";

type Message = { text: string; tone?: "danger" | "success" };

const crmModules = [
  ["crm_companies", "Companies"],
  ["crm_custom_fields", "Custom fields"],
  ["crm_leads", "Leads"],
  ["crm_experts", "Experts"],
  ["crm_orders", "Orders"],
  ["crm_contacts", "Contacts"],
  ["crm_segments", "Segments"],
  ["crm_webmail", "Webmail"],
  ["crm_email_templates", "Email templates"],
  ["crm_campaigns", "Campaigns"],
  ["crm_automations", "Automations"],
  ["crm_analytics", "Analytics"],
  ["crm_settings", "CRM settings"],
] as const;

const permissionKeys: PermissionKey[] = ["can_read", "can_add", "can_edit", "can_delete"];

export default function CrmSettingsPage() {
  const { profile } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [crmCompanies, setCrmCompanies] = useState<CrmCompany[]>([]);
  const [crmModuleCompanyAccess, setCrmModuleCompanyAccess] = useState<CrmModuleCompanyAccess[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState("");
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [accessLoading, setAccessLoading] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  const filteredEmployees = useMemo(() => {
    const query = employeeSearch.trim().toLowerCase();
    return employees.filter((employee) =>
      `${employee.name} ${employee.employee_id ?? employee.id} ${employee.email ?? ""}`
        .toLowerCase()
        .includes(query),
    );
  }, [employeeSearch, employees]);

  const selectedEmployee = employees.find(
    (employee) => String(employee.id) === selectedEmployeeId,
  );

  const grantedAccess = useMemo(
    () =>
      permissions.filter(
        (permission) =>
          permission.can_read ||
          permission.can_add ||
          permission.can_edit ||
          permission.can_delete,
      ),
    [permissions],
  );

  function employeeName(employeeId: number) {
    return employees.find((employee) => employee.id === employeeId)?.name ?? `Employee #${employeeId}`;
  }

  function currentPermission(module: string): Permission {
    return (
      permissions.find(
        (permission) =>
          permission.employee_id === Number(selectedEmployeeId) &&
          permission.module === module,
      ) ?? {
        employee_id: Number(selectedEmployeeId),
        module,
        can_read: false,
        can_add: false,
        can_edit: false,
        can_delete: false,
      }
    );
  }

  async function loadAccess() {
    if (profile?.role !== "superadmin") return;
    setAccessLoading(true);
    try {
      const response = await fetch("/api/permissions", { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load permissions.");
      setEmployees(result.employees ?? []);
      setCrmCompanies(result.crmCompanies ?? []);
      setCrmModuleCompanyAccess(result.crmModuleCompanyAccess ?? []);
      setPermissions(result.permissions ?? []);
      if (!selectedEmployeeId && result.employees?.length) {
        setSelectedEmployeeId(String(result.employees[0].id));
      }
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : "Could not load permissions.",
        tone: "danger",
      });
    } finally {
      setAccessLoading(false);
    }
  }

  useEffect(() => {
    loadAccess();
  }, [profile?.role]);

  async function savePermission(next: Permission) {
    const response = await fetch("/api/permissions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not save permission.");
  }

  function selectedCrmCompanyIds(module: string) {
    return crmModuleCompanyAccess.filter((access) => access.employee_id === Number(selectedEmployeeId) && access.module === module).map((access) => access.company_id);
  }

  async function updateCrmCompanyAccess(module: string, companyId: number, checked: boolean) {
    const employeeId = Number(selectedEmployeeId);
    const nextCompanyIds = checked ? [...new Set([...selectedCrmCompanyIds(module), companyId])] : selectedCrmCompanyIds(module).filter((id) => id !== companyId);
    setCrmModuleCompanyAccess((current) => [...current.filter((access) => access.employee_id !== employeeId || access.module !== module), ...nextCompanyIds.map((id) => ({ employee_id: employeeId, module, company_id: id }))]);
    try {
      const response = await fetch("/api/permissions", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employee_id: employeeId, module, crm_company_ids: nextCompanyIds }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save CRM module company access.");
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not save CRM module company access.", tone: "danger" });
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

    setPermissions((current) => [
      ...current.filter(
        (permission) =>
          !(permission.employee_id === next.employee_id && permission.module === module),
      ),
      next,
    ]);

    try {
      await savePermission(next);
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : "Could not save permission.",
        tone: "danger",
      });
    }
  }

  async function toggleAll(module: string, checked: boolean) {
    const next = {
      ...currentPermission(module),
      can_read: checked,
      can_add: checked,
      can_edit: checked,
      can_delete: checked,
    };
    setPermissions((current) => [
      ...current.filter(
        (permission) =>
          !(permission.employee_id === next.employee_id && permission.module === module),
      ),
      next,
    ]);

    try {
      await savePermission(next);
    } catch (error) {
      setMessage({
        text: error instanceof Error ? error.message : "Could not save all permissions.",
        tone: "danger",
      });
    }
  }

  if (profile?.role !== "superadmin") {
    return (
      <Card className="p-6">
        <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary">
          Business CRM
        </p>
        <h2 className="mt-2 text-xl font-bold">CRM access control</h2>
        <p className="mt-2 text-sm text-muted">
          This section is only available to the workspace administrator.
        </p>
      </Card>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Business CRM / Settings"
        title="CRM access control"
        description="Assign Business CRM access to employees and choose exactly which CRM features they can use."
        actions={
          <Button variant="secondary" onClick={loadAccess} disabled={accessLoading}>
            <IconRefresh className="h-4 w-4" />
            Refresh access
          </Button>
        }
      />

      {message ? (
        <div className="mb-5">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      ) : null}

      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-primary/15 bg-primary-soft/40 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
            Editing access for
          </p>
          <p className="mt-1 text-base font-bold">
            {selectedEmployee?.name ?? "Select an employee"}
          </p>
          <p className="mt-1 text-xs text-muted">
            {selectedEmployee
              ? `Employee ID ${selectedEmployee.employee_id ?? selectedEmployee.id} · ${selectedEmployee.email ?? "Permissions are saved instantly"}`
              : "Choose an employee below to manage CRM module access."}
          </p>
        </div>
        <div className="rounded-xl bg-white px-3 py-2 text-right shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-400">
            Active staff
          </p>
          <p className="mt-0.5 text-lg font-bold text-primary">{employees.length}</p>
        </div>
      </div>

      <Card className="overflow-visible p-0 sm:p-0">
        <div className="flex flex-col gap-5 border-b border-border bg-[#fffaf9] p-5 sm:p-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary">
              Access management
            </p>
            <h2 className="mt-1 text-lg font-bold">Business CRM permissions</h2>
            <p className="mt-1 text-sm text-muted">
              Choose an employee, then grant access to the CRM features they need.
            </p>
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_260px]">
            <Field label="Search employee">
              <TextInput
                placeholder="Search by name, ID, or email"
                value={employeeSearch}
                onChange={(event) => setEmployeeSearch(event.target.value)}
              />
            </Field>
            <Field label="Selected employee">
              <EmployeePicker
                employees={filteredEmployees}
                value={selectedEmployeeId}
                onChange={setSelectedEmployeeId}
              />
            </Field>
          </div>

          <div className="rounded-xl border border-primary/15 bg-white/80 px-4 py-3 text-xs text-muted">
            <span className="font-semibold text-foreground">Permission levels:</span> Read lets an employee open a module. Add, Edit, and Delete automatically include Read.
          </div>

        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="bg-[#fcfaf9] text-[10px] uppercase tracking-[0.11em] text-stone-400">
              <tr>
                <th className="px-5 py-3 font-bold">Module</th>
                <th className="px-3 py-3 text-center font-bold">Read</th>
                <th className="px-3 py-3 text-center font-bold">Add</th>
                <th className="px-3 py-3 text-center font-bold">Edit</th>
                <th className="px-3 py-3 text-center font-bold">Delete</th>
                <th className="px-3 py-3 text-center font-bold">All</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {crmModules.map(([module, label]) => {
                const permission = currentPermission(module);
                const allChecked = permissionKeys.every((key) => permission[key]);
                return (
                  <Fragment key={module}>
                  <tr className="hover:bg-[#fffafa]">
                    <td className="px-5 py-4 font-semibold"><details><summary className="cursor-pointer list-none">{label}<span className="ml-2 text-xs font-normal text-muted">⌄ companies</span></summary><div className="mt-3 grid gap-2 rounded-lg border border-border bg-[#fffaf9] p-3 sm:grid-cols-2">{crmCompanies.length ? crmCompanies.map((company) => <label key={company.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-primary-soft"><input type="checkbox" checked={selectedCrmCompanyIds(module).includes(company.id)} onChange={(event) => updateCrmCompanyAccess(module, company.id, event.target.checked)} />{company.name}{company.status !== "active" ? <Badge tone="neutral">{company.status}</Badge> : null}</label>) : <span className="text-sm font-normal text-muted">No CRM companies available.</span>}</div></details></td>
                    {permissionKeys.map((key) => (
                      <td key={key} className="px-3 py-4 text-center">
                        <input
                          type="checkbox"
                          checked={permission[key]}
                          onChange={(event) =>
                            updatePermission(module, key, event.target.checked)
                          }
                          className="h-4 w-4 accent-primary"
                        />
                      </td>
                    ))}
                    <td className="px-3 py-4 text-center">
                      <input
                        type="checkbox"
                        checked={allChecked}
                        onChange={(event) => toggleAll(module, event.target.checked)}
                        className="h-4 w-4 accent-primary"
                      />
                    </td>
                  </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <Card className="mt-5 overflow-hidden p-0 sm:p-0">
        <div className="border-b border-border p-5 sm:p-6">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary">
            Granted access overview
          </p>
          <h2 className="mt-1 text-lg font-bold">Who has CRM access to what</h2>
          <p className="mt-1 text-sm text-muted">
            Every active CRM permission grant is listed below.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-left text-sm">
            <thead className="bg-[#fcfaf9] text-[10px] uppercase tracking-[0.11em] text-stone-400">
              <tr>
                <th className="px-5 py-3 font-bold">Employee</th>
                <th className="px-3 py-3 font-bold">Module</th>
                <th className="px-3 py-3 font-bold">Permissions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {grantedAccess.length ? (
                grantedAccess.map((permission) => (
                  <tr
                    key={`${permission.employee_id}-${permission.module}`}
                    className="hover:bg-[#fffafa]"
                  >
                    <td className="px-5 py-4 font-semibold">
                      {employeeName(permission.employee_id)}
                    </td>
                    <td className="px-3 py-4 text-muted">
                      {crmModules.find(([module]) => module === permission.module)?.[1] ??
                        permission.module}
                    </td>
                    <td className="px-3 py-4">
                      <div className="flex flex-wrap gap-1.5">
                        {permissionKeys
                          .filter((key) => permission[key])
                          .map((key) => (
                            <Badge key={key} tone={key === "can_read" ? "primary" : "neutral"}>
                              {key.replace("can_", "")}
                            </Badge>
                          ))}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="px-6 py-14 text-center text-sm text-muted">
                    No CRM permissions granted yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
