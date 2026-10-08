"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RealtimePostgresInsertPayload } from "@supabase/supabase-js";
import { useAuth } from "@/components/auth/auth-provider";
import { IconArrowRight, IconBell, IconClose, IconEye } from "@/components/icons";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { CRM_ALERTS_CHANGED_EVENT, getCrmInAppAlertsEnabled } from "@/lib/crm-alert-preferences";
import { CRM_NOTIFICATION_READ_EVENT } from "@/lib/crm-notification-events";

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

function notificationTitle(type: CrmNotification["type"]) {
  return type === "crm_lead" ? "New Lead Arrived" : "New Email Arrived";
}

function notificationHref(notification: CrmNotification) {
  const relatedUrl = notification.related_url;
  if (relatedUrl?.startsWith("/") && !relatedUrl.startsWith("//")) return relatedUrl;
  return notification.type === "crm_lead" ? "/dashboard/crm/leads" : "/dashboard/crm/webmail";
}

function notificationCompany(notification: CrmNotification) {
  const oldCompany = notification.message.match(/\|\s*Company:\s*(.+)$/i)?.[1]?.trim();
  const company = oldCompany || notification.message.match(/^on\s+(.+)$/i)?.[1]?.trim();
  return company && !/^(?:lead:|email:)/i.test(company) ? company : null;
}

function NotificationLabel({ notification }: { notification: CrmNotification }) {
  const company = notificationCompany(notification);
  return (
    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
      <span>{notificationTitle(notification.type)}{company ? " on" : ""}</span>
      {company ? <span className="rounded-md border border-rose-200 bg-rose-100 px-1.5 py-0.5 font-bold text-rose-800">{company}</span> : null}
    </span>
  );
}

let crmNotificationAudioContext: AudioContext | null = null;

function playCrmNotificationSound(type: CrmNotification["type"]) {
  if (typeof window === "undefined" || !("AudioContext" in window)) return;

  try {
    crmNotificationAudioContext ??= new window.AudioContext();
    const context = crmNotificationAudioContext;
    const notes = type === "crm_lead" ? [880, 1175] : [660, 880];
    const play = () => {
      const start = context.currentTime;
      notes.forEach((frequency, index) => {
        const offset = index * 0.16;
        const oscillator = context.createOscillator();
        const gain = context.createGain();
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, start + offset);
        gain.gain.setValueAtTime(0.0001, start + offset);
        gain.gain.exponentialRampToValueAtTime(0.22, start + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + offset + 0.28);
        oscillator.connect(gain).connect(context.destination);
        oscillator.start(start + offset);
        oscillator.stop(start + offset + 0.3);
      });
    };

    if (context.state === "suspended") void context.resume().then(play).catch(() => undefined);
    else play();
  } catch {
    return;
  }
}

