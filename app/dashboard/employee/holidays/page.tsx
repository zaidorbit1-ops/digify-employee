"use client";

import { useEffect, useState } from "react";
import { IconCalendar } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/empty-state";
import { TextInput } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";

type Holiday = {
  id: number;
  title: string;
  start_date: string;
  end_date: string;
};
const formatDate = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

export default function EmployeeHolidaysPage() {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch(`/api/me/holidays?month=${month}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error ?? "Could not load holidays.");
        setHolidays(result.holidays ?? []);
      })
      .catch((loadError) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load holidays.",
        ),
      );
  }, [month]);
  return (
    <>
      <PageHeader
        eyebrow="Employee portal"
        title="Company holidays"
        description="See scheduled holidays for the selected month. Holiday dates are not counted as absences or salary deductions."
      />
      <Card className="mb-5 p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-primary">
              Month view
            </p>
            <h2 className="mt-1 text-lg font-bold">Your holiday calendar</h2>
          </div>
          <label>
            <span className="sr-only">Select month</span>
            <TextInput
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
            />
          </label>
        </div>
      </Card>
      {error ? (
        <Alert tone="danger">{error}</Alert>
      ) : (
        <Card className="overflow-hidden p-0 sm:p-0">
          <div className="border-b border-border bg-[#fcfaf9] p-5">
            <p className="text-sm font-semibold">
              {holidays.length
                ? `${holidays.length} holiday${holidays.length === 1 ? "" : "s"} this month`
                : "No holidays this month"}
            </p>
          </div>
          <div className="divide-y divide-border">
            {holidays.length ? (
              holidays.map((holiday) => (
                <div key={holiday.id} className="flex items-center gap-4 p-5">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                    <IconCalendar className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{holiday.title}</p>
                      <Badge tone="primary">Holiday</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted">
                      {formatDate(holiday.start_date)}
                      {holiday.start_date === holiday.end_date
                        ? ""
                        : ` to ${formatDate(holiday.end_date)}`}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="px-6 py-16 text-center text-sm text-muted">
                There are no scheduled holidays for this month.
              </div>
            )}
          </div>
        </Card>
      )}
    </>
  );
}
