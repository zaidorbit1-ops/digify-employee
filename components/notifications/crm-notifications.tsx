"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { RealtimePostgresInsertPayload } from "@supabase/supabase-js";
import { useAuth } from "@/components/auth/auth-provider";
import { IconBell } from "@/components/icons";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";

type CrmNotification = {
  id: number;
  recipient_id: string;
  type: "crm_lead" | "crm_email";
  message: string;
  is_read: boolean;
  related_record_id: number | null;
  created_at: string;
};

function notificationTitle(type: CrmNotification["type"]) {
  return type === "crm_lead" ? "New Lead Arrived" : "New Email Arrived";
}

function notificationHref(type: CrmNotification["type"]) {
  return type === "crm_lead" ? "/dashboard/crm/leads" : "/dashboard/crm/webmail";
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
  const [toast, setToast] = useState<CrmNotification | null>(null);
  const [open, setOpen] = useState(false);
  const [loadError, setLoadError] = useState("");
  const toastTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!user || profile?.role !== "superadmin") return;
    let active = true;

    fetch("/api/crm/notifications", { cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load notifications.");
        return response.json() as Promise<{ notifications: CrmNotification[] }>;
      })
      .then((result) => {
        if (active) setNotifications(result.notifications ?? []);
      })
      .catch((error: unknown) => {
        if (active) setLoadError(error instanceof Error ? error.message : "Could not load notifications.");
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
        setNotifications((current) => current.some((notification) => notification.id === item.id)
          ? current
          : [item, ...current].slice(0, 40));
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

  if (profile?.role !== "superadmin") return null;

  const unreadCount = notifications.filter((item) => !item.is_read).length;

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
    }
    setOpen(false);
    setToast(null);
    router.push(notificationHref(item.type));
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
              {notifications.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => void openNotification(item)}
                  className={`block w-full border-b border-border/70 px-4 py-3 text-left transition hover:bg-surface ${item.is_read ? "bg-white" : "bg-rose-50/50"}`}
                >
                  <span className="flex items-center justify-between gap-3">
                    <span className="text-xs font-bold uppercase text-primary">{notificationTitle(item.type)}</span>
                    {!item.is_read ? <span className="h-2 w-2 shrink-0 rounded-full bg-primary" aria-label="Unread" /> : null}
                  </span>
                  <span className="mt-1 block text-sm leading-5 text-foreground">{item.message}</span>
                  <span className="mt-1 block text-xs text-muted">{new Date(item.created_at).toLocaleString()}</span>
                </button>
              ))}
            </div>
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
          <span className="block text-xs font-bold uppercase text-primary">{notificationTitle(toast.type)}</span>
          <span className="mt-1 block text-sm leading-5 text-foreground">{toast.message}</span>
        </button>
      ) : null}
    </>
  );
}
