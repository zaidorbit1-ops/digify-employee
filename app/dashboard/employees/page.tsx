"use client";

import { useEffect, useState, type FormEvent } from "react";
import { IconEdit, IconPlus, IconSearch, IconTrash } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/empty-state";
import { Field, SelectInput, TextInput } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";

type Employee = {
  id: number;
  employee_id: string;
  name: string;
  department?: string;
  email?: string;
  phone?: string;
  position?: string;
  salary?: number | null;
  enrollment_status?: string;
  device_id?: number | null;
  zk_device_uid?: number | null;
};
type Device = { id: number; name: string; device_ip: string; port: number };
type EmployeeForm = {
  employee_id: string;
  name: string;
  department: string;
  email: string;
  phone: string;
  position: string;
  salary: string;
  enrollment_status: string;
  device_id: string;
  zk_device_uid: string;
};

const emptyForm: EmployeeForm = {
  employee_id: "", name: "", department: "", email: "", phone: "", position: "",
  salary: "", enrollment_status: "pending", device_id: "", zk_device_uid: "",
};

function employeeForm(employee?: Employee): EmployeeForm {
  return employee ? {
    employee_id: employee.employee_id,
    name: employee.name,
    department: employee.department ?? "",
    email: employee.email ?? "",
    phone: employee.phone ?? "",
    position: employee.position ?? "",
    salary: employee.salary?.toString() ?? "",
    enrollment_status: employee.enrollment_status ?? "pending",
    device_id: employee.device_id?.toString() ?? "",
    zk_device_uid: employee.zk_device_uid?.toString() ?? "",
  } : emptyForm;
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [form, setForm] = useState<EmployeeForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [enrollingId, setEnrollingId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ text: string; tone?: "danger" | "success" } | null>(null);

  async function loadData() {
    const [employeesResponse, devicesResponse] = await Promise.all([
      fetch("/api/employees", { cache: "no-store" }),
      fetch("/api/devices", { cache: "no-store" }),
    ]);
    const employeesData = await employeesResponse.json();
    const devicesData = await devicesResponse.json();
    setEmployees(employeesData.employees ?? []);
    setDevices(devicesData.devices ?? []);
  }

  useEffect(() => {
    loadData().catch(() => setMessage({ text: "Could not load employee data.", tone: "danger" }));
  }, []);

  function openAdd() {
    setEditingId(null); setForm(emptyForm); setMessage(null); setOpen(true);
  }

  function openEdit(employee: Employee) {
    setEditingId(employee.id); setForm(employeeForm(employee)); setMessage(null); setOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage(null);
    try {
      const response = await fetch("/api/employees", {
        method: editingId ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          id: editingId,
          salary: form.salary ? Number(form.salary) : null,
          device_id: form.device_id ? Number(form.device_id) : null,
          zk_device_uid: form.zk_device_uid ? Number(form.zk_device_uid) : null,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save employee.");
      setOpen(false);
      setMessage({ text: editingId ? "Employee updated successfully." : "Employee added successfully.", tone: "success" });
      await loadData();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not save employee.", tone: "danger" });
    } finally { setLoading(false); }
  }

  async function handleDelete(employee: Employee) {
    if (!window.confirm(`Delete ${employee.name}? This cannot be undone.`)) return;
    const response = await fetch(`/api/employees?id=${employee.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) {
      setMessage({ text: result.error ?? "Could not delete employee.", tone: "danger" });
      return;
    }
    setMessage({ text: "Employee deleted successfully.", tone: "success" });
    await loadData();
  }

  async function handleEnroll(employee: Employee) {
    const deviceId = employee.device_id ?? (devices.length === 1 ? devices[0].id : null);
    if (!deviceId) {
      setMessage({ text: "Assign a device to this employee before enrolling.", tone: "danger" });
      openEdit(employee);
      return;
    }
    setEnrollingId(employee.id); setMessage(null);
    try {
      const response = await fetch("/api/employees/enroll", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ employee_id: employee.id, device_id: deviceId, zk_device_uid: employee.zk_device_uid ?? employee.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(`${result.error ?? "Enrollment failed."} ${result.hint ?? ""}`.trim());
      setMessage({ text: result.message ?? `${employee.name} was enrolled successfully.`, tone: "success" });
      await loadData();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Enrollment failed.", tone: "danger" });
    } finally { setEnrollingId(null); }
  }

  const filteredEmployees = employees.filter((employee) => {
    const searchable = `${employee.name} ${employee.employee_id} ${employee.email ?? ""} ${employee.department ?? ""} ${employee.position ?? ""}`.toLowerCase();
    return searchable.includes(query.toLowerCase()) && (statusFilter === "all" || (employee.enrollment_status ?? "pending") === statusFilter);
  });

  return <>
    <PageHeader eyebrow="Employees" title="Employee directory" description="Manage employee records, device assignments, and fingerprint enrollment." actions={<Button onClick={openAdd}><IconPlus className="h-4 w-4" />Add employee</Button>} />
    {message ? <div className="mb-5"><Alert tone={message.tone}>{message.text}</Alert></div> : null}
    <Card className="p-0 sm:p-0">
      <div className="flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div><h2 className="text-base font-semibold">All employees</h2><p className="mt-1 text-sm text-muted">{filteredEmployees.length} of {employees.length} records</p></div>
        <div className="flex flex-col gap-3 sm:flex-row">
          <label className="relative block"><span className="sr-only">Search employees</span><IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" /><TextInput className="pl-9 sm:w-64" placeholder="Search employees" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
          <SelectInput className="sm:w-40" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="pending">Pending</option><option value="enrolled">Enrolled</option></SelectInput>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1200px] text-left text-sm">
          <thead className="bg-[#fcfaf9] text-[11px] uppercase tracking-[0.12em] text-stone-400"><tr><th className="px-6 py-3 font-bold">Employee</th><th className="px-4 py-3 font-bold">Contact</th><th className="px-4 py-3 font-bold">Role</th><th className="px-4 py-3 font-bold">Salary</th><th className="px-4 py-3 font-bold">Device / UID</th><th className="px-4 py-3 font-bold">Enrollment</th><th className="px-6 py-3 text-right font-bold">Actions</th></tr></thead>
          <tbody className="divide-y divide-border">
            {filteredEmployees.map((employee) => {
              const device = devices.find((item) => item.id === employee.device_id);
              const enrolled = employee.enrollment_status === "enrolled";
              return <tr key={employee.id} className="transition hover:bg-[#fffafa]">
                <td className="px-6 py-4"><div className="flex items-center gap-3"><div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft font-bold text-primary">{employee.name.slice(0, 1).toUpperCase()}</div><div><p className="font-semibold">{employee.name}</p><p className="text-xs text-muted">{employee.employee_id}</p></div></div></td>
                <td className="px-4 py-4"><p>{employee.email || "No email"}</p><p className="mt-1 text-xs text-muted">{employee.phone || "No phone"}</p></td>
                <td className="px-4 py-4"><p className="font-medium">{employee.position || "Unassigned"}</p><p className="mt-1 text-xs text-muted">{employee.department || "No department"}</p></td>
                <td className="px-4 py-4 text-muted">{employee.salary != null ? employee.salary.toLocaleString() : "-"}</td>
                <td className="px-4 py-4"><p>{device?.name || "Not assigned"}</p><p className="mt-1 text-xs text-muted">UID {employee.zk_device_uid ?? "-"}</p></td>
                <td className="px-4 py-4"><div className="flex flex-col items-start gap-2"><Badge tone={enrolled ? "success" : "warning"}>{enrolled ? "Enrolled" : "Not enrolled"}</Badge><Button variant={enrolled ? "secondary" : "primary"} className="px-3 py-1.5 text-xs" onClick={() => handleEnroll(employee)} disabled={enrollingId === employee.id}>{enrollingId === employee.id ? "Enrolling..." : enrolled ? "Re-enroll" : "Enroll"}</Button></div></td>
                <td className="px-6 py-4"><div className="flex justify-end gap-2"><button type="button" title="Edit employee" aria-label={`Edit ${employee.name}`} onClick={() => openEdit(employee)} className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted hover:border-primary/30 hover:bg-primary-soft hover:text-primary"><IconEdit className="h-4 w-4" /></button><button type="button" title="Delete employee" aria-label={`Delete ${employee.name}`} onClick={() => handleDelete(employee)} className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted hover:border-red-200 hover:bg-red-50 hover:text-red-600"><IconTrash className="h-4 w-4" /></button></div></td>
              </tr>;
            })}
          </tbody>
        </table>
        {filteredEmployees.length === 0 ? <div className="px-6 py-16 text-center text-sm text-muted">No employees match your search or filter.</div> : null}
      </div>
    </Card>
    <Modal open={open} onClose={() => setOpen(false)} title={editingId ? "Edit employee" : "Add employee"} description="Keep the employee record and device mapping up to date.">
      <form onSubmit={handleSubmit} className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><Field label="Employee ID"><TextInput required value={form.employee_id} onChange={(event) => setForm({ ...form, employee_id: event.target.value })} placeholder="E001" /></Field><Field label="Full name"><TextInput required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ali Khan" /></Field><Field label="Email"><TextInput type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="ali@example.com" /></Field><Field label="Phone"><TextInput value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="03001234567" /></Field><Field label="Position"><TextInput value={form.position} onChange={(event) => setForm({ ...form, position: event.target.value })} placeholder="Developer" /></Field><Field label="Department"><TextInput value={form.department} onChange={(event) => setForm({ ...form, department: event.target.value })} placeholder="Engineering" /></Field><Field label="Salary"><TextInput type="number" min="0" value={form.salary} onChange={(event) => setForm({ ...form, salary: event.target.value })} placeholder="50000" /></Field><Field label="Enrollment status"><SelectInput value={form.enrollment_status} onChange={(event) => setForm({ ...form, enrollment_status: event.target.value })}><option value="pending">Pending</option><option value="enrolled">Enrolled</option></SelectInput></Field><Field label="K60 device"><SelectInput value={form.device_id} onChange={(event) => setForm({ ...form, device_id: event.target.value })}><option value="">Not assigned</option>{devices.map((device) => <option key={device.id} value={device.id}>{device.name} ({device.device_ip})</option>)}</SelectInput></Field><Field label="Device user UID"><TextInput type="number" min="1" value={form.zk_device_uid} onChange={(event) => setForm({ ...form, zk_device_uid: event.target.value })} placeholder="Optional" /></Field></div><div className="flex justify-end gap-3 border-t border-border pt-5"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={loading}>{loading ? "Saving..." : editingId ? "Update employee" : "Add employee"}</Button></div></form>
    </Modal>
  </>;
}
