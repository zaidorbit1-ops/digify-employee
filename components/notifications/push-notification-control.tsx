"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { IconBell } from "@/components/icons";

function decodeVapidKey(value: string) {
  const padding = "=".repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = window.atob(base64);
  return Uint8Array.from(raw, (character) => character.charCodeAt(0));
}

export function PushNotificationControl() {
  const { profile } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [checking, setChecking] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
      setChecking(false);
      return;
    }
    let active = true;
    navigator.serviceWorker.ready
      .then((registration) => registration.pushManager.getSubscription())
      .then((subscription) => {
        if (active) setEnabled(Boolean(subscription));
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, []);

  if (profile?.role !== "superadmin") return null;

  async function toggleNotifications() {
    setBusy(true);
    setMessage("");
    try {
      if (!("Notification" in window) || !("PushManager" in window) || !("serviceWorker" in navigator)) {
        throw new Error("This browser does not support push notifications.");
      }
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!enabled && !publicKey) throw new Error("Push notifications need VAPID keys configured on the server first.");
      const permission = !enabled && Notification.permission === "default"
        ? await Notification.requestPermission()
        : Notification.permission;
      if (!enabled && permission !== "granted") throw new Error("Allow notifications for this site in your browser settings.");

      const registration = await navigator.serviceWorker.register("/sw.js");
      let subscription = await registration.pushManager.getSubscription();

      if (subscription) {
        const response = await fetch("/api/push/subscription", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: subscription.endpoint }),
        });
        if (!response.ok) throw new Error("Could not disable notifications for this device.");
        await subscription.unsubscribe();
        setEnabled(false);
        setMessage("Desktop notifications disabled.");
        return;
      }

      if (!publicKey) throw new Error("Push notifications need VAPID keys configured on the server first.");

      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: decodeVapidKey(publicKey),
      });
      const response = await fetch("/api/push/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(subscription),
      });
      if (!response.ok) {
        await subscription.unsubscribe();
        throw new Error("Could not save this device. Apply the latest database migration and try again.");
      }
      setEnabled(true);
      setMessage("Desktop notifications enabled on this device.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update notification settings.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={toggleNotifications}
        disabled={busy || checking}
        title={enabled ? "Disable desktop notifications" : "Enable desktop notifications"}
        aria-label={enabled ? "Disable desktop notifications" : "Enable desktop notifications"}
        className={`inline-flex h-10 items-center gap-2 rounded-lg border px-3 text-sm font-medium transition disabled:cursor-wait disabled:opacity-60 ${enabled ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100" : "border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100"}`}
      >
        <IconBell className="h-4 w-4" />
        <span className="hidden sm:inline">{checking ? "Checking..." : busy ? "Updating..." : enabled ? "Notifications on" : "Enable notifications"}</span>
      </button>
      {message ? <span role="status" className="max-w-48 text-xs leading-4 text-muted">{message}</span> : null}
    </div>
  );
}