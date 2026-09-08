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

type Employee = { id: number; employee_id?: string; employee_number?: number; auth_user_id?: string | null; name: string; department?: string; department_id?: number | null; email?: string; phone?: string; position?: string; position_id?: number | null; shift_id?: number | null; salary?: number | null; physical_address?: string; cnic?: string; joining_date?: string | null; status?: string; enrollment_status?: string; device_id?: number | null; zk_device_uid?: number | null };
type Device = { id: number; name: string; device_ip: string; port: number };
type Lookup = { id: number; name: string; start_time?: string; end_time?: string; grace_minutes?: number };
type EmployeeForm = { name: string; phone: string; email: string; password: string; department_id: string; position_id: string; shift_id: string; salary: string; physical_address: string; cnic: string; joining_date: string; status: string; device_id: string; zk_device_uid: string };
type Message = { text: string; tone?: "danger" | "success" };

const emptyForm: EmployeeForm = { name: "", phone: "", email: "", password: "", department_id: "", position_id: "", shift_id: "", salary: "", physical_address: "", cnic: "", joining_date: "", status: "active", device_id: "", zk_device_uid: "" };

function toEmployeeForm(employee: Employee): EmployeeForm {
  return { name: employee.name, phone: employee.phone ?? "", email: employee.email ?? "", password: "", department_id: employee.department_id?.toString() ?? "", position_id: employee.position_id?.toString() ?? "", shift_id: employee.shift_id?.toString() ?? "", salary: employee.salary?.toString() ?? "", physical_address: employee.physical_address ?? "", cnic: employee.cnic ?? "", joining_date: employee.joining_date ?? "", status: employee.status ?? "active", device_id: employee.device_id?.toString() ?? "", zk_device_uid: employee.zk_device_uid?.toString() ?? "" };
}

function formatShift(shift?: Lookup) {
  if (!shift) return "Not assigned";
  return `${shift.name} · ${shift.start_time?.slice(0, 5) ?? "-"}–${shift.end_time?.slice(0, 5) ?? "-"}`;
}

function Detail({ label, value }: { label: string; value?: string | number | null }) {
  return <div className="rounded-xl border border-border/70 bg-[#fcfaf9] px-3.5 py-3"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-400">{label}</p><p className="mt-1.5 truncate text-sm font-semibold text-foreground">{value || "Not provided"}</p></div>;
}

