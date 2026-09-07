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

type Device = { id: number; name: string; device_ip: string; port: number; device_type: string; status: string };
type DeviceForm = { name: string; device_ip: string; port: string; device_type: string; status: string };
const emptyForm: DeviceForm = { name: "", device_ip: "", port: "4370", device_type: "zkteco_k60", status: "active" };

export default function DevicesPage() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [form, setForm] = useState<DeviceForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone?: "danger" | "success" } | null>(null);
  const [testResult, setTestResult] = useState<string | null>(null);

  async function loadDevices() { const response = await fetch("/api/devices", { cache: "no-store" }); const data = await response.json(); setDevices(data.devices ?? []); }
  useEffect(() => { loadDevices().catch(() => setMessage({ text: "Could not load device data.", tone: "danger" })); }, []);
  function openAdd() { setEditingId(null); setForm(emptyForm); setTestResult(null); setMessage(null); setOpen(true); }
  function openEdit(device: Device) { setEditingId(device.id); setForm({ name: device.name, device_ip: device.device_ip, port: device.port.toString(), device_type: device.device_type, status: device.status }); setTestResult(null); setMessage(null); setOpen(true); }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage(null);
    try { const response = await fetch("/api/devices", { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, id: editingId, port: Number(form.port) }) }); const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Could not save device."); setOpen(false); setMessage({ text: editingId ? "Device updated successfully." : "Device added successfully.", tone: "success" }); await loadDevices(); } catch (error) { setMessage({ text: error instanceof Error ? error.message : "Could not save device.", tone: "danger" }); } finally { setLoading(false); }
  }
  async function handleDelete(device: Device) { if (!window.confirm(`Delete ${device.name}? This cannot be undone.`)) return; const response = await fetch(`/api/devices?id=${device.id}`, { method: "DELETE" }); const result = await response.json(); if (!response.ok) { setMessage({ text: result.error ?? "Could not delete device.", tone: "danger" }); return; } setMessage({ text: "Device deleted successfully.", tone: "success" }); await loadDevices(); }
  async function handleTestConnection() { setTesting(true); setTestResult(null); try { const response = await fetch("/api/devices/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ device_ip: form.device_ip, port: Number(form.port) }) }); const result = await response.json(); setTestResult(result.message ?? (result.ok ? "Connection successful" : "Connection failed")); } catch { setTestResult("Connection test failed."); } finally { setTesting(false); } }

  const filteredDevices = devices.filter((device) => `${device.name} ${device.device_ip} ${device.device_type}`.toLowerCase().includes(query.toLowerCase()) && (statusFilter === "all" || device.status === statusFilter));

  return <>
    <PageHeader eyebrow="Devices" title="Device management" description="Register, test, and maintain the biometric terminals connected to your workspace." actions={<Button onClick={openAdd}><IconPlus className="h-4 w-4" />Add device</Button>} />
    {message ? <div className="mb-5"><Alert tone={message.tone}>{message.text}</Alert></div> : null}
    <Card className="p-0 sm:p-0"><div className="flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"><div><h2 className="text-base font-semibold">Connected devices</h2><p className="mt-1 text-sm text-muted">{filteredDevices.length} of {devices.length} records</p></div><div className="flex flex-col gap-3 sm:flex-row"><label className="relative block"><span className="sr-only">Search devices</span><IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" /><TextInput className="pl-9 sm:w-64" placeholder="Search devices" value={query} onChange={(event) => setQuery(event.target.value)} /></label><SelectInput className="sm:w-36" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="inactive">Inactive</option></SelectInput></div></div><div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-sm"><thead className="bg-[#fcfaf9] text-[11px] uppercase tracking-[0.12em] text-stone-400"><tr><th className="px-6 py-3 font-bold">Device</th><th className="px-4 py-3 font-bold">Network</th><th className="px-4 py-3 font-bold">Type</th><th className="px-4 py-3 font-bold">Status</th><th className="px-6 py-3 text-right font-bold">Actions</th></tr></thead><tbody className="divide-y divide-border">{filteredDevices.map((device) => <tr key={device.id} className="transition hover:bg-[#fffafa]"><td className="px-6 py-4"><div className="flex items-center gap-3"><div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-50 text-sky-600"><span className="text-xs font-bold">K60</span></div><div><p className="font-semibold">{device.name}</p><p className="text-xs text-muted">Device #{device.id}</p></div></div></td><td className="px-4 py-4"><p className="font-medium">{device.device_ip}</p><p className="mt-1 text-xs text-muted">Port {device.port}</p></td><td className="px-4 py-4 text-muted">{device.device_type.replaceAll("_", " ")}</td><td className="px-4 py-4"><Badge tone={device.status === "active" ? "success" : "danger"}>{device.status}</Badge></td><td className="px-6 py-4"><div className="flex justify-end gap-2"><button type="button" title="Edit device" aria-label={`Edit ${device.name}`} onClick={() => openEdit(device)} className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted hover:border-primary/30 hover:bg-primary-soft hover:text-primary"><IconEdit className="h-4 w-4" /></button><button type="button" title="Delete device" aria-label={`Delete ${device.name}`} onClick={() => handleDelete(device)} className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted hover:border-red-200 hover:bg-red-50 hover:text-red-600"><IconTrash className="h-4 w-4" /></button></div></td></tr>)}</tbody></table>{filteredDevices.length === 0 ? <div className="px-6 py-16 text-center text-sm text-muted">No devices match your search or filter.</div> : null}</div></Card>
    <Modal open={open} onClose={() => setOpen(false)} title={editingId ? "Edit device" : "Add device"} description="Save the terminal connection details used by attendance sync"><form onSubmit={handleSubmit} className="space-y-5"><div className="grid gap-4 sm:grid-cols-2"><Field label="Device name"><TextInput required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Main Gate K60" /></Field><Field label="Device type"><SelectInput value={form.device_type} onChange={(event) => setForm({ ...form, device_type: event.target.value })}><option value="zkteco_k60">ZKTeco K60</option><option value="zkteco_k40">ZKTeco K40</option></SelectInput></Field><Field label="Device IP"><TextInput required value={form.device_ip} onChange={(event) => setForm({ ...form, device_ip: event.target.value })} placeholder="192.168.18.201" /></Field><Field label="Port"><TextInput required type="number" min="1" value={form.port} onChange={(event) => setForm({ ...form, port: event.target.value })} /></Field><Field label="Status"><SelectInput value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option></SelectInput></Field></div>{testResult ? <Alert>{testResult}</Alert> : null}<div className="flex flex-col-reverse gap-3 border-t border-border pt-5 sm:flex-row sm:justify-between"><Button type="button" variant="secondary" onClick={handleTestConnection} disabled={testing || !form.device_ip}>{testing ? "Testing..." : "Test connection"}</Button><div className="flex justify-end gap-3"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={loading}>{loading ? "Saving..." : editingId ? "Update device" : "Add device"}</Button></div></div></form></Modal>
  </>;
}
