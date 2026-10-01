"use client";

import { useEffect, useState } from "react";
import { Alert } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

type LogLevel = "success" | "info" | "warning" | "error";
type SystemLog = { id: number; created_at: string; level: LogLevel; source: string; event: string; message: string; route: string | null; request_id: string | null; company_id: number | null; metadata: Record<string, unknown> };

const levelTone: Record<LogLevel, "success" | "neutral" | "warning" | "danger"> = { success: "success", info: "neutral", warning: "warning", error: "danger" };

function formattedDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Unknown time" : new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "medium" }).format(date);
}

export default function CrmLogsPage() {
  const [logs, setLogs] = useState<SystemLog[]>([]);
  const [level, setLevel] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadLogs() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (level !== "all") params.set("level", level);
      if (search.trim()) params.set("search", search.trim());
      const response = await fetch(`/api/crm/logs?${params}`, { cache: "no-store" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not load system logs.");
      setLogs(result.logs ?? []);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not load system logs.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void loadLogs(); }, [level]);

  return <>
    <PageHeader eyebrow="Business CRM / Operations" title="System logs" description="Recent CRM, campaign, and email processing outcomes." actions={<Button variant="secondary" loading={loading} onClick={() => void loadLogs()}>Refresh</Button>} />
    {error ? <div className="mb-5"><Alert tone="danger">{error}</Alert></div> : null}
    <Card className="mb-5 p-4">
      <div className="grid gap-3 sm:grid-cols-[180px_minmax(220px,1fr)_auto] sm:items-end">
        <label className="block text-sm font-semibold">Level<select value={level} onChange={(event) => setLevel(event.target.value)} className="mt-1.5 h-10 w-full rounded-lg border border-border bg-white px-3 text-sm"><option value="all">All levels</option><option value="error">Error</option><option value="warning">Warning</option><option value="success">Success</option><option value="info">Info</option></select></label>
        <label className="block text-sm font-semibold">Search<input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void loadLogs(); }} placeholder="Event, message, source, or route" className="mt-1.5 h-10 w-full rounded-lg border border-border bg-white px-3 text-sm font-normal" /></label>
        <Button variant="secondary" loading={loading} onClick={() => void loadLogs()}>Apply</Button>
      </div>
    </Card>
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h2 className="font-semibold">Latest activity</h2><p className="mt-1 text-xs text-muted">Showing up to 300 newest records; older records are automatically removed.</p></div><span className="text-xs text-muted">{logs.length} records</span></div>
      {!logs.length && !loading ? <div className="p-8 text-center text-sm text-muted">No system logs recorded yet.</div> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left text-sm"><thead className="bg-[#f7f9f7] text-xs uppercase text-muted"><tr><th className="px-5 py-3">Time</th><th className="px-5 py-3">Level</th><th className="px-5 py-3">Source / Event</th><th className="px-5 py-3">Result</th><th className="px-5 py-3">Route</th><th className="px-5 py-3">Details</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id} className="border-t border-border align-top"><td className="whitespace-nowrap px-5 py-4 text-xs text-muted">{formattedDate(log.created_at)}</td><td className="px-5 py-4"><Badge tone={levelTone[log.level]}>{log.level}</Badge></td><td className="px-5 py-4"><p className="font-semibold">{log.source}</p><p className="mt-1 text-xs text-muted">{log.event}</p></td><td className="max-w-[360px] px-5 py-4">{log.message}</td><td className="max-w-[260px] break-all px-5 py-4 text-xs text-muted">{log.route || "-"}</td><td className="px-5 py-4"><details><summary className="cursor-pointer text-xs font-semibold text-primary">View</summary><pre className="mt-2 max-w-[420px] overflow-auto whitespace-pre-wrap break-words rounded-md bg-[#f7f9f7] p-3 text-xs">{JSON.stringify({ request_id: log.request_id, company_id: log.company_id, ...log.metadata }, null, 2)}</pre></details></td></tr>)}</tbody></table></div>}
    </Card>
  </>;
}