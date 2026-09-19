"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { IconArrowRight, IconBriefcase, IconPlus } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

type Company = { id: number; name: string; status: string; crm_websites?: { id: number }[] };

export default function CrmOverviewPage() {
  const [companies, setCompanies] = useState<Company[]>([]);

  useEffect(() => {
    fetch("/api/crm/companies", { cache: "no-store" }).then((response) => response.json()).then((result) => setCompanies(result.companies ?? [])).catch(() => setCompanies([]));
  }, []);

  return <>
    <PageHeader eyebrow="Business CRM" title="A clearer view of your business relationships" description="Set up your companies first. Leads, contacts, webmail, and campaigns will build on this foundation." actions={<Link href="/dashboard/crm/companies"><Button><IconBriefcase className="h-4 w-4" />Manage companies</Button></Link>} />
    <div className="grid gap-5 md:grid-cols-3">
      <Card><p className="text-sm font-medium text-muted">Companies</p><p className="mt-3 text-3xl font-bold">{companies.length}</p><p className="mt-2 text-xs text-muted">CRM workspaces created</p></Card>
      <Card><p className="text-sm font-medium text-muted">Websites</p><p className="mt-3 text-3xl font-bold">{companies.reduce((total, company) => total + (company.crm_websites?.length ?? 0), 0)}</p><p className="mt-2 text-xs text-muted">Connected company websites</p></Card>
      <Card><p className="text-sm font-medium text-muted">Next foundation</p><div className="mt-3"><Badge tone="primary">Company setup</Badge></div><p className="mt-2 text-xs text-muted">Create the first CRM company to begin.</p></Card>
    </div>
    <Card className="mt-5 overflow-hidden p-0"><div className="flex items-center justify-between border-b border-border px-5 py-4 sm:px-6"><div><h2 className="font-semibold">CRM workspace</h2><p className="mt-1 text-sm text-muted">Your company records are kept separate from Employee Management.</p></div><Link href="/dashboard/crm/companies" className="grid h-9 w-9 place-items-center rounded-lg text-muted hover:bg-primary-soft hover:text-primary" aria-label="Open companies"><IconArrowRight className="h-4 w-4" /></Link></div><div className="p-5 sm:p-6">{companies.length ? <div className="grid gap-3 sm:grid-cols-2">{companies.slice(0, 4).map((company) => <Link key={company.id} href="/dashboard/crm/companies" className="flex items-center justify-between rounded-xl border border-border px-4 py-3 transition hover:border-primary/30 hover:bg-primary-soft/40"><span className="font-semibold">{company.name}</span><Badge tone={company.status === "active" ? "success" : "neutral"}>{company.status}</Badge></Link>)}</div> : <div className="rounded-xl border border-dashed border-primary/30 bg-primary-soft/30 p-8 text-center"><IconPlus className="mx-auto h-6 w-6 text-primary" /><p className="mt-3 font-semibold">No CRM companies yet</p><p className="mt-1 text-sm text-muted">Create your first company workspace to get started.</p><Link href="/dashboard/crm/companies"><Button className="mt-4"><IconPlus className="h-4 w-4" />Add company</Button></Link></div>}</div></Card>
  </>;
}