export function CrmNotifications() {
  const { user, profile } = useAuth();
  const router = useRouter();
  const [notifications, setNotifications] = useState<CrmNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [toast, setToast] = useState<CrmNotification | null>(null);
  const [open, setOpen] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [activeType, setActiveType] = useState<CrmNotification["type"]>("crm_email");
  const toastTimer = useRef<number | null>(null);
  const seenNotificationIds = useRef(new Set<number>());
  const handledReadNotificationIds = useRef(new Set<number>());
  const alertsEnabled = useRef(true);

  useEffect(() => {
    if (!user) return;
    const syncPreference = (enabled: boolean) => {
      alertsEnabled.current = enabled;
      if (!enabled) {
        setToast(null);
        if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
      }
    };
    syncPreference(getCrmInAppAlertsEnabled(user.id));
    const handlePreferenceChange = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; enabled?: boolean }>).detail;
      if (detail?.userId === user.id && typeof detail.enabled === "boolean") syncPreference(detail.enabled);
    };
    const handleStorage = (event: StorageEvent) => {
      if (event.key === `crm-in-app-alerts-enabled:${user.id}`) syncPreference(event.newValue !== "false");
    };
    window.addEventListener(CRM_ALERTS_CHANGED_EVENT, handlePreferenceChange);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener(CRM_ALERTS_CHANGED_EVENT, handlePreferenceChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, [user?.id]);

  useEffect(() => {
    const handleNotificationRead = (event: Event) => {
      const id = (event as CustomEvent<{ id?: number }>).detail?.id;
      if (!id || handledReadNotificationIds.current.has(id)) return;
      handledReadNotificationIds.current.add(id);
      setUnreadCount((count) => Math.max(0, count - 1));
      setNotifications((current) => current.map((notification) => notification.id === id
        ? { ...notification, is_read: true }
        : notification));
    };
    window.addEventListener(CRM_NOTIFICATION_READ_EVENT, handleNotificationRead);
    return () => window.removeEventListener(CRM_NOTIFICATION_READ_EVENT, handleNotificationRead);
  }, []);

  useEffect(() => {
    if (!user || (profile?.role !== "superadmin" && profile?.role !== "employee")) return;
    let active = true;

    fetch(`/api/crm/notifications?type=${activeType}`, { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load notifications.");
        return response.json() as Promise<{ notifications: CrmNotification[]; unreadCount: number }>;
      })
      .then((result) => {
        if (active) {
          setNotifications(result.notifications ?? []);
          setUnreadCount(result.unreadCount ?? 0);
          setLoadError("");
          for (const item of result.notifications ?? []) seenNotificationIds.current.add(item.id);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setLoadError(error instanceof Error ? error.message : "Could not load notifications.");
        }
      });

    const channel = getSupabaseBrowserClient()
      .channel(`crm-notifications-${user.id}`)
      .on("postgres_changes", {
        event: "INSERT",
        schema: "public",
        table: "notifications",
        filter: `recipient_id=eq.${user.id}`,
      }, (payload: RealtimePostgresInsertPayload<Record<string, unknown>>) => {
        const item = payload.new as unknown as CrmNotification;
        if (item.type !== "crm_lead" && item.type !== "crm_email") return;
        if (seenNotificationIds.current.has(item.id)) return;
        seenNotificationIds.current.add(item.id);
        if (item.type === activeType) {
          setNotifications((current) => current.some((notification) => notification.id === item.id)
            ? current
            : [item, ...current].slice(0, 10));
        }
        if (!item.is_read) setUnreadCount((current) => current + 1);
        if (alertsEnabled.current) {
          setToast(item);
          playCrmNotificationSound(item.type);
          if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
          toastTimer.current = window.setTimeout(() => setToast(null), 5000);
        }
      })
      .subscribe();

    return () => {
      active = false;
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
      void getSupabaseBrowserClient().removeChannel(channel);
    };
  }, [activeType, profile?.role, user]);

  if (profile?.role !== "superadmin" && profile?.role !== "employee") return null;

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
      return true;
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not mark this notification as viewed.");
      return false;
    }
  }

  async function openNotification(item: CrmNotification) {
    if (!await markNotificationRead(item)) return;
    setOpen(false);
    setToast(null);
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
    router.push(notificationHref(item));
  }

  const filteredNotifications = notifications.filter((item) => item.type === activeType);
  const notificationGroups = new Map<string, CrmNotification[]>();
  for (const item of filteredNotifications) {
    const date = new Date(item.created_at).toLocaleDateString();
    notificationGroups.set(date, [...(notificationGroups.get(date) ?? []), item]);
  }

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
          aria-expanded={open}
          className="relative grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-border bg-white text-foreground transition hover:bg-surface"
        >
          <IconBell className="h-5 w-5" />
          {unreadCount > 0 ? <span className="absolute -right-1 -top-1 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-primary px-1 text-[10px] font-bold leading-none text-white">{unreadCount > 99 ? "99+" : unreadCount}</span> : null}
        </button>

        {open ? (
          <section className="absolute right-0 top-12 z-[70] w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-white shadow-[0_18px_48px_rgba(15,23,42,0.18)]" aria-label="CRM notifications">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold text-foreground">Notifications</h2>
              <span className="text-xs text-muted">{unreadCount} unread</span>
            </div>
            <div className="grid grid-cols-2 gap-1 border-b border-border bg-slate-50 p-2" role="tablist" aria-label="Notification type">
              {([
                { label: "Emails", value: "crm_email" },
                { label: "Leads", value: "crm_lead" },
              ] as const).map((tab) => (
                <button
                  key={tab.value}
                  type="button"
                  role="tab"
                  aria-selected={activeType === tab.value}
                  onClick={() => setActiveType(tab.value)}
                  className={`rounded-lg px-3 py-2 text-xs font-semibold transition ${activeType === tab.value ? "bg-white text-primary shadow-sm ring-1 ring-border" : "text-muted hover:text-foreground"}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <div className="max-h-[min(65vh,480px)] overflow-y-auto">
              {loadError ? <p className="px-4 py-5 text-sm text-rose-700">{loadError}</p> : null}
              {!loadError && filteredNotifications.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted">No {activeType === "crm_email" ? "email" : "lead"} notifications yet.</p> : null}
              {Array.from(notificationGroups.entries()).map(([date, items]) => (
                <section key={date} aria-label={date}>
                  <h3 className="sticky top-0 border-b border-border/70 bg-slate-50 px-4 py-2 text-[11px] font-bold uppercase text-muted">{date}</h3>
                  {items.map((item) => (
                    <div
                      key={item.id}
                      className={`flex items-center gap-1 border-b border-border/70 border-l-4 px-2 transition hover:bg-rose-50 ${item.is_read ? "border-l-transparent bg-white" : "border-l-primary bg-rose-50"}`}
                    >
                      <button
                        type="button"
                        onClick={() => void openNotification(item)}
                        className="group flex min-w-0 flex-1 items-center gap-2 px-2 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold leading-5 text-foreground"><NotificationLabel notification={item} /></span>
                          <span className="mt-1 block text-xs text-muted">{new Date(item.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                        </span>
                        {!item.is_read ? <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" /> : null}
                        <IconArrowRight className="h-4 w-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-primary" />
                      </button>
                      <button
                        type="button"
                        onClick={() => void markNotificationRead(item)}
                        disabled={item.is_read}
                        aria-label={item.is_read ? "Already viewed" : "Mark notification as viewed"}
                        title={item.is_read ? "Already viewed" : "Mark as viewed"}
                        className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-muted transition hover:bg-white hover:text-primary disabled:cursor-default disabled:opacity-40"
                      >
                        <IconEye className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </section>
              ))}
            </div>
            <Link href="/dashboard/crm/notifications" onClick={() => setOpen(false)} className="flex items-center justify-between border-t border-border bg-slate-50 px-4 py-3 text-sm font-semibold text-primary transition hover:bg-rose-50">
              <span>View all notifications</span>
              <IconArrowRight className="h-4 w-4" />
            </Link>
          </section>
        ) : null}
      </div>

      {toast ? (
        <aside
          key={toast.id}
          className="crm-notification-toast fixed right-4 top-20 z-[65] w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-rose-200 bg-white shadow-[0_16px_44px_rgba(15,23,42,0.2)]"
          role="status"
        >
          <div className="flex items-start gap-3 border-l-4 border-l-primary bg-gradient-to-r from-rose-50/80 to-white p-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-rose-100 text-primary"><IconBell className="h-5 w-5" /></span>
            <button type="button" onClick={() => void openNotification(toast)} className="min-w-0 flex-1 text-left">
              <span className="block text-[11px] font-bold uppercase tracking-wide text-primary">New notification</span>
              <span className="mt-1 block text-sm font-semibold leading-5 text-foreground"><NotificationLabel notification={toast} /></span>
              <span className="mt-1 block text-xs text-muted">Click to open</span>
            </button>
            <button
              type="button"
              aria-label="Dismiss notification"
              onClick={() => {
                setToast(null);
                if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
              }}
              className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-muted transition hover:bg-rose-100 hover:text-foreground"
            >
              <IconClose className="h-4 w-4" />
            </button>
          </div>
          <div className="h-1 bg-rose-100" aria-hidden="true">
            <div className="crm-notification-toast-progress h-full bg-primary" />
          </div>
        </aside>
      ) : null}
    </>
  );
}
