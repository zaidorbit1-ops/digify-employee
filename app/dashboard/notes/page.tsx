"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { IconAttendance, IconBell, IconCalendar, IconCheck, IconEdit, IconPlus, IconTrash } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/empty-state";
import { Field, TextInput } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";

type Note = { id: number; title: string; description?: string | null; remind_at: string; completed_at?: string | null };
type FormValues = { title: string; description: string; remind_date: string; remind_time: string };
const emptyForm: FormValues = { title: "", description: "", remind_date: "", remind_time: "" };

function inputValue(value?: string | null): Pick<FormValues, "remind_date" | "remind_time"> {
  if (!value) return { remind_date: "", remind_time: "" };
  const date = new Date(value);
  const pad = (number: number) => String(number).padStart(2, "0");
  return {
    remind_date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    remind_time: `${pad(date.getHours())}:${pad(date.getMinutes())}`,
  };
}

function formatReminder(value: string) {
  return new Date(value).toLocaleString([], { dateStyle: "medium", timeStyle: "short" });
}

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [form, setForm] = useState<FormValues>(emptyForm);
  const [editing, setEditing] = useState<Note | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; tone?: "danger" | "success" } | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>("default");
  const [dueIds, setDueIds] = useState<number[]>([]);

  async function loadNotes() {
    const response = await fetch("/api/notes", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not load notes.");
    setNotes(result.notes ?? []);
  }

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) setNotificationPermission(Notification.permission);
    loadNotes().catch((error) => setMessage({ text: error instanceof Error ? error.message : "Could not load notes.", tone: "danger" })).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    function checkDueNotes() {
      const now = Date.now();
      const due = notes.filter((note) => !note.completed_at && new Date(note.remind_at).getTime() <= now);
      setDueIds(due.map((note) => note.id));
      due.forEach((note) => {
        const key = `note-reminder-${note.id}-${note.remind_at}`;
        if (localStorage.getItem(key)) return;
        localStorage.setItem(key, "shown");
        ringReminder();
        if ("Notification" in window && Notification.permission === "granted") new Notification(`Reminder: ${note.title}`, { body: note.description || "Your reminder is due now.", icon: "/logo.png", tag: key });
      });
    }
    checkDueNotes();
    const timer = window.setInterval(checkDueNotes, 15000);
    return () => window.clearInterval(timer);
  }, [notes]);

  async function enableNotifications() {
    if (!("Notification" in window)) {
      setMessage({ text: "This browser does not support desktop notifications.", tone: "danger" });
      return;
    }
    const permission = await Notification.requestPermission();
    setNotificationPermission(permission);
    ringReminder();
  }

  function openAdd() {
    setEditing(null);
    setForm(emptyForm);
    setShowForm(true);
    setMessage(null);
  }

  function openEdit(note: Note) {
    setEditing(note);
    setForm({ title: note.title, description: note.description ?? "", ...inputValue(note.remind_at) });
    setShowForm(true);
    setMessage(null);
  }

  async function saveNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const remindAt = new Date(`${form.remind_date}T${form.remind_time}`);
      if (!form.remind_date || !form.remind_time || !Number.isFinite(remindAt.getTime())) throw new Error("Please choose a valid reminder date and time.");
      const response = await fetch("/api/notes", { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, id: editing?.id, remind_at: remindAt.toISOString() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save note.");
      setShowForm(false);
      setMessage({ text: editing ? "Note updated." : "Note created.", tone: "success" });
      await loadNotes();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not save note.", tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  async function updateNote(id: number, action: "done" | "reopen") {
    const response = await fetch("/api/notes", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id, action }) });
    const result = await response.json();
    if (!response.ok) { setMessage({ text: result.error ?? "Could not update note.", tone: "danger" }); return; }
    await loadNotes();
  }

  async function deleteNote(id: number) {
    if (!window.confirm("Delete this note and reminder?")) return;
    const response = await fetch(`/api/notes?id=${id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) { setMessage({ text: result.error ?? "Could not delete note.", tone: "danger" }); return; }
    await loadNotes();
  }

  const pending = useMemo(() => notes.filter((note) => !note.completed_at), [notes]);
  const completed = useMemo(() => notes.filter((note) => note.completed_at), [notes]);

  return <>
    <PageHeader eyebrow="Personal workspace" title="Notes & Reminders" description="Keep private follow-ups, ideas, and timed reminders in one place." actions={<div className="flex gap-2"><Button variant="secondary" onClick={enableNotifications}><IconBell className="h-4 w-4" />{notificationPermission === "granted" ? "Reminders on" : "Enable reminders"}</Button><Button onClick={openAdd}><IconPlus className="h-4 w-4" />Add note</Button></div>} />
    {message ? <div className="mb-5"><Alert tone={message.tone}>{message.text}</Alert></div> : null}
    {dueIds.length ? <div className="mb-5 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-900"><span className="mr-2 inline-block animate-pulse">●</span>{dueIds.length} reminder{dueIds.length === 1 ? "" : "s"} due now. Mark it done to stop future reminders.</div> : null}
    {showForm ? <Card className="mb-5 border-primary/20 p-5 shadow-[0_12px_32px_rgba(228,90,90,0.08)] sm:p-6"><div className="mb-5"><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">{editing ? "Edit reminder" : "New reminder"}</p><h2 className="mt-1 text-lg font-bold">What should you remember?</h2></div><form onSubmit={saveNote} className="space-y-5"><Field label="Note topic"><TextInput required maxLength={180} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Follow up with client" /></Field><Field label="Note description"><textarea className="min-h-24 w-full rounded-xl border border-border bg-white px-3 py-2.5 text-sm outline-none placeholder:text-stone-400 focus:border-primary focus:ring-2 focus:ring-primary/15" value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Add useful context or next steps..." /></Field><div className="grid gap-4 sm:grid-cols-2"><Field label="Reminder date"><div className="relative"><IconCalendar className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-primary" /><TextInput required type="date" className="h-12 pl-10 pr-3 font-semibold text-foreground" value={form.remind_date} onChange={(event) => setForm({ ...form, remind_date: event.target.value })} /></div></Field><Field label="Reminder time"><div className="relative"><IconAttendance className="pointer-events-none absolute left-3 top-1/2 z-10 h-4 w-4 -translate-y-1/2 text-primary" /><TextInput required type="time" className="h-12 pl-10 pr-3 font-semibold text-foreground" value={form.remind_time} onChange={(event) => setForm({ ...form, remind_time: event.target.value })} /></div></Field></div><div className="rounded-xl border border-primary/10 bg-primary-soft/50 px-3.5 py-3 text-xs leading-5 text-[#5e433f]">Choose the date and time separately so your reminder is easy to scan and adjust.</div><div className="flex justify-end gap-3 border-t border-border pt-5"><Button type="button" variant="secondary" onClick={() => setShowForm(false)}>Cancel</Button><Button type="submit" disabled={saving}>{saving ? "Saving..." : editing ? "Update note" : "Create note"}</Button></div></form></Card> : null}
    {loading ? <Card className="p-8 text-sm text-muted">Loading your notes...</Card> : <div className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]"><Card className="p-5 sm:p-6"><div className="flex items-center justify-between border-b border-border pb-4"><div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-primary">Your queue</p><h2 className="mt-1 text-lg font-bold">Open reminders</h2></div><Badge tone="neutral">{pending.length} pending</Badge></div><div className="mt-4 space-y-3">{pending.length ? pending.map((note) => <NoteRow key={note.id} note={note} due={dueIds.includes(note.id)} onDone={() => updateNote(note.id, "done")} onEdit={() => openEdit(note)} onDelete={() => deleteNote(note.id)} />) : <p className="py-8 text-center text-sm text-muted">No open notes. Add a reminder to keep your next action visible.</p>}</div></Card><Card className="p-5 sm:p-6"><div className="flex items-center justify-between border-b border-border pb-4"><div><p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">Completed</p><h2 className="mt-1 text-lg font-bold">Finished notes</h2></div><Badge tone="success">{completed.length} done</Badge></div><div className="mt-4 space-y-3">{completed.length ? completed.map((note) => <NoteRow key={note.id} note={note} onDone={() => updateNote(note.id, "reopen")} onEdit={() => openEdit(note)} onDelete={() => deleteNote(note.id)} />) : <p className="py-8 text-center text-sm text-muted">Completed notes will appear here.</p>}</div></Card></div>}
  </>;
}

function NoteRow({ note, due, onDone, onEdit, onDelete }: { note: Note; due?: boolean; onDone: () => void; onEdit: () => void; onDelete: () => void }) {
  const completed = Boolean(note.completed_at);
  return <div className={`rounded-xl border p-4 transition ${due ? "border-amber-300 bg-amber-50/60 shadow-[0_8px_22px_rgba(245,158,11,0.12)]" : "border-border bg-white hover:border-primary/25"}`}><div className="flex items-start gap-3"><button type="button" onClick={onDone} aria-label={completed ? "Reopen note" : "Mark note done"} className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border ${completed ? "border-emerald-500 bg-emerald-500 text-white" : "border-stone-300 text-transparent hover:border-primary"}`}><IconCheck className="h-3.5 w-3.5" /></button><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><h3 className={`font-semibold ${completed ? "text-muted line-through" : ""}`}>{note.title}</h3>{due ? <Badge tone="warning">Due now</Badge> : null}</div>{note.description ? <p className="mt-1 text-sm leading-5 text-muted">{note.description}</p> : null}<p className={`mt-3 text-xs font-semibold ${due ? "text-amber-700" : "text-muted"}`}>{completed ? `Completed · ${formatReminder(note.completed_at as string)}` : `Reminder · ${formatReminder(note.remind_at)}`}</p></div><div className="flex shrink-0 gap-1"><button type="button" aria-label="Edit note" onClick={onEdit} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-primary-soft hover:text-primary"><IconEdit className="h-4 w-4" /></button><button type="button" aria-label="Delete note" onClick={onDelete} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-rose-50 hover:text-rose-600"><IconTrash className="h-4 w-4" /></button></div></div></div>;
}

function ringReminder() {
  try {
    const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.frequency.value = 880;
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.16, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.6);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.65);
    oscillator.addEventListener("ended", () => context.close());
  } catch {
    // Browser audio can be unavailable until the user interacts with the page.
  }
}
