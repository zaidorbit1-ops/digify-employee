"use client";

import { useEffect, useState } from "react";
import type { RealtimePostgresInsertPayload } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useAuth } from "@/components/auth/auth-provider";
import { IconCheck } from "@/components/icons";

type AttendanceEvent = { name: string; checkIn: string; kind: "check_in" | "check_out" };

export function AttendanceNotifier() {
  const { user, profile } = useAuth();
  const [event, setEvent] = useState<AttendanceEvent | null>(null);

  useEffect(() => {
    if (!user || profile?.role !== "superadmin") return;

    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      Notification.requestPermission().catch(() => undefined);
    }

    const channel = getSupabaseBrowserClient()
      .channel("attendance-live-notifications")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "attendance" }, async (payload: RealtimePostgresInsertPayload<Record<string, unknown>>) => {
        const row = payload.new as { zk_user_id?: number; check_in?: string; day_status?: string };
        const employeeId = Number(payload.new.employee_id);
        const { data: employee } = employeeId
          ? await getSupabaseBrowserClient().from("employees").select("name").eq("id", employeeId).maybeSingle()
          : { data: null };
        const name = employee?.name ?? `Device user ${row.zk_user_id ?? "unknown"}`;
        const checkIn = row.check_in ?? new Date().toISOString();
        const checkInDate = new Date(checkIn);
        const offsetMinutes = 300;
        const localDate = new Date(checkInDate.getTime() + offsetMinutes * 60000).toISOString().slice(0, 10);
        const localStart = new Date(`${localDate}T00:00:00Z`).getTime() - offsetMinutes * 60000;
        const localEnd = localStart + 86400000;
        const { count } = await getSupabaseBrowserClient()
          .from("attendance")
          .select("id", { count: "exact", head: true })
          .eq("employee_id", employeeId)
          .gte("check_in", new Date(localStart).toISOString())
          .lt("check_in", new Date(localEnd).toISOString());
        const kind = (count ?? 1) % 2 === 0 ? "check_out" : "check_in";
        setEvent({ name, checkIn, kind });
        window.setTimeout(() => setEvent(null), 9000);
        if ("speechSynthesis" in window) {
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(new SpeechSynthesisUtterance(`${name} has ${kind === "check_in" ? "checked in" : "checked out"}`));
        }
        if (typeof window === "undefined" || !("Notification" in window) || Notification.permission !== "granted") return;
        new Notification(kind === "check_in" ? "Check-in recorded" : "Check-out recorded", {
          body: `${name} ${kind === "check_in" ? "checked in" : "checked out"} at ${new Date(checkIn).toLocaleTimeString()}.`,
          icon: "/logo.png",
          tag: `attendance-${row.zk_user_id}-${checkIn}`,
        });
      })
      .subscribe();

    return () => {
      getSupabaseBrowserClient().removeChannel(channel);
    };
  }, [profile?.role, user]);

  return event ? <div className="fixed right-5 top-5 z-[60] w-[min(420px,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-[0_24px_60px_rgba(16,185,129,0.18)]"><div className="h-1.5 bg-emerald-500" /><div className="flex gap-4 p-5"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><IconCheck className="h-6 w-6" /></div><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-600">Attendance marked</p><h2 className="mt-1 text-lg font-bold">{event.name}</h2><p className="mt-1 text-sm text-muted">Fingerprint attendance saved at {new Date(event.checkIn).toLocaleTimeString()}.</p></div></div></div> : null;
  const currentEvent = event;
  if (!currentEvent) return null;
  const { kind, name, checkIn } = currentEvent as AttendanceEvent;
  return <div className="fixed right-5 top-5 z-[60] w-[min(420px,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-[0_24px_60px_rgba(16,185,129,0.18)]"><div className="h-1.5 bg-emerald-500" /><div className="flex gap-4 p-5"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><IconCheck className="h-6 w-6" /></div><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-600">{kind === "check_in" ? "Check-in recorded" : "Check-out recorded"}</p><h2 className="mt-1 text-lg font-bold">{name}</h2><p className="mt-1 text-sm text-muted">{kind === "check_in" ? "Work session started" : "Work session closed"} at {new Date(checkIn).toLocaleTimeString()}.</p></div></div></div>;
}
