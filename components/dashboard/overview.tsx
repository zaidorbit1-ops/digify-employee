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
    if (!response.ok) throw new Error(data.error ?? "Could not load attendance feed.");
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
      await loadAttendance(true);
      setMonitorState("online");
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
      await loadAttendance(true);
      setMonitorState("online");
      setSyncMessage("Latest attendance data loaded.");
    } catch {
      setMonitorState("offline");
      setSyncMessage("Attendance feed is unavailable. Confirm the connector and website connection.");
    } finally {
      setSyncing(false);
    }
  }

  const todayKey = new Date().toLocaleDateString();
  const todayAttendance = attendance.filter((row) => new Date(row.check_in).toLocaleDateString() === todayKey);
  const mappedToday = todayAttendance.filter((row) => row.employee).length;
  const uniqueToday = new Set(todayAttendance.map((row) => row.employee?.id ?? `device-${row.zk_user_id}`)).size;
  const activeEmployees = employees.filter((employee) => employee.zk_device_uid != null).length;
  const coverage = employees.length ? Math.round((mappedToday / Math.max(uniqueToday, 1)) * 100) : 0;

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
              {monitorState === "online" ? "Data feed live" : monitorState === "offline" ? "Data feed unavailable" : "Connecting to data feed..."}
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
          <section className="mb-6 overflow-hidden rounded-[1.25rem] bg-[#241b19] text-white shadow-[0_18px_45px_rgba(36,27,25,0.12)]">
            <div className="grid gap-8 p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-end">
              <div>
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.16em] text-[#ffaaa2]"><span className="h-2 w-2 rounded-full bg-emerald-400" />Live operations room</div>
                <h2 className="mt-3 max-w-2xl text-2xl font-bold tracking-tight sm:text-3xl">A quieter way to see the whole office.</h2>
                <p className="mt-2 max-w-xl text-sm leading-6 text-stone-300">The connector is watching your K60 device continuously. New punches appear here as soon as they sync.</p>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:gap-3"><div className="rounded-xl bg-white/10 px-4 py-3"><p className="text-[10px] uppercase tracking-[0.12em] text-stone-400">Today</p><p className="mt-1 text-2xl font-bold">{uniqueToday}</p><p className="text-xs text-stone-300">active people</p></div><div className="rounded-xl bg-white/10 px-4 py-3"><p className="text-[10px] uppercase tracking-[0.12em] text-stone-400">Coverage</p><p className="mt-1 text-2xl font-bold">{Math.min(coverage, 100)}%</p><p className="text-xs text-stone-300">mapped punches</p></div></div>
            </div>
          </section>
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Employees"
              value={employees.length}
              detail={`${activeEmployees} mapped to a device`}
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
              detail={`${todayAttendance.length} received today`}
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

          <section className="mt-6 grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
            <Card className="p-5 sm:p-6">
              <div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Attendance signal</p><h2 className="mt-1 text-lg font-bold">Today&apos;s movement</h2></div><Badge tone={monitorState === "online" ? "success" : "danger"}>{monitorState === "online" ? "Live" : "Attention"}</Badge></div>
              <div className="mt-6 space-y-4"><SignalRow label="Punches received" value={todayAttendance.length} total={Math.max(employees.length, todayAttendance.length, 1)} color="bg-primary" /><SignalRow label="Mapped to employees" value={mappedToday} total={Math.max(todayAttendance.length, 1)} color="bg-emerald-500" /><SignalRow label="Configured devices" value={devices.filter((device) => device.status === "active").length} total={Math.max(devices.length, 1)} color="bg-sky-500" /></div>
              <div className="mt-6 flex items-center justify-between border-t border-border pt-4 text-xs text-muted"><span>Auto-check runs every second</span><button type="button" onClick={handleManualSync} className="font-semibold text-primary hover:underline">Run a check now</button></div>
            </Card>
            <Card className="p-5 sm:p-6"><div className="flex items-start justify-between gap-4"><div><p className="text-[10px] font-bold uppercase tracking-[0.16em] text-primary">Quick read</p><h2 className="mt-1 text-lg font-bold">Workspace health</h2></div><IconCheck className="h-5 w-5 text-emerald-500" /></div><div className="mt-5 grid gap-3 sm:grid-cols-3"><HealthItem label="Device link" value={monitorState === "online" ? "Connected" : "Offline"} tone={monitorState === "online" ? "emerald" : "rose"} /><HealthItem label="Employees" value={`${employees.length} records`} tone="sky" /><HealthItem label="Latest sync" value={attendance[0] ? new Date(attendance[0].check_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : "Waiting"} tone="amber" /></div><div className="mt-5 rounded-xl bg-[#fcfaf9] p-4"><p className="text-sm font-semibold">Keep the signal clean</p><p className="mt-1 text-xs leading-5 text-muted">A mapped device UID lets attendance flow straight into the employee timeline and reports.</p></div></Card>
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

function SignalRow({ label, value, total, color }: { label: string; value: number; total: number; color: string }) {
  const width = Math.min(100, Math.round((value / total) * 100));
  return <div><div className="mb-2 flex items-center justify-between text-xs"><span className="font-medium text-muted">{label}</span><strong>{value}</strong></div><div className="h-2 overflow-hidden rounded-full bg-stone-100"><div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${width}%` }} /></div></div>;
}

function HealthItem({ label, value, tone }: { label: string; value: string; tone: "emerald" | "rose" | "sky" | "amber" }) {
  const styles = { emerald: "bg-emerald-50 text-emerald-700", rose: "bg-rose-50 text-rose-700", sky: "bg-sky-50 text-sky-700", amber: "bg-amber-50 text-amber-700" };
  return <div className={`rounded-xl p-3 ${styles[tone]}`}><p className="text-[10px] font-bold uppercase tracking-[0.1em] opacity-70">{label}</p><p className="mt-2 text-sm font-bold">{value}</p></div>;
}
