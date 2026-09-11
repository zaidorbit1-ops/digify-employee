"use client";

import { useEffect, useState, type FormEvent } from "react";
import { IconCalendar, IconTrash } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/empty-state";
import { Field, TextInput } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";

type Holiday = {
  id: number;
  title: string;
  start_date: string;
  end_date: string;
};
const formatDate = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export default function HolidaysPage() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [form, setForm] = useState({ title: "", start_date: "", end_date: "" });
  const [multiple, setMultiple] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{
    text: string;
    tone: "danger" | "success";
  } | null>(null);

  async function load() {
    setLoading(true);
    const response = await fetch("/api/holidays", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok)
      setMessage({
        text: result.error ?? "Could not load holidays.",
        tone: "danger",
      });
    else setHolidays(result.holidays ?? []);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      const response = await fetch("/api/holidays", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          end_date: multiple ? form.end_date : form.start_date,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Could not create holiday.");
      setForm({ title: "", start_date: "", end_date: "" });
      setMultiple(false);
      setMessage({ text: "Holiday added successfully.", tone: "success" });
      await load();
    } catch (error) {
      setMessage({
        text:
          error instanceof Error ? error.message : "Could not create holiday.",
        tone: "danger",
      });
    } finally {
      setSaving(false);
    }
  }

  async function remove(id: number) {
    if (
      !window.confirm(
        "Remove this holiday? Attendance will use the normal rules for these dates again.",
      )
    )
      return;
    const response = await fetch(`/api/holidays?id=${id}`, {
      method: "DELETE",
    });
    const result = await response.json();
    if (!response.ok) {
      setMessage({
        text: result.error ?? "Could not remove holiday.",
        tone: "danger",
      });
      return;
    }
    setHolidays((current) => current.filter((holiday) => holiday.id !== id));
  }

  return (
    <>
      <PageHeader
        eyebrow="Calendar management"
        title="Holidays"
        description="Add company holidays so attendance stays neutral and salary is not cut for those days."
      />
      {message ? (
        <div className="mb-5">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      ) : null}
      <div className="grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
        <Card className="p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary">
              <IconCalendar className="h-5 w-5" />
            </span>
            <div>
              <h2 className="font-semibold">Add holiday</h2>
              <p className="text-xs text-muted">One day or a date range</p>
            </div>
          </div>
          <form className="mt-5 space-y-4" onSubmit={submit}>
            <Field label="Holiday title">
              <TextInput
                required
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
                placeholder="Eid ul Fitr"
              />
            </Field>
            <div>
              <p className="mb-2 text-sm font-medium text-stone-600">
                Holiday length
              </p>
              <div className="grid grid-cols-2 gap-2 rounded-xl bg-[#fcfaf9] p-1">
                <button
                  type="button"
                  onClick={() => setMultiple(false)}
                  className={`rounded-lg px-3 py-2.5 text-sm font-semibold ${!multiple ? "bg-white text-primary shadow-sm" : "text-muted"}`}
                >
                  One day
                </button>
                <button
                  type="button"
                  onClick={() => setMultiple(true)}
                  className={`rounded-lg px-3 py-2.5 text-sm font-semibold ${multiple ? "bg-white text-primary shadow-sm" : "text-muted"}`}
                >
                  Multiple days
                </button>
              </div>
            </div>
            <Field label={multiple ? "Start date" : "Holiday date"}>
              <TextInput
                required
                type="date"
                value={form.start_date}
                onChange={(event) =>
                  setForm({ ...form, start_date: event.target.value })
                }
              />
            </Field>
            {multiple ? (
              <Field label="End date">
                <TextInput
                  required
                  type="date"
                  min={form.start_date || undefined}
                  value={form.end_date}
                  onChange={(event) =>
                    setForm({ ...form, end_date: event.target.value })
                  }
                />
              </Field>
            ) : null}
            <Button type="submit" disabled={saving} className="w-full">
              {saving ? "Adding..." : "Add holiday"}
            </Button>
          </form>
        </Card>
        <Card className="overflow-hidden p-0 sm:p-0">
          <div className="border-b border-border p-5">
            <h2 className="font-semibold">Holiday calendar</h2>
            <p className="mt-1 text-xs text-muted">
              {holidays.length} scheduled holiday
              {holidays.length === 1 ? "" : "s"}
            </p>
          </div>
          <div className="divide-y divide-border">
            {loading ? (
              <div className="p-6 text-sm text-muted">Loading holidays...</div>
            ) : holidays.length ? (
              holidays.map((holiday) => (
                <div
                  key={holiday.id}
                  className="flex items-center justify-between gap-4 p-5"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{holiday.title}</p>
                      <Badge tone="primary">
                        {holiday.start_date === holiday.end_date
                          ? "One day"
                          : "Multiple days"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {formatDate(holiday.start_date)}
                      {holiday.start_date === holiday.end_date
                        ? ""
                        : ` to ${formatDate(holiday.end_date)}`}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    className="text-rose-700 hover:bg-rose-50"
                    onClick={() => remove(holiday.id)}
                    aria-label={`Remove ${holiday.title}`}
                  >
                    <IconTrash className="h-4 w-4" />
                  </Button>
                </div>
              ))
            ) : (
              <div className="px-6 py-14 text-center text-sm text-muted">
                No holidays scheduled yet.
              </div>
            )}
          </div>
        </Card>
      </div>
    </>
  );
}
