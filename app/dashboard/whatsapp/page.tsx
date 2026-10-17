"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import Link from "next/link";
import { Alert } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, SelectInput, TextInput } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";

type Company = { id: number; name: string; status?: string };
type Connection = {
  company_id: number;
  company_name: string;
  status: "disconnected" | "connecting" | "connected" | "reconnecting";
  connected_number?: string | null;
  profile_name?: string | null;
  qr_code?: string | null;
  last_connected_at?: string | null;
  note?: string | null;
};

type Message = { text: string; tone: "success" | "danger" };

type FormState = { company_id: string; profile_name: string };

const emptyForm: FormState = { company_id: "", profile_name: "" };

export default function WhatsAppDashboardPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"create" | "edit">("create");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [message, setMessage] = useState<Message | null>(null);
  const [generatedQr, setGeneratedQr] = useState<string | null>(null);

  async function loadData(showLoading = false) {
    if (showLoading) setLoading(true);
    try {
      const [companyResponse, connectionResponse] = await Promise.all([
        fetch("/api/crm/companies?module=crm_whatsapp", { cache: "no-store" }),
        fetch("/api/whatsapp/connections", { cache: "no-store" }),
      ]);

      const companyResult = await companyResponse.json();
      const connectionResult = await connectionResponse.json();

      if (!companyResponse.ok) throw new Error(companyResult.error ?? "Could not load companies.");
      if (!connectionResponse.ok) throw new Error(connectionResult.error ?? "Could not load WhatsApp connections.");

      const nextCompanies = Array.isArray(companyResult.companies) ? companyResult.companies : [];
      setCompanies(nextCompanies);
      setConnections(Array.isArray(connectionResult.connections) ? connectionResult.connections : []);

      const firstCompany = nextCompanies[0];
      if (firstCompany && !form.company_id) {
        setForm((current) => ({ ...current, company_id: String(firstCompany.id) }));
      }
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not load WhatsApp data.", tone: "danger" });
    } finally {
      if (showLoading) setLoading(false);
    }
  }

  useEffect(() => {
    void loadData(true);
    const refreshHandle = window.setInterval(() => {
      void loadData();
    }, 4000);

    return () => window.clearInterval(refreshHandle);
  }, []);

  useEffect(() => {
    if (!modalOpen || modalMode !== "create" || !form.company_id) return;
    const connection = connections.find((item) => item.company_id === Number(form.company_id));
    if (!connection) return;

    if (connection.qr_code) {
      setGeneratedQr(connection.qr_code);
    }
    if (connection.status === "connected") {
      setGeneratedQr(null);
      setModalOpen(false);
      setMessage({ text: `${connection.company_name} WhatsApp connected successfully.`, tone: "success" });
    }
  }, [connections, form.company_id, modalMode, modalOpen]);

  const sortedConnections = useMemo(
    () => [...connections].sort((left, right) => left.company_name.localeCompare(right.company_name)),
    [connections],
  );

  async function runAction(action: "create" | "reconnect" | "disconnect" | "reset", companyId: number, profileName?: string) {
    setSubmitting(true);
    setMessage(null);

    try {
      const response = await fetch("/api/whatsapp/connections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          company_id: companyId,
          profile_name: profileName,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not update WhatsApp connection.");

      if ((action === "create" || action === "reconnect") && result.connection?.qr_code) {
        setGeneratedQr(result.connection.qr_code);
      } else {
        setGeneratedQr(null);
      }

      await loadData();
      const statusText =
        action === "create"
          ? "Connection created. Waiting for Baileys to provide the QR code..."
          : action === "reconnect"
            ? "Reconnecting to WhatsApp..."
            : action === "reset"
              ? "Fresh WhatsApp session started. Waiting for a new QR code..."
            : "WhatsApp disconnected.";
      setMessage({ text: statusText, tone: "success" });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not update the WhatsApp connection.", tone: "danger" });
    } finally {
      setSubmitting(false);
    }
  }

  function requestFreshQr(connection: Connection) {
    if (!window.confirm(
      `Create a new QR for ${connection.company_name}? This clears its saved WhatsApp session and requires scanning the new QR again.`,
    )) return;
    void runAction("reset", connection.company_id);
  }

  function openConnectionModal() {
    setMessage(null);
    setGeneratedQr(null);
    const existingCompanyIds = new Set(connections.map((connection) => connection.company_id));
    const selected = companies.find((company) => !existingCompanyIds.has(company.id));
    if (!selected) {
      setMessage({ text: "Every available company already has a WhatsApp connection.", tone: "danger" });
      return;
    }
    setModalMode("create");
    setForm({ company_id: String(selected.id), profile_name: `${selected.name} WhatsApp` });
    setModalOpen(true);
  }

  async function handleGenerateQr(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.company_id) {
      setMessage({ text: "Choose a company before generating the QR code.", tone: "danger" });
      return;
    }

    const companyId = Number(form.company_id);
    await runAction("create", companyId, form.profile_name);
  }

  function openEditModal(connection: Connection) {
    setModalMode("edit");
    setGeneratedQr(null);
    setForm({
      company_id: String(connection.company_id),
      profile_name: connection.profile_name ?? `${connection.company_name} WhatsApp`,
    });
    setMessage(null);
    setModalOpen(true);
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const companyId = Number(form.company_id);
    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/whatsapp/connections", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, profile_name: form.profile_name }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not edit the WhatsApp connection.");
      setModalOpen(false);
      setMessage({ text: "WhatsApp connection updated.", tone: "success" });
      await loadData();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not edit the WhatsApp connection.", tone: "danger" });
    } finally {
      setSubmitting(false);
    }
  }

  async function deleteConnection(connection: Connection) {
    if (!window.confirm(`Delete the WhatsApp connection for ${connection.company_name}? This also logs out the linked device.`)) return;
    setSubmitting(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/whatsapp/connections?company_id=${connection.company_id}`, { method: "DELETE" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not delete the WhatsApp connection.");
      setMessage({ text: `${connection.company_name} WhatsApp connection deleted.`, tone: "success" });
      await loadData();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not delete the WhatsApp connection.", tone: "danger" });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Business CRM / WhatsApp"
        title="WhatsApp connections"
        description="Connect each company to its own WhatsApp account and manage the session from one place."
        actions={<Button onClick={openConnectionModal} disabled={!companies.some((company) => !connections.some((connection) => connection.company_id === company.id))}>Add WhatsApp</Button>}
      />

      {message ? (
        <div className="mb-5">
          <Alert tone={message.tone}>{message.text}</Alert>
        </div>
      ) : null}

      {loading ? (
        <Card className="p-8 text-sm text-muted">Loading connected WhatsApp accounts...</Card>
      ) : sortedConnections.length ? (
        <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
          {sortedConnections.map((connection) => {
            const statusTone = connection.status === "connected" ? "success" : connection.status === "connecting" || connection.status === "reconnecting" ? "warning" : "neutral";

            return (
              <Card key={connection.company_id} className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-emerald-700">WhatsApp</p>
                    <h2 className="mt-2 text-xl font-bold">
                      {connection.status === "connected" ? (
                        <Link
                          href={`/dashboard/whatsapp/${connection.company_id}`}
                          className="rounded-sm hover:text-emerald-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700"
                        >
                          {connection.company_name}
                        </Link>
                      ) : connection.company_name}
                    </h2>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[10px] font-semibold capitalize ${statusTone === "success" ? "bg-emerald-100 text-emerald-700" : statusTone === "warning" ? "bg-amber-100 text-amber-700" : "bg-stone-100 text-stone-600"}`}>
                    {connection.status}
                  </span>
                </div>

                <div className="mt-4 space-y-2 text-sm text-muted">
                  <p><span className="font-semibold text-foreground">Linked number:</span> {connection.connected_number || "Waiting for QR scan"}</p>
                  <p><span className="font-semibold text-foreground">Profile:</span> {connection.profile_name || "Company WhatsApp"}</p>
                  <p><span className="font-semibold text-foreground">Last connected:</span> {connection.last_connected_at ? new Date(connection.last_connected_at).toLocaleString() : "Not connected yet"}</p>
                  {connection.note ? <p className="pt-1 text-xs">{connection.note}</p> : null}
                </div>

                {connection.qr_code ? (
                  <div className="mt-4 rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/50 p-3">
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">Scan QR</p>
                    <img src={connection.qr_code} alt={`${connection.company_name} WhatsApp QR`} className="mx-auto h-36 w-36 rounded-xl border border-emerald-100 bg-white p-2" />
                  </div>
                ) : null}

                <div className="mt-5 flex flex-wrap gap-2">
                  {connection.status === "connected" ? (
                    <Link
                      href={`/dashboard/whatsapp/${connection.company_id}`}
                      className="inline-flex items-center justify-center rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
                    >
                      Open chats
                    </Link>
                  ) : null}
                  {connection.status === "disconnected" ? (
                    <Button onClick={() => runAction("reconnect", connection.company_id)} disabled={submitting}>Connect</Button>
                  ) : connection.status === "reconnecting" ? (
                    <Button variant="secondary" onClick={() => runAction("reconnect", connection.company_id)} disabled={submitting}>Retry</Button>
                  ) : null}
                  {connection.status === "reconnecting" || connection.status === "connecting" ? (
                    <Button variant="secondary" onClick={() => requestFreshQr(connection)} disabled={submitting}>
                      Get a new QR
                    </Button>
                  ) : null}

                  {connection.status !== "disconnected" ? (
                    <Button variant="ghost" onClick={() => runAction("disconnect", connection.company_id)} disabled={submitting}>Disconnect</Button>
                  ) : null}
                  <Button variant="secondary" onClick={() => openEditModal(connection)} disabled={submitting}>Edit</Button>
                  <Button variant="ghost" onClick={() => deleteConnection(connection)} disabled={submitting}>Delete</Button>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="p-10 text-center">
          <p className="text-lg font-bold">No WhatsApp accounts connected yet</p>
          <p className="mt-2 text-sm text-muted">Use the Add WhatsApp button to link a company account with a QR scan.</p>
        </Card>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={modalMode === "create" ? "Add WhatsApp account" : "Edit WhatsApp account"}
        description={modalMode === "create" ? "Select a company and Baileys will generate a QR code. No phone number is needed." : "Change the label shown for this company's WhatsApp connection."}
      >
        <form onSubmit={modalMode === "create" ? handleGenerateQr : saveProfile} className="space-y-5">
          {modalMode === "create" ? (
            <Field label="Company">
              <SelectInput
                value={form.company_id}
                onChange={(event) => {
                  const selected = companies.find((company) => String(company.id) === event.target.value);
                  setForm({ company_id: event.target.value, profile_name: selected ? `${selected.name} WhatsApp` : "" });
                }}
              >
                <option value="">Select company</option>
                {companies
                  .filter((company) => !connections.some((connection) => connection.company_id === company.id))
                  .map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
              </SelectInput>
            </Field>
          ) : null}

          <Field label="Profile name">
            <TextInput
              value={form.profile_name}
              onChange={(event) => setForm((current) => ({ ...current, profile_name: event.target.value }))}
              maxLength={150}
              required
            />
          </Field>

          {modalMode === "create" && generatedQr ? (
            <div className="rounded-2xl border border-dashed border-emerald-200 bg-emerald-50/60 p-4">
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-emerald-700">Scan with WhatsApp → Linked devices</p>
              <div className="flex justify-center rounded-xl bg-white p-3">
                <img src={generatedQr} alt="WhatsApp QR code" className="h-44 w-44 rounded-lg object-contain" />
              </div>
            </div>
          ) : modalMode === "create" && form.company_id && connections.find((connection) => connection.company_id === Number(form.company_id))?.status === "connecting" ? (
            <p className="rounded-xl bg-stone-50 p-4 text-sm text-muted">Waiting for Baileys to provide a QR code...</p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Close</Button>
            <Button type="submit" disabled={submitting || (modalMode === "create" && (!form.company_id || Boolean(generatedQr)))}>
              {submitting ? "Saving..." : modalMode === "create" ? (generatedQr ? "Waiting for scan" : "Create and connect") : "Save changes"}
            </Button>
          </div>
        </form>
      </Modal>
    </>
  );
}
