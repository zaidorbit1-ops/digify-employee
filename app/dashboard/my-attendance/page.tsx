"use client";

import { useEffect, useMemo, useState } from "react";
import {
  IconAttendance,
  IconCalendar,
  IconCheck,
  IconRefresh,
} from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/empty-state";
import { TextInput } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";

type AttendanceRecord = {
  id: number;
  check_in?: string | null;
  status?: string | null;
  day_status?: string | null;
  arrival_status?: string | null;
  worked_minutes?: number | null;
  session_end?: string | null;
  date: string;
  upcoming?: boolean;
};

const monthNow = new Date().toISOString().slice(0, 7);
const time = (value?: string | null) =>
  value
    ? new Date(value).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : "-";
const date = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
const fullMonth = (value: string) =>
  new Date(`${value}-01T00:00:00`).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

export default function MyAttendancePage() {
  const [month, setMonth] = useState(monthNow);
  const [records, setRecords] = useState<AttendanceRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadAttendance() {
    setError(null);
    try {
      const response = await fetch(`/api/me/attendance?month=${month}`, {
        cache: "no-store",
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error ?? "Could not load attendance.");
      setRecords(
        [...(result.attendance ?? [])].sort((first, second) =>
          first.date.localeCompare(second.date),
        ),
      );
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Could not load attendance.",
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    loadAttendance();
    const timer = window.setInterval(loadAttendance, 30000);
    return () => window.clearInterval(timer);
  }, [month]);

  const summary = useMemo(() => {
    const present = records.filter(
      (record) => record.status === "present",
    ).length;
    const halfDays = records.filter(
      (record) => record.status === "half_day",
    ).length;
    const leave = records.filter((record) => record.status === "leave").length;
    const absent = records.filter(
      (record) => record.status === "absent",
    ).length;
    const upcoming = records.filter((record) => record.upcoming).length;
    const late = records.filter(
      (record) => record.arrival_status === "late",
    ).length;
    const worked = records.reduce(
      (total, record) => total + (record.worked_minutes ?? 0),
      0,
    );
    const active = [...records]
      .reverse()
      .find((record) => record.check_in && !record.session_end);
    return { present, halfDays, leave, absent, upcoming, late, worked, active };
  }, [records]);

  return (
    <>
      <PageHeader
        eyebrow="Employee portal"
        title="My attendance"
        description="Your month, clearly laid out. Real punches, daily status, and what is still ahead."
        actions={
          <Button
            variant="secondary"
            onClick={() => {
              setRefreshing(true);
              loadAttendance();
            }}
            disabled={loading || refreshing}
          >
            <IconRefresh className="h-4 w-4" />
            {refreshing ? "Refreshing..." : "Refresh"}
          </Button>
        }
      />
      {error ? (
        <div className="mb-5">
          <Alert tone="danger">{error}</Alert>
        </div>
      ) : null}

      <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <SummaryCard
          icon={<IconCalendar className="h-5 w-5" />}
          label="Present days"
          value={summary.present}
          detail="Full working days"
          tone="coral"
        />
        <SummaryCard
          icon={<IconCalendar className="h-5 w-5" />}
          label="Absent days"
          value={summary.absent}
          detail="No punch recorded"
          tone="amber"
        />
        <SummaryCard
          icon={<IconCheck className="h-5 w-5" />}
          label="Late days"
          value={summary.late}
          detail="Arrived after shift time"
          tone="sky"
        />
        <SummaryCard
          icon={<IconCalendar className="h-5 w-5" />}
          label="Half days"
          value={summary.halfDays}
          detail="Short working sessions"
          tone="amber"
        />
        <SummaryCard
          icon={<IconAttendance className="h-5 w-5" />}
          label="Hours logged"
          value={`${Math.floor(summary.worked / 60)}h ${summary.worked % 60}m`}
          detail="Completed sessions only"
          tone="sky"
        />
        <SummaryCard
          icon={<IconCalendar className="h-5 w-5" />}
          label="Upcoming"
          value={summary.upcoming}
          detail={`${summary.leave} approved leave`}
          tone="emerald"
        />
      </section>

      <Card className="mb-5 overflow-hidden p-0 sm:p-0">
        <div className="flex flex-col gap-4 border-b border-border bg-[#241b19] px-5 py-5 text-white sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-[#ffaaa2]">
              Attendance journal
            </p>
            <h2 className="mt-1 text-xl font-bold">{fullMonth(month)}</h2>
            <p className="mt-1 text-sm text-stone-300">
              Every working day in one view
            </p>
          </div>
          <label className="block">
            <span className="sr-only">Select month</span>
            <TextInput
              className="border-white/15 bg-white/10 text-white [color-scheme:dark]"
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border px-5 py-3 text-xs text-muted sm:px-6">
          <span>
            <i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-emerald-500" />
            Present
          </span>
          <span>
            <i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-rose-400" />
            Absent
          </span>
          <span>
            <i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-amber-400" />
            Half day / late
          </span>
          <span>
            <i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-stone-300" />
            Upcoming
          </span>
        </div>
        <div>
          {loading ? (
            <LoadingRows />
          ) : records.length ? (
            records.map((record) => (
              <AttendanceRow key={record.id} record={record} />
            ))
          ) : (
            <div className="px-6 py-16 text-center text-sm text-muted">
              No working days found for this month.
            </div>
          )}
        </div>
      </Card>

      {summary.active ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
          Your latest session is still open. Check-out will appear after your
          next device punch.
        </div>
      ) : null}
    </>
  );
}