export default function EmployeesPage() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [departments, setDepartments] = useState<Lookup[]>([]);
  const [positions, setPositions] = useState<Lookup[]>([]);
  const [shifts, setShifts] = useState<Lookup[]>([]);
  const [form, setForm] = useState<EmployeeForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [viewing, setViewing] = useState<Employee | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [enrollingId, setEnrollingId] = useState<number | null>(null);
  const [enrollmentEmployee, setEnrollmentEmployee] = useState<Employee | null>(null);
  const [enrollmentDeviceId, setEnrollmentDeviceId] = useState("");
  const [message, setMessage] = useState<Message | null>(null);

  async function loadData() {
    const urls = ["/api/employees", "/api/devices", "/api/lookups/departments", "/api/lookups/positions", "/api/lookups/shifts"];
    const responses = await Promise.all(urls.map((url) => fetch(url, { cache: "no-store" })));
    const [employeeData, deviceData, departmentData, positionData, shiftData] = await Promise.all(responses.map((response) => response.json()));
    setEmployees(employeeData.employees ?? []); setDevices(deviceData.devices ?? []); setDepartments(departmentData.items ?? []); setPositions(positionData.items ?? []); setShifts(shiftData.items ?? []);
  }

  useEffect(() => { loadData().catch((error) => setMessage({ text: error instanceof Error ? error.message : "Could not load employee data.", tone: "danger" })); }, []);

  function openAdd() { setEditingId(null); setForm(emptyForm); setMessage(null); setOpen(true); }
  function openEdit(employee: Employee) { setEditingId(employee.id); setForm(toEmployeeForm(employee)); setMessage(null); setOpen(true); }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage(null);
    try {
      const response = await fetch("/api/employees", { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, id: editingId, salary: form.salary ? Number(form.salary) : null, department_id: form.department_id ? Number(form.department_id) : null, position_id: form.position_id ? Number(form.position_id) : null, shift_id: form.shift_id ? Number(form.shift_id) : null, device_id: form.device_id ? Number(form.device_id) : null, zk_device_uid: form.zk_device_uid ? Number(form.zk_device_uid) : null }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Could not save employee.");
      setOpen(false); setMessage({ text: editingId ? "Employee updated successfully." : "Employee account created successfully.", tone: "success" }); await loadData();
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : "Could not save employee.", tone: "danger" }); } finally { setLoading(false); }
  }

  async function handleDelete(employee: Employee) {
    if (!window.confirm(`Delete ${employee.name}? Their login and employee record will be removed.`)) return;
    const response = await fetch(`/api/employees?id=${employee.id}`, { method: "DELETE" }); const result = await response.json();
    if (!response.ok) { setMessage({ text: result.error ?? "Could not delete employee.", tone: "danger" }); return; }
    setMessage({ text: "Employee deleted successfully.", tone: "success" }); await loadData();
  }

  async function handleDeactivate(employee: Employee) {
    const nextStatus = employee.status === "inactive" ? "active" : "inactive";
    if (!window.confirm(`${nextStatus === "active" ? "Activate" : "Deactivate"} ${employee.name}'s login?`)) return;
    const response = await fetch("/api/employees", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...toEmployeeForm(employee), id: employee.id, status: nextStatus, salary: employee.salary, department_id: employee.department_id, position_id: employee.position_id, shift_id: employee.shift_id, device_id: employee.device_id, zk_device_uid: employee.zk_device_uid }) });
    const result = await response.json(); if (!response.ok) { setMessage({ text: result.error ?? "Could not update employee status.", tone: "danger" }); return; }
    setMessage({ text: `Employee ${nextStatus === "active" ? "activated" : "deactivated"}.`, tone: "success" }); await loadData();
  }

  function openEnrollment(employee: Employee) {
    const deviceId = employee.device_id ?? (devices.length === 1 ? devices[0].id : null);
    if (!deviceId) { setMessage({ text: "Assign a device to this employee before enrolling.", tone: "danger" }); openEdit(employee); return; }
    setEnrollmentEmployee(employee);
    setEnrollmentDeviceId(employee.employee_id ?? "");
  }

  async function handleEnroll(employee: Employee, numericDeviceId?: number) {
    if (numericDeviceId === undefined) {
      openEnrollment(employee);
      return;
    }
    const deviceId = employee.device_id ?? (devices.length === 1 ? devices[0].id : null);
    if (!deviceId) return;
    setEnrollingId(employee.id); setMessage(null);
    try {
      const response = await fetch("/api/employees/enroll", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ employee_id: employee.id, device_id: deviceId, zk_device_uid: numericDeviceId }) });
      const result = await response.json(); if (!response.ok) throw new Error(`${result.error ?? "Enrollment failed."} ${result.hint ?? ""}`.trim());
      setEnrollmentEmployee(null); setMessage({ text: result.message ?? `${employee.name} was enrolled successfully.`, tone: "success" }); await loadData();
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : "Enrollment failed.", tone: "danger" }); } finally { setEnrollingId(null); }
  }

  const filteredEmployees = employees.filter((employee) => {
    const searchable = `${employee.name} ${employee.employee_id ?? employee.employee_number ?? ""} ${employee.email ?? ""}`.toLowerCase();
    return searchable.includes(query.toLowerCase()) && (statusFilter === "all" || (employee.status ?? "active") === statusFilter);
  });
  const viewingDepartment = departments.find((item) => item.id === viewing?.department_id)?.name ?? viewing?.department;
  const viewingPosition = positions.find((item) => item.id === viewing?.position_id)?.name ?? viewing?.position;
  const viewingShift = formatShift(shifts.find((item) => item.id === viewing?.shift_id));
  const viewingDevice = devices.find((item) => item.id === viewing?.device_id);

  return <>
    <PageHeader eyebrow="Employees" title="Employee directory" description="Create employee accounts, manage profiles, and enroll them on a device." actions={<Button onClick={openAdd}><IconPlus className="h-4 w-4" />Add employee</Button>} />
    {message ? <div className="mb-5"><Alert tone={message.tone}>{message.text}</Alert></div> : null}
    <Card className="overflow-hidden p-0 sm:p-0">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"><div><h2 className="text-base font-semibold">All employees</h2><p className="mt-0.5 text-xs text-muted">{filteredEmployees.length} of {employees.length} records</p></div><div className="flex gap-2"><label className="relative block"><span className="sr-only">Search employees</span><IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" /><TextInput className="h-10 pl-9 text-xs sm:w-56" placeholder="Search employees" value={query} onChange={(event) => setQuery(event.target.value)} /></label><SelectInput className="h-10 w-32 text-xs" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All status</option><option value="active">Active</option><option value="inactive">Inactive</option></SelectInput></div></div>
      <div className="overflow-x-auto"><table className="w-full min-w-[1080px] text-left text-[13px]"><thead className="bg-[#fcfaf9] text-[10px] uppercase tracking-[0.11em] text-stone-400"><tr><th className="px-5 py-2.5 font-bold">Employee</th><th className="px-3 py-2.5 font-bold">Department</th><th className="px-3 py-2.5 font-bold">Position</th><th className="px-3 py-2.5 font-bold">Shift</th><th className="px-3 py-2.5 font-bold">Status</th><th className="px-3 py-2.5 font-bold">Enrollment</th><th className="px-5 py-2.5 text-right font-bold">Actions</th></tr></thead><tbody className="divide-y divide-border/80">{filteredEmployees.map((employee) => { const department = departments.find((item) => item.id === employee.department_id); const position = positions.find((item) => item.id === employee.position_id); const shift = shifts.find((item) => item.id === employee.shift_id); const enrolled = employee.enrollment_status === "enrolled"; return <tr key={employee.id} className="transition hover:bg-[#fffafa]"><td className="px-5 py-3"><div className="flex items-center gap-2.5"><div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary-soft text-xs font-bold text-primary">{employee.name.slice(0, 1).toUpperCase()}</div><div><p className="font-semibold leading-tight">{employee.name}</p><p className="mt-0.5 text-[11px] text-muted">ID {employee.employee_id ?? employee.employee_number ?? employee.id}</p></div></div></td><td className="px-3 py-3 text-muted">{department?.name ?? employee.department ?? "Not assigned"}</td><td className="px-3 py-3 text-muted">{position?.name ?? employee.position ?? "Not assigned"}</td><td className="px-3 py-3 text-xs text-muted">{formatShift(shift)}</td><td className="px-3 py-3"><Badge tone={employee.status === "inactive" ? "danger" : "success"}>{employee.status ?? "active"}</Badge></td><td className="px-3 py-3"><div className="flex items-center gap-2"><Badge tone={enrolled ? "success" : "warning"}>{enrolled ? "Enrolled" : "Pending"}</Badge><Button variant={enrolled ? "secondary" : "primary"} className="px-2.5 py-1 text-[11px]" onClick={() => handleEnroll(employee)} disabled={enrollingId === employee.id}>{enrollingId === employee.id ? "..." : enrolled ? "Re-enroll" : "Enroll"}</Button></div></td><td className="px-5 py-3"><div className="flex justify-end gap-1.5"><Button variant="ghost" className="px-2 py-1 text-[11px]" onClick={() => setViewing(employee)}>View</Button><button type="button" aria-label={`Edit ${employee.name}`} onClick={() => openEdit(employee)} className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted hover:bg-primary-soft hover:text-primary"><IconEdit className="h-3.5 w-3.5" /></button><button type="button" onClick={() => handleDeactivate(employee)} className="rounded-lg border border-border px-2 py-1 text-[11px] font-semibold text-muted hover:bg-primary-soft hover:text-primary">{employee.status === "inactive" ? "Activate" : "Deactivate"}</button><button type="button" aria-label={`Delete ${employee.name}`} onClick={() => handleDelete(employee)} className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted hover:bg-red-50 hover:text-red-600"><IconTrash className="h-3.5 w-3.5" /></button></div></td></tr>; })}</tbody></table>{filteredEmployees.length === 0 ? <div className="px-6 py-14 text-center text-sm text-muted">No employees match your search or filter.</div> : null}</div>
    </Card>

    <Modal open={Boolean(enrollmentEmployee)} onClose={() => setEnrollmentEmployee(null)} title="Enroll fingerprint" description="Enter the Employee ID that should be saved as the ZKTeco user ID on the machine.">
      {enrollmentEmployee ? <div className="space-y-5"><div className="rounded-2xl border border-border bg-[#fcfaf9] p-4"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-primary">Employee</p><p className="mt-1 text-lg font-bold">{enrollmentEmployee.name}</p><p className="mt-1 text-sm text-muted">System Employee ID: {enrollmentEmployee.employee_id ?? "Not assigned"}</p></div><Field label="ZKTeco user ID"><TextInput type="number" min="1" required value={enrollmentDeviceId} onChange={(event) => setEnrollmentDeviceId(event.target.value)} placeholder="Enter the same Employee ID" autoFocus /></Field><div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">This ID will be saved on the device with <strong>{enrollmentEmployee.name}</strong>. After confirmation, complete fingerprint capture on the ZKTeco machine.</div><div className="flex justify-end gap-3 border-t border-border pt-5"><Button type="button" variant="secondary" onClick={() => setEnrollmentEmployee(null)}>Cancel</Button><Button type="button" disabled={enrollingId === enrollmentEmployee.id} onClick={() => { const numericId = Number(enrollmentDeviceId); if (!Number.isInteger(numericId) || numericId <= 0) { setMessage({ text: "Enter a valid numeric Employee ID.", tone: "danger" }); return; } handleEnroll(enrollmentEmployee, numericId); }}>{enrollingId === enrollmentEmployee.id ? "Sending..." : "Save ID and enroll"}</Button></div></div> : null}
    </Modal>

    <Modal open={Boolean(viewing)} onClose={() => setViewing(null)} title="Employee profile" description="A complete view of this employee's account and assignment.">
      {viewing ? <div className="space-y-5"><div className="relative overflow-hidden rounded-2xl bg-[#241b19] p-5 text-white"><div className="absolute -right-8 -top-14 h-40 w-40 rounded-full bg-primary/25 blur-2xl" /><div className="relative flex items-center gap-4"><div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-primary text-2xl font-bold shadow-lg shadow-primary/25">{viewing.name.slice(0, 1).toUpperCase()}</div><div className="min-w-0"><h3 className="truncate text-xl font-bold">{viewing.name}</h3><p className="mt-1 truncate text-sm text-stone-300">{viewing.email || "No email provided"}</p><div className="mt-3 flex flex-wrap gap-2"><span className="rounded-full bg-white/10 px-2.5 py-1 text-[11px] font-semibold">ID {viewing.employee_id ?? viewing.employee_number ?? viewing.id}</span><span className="rounded-full bg-emerald-400/15 px-2.5 py-1 text-[11px] font-semibold text-emerald-200">{viewing.status ?? "active"}</span><span className="rounded-full bg-primary/20 px-2.5 py-1 text-[11px] font-semibold text-[#ffb1aa]">{viewing.enrollment_status ?? "pending"}</span></div></div></div></div><section><p className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Work profile</p><div className="grid gap-2.5 sm:grid-cols-2"><Detail label="Department" value={viewingDepartment} /><Detail label="Position" value={viewingPosition} /><Detail label="Shift timing" value={viewingShift} /><Detail label="Salary" value={viewing.salary?.toLocaleString()} /></div></section><section><p className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Personal details</p><div className="grid gap-2.5 sm:grid-cols-2"><Detail label="Phone" value={viewing.phone} /><Detail label="CNIC" value={viewing.cnic} /><Detail label="Joining date" value={viewing.joining_date} /><Detail label="Address" value={viewing.physical_address} /></div></section><section><p className="mb-3 text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Device assignment</p><div className="grid gap-2.5 sm:grid-cols-2"><Detail label="Device" value={viewingDevice?.name} /><Detail label="Network" value={viewingDevice ? `${viewingDevice.device_ip}:${viewingDevice.port}` : undefined} /><Detail label="Device UID" value={viewing.zk_device_uid} /></div></section></div> : null}
    </Modal>

    <Modal open={open} onClose={() => setOpen(false)} title={editingId ? "Edit employee" : "Add employee"} description="Create the employee profile and login details."><form onSubmit={handleSubmit} className="space-y-5"><div className="rounded-xl bg-primary-soft px-4 py-3 text-sm text-primary">Employee ID is generated automatically when the account is created.</div><div className="grid gap-4 sm:grid-cols-2"><Field label="Full name"><TextInput required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Ali Khan" /></Field><Field label="Phone number"><TextInput required value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} placeholder="03001234567" /></Field><Field label="Email address"><TextInput required type="email" value={form.email} onChange={(event) => setForm({ ...form, email: event.target.value })} placeholder="ali@example.com" /></Field><Field label={editingId ? "New password (optional)" : "Password"}><TextInput required={!editingId} type="password" minLength={6} value={form.password} onChange={(event) => setForm({ ...form, password: event.target.value })} placeholder={editingId ? "Leave empty to keep current" : "At least 6 characters"} /></Field><Field label="Shift timing"><SelectInput value={form.shift_id} onChange={(event) => setForm({ ...form, shift_id: event.target.value })}><option value="">Select shift</option>{shifts.map((item) => <option key={item.id} value={item.id}>{formatShift(item)}</option>)}</SelectInput></Field><Field label="Department"><SelectInput value={form.department_id} onChange={(event) => setForm({ ...form, department_id: event.target.value })}><option value="">Select department</option>{departments.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectInput></Field><Field label="Position"><SelectInput value={form.position_id} onChange={(event) => setForm({ ...form, position_id: event.target.value })}><option value="">Select position</option>{positions.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</SelectInput></Field><Field label="Salary"><TextInput type="number" min="0" value={form.salary} onChange={(event) => setForm({ ...form, salary: event.target.value })} placeholder="50000" /></Field><Field label="Physical address"><TextInput value={form.physical_address} onChange={(event) => setForm({ ...form, physical_address: event.target.value })} /></Field><Field label="CNIC number"><TextInput value={form.cnic} onChange={(event) => setForm({ ...form, cnic: event.target.value })} /></Field><Field label="Joining date"><TextInput type="date" value={form.joining_date} onChange={(event) => setForm({ ...form, joining_date: event.target.value })} /></Field><Field label="Status"><SelectInput value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></SelectInput></Field><Field label="K60 device"><SelectInput value={form.device_id} onChange={(event) => setForm({ ...form, device_id: event.target.value })}><option value="">Not assigned</option>{devices.map((device) => <option key={device.id} value={device.id}>{device.name} ({device.device_ip})</option>)}</SelectInput></Field><Field label="Device user UID"><TextInput type="number" min="1" value={form.zk_device_uid} onChange={(event) => setForm({ ...form, zk_device_uid: event.target.value })} placeholder="Optional" /></Field></div><div className="flex justify-end gap-3 border-t border-border pt-5"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={loading}>{loading ? "Saving..." : editingId ? "Update employee" : "Create employee"}</Button></div></form></Modal>
  </>;
}
