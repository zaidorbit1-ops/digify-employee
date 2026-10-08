"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { IconArrowLeft, IconMail, IconRefresh } from "@/components/icons";
import { Alert } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";

type Company = { id: number; name: string };
type CompanyDebug = {
  company: Company | null;
  mailboxes: Array<{
    id: number;
    email_address: string;
    provider: string;
    status: string;
    has_brevo_key: boolean;
    key_name: string;
    debug_message: string;
  }>;
};

export default function CampaignDebugPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [checks, setChecks] = useState<Record<number, CompanyDebug>>({});
  const [busy, setBusy] = useState<Record<number, string>>({});
  const [message, setMessage] = useState<{ text: string; tone: "success" | "danger" } | null>(null);

  async function loadCompanies() {
    const response = await fetch("/api/crm/companies", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not load companies.");
    setCompanies(result.companies ?? []);
  }

  async function runCompanyDebug(companyId: number) {
    setBusy((current) => ({ ...current, [companyId]: "debug" }));
    setMessage(null);
    try {
      const response = await fetch("/api/crm/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "debug-company", company_id: companyId }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not run delivery diagnostics.");
      setChecks((current) => ({ ...current, [companyId]: result }));
      setMessage({ text: `Diagnostics completed for ${result.company?.name ?? "this company"}.`, tone: "success" });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not run delivery diagnostics.", tone: "danger" });
    } finally {
      setBusy((current) => ({ ...current, [companyId]: "" }));
    }
  }

  async function sendTestMail(companyId: number, mailboxId: number) {
    setBusy((current) => ({ ...current, [companyId]: "mail" }));
    setMessage(null);
    try {
      const response = await fetch("/api/crm/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "send_test_email", mailbox_id: mailboxId, to: "zaidorbit1@gmail.com", subject: "CRM Brevo test email", html_body: "<p>CRM Brevo diagnostic email.</p>", text_body: "CRM Brevo diagnostic email." }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not send diagnostic email.");
      setMessage({ text: result.message ?? "Diagnostic email sent successfully.", tone: "success" });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not send diagnostic email.", tone: "danger" });
    } finally {
      setBusy((current) => ({ ...current, [companyId]: "" }));
    }
  }

  useEffect(() => {
    void loadCompanies().catch((error) => setMessage({ text: error instanceof Error ? error.message : "Could not load companies.", tone: "danger" }));
  }, []);

  return (
    <>
      <div className="space-y-6 pb-10">
        <PageHeader
          eyebrow="Business CRM / Delivery diagnostics"
          title="Brevo delivery debug"
          description="Review each company, test its sender configuration, and send a live diagnostic mail to zaidorbit1@gmail.com."
          actions={
            <Link href="/dashboard/crm/campaigns">
              <Button variant="secondary"><IconArrowLeft className="h-4 w-4" />Back to campaigns</Button>
            </Link>
          }
        />

        {message ? <Alert tone={message.tone}>{message.text}</Alert> : null}

        {companies.length ? (
          <div className="grid gap-4 xl:grid-cols-2">
            {companies.map((company) => {
              const companyDebug = checks[company.id];
              const debugBusy = busy[company.id] === "debug";
              const mailBusy = busy[company.id] === "mail";
              const connectedMailboxes = companyDebug?.mailboxes.filter((mailbox) => mailbox.status === "connected") ?? [];
              return (
                <Card key={company.id} className="border-stone-200 bg-white p-5 shadow-[0_10px_30px_rgba(28,20,18,0.04)]">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500">Company</p>
                      <h3 className="mt-2 text-xl font-bold text-stone-900">{company.name}</h3>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" onClick={() => void runCompanyDebug(company.id)} disabled={debugBusy}>
                        <IconRefresh className="h-4 w-4" />{debugBusy ? "Checking..." : "Test Brevo"}
                      </Button>
                      <Button onClick={() => {
                        const firstMailbox = connectedMailboxes[0];
                        if (!firstMailbox) {
                          setMessage({ text: `No connected mailbox exists for ${company.name}.`, tone: "danger" });
                          return;
                        }
                        void sendTestMail(company.id, firstMailbox.id);
                      }} disabled={mailBusy || !connectedMailboxes.length}>
                        <IconMail className="h-4 w-4" />{mailBusy ? "Sending..." : "Test mail"}
                      </Button>
                    </div>
                  </div>

                  <div className="mt-5 space-y-3">
                    {companyDebug?.mailboxes.length ? (
                      companyDebug.mailboxes.map((mailbox) => (
                        <div key={mailbox.id} className="rounded-2xl border border-stone-200 bg-stone-50 p-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="font-semibold text-stone-900">{mailbox.email_address}</p>
                              <p className="text-xs text-stone-500">{mailbox.provider} · {mailbox.status}</p>
                            </div>
                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.15em] ${mailbox.has_brevo_key ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700"}`}>
                              {mailbox.has_brevo_key ? "BREVO OK" : "MISSING KEY"}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-stone-600">{mailbox.debug_message}</p>
                          {mailbox.status === "connected" ? (
                            <div className="mt-3">
                              <Button variant="secondary" onClick={() => void sendTestMail(company.id, mailbox.id)} disabled={mailBusy} className="w-full justify-center">
                                <IconMail className="h-4 w-4" />Send test mail to zaidorbit1@gmail.com
                              </Button>
                            </div>
                          ) : null}
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-stone-500">No diagnostics run yet. Click “Test Brevo” to inspect this company.</p>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="border-dashed border-stone-300 bg-white py-10 text-center">
            <p className="text-lg font-bold text-stone-900">No companies found</p>
          </Card>
        )}
      </div>
    </>
  );
}
