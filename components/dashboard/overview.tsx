"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  IconArrowRight,
  IconAttendance,
  IconCheck,
  IconDevices,
  IconEmployees,
  IconRefresh,
} from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";

type Device = { id: number; name: string; device_ip: string; port: number; status: string };
type Employee = { id: number; name: string; employee_id: string; department?: string; position?: string; phone?: string; zk_device_uid?: number | null };
type AttendanceRow = {
  id: number;
  zk_user_id: number;
  check_in: string;
  status?: string;
  employee?: Employee | null;
};

export function OverviewView() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [event, setEvent] = useState<AttendanceRow | null>(null);
  const [monitorState, setMonitorState] = useState<"starting" | "online" | "offline">("starting");
  const latestId = useRef<number | null>(null);
  const polling = useRef(false);

  async function loadAttendance(showEvent = false) {
    const response = await fetch("/api/attendance", { cache: "no-store" });
    const data = await response.json();
    const records: AttendanceRow[] = data.attendance ?? [];
    if (showEvent && records[0] && latestId.current !== null && records[0].id !== latestId.current) {
      setEvent(records[0]);
      const employeeName = records[0].employee?.name ?? `K60 User ${records[0].zk_user_id}`;
      if (typeof window !== "undefined" && "speechSynthesis" in window) {
        window.speechSynthesis.cancel();
        window.speechSynthesis.speak(new SpeechSynthesisUtterance(`${employeeName} just checked in`));
      }
      window.setTimeout(() => setEvent(null), 9000);
    }
    if (records[0]) latestId.current = records[0].id;
    setAttendance(records);
  }

  async function automaticCheck() {
    if (polling.current) return;
    polling.current = true;
    try {
      const response = await fetch("/api/attendance/sync", { method: "POST" });
      const data = await response.json();
      if (response.ok && data.ok) {
        setMonitorState("online");
        await loadAttendance(true);
      } else {
        setMonitorState("offline");
      }
    } catch {
      setMonitorState("offline");
    } finally {
      polling.current = false;
    }
  }

  useEffect(() => {
    async function load() {
      try {
        const [devicesResponse, employeesResponse] = await Promise.all([
          fetch("/api/devices", { cache: "no-store" }),
          fetch("/api/employees", { cache: "no-store" }),
        ]);
        const devicesData = await devicesResponse.json();
        const employeesData = await employeesResponse.json();
        setDevices(devicesData.devices ?? []);
        setEmployees(employeesData.employees ?? []);
        await loadAttendance();
      } catch {
        setSyncMessage("Could not load dashboard data. Check your database connection.");
      } finally {
        setLoading(false);
      }
    }
    load();
    const timer = window.setInterval(automaticCheck, 1000);
    return () => window.clearInterval(timer);
  }, []);

  async function handleManualSync() {
    setSyncing(true);
    setSyncMessage(null);
    try {
      const response = await fetch("/api/attendance/sync", { method: "POST" });
      const data = await response.json();
      setSyncMessage(
        response.ok && data.ok
          ? `Connected to ${data.device}. ${data.logsFetched ?? 0} records checked.`
          : data.error ?? "Sync failed.",
      );
      if (response.ok && data.ok) await loadAttendance(true);
    } catch {
      setSyncMessage("Sync failed. Confirm the K60 is online and saved in Devices.");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <>
      {event ? (
        <div className="fixed right-5 top-5 z-40 w-[min(440px,calc(100vw-2.5rem))] overflow-hidden rounded-2xl border border-emerald-100 bg-white shadow-[0_24px_60px_rgba(16,185,129,0.18)]">
          <div className="h-1.5 bg-emerald-500" />
          <div className="flex gap-4 p-5">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-emerald-600">
              <IconCheck className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-600">
                Attendance marked
              </p>
              <h2 className="mt-1 text-xl font-bold">
                {event.employee?.name ?? `K60 User #${event.zk_user_id}`}
              </h2>
              <p className="mt-1 text-sm text-muted">
                Fingerprint verified and attendance saved at {new Date(event.check_in).toLocaleTimeString()}.
              </p>
              <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-lg bg-[#f7f4f3] p-2"><span className="block text-stone-400">Employee ID</span><strong>{event.employee?.employee_id ?? "Not mapped"}</strong></div>
                <div className="rounded-lg bg-[#f7f4f3] p-2"><span className="block text-stone-400">Department</span><strong>{event.employee?.department ?? "Not provided"}</strong></div>
                <div className="rounded-lg bg-[#f7f4f3] p-2"><span className="block text-stone-400">Position</span><strong>{event.employee?.position ?? "Not provided"}</strong></div>
                <div className="rounded-lg bg-[#f7f4f3] p-2"><span className="block text-stone-400">Phone</span><strong>{event.employee?.phone ?? "Not provided"}</strong></div>
              </div>
              <p className="mt-3 text-xs font-medium text-stone-400">
                Device UID {event.zk_user_id} · Record #{event.id}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      <PageHeader
        eyebrow="Operations"
        title="Attendance overview"
        description="Monitor devices, employees, and live K60 check-ins from one workspace."
        actions={
          <>
            <span className="hidden items-center gap-2 text-xs font-medium text-muted sm:flex">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              {monitorState === "online" ? "Device connected · Live" : monitorState === "offline" ? "Device offline" : "Connecting to device..."}
            </span>
            <Button onClick={handleManualSync} disabled={syncing}>
              <IconRefresh className="h-4 w-4" />
              {syncing ? "Checking..." : "Check now"}
            </Button>
          </>
        }
      />

      {syncMessage ? <div className="mb-6"><Alert>{syncMessage}</Alert></div> : null}

      {loading ? (
        <Card className="text-muted">Loading your workspace...</Card>
      ) : (
        <>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Employees"
              value={employees.length}
              detail="Registered people"
              tone="primary"
              icon={<IconEmployees className="h-5 w-5" />}
            />
            <StatCard
              label="Devices"
              value={devices.length}
              detail="Configured K60 units"
              tone="sky"
              icon={<IconDevices className="h-5 w-5" />}
            />
            <StatCard
              label="Attendance logs"
              value={attendance.length}
              detail="Imported records"
              tone="amber"
              icon={<IconAttendance className="h-5 w-5" />}
            />
            <StatCard
              label="Active devices"
              value={devices.filter((device) => device.status === "active").length}
              detail="Ready for monitoring"
              tone="emerald"
              icon={<IconCheck className="h-5 w-5" />}
            />
          </section>

          <section className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
            <Card>
              <CardHeader
                title="Connected devices"
                action={
                  <Link
                    href="/dashboard/devices"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  >
                    Manage devices
                    <IconArrowRight className="h-3.5 w-3.5" />
                  </Link>
                }
              />
              <div className="space-y-3">
                {devices.length ? (
                  devices.map((device) => (
                    <div
                      key={device.id}
                      className="flex items-center justify-between rounded-xl border border-border bg-[#fcfaf9] p-4"
                    >
                      <div className="flex items-center gap-3">
                        <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-50 text-sky-600">
                          <IconDevices className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-semibold">{device.name}</p>
                          <p className="text-xs text-muted">
                            {device.device_ip}:{device.port}
                          </p>
                        </div>
                      </div>
                      <span className="flex items-center gap-2 text-xs font-semibold capitalize text-emerald-600">
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        {device.status}
                      </span>
                    </div>
                  ))
                ) : (
                  <EmptyState text="No devices connected yet." href="/dashboard/devices" label="Add a device" />
                )}
              </div>
            </Card>

            <Card>
              <CardHeader
                title="Latest attendance"
                action={
                  <Link
                    href="/dashboard/attendance"
                    className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                  >
                    View all
                    <IconArrowRight className="h-3.5 w-3.5" />
                  </Link>
                }
              />
              <div className="space-y-1">
                {attendance.length ? (
                  attendance.slice(0, 6).map((row) => (
                    <div key={row.id} className="flex items-center justify-between rounded-xl px-2 py-3">
                      <div className="flex items-center gap-3">
                        <div className="grid h-9 w-9 place-items-center rounded-full bg-primary-soft text-sm font-bold text-primary">
                          {(row.employee?.name ?? "U").charAt(0)}
                        </div>
                        <div>
                          <p className="text-sm font-semibold">
                            {row.employee?.name ?? `K60 User #${row.zk_user_id}`}
                          </p>
                          <p className="text-xs text-muted">{new Date(row.check_in).toLocaleString()}</p>
                        </div>
                      </div>
                      <Badge tone="success">Present</Badge>
                    </div>
                  ))
                ) : (
                  <EmptyState
                    text="No attendance imported yet."
                    href="/dashboard/attendance"
                    label="Open attendance"
                  />
                )}
              </div>
            </Card>
          </section>
        </>
      )}
    </>
  );
}
