"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RealtimePostgresInsertPayload } from "@supabase/supabase-js";
import { useAuth } from "@/components/auth/auth-provider";
import { IconArrowRight, IconBell } from "@/components/icons";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

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

function notificationTag(notification: CrmNotification) {
  const prefix = notification.type === "crm_lead" ? "crm-lead" : "crm-email";
  return `${prefix}-${notification.related_record_id ?? notification.id}`;
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
  const [available, setAvailable] = useState(false);
  const [toast, setToast] = useState<CrmNotification | null>(null);
  const [open, setOpen] = useState(false);
  const [loadError, setLoadError] = useState("");
  const toastTimer = useRef<number | null>(null);
  const seenNotificationIds = useRef(new Set<number>());

  useEffect(() => {
    if (!user || (profile?.role !== "superadmin" && profile?.role !== "employee")) return;
    let active = true;
    seenNotificationIds.current.clear();

    fetch("/api/crm/notifications", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load notifications.");
        return response.json() as Promise<{ notifications: CrmNotification[]; unreadCount: number; enabled: boolean }>;
      })
      .then((result) => {
        if (active) {
          setNotifications(result.notifications ?? []);
          setUnreadCount(result.unreadCount ?? 0);
          setAvailable(result.enabled);
          setLoadError("");
          for (const item of result.notifications ?? []) seenNotificationIds.current.add(item.id);
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setAvailable(false);
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
        setNotifications((current) => current.some((notification) => notification.id === item.id)
          ? current
          : [item, ...current].slice(0, 10));
        if (!item.is_read) setUnreadCount((current) => current + 1);
        setToast(item);
        playCrmNotificationSound(item.type);
        if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
        toastTimer.current = window.setTimeout(() => setToast(null), 8000);

        if (document.visibilityState === "hidden" && "Notification" in window && Notification.permission === "granted") {
          new Notification(notificationTitle(item.type), {
            body: item.message,
            icon: "/logo.png",
            tag: notificationTag(item),
          });
        }
      })
      .subscribe();

    return () => {
      active = false;
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current);
      void getSupabaseBrowserClient().removeChannel(channel);
    };
  }, [profile?.role, user]);

  if (profile?.role !== "superadmin" && (profile?.role !== "employee" || !available)) return null;

  async function openNotification(item: CrmNotification) {
    if (!item.is_read) {
      await fetch("/api/crm/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: item.id }),
      }).catch(() => undefined);
      setNotifications((current) => current.map((notification) => notification.id === item.id
        ? { ...notification, is_read: true }
        : notification));
      setUnreadCount((current) => Math.max(0, current - 1));
    }
    setOpen(false);
    setToast(null);
    router.push(notificationHref(item));
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
            <div className="max-h-[min(65vh,480px)] overflow-y-auto">
              {loadError ? <p className="px-4 py-5 text-sm text-rose-700">{loadError}</p> : null}
              {!loadError && notifications.length === 0 ? <p className="px-4 py-6 text-center text-sm text-muted">No lead or email notifications yet.</p> : null}
              {(() => {
                const groups = new Map<string, CrmNotification[]>();
                for (const item of notifications) {
                  const date = new Date(item.created_at);
                  const key = date.toLocaleDateString();
                  groups.set(key, [...(groups.get(key) ?? []), item]);
                }
                return Array.from(groups.entries()).map(([date, items]) => (
                  <section key={date} aria-label={date}>
                    <h3 className="sticky top-0 border-b border-border/70 bg-slate-50 px-4 py-2 text-[11px] font-bold uppercase text-muted">{date}</h3>
                    {items.map((item) => (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => void openNotification(item)}
                        className={`group flex w-full cursor-pointer items-center gap-3 border-b border-border/70 border-l-4 px-4 py-3 text-left transition hover:bg-rose-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary ${item.is_read ? "border-l-transparent bg-white" : "border-l-primary bg-rose-100"}`}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-semibold leading-5 text-foreground"><NotificationLabel notification={item} /></span>
                          <span className="mt-1 block text-xs text-muted">{new Date(item.created_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</span>
                        </span>
                        {!item.is_read ? <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" aria-label="Unread" /> : null}
                        <IconArrowRight className="h-4 w-4 shrink-0 text-muted transition group-hover:translate-x-0.5 group-hover:text-primary" />
                      </button>
                    ))}
                  </section>
                ));
              })()}
            </div>
            <Link href="/dashboard/crm/notifications" onClick={() => setOpen(false)} className="flex items-center justify-between border-t border-border bg-slate-50 px-4 py-3 text-sm font-semibold text-primary transition hover:bg-rose-50">
              <span>View all notifications</span>
              <IconArrowRight className="h-4 w-4" />
            </Link>
          </section>
        ) : null}
      </div>

      {toast ? (
        <button
          type="button"
          onClick={() => void openNotification(toast)}
          className="fixed right-4 top-20 z-[65] w-[min(380px,calc(100vw-2rem))] rounded-xl border border-border border-l-4 border-l-primary bg-white p-4 text-left shadow-[0_16px_44px_rgba(15,23,42,0.18)]"
          role="status"
        >
          <span className="block text-sm font-semibold leading-5 text-foreground"><NotificationLabel notification={toast} /></span>
          <span className="mt-1 block text-xs text-muted">Click to open</span>
        </button>
      ) : null}
    </>
  );
}
