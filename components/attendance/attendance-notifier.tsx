"use client";

import { useEffect, useState } from "react";
import type { RealtimePostgresInsertPayload } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase-browser";
import { useAuth } from "@/components/auth/auth-provider";
import { IconCheck } from "@/components/icons";
import { attendanceEventKind, sessionDateKey, sessionWindow } from "@/lib/attendance";

type AttendanceEvent = { name: string; checkIn: string; kind: "check_in" | "check_out" };
type Employee = { name: string; shift_id?: number | null };
type Shift = { start_time: string; end_time: string; grace_minutes?: number };

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
        const row = payload.new as { id?: number; employee_id?: number; zk_user_id?: number; check_in?: string };
        const employeeId = Number(payload.new.employee_id);
        const client = getSupabaseBrowserClient();
        const { data: employee } = employeeId
          ? await client.from("employees").select("name, shift_id").eq("id", employeeId).maybeSingle() as { data: Employee | null }
          : { data: null };
        const name = employee?.name ?? `Device user ${row.zk_user_id ?? "unknown"}`;
        const checkIn = row.check_in ?? new Date().toISOString();
        const { data: shift } = employee?.shift_id
          ? await client.from("shift_timings").select("start_time, end_time, grace_minutes").eq("id", employee.shift_id).maybeSingle() as { data: Shift | null }
          : { data: null };
        const sessionDate = sessionDateKey(checkIn, shift ?? undefined);
        const attendanceWindow = sessionWindow(sessionDate, shift ?? undefined);
        const { data: sessionPunches } = employeeId
          ? await client.from("attendance").select("check_in").eq("employee_id", employeeId).gte("check_in", attendanceWindow.start).lt("check_in", attendanceWindow.end).order("check_in", { ascending: true })
          : { data: [] };
        const kind = attendanceEventKind(sessionPunches ?? [], checkIn);
        if (kind === "ignored") return;
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

  if (!event) return null;
  const { kind, name, checkIn } = event;
  return <div className="fixed right-5 top-5 z-[60] w-[min(420px,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-[0_24px_60px_rgba(16,185,129,0.18)]"><div className="h-1.5 bg-emerald-500" /><div className="flex gap-4 p-5"><div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-600"><IconCheck className="h-6 w-6" /></div><div><p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-600">{kind === "check_in" ? "Check-in recorded" : "Check-out recorded"}</p><h2 className="mt-1 text-lg font-bold">{name}</h2><p className="mt-1 text-sm text-muted">{name} {kind === "check_in" ? "checked in" : "checked out"} at {new Date(checkIn).toLocaleTimeString()}.</p></div></div></div>;
}
