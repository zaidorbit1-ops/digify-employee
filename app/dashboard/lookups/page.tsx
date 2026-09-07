"use client";

import { useEffect, useState } from "react";
import { IconEdit, IconPlus, IconSearch, IconTrash } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/empty-state";
import { Field, SelectInput, TextInput } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";

type LookupTab = "shifts" | "departments" | "positions";
type LookupItem = { id: number; name: string; start_time?: string; end_time?: string; grace_minutes?: number };
type LookupForm = { name: string; start_time: string; end_time: string; grace_minutes: string };

const tabs: { key: LookupTab; label: string; description: string }[] = [
  { key: "shifts", label: "Shift timings", description: "Working hours and late grace windows" },
  { key: "departments", label: "Departments", description: "Teams used across employee records" },
  { key: "positions", label: "Positions", description: "Job titles used across employee records" },
];

const emptyForm: LookupForm = { name: "", start_time: "09:00", end_time: "17:00", grace_minutes: "15" };

function formatTime(value?: string) {
  if (!value) return "-";
  const [hourString, minute] = value.slice(0, 5).split(":");
  const hour = Number(hourString);
  return `${hour % 12 || 12}:${minute} ${hour >= 12 ? "PM" : "AM"}`;
}

export default function LookupsPage() {
  const [activeTab, setActiveTab] = useState<LookupTab>("shifts");
  const [items, setItems] = useState<Record<LookupTab, LookupItem[]>>({ shifts: [], departments: [], positions: [] });
  const [form, setForm] = useState<LookupForm>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone?: "danger" | "success" } | null>(null);

  async function loadTab(tab: LookupTab) {
    const response = await fetch(`/api/lookups/${tab}`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not load lookup list.");
    setItems((current) => ({ ...current, [tab]: result.items ?? [] }));
  }

  useEffect(() => {
    loadTab(activeTab).catch((error) => setMessage({ text: error instanceof Error ? error.message : "Could not load lookup list.", tone: "danger" }));
  }, [activeTab]);

  function openAdd() {
    setEditingId(null); setForm(emptyForm); setMessage(null); setOpen(true);
  }

  function openEdit(item: LookupItem) {
    setEditingId(item.id);
    setForm({ name: item.name, start_time: item.start_time?.slice(0, 5) ?? "09:00", end_time: item.end_time?.slice(0, 5) ?? "17:00", grace_minutes: String(item.grace_minutes ?? 15) });
    setMessage(null); setOpen(true);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage(null);
    try {
      const response = await fetch(`/api/lookups/${activeTab}`, { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, id: editingId, grace_minutes: Number(form.grace_minutes) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save item.");
      setOpen(false); setMessage({ text: editingId ? "Lookup item updated." : "Lookup item added.", tone: "success" }); await loadTab(activeTab);
    } catch (error) { setMessage({ text: error instanceof Error ? error.message : "Could not save item.", tone: "danger" }); } finally { setLoading(false); }
  }

  async function handleDelete(item: LookupItem) {
    if (!window.confirm(`Delete ${item.name}? Existing employee records may lose this lookup.`)) return;
    const response = await fetch(`/api/lookups/${activeTab}?id=${item.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) { setMessage({ text: result.error ?? "Could not delete item.", tone: "danger" }); return; }
    setMessage({ text: "Lookup item deleted.", tone: "success" }); await loadTab(activeTab);
  }

  const tab = tabs.find((item) => item.key === activeTab)!;
  const filteredItems = items[activeTab].filter((item) => `${item.name} ${item.start_time ?? ""} ${item.end_time ?? ""}`.toLowerCase().includes(query.toLowerCase()));

  return <>
    <PageHeader eyebrow="Setup" title="Lookup lists" description="Create the lists that power employee forms and attendance rules." actions={<Button onClick={openAdd}><IconPlus className="h-4 w-4" />Add {activeTab === "shifts" ? "shift" : activeTab.slice(0, -1)}</Button>} />
    {message ? <div className="mb-5"><Alert tone={message.tone}>{message.text}</Alert></div> : null}
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <Card className="h-fit p-2 sm:p-2"><nav className="space-y-1">{tabs.map((item) => <button key={item.key} type="button" onClick={() => { setActiveTab(item.key); setQuery(""); }} className={`w-full rounded-xl px-3 py-3 text-left transition ${activeTab === item.key ? "bg-primary-soft text-primary" : "text-muted hover:bg-[#fbf6f5] hover:text-foreground"}`}><span className="block text-sm font-semibold">{item.label}</span><span className="mt-1 block text-xs opacity-75">{item.description}</span></button>)}</nav></Card>
      <Card className="p-0 sm:p-0"><div className="flex flex-col gap-4 border-b border-border p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6"><div><h2 className="text-base font-semibold">{tab.label}</h2><p className="mt-1 text-sm text-muted">{filteredItems.length} of {items[activeTab].length} records</p></div><label className="relative block"><span className="sr-only">Search {tab.label}</span><IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" /><TextInput className="pl-9 sm:w-64" placeholder={`Search ${tab.label.toLowerCase()}`} value={query} onChange={(event) => setQuery(event.target.value)} /></label></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-left text-sm"><thead className="bg-[#fcfaf9] text-[11px] uppercase tracking-[0.12em] text-stone-400"><tr><th className="px-6 py-3 font-bold">Name</th>{activeTab === "shifts" ? <><th className="px-4 py-3 font-bold">Start</th><th className="px-4 py-3 font-bold">End</th><th className="px-4 py-3 font-bold">Grace</th></> : <th className="px-4 py-3 font-bold">Usage</th>}<th className="px-6 py-3 text-right font-bold">Actions</th></tr></thead><tbody className="divide-y divide-border">{filteredItems.map((item) => <tr key={item.id} className="hover:bg-[#fffafa]"><td className="px-6 py-4 font-semibold">{item.name}</td>{activeTab === "shifts" ? <><td className="px-4 py-4 text-muted">{formatTime(item.start_time)}</td><td className="px-4 py-4 text-muted">{formatTime(item.end_time)}</td><td className="px-4 py-4"><Badge tone="primary">{item.grace_minutes ?? 15} min</Badge></td></> : <td className="px-4 py-4 text-muted">Available for employee forms</td>}<td className="px-6 py-4"><div className="flex justify-end gap-2"><button type="button" title="Edit" aria-label={`Edit ${item.name}`} onClick={() => openEdit(item)} className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted hover:border-primary/30 hover:bg-primary-soft hover:text-primary"><IconEdit className="h-4 w-4" /></button><button type="button" title="Delete" aria-label={`Delete ${item.name}`} onClick={() => handleDelete(item)} className="grid h-9 w-9 place-items-center rounded-lg border border-border text-muted hover:border-red-200 hover:bg-red-50 hover:text-red-600"><IconTrash className="h-4 w-4" /></button></div></td></tr>)}</tbody></table>{filteredItems.length === 0 ? <div className="px-6 py-16 text-center text-sm text-muted">No {tab.label.toLowerCase()} found.</div> : null}</div>
      </Card>
    </div>
    <Modal open={open} onClose={() => setOpen(false)} title={`${editingId ? "Edit" : "Add"} ${activeTab === "shifts" ? "shift timing" : activeTab.slice(0, -1)}`} description={activeTab === "shifts" ? "Define the working window and late grace period." : `Maintain the ${activeTab.slice(0, -1)} list used by employee records.`}><form onSubmit={handleSubmit} className="space-y-5"><Field label={activeTab === "shifts" ? "Shift name" : `${activeTab.slice(0, -1)} name`}><TextInput required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder={activeTab === "shifts" ? "Evening shift" : "Engineering"} /></Field>{activeTab === "shifts" ? <div className="grid gap-4 sm:grid-cols-3"><Field label="Start time"><TextInput required type="time" value={form.start_time} onChange={(event) => setForm({ ...form, start_time: event.target.value })} /></Field><Field label="End time"><TextInput required type="time" value={form.end_time} onChange={(event) => setForm({ ...form, end_time: event.target.value })} /></Field><Field label="Grace minutes"><TextInput required type="number" min="0" value={form.grace_minutes} onChange={(event) => setForm({ ...form, grace_minutes: event.target.value })} /></Field></div> : null}<div className="flex justify-end gap-3 border-t border-border pt-5"><Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button type="submit" disabled={loading}>{loading ? "Saving..." : editingId ? "Update" : "Add"}</Button></div></form></Modal>
  </>;
}
