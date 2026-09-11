"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  IconArrowRight,
  IconAttendance,
  IconCalendar,
  IconCheck,
  IconFingerprint,
  IconSalary,
} from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/empty-state";

type Data = {
  employee: {
    name: string;
    employee_id?: string | null;
    joining_date?: string | null;
    status?: string | null;
  };
  attendance: {
    id?: number;
    check_in: string;
    session_end?: string | null;
    worked_minutes?: number | null;
    arrival_status?: string | null;
  }[];
  salaries: { id?: number; month: string; net_pay: number; status: string }[];
  leaves: {
    id?: number;
    start_date?: string;
    end_date?: string;
    reason?: string;
    status: string;
  }[];
};

const money = (value: number) =>
  Number(value || 0).toLocaleString("en-PK", {
    style: "currency",
    currency: "PKR",
    maximumFractionDigits: 0,
  });

const shortDate = (value?: string | null) =>
  value
    ? new Date(value).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      })
    : "-";

function formatDuration(minutes: number) {
  return `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}m`;
}

export function EmployeeHome() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    fetch("/api/me", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error ?? "Could not load dashboard.");
        setData(result);
      })
      .catch((loadError) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load dashboard.",
        ),
      );
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!data)
    return (
      <Card className="p-8 text-sm text-muted">Loading your dashboard...</Card>
    );

  const latestSalary = data.salaries[0];
  const pendingLeaves = data.leaves.filter(
    (leave) => leave.status === "pending",
  ).length;
  const approvedLeaves = data.leaves.filter(
    (leave) => leave.status === "approved",
  ).length;
  const presentDays = new Set(
    data.attendance.map((record) => record.check_in.slice(0, 10)),
  ).size;
  const lateArrivals = data.attendance.filter(
    (record) => record.arrival_status === "late",
  ).length;
  const completedSessions = data.attendance.filter(
    (record) => record.session_end,
  ).length;
  const openSession = data.attendance.find((record) => !record.session_end);
  const elapsedMinutes = openSession
    ? Math.max(
        0,
        Math.floor((now - new Date(openSession.check_in).getTime()) / 60000),
      )
    : 0;

  return (
    <div className="employee-dashboard space-y-5">
      <section className="employee-dashboard-enter relative overflow-hidden rounded-[1.5rem] bg-[#241b19] px-6 py-7 text-white shadow-[0_24px_60px_rgba(74,43,39,0.18)] sm:px-8 sm:py-9">
        <div className="employee-dashboard-glow pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full border-[32px] border-[#ffaaa2]/20" />
        <div className="employee-dashboard-glow employee-dashboard-glow--small pointer-events-none absolute -bottom-28 right-48 h-52 w-52 rounded-full border-[22px] border-[#ffd4a8]/15" />
        <div className="relative z-10 grid gap-8 lg:grid-cols-[1fr_320px] lg:items-center">
          <div>
            <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[#ffaaa2]">
              <span className="h-2 w-2 rounded-full bg-emerald-400 shadow-[0_0_0_5px_rgba(52,211,153,0.14)]" />
              Your workspace
            </div>
            <h1 className="mt-4 max-w-2xl text-2xl font-bold leading-tight tracking-tight sm:text-4xl">
              Hey {data.employee.name.split(" ")[0]}, you&apos;re on the move.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-stone-300">
              Keep an eye on your day, your pay, and the little wins in between.
            </p>
            <Link
              href="/dashboard/employee/leave"
              className="mt-6 inline-block"
            >
              <Button className="bg-[#ff6f68] shadow-[0_10px_25px_rgba(255,111,104,0.25)] hover:bg-[#ff817a]">
                Plan some time off <IconArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <div className="mt-6 flex flex-wrap items-center gap-2 text-xs text-stone-300">
              <span className="rounded-full bg-white/10 px-3 py-1.5">
                ID {data.employee.employee_id ?? "-"}
              </span>
              <span className="rounded-full bg-emerald-400/15 px-3 py-1.5 text-emerald-200">
                {data.employee.status ?? "active"}
              </span>
              <span className="rounded-full bg-white/10 px-3 py-1.5">
                Joined {shortDate(data.employee.joining_date)}
              </span>
            </div>
          </div>
          <div
            className={`rounded-[1.25rem] border p-5 ${openSession ? "border-emerald-300/30 bg-emerald-400/10" : "border-white/10 bg-white/5"}`}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-stone-300">
                Today&apos;s punch
              </p>
              <span
                className={`flex items-center gap-1.5 text-xs font-semibold ${openSession ? "text-emerald-300" : "text-stone-400"}`}
              >
                <span
                  className={`h-2 w-2 rounded-full ${openSession ? "bg-emerald-400 employee-fingerprint-dot" : "bg-stone-500"}`}
                />
                {openSession ? "Checked in" : "Not checked in"}
              </span>
            </div>
            <div className="mt-4 flex items-center gap-4">
              <div
                className={`employee-fingerprint ${openSession ? "employee-fingerprint--active" : "employee-fingerprint--idle"}`}
              >
                <IconFingerprint className="h-12 w-12" />
              </div>
              <div>
                <p className="text-2xl font-bold">
                  {openSession ? formatDuration(elapsedMinutes) : "--:--"}
                </p>
                <p className="mt-1 text-xs text-stone-400">
                  {openSession
                    ? `Since ${new Date(openSession.check_in).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
                    : "Use the device to start your day"}
                </p>
              </div>
            </div>
            <p className="mt-4 text-xs leading-5 text-stone-300">
              {openSession
                ? "Your attendance is live. Your next device punch will close this session."
                : "Your fingerprint punch will appear here when you check in."}
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <DashboardStat
          delay="delay-1"
          icon={<IconAttendance className="h-5 w-5" />}
          label="Days present"
          value={presentDays}
          detail={`${data.attendance.length} recent punches`}
          tone="coral"
        />
        <DashboardStat
          delay="delay-2"
          icon={<IconCheck className="h-5 w-5" />}
          label="Sessions closed"
          value={completedSessions}
          detail={`${lateArrivals} late arrival${lateArrivals === 1 ? "" : "s"}`}
          tone="emerald"
        />
        <DashboardStat
          delay="delay-3"
          icon={<IconSalary className="h-5 w-5" />}
          label="Latest take-home"
          value={latestSalary ? money(latestSalary.net_pay) : "Not ready"}
          detail={latestSalary?.status ?? "No salary record yet"}
          tone="sky"
        />
        <DashboardStat
          delay="delay-4"
          icon={<IconCalendar className="h-5 w-5" />}
          label="Leave requests"
          value={data.leaves.length}
          detail={`${pendingLeaves} pending · ${approvedLeaves} approved`}
          tone="amber"
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="employee-dashboard-enter delay-2 overflow-hidden p-0">
          <div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-6">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-primary">
                Your rhythm
              </p>
              <h2 className="mt-1 text-lg font-bold">Recent activity</h2>
            </div>
            <Link
              href="/dashboard/employee/attendance"
              className="text-xs font-semibold text-primary hover:underline"
            >
              See attendance <IconArrowRight className="inline h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="divide-y divide-border">
            {data.attendance.slice(0, 4).map((record, index) => (
              <div
                key={record.id ?? `${record.check_in}-${index}`}
                className="flex items-center gap-4 px-5 py-4 transition hover:bg-[#fffafa] sm:px-6"
              >
                <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                  <IconAttendance className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">
                    {new Date(record.check_in).toLocaleDateString(undefined, {
                      weekday: "short",
                      month: "short",
                      day: "numeric",
                    })}
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    In{" "}
                    {new Date(record.check_in).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}{" "}
                    · {record.session_end ? "Session closed" : "In progress"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">
                    {record.worked_minutes != null
                      ? `${Math.floor(record.worked_minutes / 60)}h ${record.worked_minutes % 60}m`
                      : "Live"}
                  </p>
                  <Badge
                    tone={
                      record.arrival_status === "late" ? "warning" : "success"
                    }
                  >
                    {record.arrival_status === "late" ? "Late" : "On time"}
                  </Badge>
                </div>
              </div>
            ))}
            {!data.attendance.length ? (
              <div className="px-6 py-12 text-center text-sm text-muted">
                Your attendance activity will appear here.
              </div>
            ) : null}
          </div>
        </Card>

        <Card className="employee-dashboard-enter delay-3 p-5 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-primary">
                Stay in the loop
              </p>
              <h2 className="mt-1 text-lg font-bold">Latest update</h2>
            </div>
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-50 text-amber-600">
              <IconCalendar className="h-5 w-5" />
            </span>
          </div>
          {data.leaves[0] ? (
            <div className="mt-6 rounded-2xl bg-[#fff8ef] p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="text-sm font-bold">Leave request</p>
                <Badge
                  tone={
                    data.leaves[0].status === "approved"
                      ? "success"
                      : data.leaves[0].status === "declined"
                        ? "danger"
                        : "warning"
                  }
                >
                  {data.leaves[0].status}
                </Badge>
              </div>
              <p className="mt-3 text-sm text-stone-700">
                {data.leaves[0].reason}
              </p>
              <p className="mt-2 text-xs text-muted">
                {shortDate(data.leaves[0].start_date)} →{" "}
                {shortDate(data.leaves[0].end_date)}
              </p>
            </div>
          ) : (
            <div className="mt-6 rounded-2xl bg-[#fcfaf9] p-4">
              <p className="text-sm font-semibold">No leave requests yet</p>
              <p className="mt-1 text-xs leading-5 text-muted">
                Need a reset? Submit a request and your admin will review it.
              </p>
            </div>
          )}
          <Link
            href="/dashboard/employee/leave"
            className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
          >
            Open leave requests <IconArrowRight className="h-3.5 w-3.5" />
          </Link>
        </Card>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <QuickAction
          href="/dashboard/employee/attendance"
          icon={<IconAttendance className="h-5 w-5" />}
          title="My attendance"
          description="Punches, hours and rhythm"
        />
        <QuickAction
          href="/dashboard/employee/salary"
          icon={<IconSalary className="h-5 w-5" />}
          title="My salary"
          description="Payslips and payout history"
        />
        <QuickAction
          href="/dashboard/employee/leave"
          icon={<IconCalendar className="h-5 w-5" />}
          title="Request leave"
          description="Plan your next break"
        />
      </section>
    </div>
  );
}

function DashboardStat({
  icon,
  label,
  value,
  detail,
  tone,
  delay,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  detail: string;
  tone: "coral" | "emerald" | "sky" | "amber";
  delay: string;
}) {
  const colors = {
    coral: "bg-primary-soft text-primary",
    emerald: "bg-emerald-50 text-emerald-600",
    sky: "bg-sky-50 text-sky-600",
    amber: "bg-amber-50 text-amber-600",
  };
  return (
    <Card className={`employee-dashboard-enter ${delay} p-4 sm:p-5`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted">{label}</p>
          <p className="mt-2 truncate text-2xl font-bold tracking-tight">
            {value}
          </p>
        </div>
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${colors[tone]}`}
        >
          {icon}
        </span>
      </div>
      <p className="mt-3 text-xs text-muted">{detail}</p>
    </Card>
  );
}

function QuickAction({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="employee-dashboard-enter group flex items-center gap-3 rounded-2xl border border-border bg-white p-4 transition duration-200 hover:-translate-y-1 hover:border-primary/30 hover:shadow-[0_14px_30px_rgba(94,67,63,0.08)]"
    >
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary transition group-hover:rotate-6">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block font-semibold">{title}</span>
        <span className="mt-0.5 block truncate text-xs text-muted">
          {description}
        </span>
      </span>
      <IconArrowRight className="ml-auto h-4 w-4 text-stone-300 transition group-hover:translate-x-1 group-hover:text-primary" />
    </Link>
  );
}
