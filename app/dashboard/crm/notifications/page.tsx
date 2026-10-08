"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { IconArrowRight, IconBell, IconEye } from "@/components/icons";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { CRM_NOTIFICATION_READ_EVENT } from "@/lib/crm-notification-events";

type TypeFilter = "crm_lead" | "crm_email";
type ReadFilter = "all" | "unread" | "read";
const PAGE_SIZE = 20;

type CrmNotification = {
  id: number;
  recipient_id: string;
  type: "crm_lead" | "crm_email";
  message: string;
  is_read: boolean;
  related_record_id: number | null;
  related_url: string | null;
  created_at: string;
};

function title(type: CrmNotification["type"]) {
  return type === "crm_lead" ? "New Lead Arrived" : "New Email Arrived";
}

function companyName(notification: CrmNotification) {
  return notification.message.match(/\|\s*Company:\s*(.+)$/i)?.[1]?.trim()
    ?? notification.message.match(/^on\s+(.+)$/i)?.[1]?.trim()
    ?? null;
}

function dateLabel(value: string) {
  const date = new Date(value);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  if (date.toDateString() === today.toDateString()) return "Today";
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "full" }).format(date);
}

export default function CrmNotificationHistoryPage() {
  const router = useRouter();
  const [notifications, setNotifications] = useState<CrmNotification[]>([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("crm_email");
  const [readFilter, setReadFilter] = useState<ReadFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function loadPage(nextPage: number, nextType: TypeFilter, nextRead: ReadFilter) {
    setLoading(true);
    setError("");
    try {
      const query = new URLSearchParams({ page: String(nextPage), limit: String(PAGE_SIZE) });
      query.set("type", nextType);
      if (nextRead !== "all") query.set("read", nextRead);
      const response = await fetch(`/api/crm/notifications?${query}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load notifications.");
      setNotifications(result.notifications ?? []);
      setTotalCount(result.totalCount ?? 0);
      setPage(result.page ?? nextPage);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load notifications.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPage(1, "crm_email", "all");
  }, []);

  function setTypeAndReload(nextType: TypeFilter) {
    setTypeFilter(nextType);
    void loadPage(1, nextType, readFilter);
  }

  function setReadAndReload(nextRead: ReadFilter) {
    setReadFilter(nextRead);
    void loadPage(1, typeFilter, nextRead);
  }

  async function markNotificationRead(item: CrmNotification) {
    if (item.is_read) return true;
    try {
      const response = await fetch("/api/crm/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      });
      const result = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(result?.error ?? "Could not mark this notification as viewed.");
      window.dispatchEvent(new CustomEvent(CRM_NOTIFICATION_READ_EVENT, { detail: { id: item.id } }));
      setNotifications((current) => current.map((notification) => notification.id === item.id
        ? { ...notification, is_read: true }
        : notification));
      if (readFilter === "unread") {
        void loadPage(page, typeFilter, readFilter);
      }
      return true;
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not mark this notification as viewed.");
      return false;
    }
  }

  async function openNotification(item: CrmNotification) {
    if (!await markNotificationRead(item)) return;
    const path = item.related_url?.startsWith("/") && !item.related_url.startsWith("//")
      ? item.related_url
      : item.type === "crm_lead" ? "/dashboard/crm/leads" : "/dashboard/crm/webmail";
    router.push(path);
  }

  const groups = new Map<string, CrmNotification[]>();
  for (const item of notifications) {
    const label = dateLabel(item.created_at);
    groups.set(label, [...(groups.get(label) ?? []), item]);
  }
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
  const typeOptions: { label: string; value: TypeFilter }[] = [
    { label: "Emails", value: "crm_email" },
    { label: "Leads", value: "crm_lead" },
  ];
  const readOptions: { label: string; value: ReadFilter }[] = [
    { label: "All status", value: "all" },
    { label: "Unread", value: "unread" },
    { label: "Read", value: "read" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Business CRM / Notifications"
        title="Activity history"
        description="Every CRM lead and incoming email notification, grouped by date."
      />
      <section className="overflow-hidden rounded-xl border border-border bg-white" aria-label={`${typeFilter === "crm_email" ? "Email" : "Lead"} notifications`}>
        <div className="flex items-center gap-3 border-b border-border px-5 py-4">
          <span className="grid h-10 w-10 place-items-center rounded-lg bg-rose-50 text-primary"><IconBell className="h-5 w-5" /></span>
          <div>
            <h2 className="text-sm font-semibold text-foreground">{typeFilter === "crm_email" ? "Email notifications" : "Lead notifications"}</h2>
            <p className="text-xs text-muted">Newest first</p>
          </div>
          <span className="ml-auto text-xs font-medium text-muted">{totalCount} records</span>
        </div>
        <div className="flex flex-col gap-4 border-b border-border bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="inline-flex w-full rounded-lg border border-border bg-slate-50 p-1 sm:w-auto" role="tablist" aria-label="Notification type">
            {typeOptions.map((option) => (
              <button key={option.value} type="button" role="tab" onClick={() => setTypeAndReload(option.value)} aria-selected={typeFilter === option.value} className={`flex-1 rounded-md px-4 py-2 text-sm font-semibold transition sm:flex-none ${typeFilter === option.value ? "bg-white text-primary shadow-sm ring-1 ring-border" : "text-muted hover:text-foreground"}`}>
                {option.label}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <span className="w-12 text-[11px] font-bold uppercase text-muted">Status</span>
            <div className="inline-flex rounded-lg border border-border bg-slate-50 p-1" role="group" aria-label="Filter by read status">
              {readOptions.map((option) => (
                <button key={option.value} type="button" onClick={() => setReadAndReload(option.value)} aria-pressed={readFilter === option.value} className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${readFilter === option.value ? "bg-white text-primary shadow-sm ring-1 ring-border" : "text-muted hover:text-foreground"}`}>
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
        {error ? <p role="alert" className="px-5 py-8 text-sm text-rose-700">{error}</p> : null}
        {!error && !loading && notifications.length === 0 ? <p className="px-5 py-10 text-center text-sm text-muted">No {typeFilter === "crm_email" ? "email" : "lead"} notifications match these filters.</p> : null}
        {Array.from(groups.entries()).map(([date, items]) => (
          <section key={date} aria-label={date}>
            <h3 className="border-b border-border bg-slate-50 px-5 py-2.5 text-xs font-bold uppercase text-muted">{date}</h3>
            {items.map((item) => {
              const company = companyName(item);
              return (
                <div
                  key={item.id}
                  className={`flex items-center gap-1 border-b border-border/70 border-l-4 px-2 transition hover:bg-rose-50 ${item.is_read ? "border-l-transparent bg-white" : "border-l-primary bg-rose-50"}`}
                >
                  <button
                    type="button"
                    onClick={() => void openNotification(item)}
                    className="group flex min-w-0 flex-1 items-center gap-3 px-3 py-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm font-semibold text-foreground">
                        <span>{title(item.type)}{company ? " on" : ""}</span>
                        {company ? <span className="rounded-md border border-rose-200 bg-rose-100 px-2 py-1 text-xs font-bold text-rose-800">{company}</span> : null}
                      </span>
                      <span className="mt-1 block text-xs text-muted">{new Date(item.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                    </span>
                    {!item.is_read ? <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" aria-label="Unread" /> : null}
                    <IconArrowRight className="h-4 w-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-primary" />
                  </button>
                  <button
                    type="button"
                    onClick={() => void markNotificationRead(item)}
                    disabled={item.is_read}
                    aria-label={item.is_read ? "Already viewed" : "Mark notification as viewed"}
                    title={item.is_read ? "Already viewed" : "Mark as viewed"}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-md text-muted transition hover:bg-white hover:text-primary disabled:cursor-default disabled:opacity-40"
                  >
                    <IconEye className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </section>
        ))}
        <Pagination page={page} totalPages={totalPages} totalCount={totalCount} pageSize={PAGE_SIZE} loading={loading} onPageChange={(nextPage) => void loadPage(nextPage, typeFilter, readFilter)} />
      </section>
    </div>
  );
}
