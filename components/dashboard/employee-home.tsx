"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

type Data = { employee: { name: string; employee_id?: string | null; salary?: number | null }; attendance: { check_in: string; day_status?: string | null }[]; salaries: { month: string; net_pay: number; status: string }[]; leaves: { status: string }[] };

export function EmployeeHome() {
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/me", { cache: "no-store" }).then(async (response) => { const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Could not load dashboard."); setData(result); }).catch((loadError) => setError(loadError instanceof Error ? loadError.message : "Could not load dashboard."));
  }, []);

  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!data) return <Card className="p-8 text-sm text-muted">Loading your dashboard...</Card>;

  const latestSalary = data.salaries[0];
  const pendingLeaves = data.leaves.filter((leave) => leave.status === "pending").length;
  return <>
    <PageHeader eyebrow="Employee dashboard" title={`Welcome, ${data.employee.name}`} description={`Employee ID ${data.employee.employee_id ?? "-"}. Review your attendance, salary history, and leave requests.`} actions={<Link href="/dashboard/employee/leave"><Button>Apply for leave</Button></Link>} />
    <div className="grid gap-4 md:grid-cols-3"><Card className="p-5"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-400">Recent attendance</p><p className="mt-2 text-2xl font-bold">{data.attendance.length}</p><p className="mt-1 text-xs text-muted">Latest records available</p></Card><Card className="p-5"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-400">Latest salary</p><p className="mt-2 text-2xl font-bold text-emerald-700">{latestSalary ? Number(latestSalary.net_pay).toLocaleString("en-PK", { style: "currency", currency: "PKR" }) : "Not generated"}</p><p className="mt-1 text-xs text-muted">{latestSalary?.status ?? "No salary record"}</p></Card><Card className="p-5"><p className="text-[10px] font-bold uppercase tracking-[0.12em] text-stone-400">Leave requests</p><p className="mt-2 text-2xl font-bold">{data.leaves.length}</p><p className="mt-1 text-xs text-muted">{pendingLeaves} pending review</p></Card></div>
    <Card className="mt-5 p-5 sm:p-6"><div className="flex items-center justify-between"><div><h2 className="text-base font-semibold">Quick access</h2><p className="mt-1 text-sm text-muted">Your personal workspace</p></div><Badge tone="success">Employee</Badge></div><div className="mt-5 grid gap-3 sm:grid-cols-3"><Link href="/dashboard/employee/attendance" className="rounded-xl border border-border p-4 hover:border-primary/40 hover:bg-primary-soft"><p className="font-semibold">My attendance</p><p className="mt-1 text-xs text-muted">Review your punch records</p></Link><Link href="/dashboard/employee/salary" className="rounded-xl border border-border p-4 hover:border-primary/40 hover:bg-primary-soft"><p className="font-semibold">My salary history</p><p className="mt-1 text-xs text-muted">View paid and pending salary</p></Link><Link href="/dashboard/employee/leave" className="rounded-xl border border-border p-4 hover:border-primary/40 hover:bg-primary-soft"><p className="font-semibold">Apply for leave</p><p className="mt-1 text-xs text-muted">Submit a date range and reason</p></Link></div></Card>
  </>;
}
