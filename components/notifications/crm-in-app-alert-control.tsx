"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/components/auth/auth-provider";
import { IconBell } from "@/components/icons";
import { CRM_ALERTS_CHANGED_EVENT, crmInAppAlertsStorageKey, getCrmInAppAlertsEnabled, setCrmInAppAlertsEnabled } from "@/lib/crm-alert-preferences";

export function CrmInAppAlertControl() {
  const { user, profile } = useAuth();
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    if (!user || (profile?.role !== "superadmin" && profile?.role !== "employee")) return;
    const userId = user.id;
    setEnabled(getCrmInAppAlertsEnabled(userId));

    function handleStorage(event: StorageEvent) {
      if (event.key === crmInAppAlertsStorageKey(userId)) setEnabled(event.newValue !== "false");
    }
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [profile?.role, user]);

  if (!user || (profile?.role !== "superadmin" && profile?.role !== "employee")) return null;

  return (
    <button
      type="button"
      onClick={() => {
        const nextValue = !enabled;
        setEnabled(nextValue);
        setCrmInAppAlertsEnabled(user.id, nextValue);
      }}
      aria-pressed={enabled}
      aria-label={enabled ? "Turn off in-app CRM alerts" : "Turn on in-app CRM alerts"}
      title={enabled ? "In-app CRM alerts are on" : "In-app CRM alerts are off"}
      className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-lg border px-3 text-sm font-semibold transition ${enabled ? "border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100" : "border-rose-300 bg-rose-50 text-rose-800 hover:bg-rose-100"}`}
    >
      <IconBell className="h-4 w-4" />
      <span className="hidden sm:inline">In-app alerts {enabled ? "on" : "off"}</span>
    </button>
  );
}