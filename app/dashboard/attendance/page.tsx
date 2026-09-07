"use client";

import { useEffect, useState } from "react";
import { IconRefresh } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

type AttendanceRow = {
  id: number;
  employee_id?: number;
  zk_user_id: number;
  check_in: string;
  status?: string;
  device_log_id?: number;
  employee?: { name: string; employee_id: string } | null;
};

export default function AttendancePage() {
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadAttendance() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/attendance");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Could not load attendance.");
      setAttendance(data.attendance ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Could not load attendance.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAttendance();
  }, []);

  return (
    <>
      <PageHeader
        eyebrow="Attendance"
        title="Daily attendance logs"
        description="Records imported from your connected K60 device."
        actions={
          <Button variant="secondary" onClick={loadAttendance} disabled={loading}>
            <IconRefresh className="h-4 w-4" />
            {loading ? "Loading..." : "Refresh"}
          </Button>
        }
      />

      <Card>
        <CardHeader title="Logs" description={`${attendance.length} imported records`} />
        {error ? (
          <div className="mb-4">
            <Alert tone="danger">{error}</Alert>
          </div>
        ) : null}

        <div className="overflow-hidden rounded-xl border border-border">
          <table className="min-w-full divide-y divide-border text-left">
            <thead className="bg-[#fcfaf9] text-xs font-semibold uppercase tracking-wide text-muted">
              <tr>
                <th className="px-4 py-3">ID</th>
                <th className="px-4 py-3">Employee</th>
                <th className="px-4 py-3">Device UID</th>
                <th className="px-4 py-3">Check in</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border bg-white text-sm">
              {attendance.length ? (
                attendance.map((row) => (
                  <tr key={row.id} className="transition hover:bg-primary-soft/40">
                    <td className="px-4 py-3 text-muted">{row.id}</td>
                    <td className="px-4 py-3">
                      <p className="font-medium">{row.employee?.name ?? "Unknown K60 user"}</p>
                      {row.employee?.employee_id ? (
                        <p className="text-xs text-stone-400">{row.employee.employee_id}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">{row.zk_user_id}</td>
                    <td className="px-4 py-3">{new Date(row.check_in).toLocaleString()}</td>
                    <td className="px-4 py-3">
                      <Badge tone="primary">{row.status ?? "present"}</Badge>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted">
                    {loading ? "Loading attendance..." : "No attendance records yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </>
  );
}
