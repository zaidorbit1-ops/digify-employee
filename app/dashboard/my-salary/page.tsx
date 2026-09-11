"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/empty-state";
import { IconDownload } from "@/components/icons";
import { PageHeader } from "@/components/ui/page-header";

function monthLabel(month: string) {
  const match = /^(\d{4})-(\d{2})/.exec(month);
  if (!match) return "-";
  return new Date(Number(match[1]), Number(match[2]) - 1, 1).toLocaleDateString(
    undefined,
    { month: "long", year: "numeric" },
  );
}

function dateLabel(date?: string | null) {
  return date ? new Date(date).toLocaleDateString() : "-";
}

export default function MySalaryPage() {
  const [records, setRecords] = useState<
    {
      id: number;
      month: string;
      base_salary: number;
      deduction_amount: number;
      net_pay: number;
      status: string;
      paid_at?: string | null;
      receipt_storage_path?: string | null;
      adjustment_note?: string | null;
    }[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/me/salaries", { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok)
          throw new Error(result.error ?? "Could not load salary history.");
        setRecords(result.salaries ?? []);
      })
      .catch((loadError) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Could not load salary history.",
        ),
      );
  }, []);
  const money = (value: number) =>
    Number(value || 0).toLocaleString("en-PK", {
      style: "currency",
      currency: "PKR",
    });
  return (
    <>
      <PageHeader
        eyebrow="Employee portal"
        title="My salary history"
        description="Review your monthly salary records, deductions, and paid status."
      />
      {error ? (
        <Alert tone="danger">{error}</Alert>
      ) : (
        <Card className="overflow-hidden p-0 sm:p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left text-sm">
              <thead className="bg-[#fcfaf9] text-[10px] uppercase tracking-[0.11em] text-stone-400">
                <tr>
                  <th className="px-5 py-3 font-bold">Month</th>
                  <th className="px-3 py-3 font-bold">Base salary</th>
                  <th className="px-3 py-3 font-bold">Deduction</th>
                  <th className="px-3 py-3 font-bold">Net pay</th>
                  <th className="px-3 py-3 font-bold">Status</th>
                  <th className="px-3 py-3 font-bold">Paid on</th>
                  <th className="px-5 py-3 text-right font-bold">Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {records.length ? (
                  records.map((record) => (
                    <tr key={record.id}>
                      <td className="px-5 py-4 font-semibold">
                        {monthLabel(record.month)}
                        {record.adjustment_note ? (
                          <p className="mt-1 text-xs font-normal text-muted">
                            {record.adjustment_note}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-4">{money(record.base_salary)}</td>
                      <td className="px-3 py-4 text-rose-700">
                        {money(record.deduction_amount)}
                      </td>
                      <td className="px-3 py-4 font-semibold text-emerald-700">
                        {money(record.net_pay)}
                      </td>
                      <td className="px-3 py-4">
                        <Badge
                          tone={
                            record.status === "paid" ? "success" : "warning"
                          }
                        >
                          {record.status}
                        </Badge>
                      </td>
                      <td className="px-3 py-4 text-muted">
                        {dateLabel(record.paid_at)}
                      </td>
                      <td className="px-5 py-4 text-right">
                        {record.receipt_storage_path ? (
                          <a
                            href={`/api/salaries/${record.id}/receipt`}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-2 text-xs font-semibold text-muted transition hover:border-primary/40 hover:bg-primary-soft hover:text-primary"
                          >
                            <IconDownload className="h-3.5 w-3.5" />
                            PDF
                          </a>
                        ) : (
                          <span className="text-xs text-muted">Pending</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-6 py-14 text-center text-sm text-muted"
                    >
                      No salary records yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