function AttendanceRow({ record }: { record: AttendanceRecord }) {
  const status = record.status;
  const isUpcoming = record.upcoming || status === null;
  const isAbsent = status === "absent";
  const isLeave = status === "leave";
  const isHalf = status === "half_day";
  const tone = isUpcoming
    ? "neutral"
    : isAbsent
      ? "danger"
      : isLeave
        ? "primary"
        : isHalf || record.arrival_status === "late"
          ? "warning"
          : "success";
  const label = isUpcoming
    ? "Upcoming"
    : isAbsent
      ? "Absent"
      : isLeave
        ? "Leave"
        : isHalf
          ? "Half day"
          : record.arrival_status === "late"
            ? "Late"
            : "Present";
  return (
    <div
      className={`grid items-center gap-4 border-b border-border px-5 py-4 last:border-b-0 sm:grid-cols-[minmax(180px,1fr)_1fr_1fr_1fr_auto] sm:px-6 ${isUpcoming ? "bg-stone-50/45" : "hover:bg-[#fffafa]"}`}
    >
      <div className="flex items-center gap-3">
        <span
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${isUpcoming ? "bg-stone-100 text-stone-400" : isAbsent ? "bg-rose-50 text-rose-500" : "bg-primary-soft text-primary"}`}
        >
          <IconCalendar className="h-4 w-4" />
        </span>
        <div>
          <p className="font-semibold">{date(record.date)}</p>
          <p className="mt-0.5 text-xs text-muted">{record.date}</p>
        </div>
      </div>
      <Info
        label="Check-in"
        value={isUpcoming || !record.check_in ? "-" : time(record.check_in)}
      />
      <Info
        label="Check-out"
        value={
          isUpcoming || !record.session_end ? "-" : time(record.session_end)
        }
      />
      <Info
        label="Worked"
        value={
          isUpcoming
            ? "-"
            : record.worked_minutes != null
              ? `${Math.floor(record.worked_minutes / 60)}h ${record.worked_minutes % 60}m`
              : record.check_in
                ? "In progress"
                : "-"
        }
      />
      <Badge tone={tone}>{label}</Badge>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-400">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function SummaryCard({
  icon,
  label,
  value,
  detail,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | number;
  detail: string;
  tone: "coral" | "sky" | "amber" | "emerald";
}) {
  const colors = {
    coral: "bg-primary-soft text-primary",
    sky: "bg-sky-50 text-sky-600",
    amber: "bg-amber-50 text-amber-600",
    emerald: "bg-emerald-50 text-emerald-600",
  };
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-muted">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
        </div>
        <span
          className={`grid h-10 w-10 place-items-center rounded-xl ${colors[tone]}`}
        >
          {icon}
        </span>
      </div>
      <p className="mt-3 text-xs text-muted">{detail}</p>
    </Card>
  );
}

function LoadingRows() {
  return (
    <>
      {[1, 2, 3, 4, 5].map((item) => (
        <div
          key={item}
          className="flex animate-pulse items-center gap-4 border-b border-border px-5 py-5 sm:px-6"
        >
          <div className="h-10 w-10 rounded-xl bg-stone-100" />
          <div className="h-3 w-36 rounded bg-stone-100" />
          <div className="ml-auto h-3 w-20 rounded bg-stone-100" />
        </div>
      ))}
    </>
  );
}
