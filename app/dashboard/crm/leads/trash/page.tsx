"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { IconArrowRight } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert, EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";

type Lead = { id: number; name: string; email: string; phone?: string | null; deleted_at?: string | null; crm_websites?: { name: string } | null; crm_companies?: { name: string } | null };
function date(value?: string | null) { return value ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Not provided"; }

export default function LeadTrashPage() {
  const [leads, setLeads] = useState<Lead[]>([]); const [message, setMessage] = useState(""); const [loading, setLoading] = useState(true);
  async function load() { setLoading(true); const response = await fetch("/api/crm/leads/trash", { cache: "no-store" }); const result = await response.json(); if (!response.ok) setMessage(result.error ?? "Could not load Trash."); else setLeads(result.leads ?? []); setLoading(false); }
  useEffect(() => { load(); }, []);
  async function action(id: number, actionName: "restore" | "permanent_delete") { const warning = actionName === "restore" ? "Restore this lead?" : "This will permanently delete the lead and cannot be undone. Continue?"; if (!window.confirm(warning)) return; const response = await fetch(`/api/crm/leads/${id}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: actionName }) }); const result = await response.json(); if (!response.ok) setMessage(result.error ?? "Could not update lead."); else await load(); }
  return <div><PageHeader eyebrow="Business CRM / Leads" title="Lead Trash" description="Restore leads or permanently remove leads without order history." actions={<Link href="/dashboard/crm/leads" className="inline-flex items-center gap-2 rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm font-semibold text-muted hover:border-primary/30 hover:text-primary">Back to Leads<IconArrowRight className="h-4 w-4" /></Link>} />{message ? <div className="mb-5"><Alert tone="danger">{message}</Alert></div> : null}<Card className="overflow-hidden p-0">{loading ? <div className="p-8"><EmptyState text="Loading Trash..." /></div> : leads.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm"><thead className="bg-[#fffaf8] text-xs uppercase tracking-[0.12em] text-stone-400"><tr><th className="px-5 py-3">Lead</th><th className="px-5 py-3">Company</th><th className="px-5 py-3">Website</th><th className="px-5 py-3">Deleted at</th><th className="px-5 py-3" /></tr></thead><tbody>{leads.map((lead) => <tr key={lead.id} className="border-t border-border"><td className="px-5 py-4"><p className="font-semibold">{lead.name}</p><p className="text-xs text-muted">{lead.email} · {lead.phone || "No phone"}</p></td><td className="px-5 py-4">{lead.crm_companies?.name || "Not provided"}</td><td className="px-5 py-4">{lead.crm_websites?.name || "Not provided"}</td><td className="px-5 py-4 text-muted">{date(lead.deleted_at)}</td><td className="px-5 py-4 text-right"><div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => action(lead.id, "restore")}>Restore</Button><button type="button" onClick={() => action(lead.id, "permanent_delete")} className="rounded-xl border border-rose-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-rose-700 hover:bg-rose-50">Delete permanently</button></div></td></tr>)}</tbody></table></div> : <div className="p-8"><EmptyState text="Trash is empty." /></div>}</Card></div>;
}