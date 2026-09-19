"use client";

import { useEffect, useState, type FormEvent } from "react";
import { IconBriefcase, IconEdit, IconPlus, IconTrash } from "@/components/icons";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/empty-state";
import { Field, SelectInput, TextInput } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { PageHeader } from "@/components/ui/page-header";

type Integration = { id: string; integration_name: string; public_identifier: string; is_allowed: boolean; last_received_at?: string | null };
type Website = { id: number; name: string; website_url: string; technology: string; hosting_provider: string; status: string; crm_website_integrations?: Integration[] };
type Company = { id: number; name: string; logo_url?: string | null; description?: string | null; status: string; created_at: string; crm_websites?: Website[] };
type FormState = { name: string; description: string; status: string; website_name: string; website_url: string; website_technology: string; hosting_provider: string; logo_url: string };
type Message = { text: string; tone?: "danger" | "success" };
type WebsiteForm = { name: string; website_url: string; technology: string; hosting_provider: string; status: string };

const emptyForm: FormState = { name: "", description: "", status: "active", website_name: "Primary website", website_url: "", website_technology: "other", hosting_provider: "other", logo_url: "" };
const emptyWebsiteForm: WebsiteForm = { name: "", website_url: "", technology: "other", hosting_provider: "other", status: "active" };

function CompanyLogo({ company }: { company: Company }) {
  const [failed, setFailed] = useState(false);
  return <div className="grid h-16 w-16 shrink-0 place-items-center text-2xl font-bold text-primary">{company.logo_url && !failed ? <img src={company.logo_url} alt={`${company.name} logo`} className="max-h-full max-w-full object-contain" onError={() => setFailed(true)} /> : company.name.slice(0, 1).toUpperCase()}</div>;
}

export default function CrmCompaniesPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [websitesCompany, setWebsitesCompany] = useState<Company | null>(null);
  const [websites, setWebsites] = useState<Website[]>([]);
  const [websiteForm, setWebsiteForm] = useState<WebsiteForm>(emptyWebsiteForm);
  const [editingWebsiteId, setEditingWebsiteId] = useState<number | null>(null);
  const [websiteLoading, setWebsiteLoading] = useState(false);
  const [integrationSecret, setIntegrationSecret] = useState<string | null>(null);
  const [integrationPublicId, setIntegrationPublicId] = useState<string | null>(null);
  const [integrationWebsite, setIntegrationWebsite] = useState<Website | null>(null);
  const [integrationName, setIntegrationName] = useState("Website lead form");
  const [integrationLoading, setIntegrationLoading] = useState(false);
  const [integrationMessage, setIntegrationMessage] = useState<Message | null>(null);
  const [generatedScript, setGeneratedScript] = useState("");

  async function loadCompanies() {
    const response = await fetch("/api/crm/companies", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not load CRM companies.");
    setCompanies(result.companies ?? []);
  }

  useEffect(() => {
    loadCompanies().catch((error) => setMessage({ text: error instanceof Error ? error.message : "Could not load CRM companies.", tone: "danger" }));
  }, []);

  function openAdd() {
    setEditingId(null);
    setForm(emptyForm);
    setModalOpen(true);
  }

  function openEdit(company: Company) {
    const website = company.crm_websites?.[0];
    setEditingId(company.id);
    setForm({ name: company.name, description: company.description ?? "", status: company.status, website_name: website?.name ?? "Primary website", website_url: website?.website_url ?? "", website_technology: website?.technology ?? "other", hosting_provider: website?.hosting_provider ?? "other", logo_url: company.logo_url ?? "" });
    setModalOpen(true);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage(null);
    const body = new FormData();
    body.set("name", form.name);
    body.set("description", form.description);
    body.set("status", form.status);
    body.set("website_name", form.website_name);
    body.set("website_url", form.website_url);
    body.set("website_technology", form.website_technology);
    body.set("hosting_provider", form.hosting_provider);
    if (editingId) body.set("id", String(editingId));
    body.set("logo_url", form.logo_url);
    try {
      const response = await fetch("/api/crm/companies", { method: editingId ? "PATCH" : "POST", body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save CRM company.");
      setModalOpen(false);
      setMessage({ text: editingId ? "CRM company updated." : "CRM company created.", tone: "success" });
      await loadCompanies();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not save CRM company.", tone: "danger" });
    } finally {
      setLoading(false);
    }
  }

  async function remove(company: Company) {
    if (!window.confirm(`Delete ${company.name} and its CRM records?`)) return;
    const response = await fetch(`/api/crm/companies?id=${company.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) {
      setMessage({ text: result.error ?? "Could not delete CRM company.", tone: "danger" });
      return;
    }
    setMessage({ text: "CRM company deleted.", tone: "success" });
    await loadCompanies();
  }

  async function openWebsites(company: Company) {
    setWebsitesCompany(company);
    setIntegrationSecret(null);
    setWebsiteForm(emptyWebsiteForm);
    setEditingWebsiteId(null);
    const response = await fetch(`/api/crm/websites?company_id=${company.id}`, { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) {
      setMessage({ text: result.error ?? "Could not load websites.", tone: "danger" });
      return;
    }
    setWebsites(result.websites ?? []);
  }

  function editWebsite(website: Website) {
    setEditingWebsiteId(website.id);
    setWebsiteForm({ name: website.name, website_url: website.website_url, technology: website.technology, hosting_provider: website.hosting_provider, status: website.status });
  }

  async function saveWebsite(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!websitesCompany) return;
    setWebsiteLoading(true);
    try {
      const response = await fetch("/api/crm/websites", { method: editingWebsiteId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...websiteForm, ...(editingWebsiteId ? { id: editingWebsiteId } : { company_id: websitesCompany.id }) }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save website.");
      setWebsiteForm(emptyWebsiteForm);
      setEditingWebsiteId(null);
      await openWebsites(websitesCompany);
      await loadCompanies();
      setMessage({ text: editingWebsiteId ? "Website updated." : "Website added.", tone: "success" });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not save website.", tone: "danger" });
    } finally {
      setWebsiteLoading(false);
    }
  }

  async function removeWebsite(website: Website) {
    if (!websitesCompany || !window.confirm(`Delete ${website.name}?`)) return;
    const response = await fetch(`/api/crm/websites?id=${website.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) {
      setMessage({ text: result.error ?? "Could not delete website.", tone: "danger" });
      return;
    }
    await openWebsites(websitesCompany);
    await loadCompanies();
  }

  function buildWebsiteScript(publicIdentifier: string, secret: string) {
    const endpoint = `${window.location.origin}/api/crm/integrations/leads`;
    return `<!-- CRM Website Tracking Script -->
<script>
  (function () {
    const config = {
      websiteId: "${publicIdentifier}",
      secret: "${secret}",
      endpoint: "${endpoint}"
    };

    function getValue(form, fields) {
      for (const field of fields) {
        const element = form.querySelector('[name="' + field + '"]');
        if (element && element.value && String(element.value).trim()) {
          return String(element.value).trim();
        }
      }
      return "";
    }

    function collectData(form) {
      const firstName = getValue(form, ["first_name"]);
      const lastName = getValue(form, ["last_name"]);
      const fullName = getValue(form, ["full_name", "name"]) || [firstName, lastName].filter(Boolean).join(" ");

      return {
        name: fullName,
        email: getValue(form, ["email"]),
        phone: getValue(form, ["phone", "mobile"]),
        message: getValue(form, ["message", "notes", "inquiry"]),
        source_url: window.location.href,
        form_name: form.getAttribute("id") || form.getAttribute("name") || "website_form"
      };
    }

    document.addEventListener("submit", function (event) {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;

      const payload = collectData(form);
      if (!payload.name || !payload.email) return;

      fetch(config.endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-crm-integration-id": config.websiteId,
          "x-crm-integration-secret": config.secret
        },
        body: JSON.stringify(payload)
      }).catch(function () {});
    });
  })();
</script>`;
  }

  async function createIntegration(website: Website) {
    setIntegrationWebsite(website);
    setIntegrationName("Website lead form");
    setIntegrationMessage(null);
    setIntegrationSecret(null);
    setIntegrationPublicId(null);
    setGeneratedScript("");
  }

  async function saveIntegration(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!integrationWebsite || !integrationName.trim()) return;
    setIntegrationLoading(true);
    setIntegrationMessage(null);
    setIntegrationSecret(null);
    setIntegrationPublicId(null);
    setGeneratedScript("");
    try {
      const response = await fetch("/api/crm/website-integrations", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ website_id: integrationWebsite.id, integration_name: integrationName.trim() }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not create integration.");
      const publicIdentifier = result.integration?.public_identifier ?? result.public_identifier ?? "";
      const script = buildWebsiteScript(publicIdentifier, result.secret);
      setGeneratedScript(script);
      setIntegrationPublicId(publicIdentifier);
      setIntegrationSecret(result.secret);
      setIntegrationMessage({ text: "Paste this script into your website header or footer. It will automatically capture form submissions and send them to CRM.", tone: "success" });
      if (websitesCompany) {
        const websitesResponse = await fetch(`/api/crm/websites?company_id=${websitesCompany.id}`, { cache: "no-store" });
        const websitesResult = await websitesResponse.json();
        if (websitesResponse.ok) setWebsites(websitesResult.websites ?? []);
      }
    } catch (error) {
      setIntegrationMessage({ text: error instanceof Error ? error.message : "Could not create integration.", tone: "danger" });
    } finally {
      setIntegrationLoading(false);
    }
  }

  async function deleteIntegration(integration: Integration) {
    if (!websitesCompany) return;
    const response = await fetch(`/api/crm/website-integrations?id=${integration.id}`, { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) {
      setMessage({ text: result.error ?? "Could not delete integration.", tone: "danger" });
      return;
    }
    if (websitesCompany) await openWebsites(websitesCompany);
    setMessage({ text: "Integration and its secret were deleted.", tone: "success" });
  }

  return <>
    <PageHeader eyebrow="Business CRM / Companies" title="Companies" description="Create separate CRM workspaces for each business, with their websites and relationship data kept independent." actions={<Button onClick={openAdd}><IconPlus className="h-4 w-4" />Add company</Button>} />
    {message ? <div className="mb-5"><Alert tone={message.tone}>{message.text}</Alert></div> : null}
    {companies.length ? <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">{companies.map((company) => { const website = company.crm_websites?.[0]; return <Card key={company.id} className="group overflow-hidden p-0 transition duration-200 hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-[0_18px_40px_rgba(28,20,18,0.1)]"><div className="h-1.5 bg-primary" /><div className="flex min-h-[270px] flex-col p-5 sm:p-6"><div className="flex items-start justify-between gap-3"><CompanyLogo company={company} /><Badge tone={company.status === "active" ? "success" : company.status === "inactive" ? "warning" : "neutral"}>{company.status}</Badge></div><div className="mt-5 flex-1"><h2 className="text-xl font-bold tracking-tight">{company.name}</h2><p className="mt-2 line-clamp-3 text-sm leading-6 text-muted">{company.description || "No company description yet."}</p>{website ? <div className="mt-4 rounded-xl bg-[#fff8f6] px-3 py-2.5"><p className="truncate text-xs font-semibold text-foreground">{website.name}</p><p className="mt-0.5 truncate text-xs text-muted">{website.website_url}</p><p className="mt-1 text-[11px] capitalize text-primary">{website.technology} · {website.hosting_provider}</p></div> : <p className="mt-4 text-xs text-muted">No website added yet.</p>}</div><div className="mt-5 flex items-center justify-between border-t border-border pt-4"><button type="button" onClick={() => openWebsites(company)} className="text-xs font-semibold text-primary hover:text-primary-hover">Manage websites ({company.crm_websites?.length ?? 0})</button><div className="flex gap-1"><button type="button" onClick={() => openEdit(company)} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-primary-soft hover:text-primary" aria-label={`Edit ${company.name}`}><IconEdit className="h-4 w-4" /></button><button type="button" onClick={() => remove(company)} className="grid h-8 w-8 place-items-center rounded-lg text-muted hover:bg-rose-50 hover:text-rose-600" aria-label={`Delete ${company.name}`}><IconTrash className="h-4 w-4" /></button></div></div></div></Card>; })}</div> : <Card className="p-10 text-center"><div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary-soft text-primary"><IconBriefcase className="h-6 w-6" /></div><h2 className="mt-5 text-lg font-bold">No CRM companies yet</h2><p className="mt-2 text-sm text-muted">Add a company workspace before connecting websites or collecting leads.</p><Button className="mt-5" onClick={openAdd}><IconPlus className="h-4 w-4" />Add company</Button></Card>}
    <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editingId ? "Edit CRM company" : "Add CRM company"} description="Company records here are separate from the existing Employee Management company accounts."><form className="space-y-5" onSubmit={save}><div className="grid gap-5 sm:grid-cols-2"><Field label="Company name"><TextInput required value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} placeholder="Exam Takers Hub" /></Field><Field label="Status"><SelectInput value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option><option value="archived">Archived</option></SelectInput></Field></div><Field label="Description"><textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} rows={3} placeholder="What this company does" className="w-full resize-y rounded-xl border border-border bg-white px-3.5 py-2.5 text-sm outline-none transition placeholder:text-stone-400 focus:border-primary focus:ring-4 focus:ring-primary/12" /></Field><Field label="Company logo URL"><TextInput type="url" value={form.logo_url} onChange={(event) => setForm({ ...form, logo_url: event.target.value })} placeholder="https://example.com/logo.png" /></Field><div className="border-t border-border pt-5"><p className="mb-4 text-sm font-semibold">Primary website</p><div className="grid gap-5 sm:grid-cols-2"><Field label="Website name"><TextInput value={form.website_name} onChange={(event) => setForm({ ...form, website_name: event.target.value })} placeholder="Main website" /></Field><Field label="Website URL"><TextInput type="url" value={form.website_url} onChange={(event) => setForm({ ...form, website_url: event.target.value })} placeholder="https://example.com" /></Field><Field label="Technology"><SelectInput value={form.website_technology} onChange={(event) => setForm({ ...form, website_technology: event.target.value })}><option value="other">Other</option><option value="react">React</option><option value="nextjs">Next.js</option><option value="php">Core PHP</option><option value="wordpress">WordPress</option></SelectInput></Field><Field label="Hosting provider"><SelectInput value={form.hosting_provider} onChange={(event) => setForm({ ...form, hosting_provider: event.target.value })}><option value="other">Other</option><option value="hostinger">Hostinger</option><option value="orangehost">OrangeHost</option></SelectInput></Field></div></div><div className="flex justify-end gap-3 border-t border-border pt-5"><Button type="button" variant="secondary" onClick={() => setModalOpen(false)}>Cancel</Button><Button type="submit" disabled={loading}>{loading ? "Saving..." : editingId ? "Update company" : "Create company"}</Button></div></form></Modal>
    <Modal open={Boolean(websitesCompany)} onClose={() => setWebsitesCompany(null)} title={`${websitesCompany?.name ?? "Company"} websites`} description="Manage multiple company websites and create a separate authenticated integration for each one."><div className="space-y-5"><div className="space-y-3">{websites.map((website) => <div key={website.id} className="rounded-xl border border-border p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold">{website.name}</p><p className="mt-1 truncate text-sm text-muted">{website.website_url}</p><p className="mt-1 text-xs capitalize text-primary">{website.technology} · {website.hosting_provider} · {website.status}</p></div><div className="flex shrink-0 gap-1"><button type="button" onClick={() => editWebsite(website)} className="rounded-lg px-2 py-1 text-xs font-semibold text-primary hover:bg-primary-soft">Edit</button><button type="button" onClick={() => removeWebsite(website)} className="rounded-lg px-2 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50">Delete</button></div></div><div className="mt-3 border-t border-border pt-3">{website.crm_website_integrations?.length ? website.crm_website_integrations.map((integration) => <div key={integration.id} className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs last:mb-0"><span className="font-semibold">{integration.integration_name}: <span className="font-mono font-normal text-muted">{integration.public_identifier}</span></span><span className="flex items-center gap-2"><Badge tone={integration.is_allowed ? "success" : "danger"}>{integration.is_allowed ? "Allowed" : "Blocked"}</Badge><button type="button" onClick={() => deleteIntegration(integration)} className="font-semibold text-rose-600 hover:text-rose-700">Delete</button></span></div>) : <p className="text-xs text-muted">No integration identity created.</p>}<Button className="mt-3" variant="secondary" onClick={() => createIntegration(website)}>Create integration identity</Button></div></div>)}{!websites.length ? <p className="rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted">No websites added yet.</p> : null}</div>{integrationSecret ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-sm font-semibold text-amber-900">Copy this secret now</p><p className="mt-1 text-xs text-amber-800">It is shown once and is never stored in readable form.</p><p className="mt-3 break-all rounded-lg bg-white px-3 py-2 font-mono text-xs text-foreground">{integrationSecret}</p></div> : null}<div className="border-t border-border pt-5"><p className="mb-4 text-sm font-semibold">{editingWebsiteId ? "Edit website" : "Add website"}</p><form className="grid gap-4 sm:grid-cols-2" onSubmit={saveWebsite}><Field label="Website name"><TextInput required value={websiteForm.name} onChange={(event) => setWebsiteForm({ ...websiteForm, name: event.target.value })} placeholder="Admissions website" /></Field><Field label="Website URL"><TextInput required type="url" value={websiteForm.website_url} onChange={(event) => setWebsiteForm({ ...websiteForm, website_url: event.target.value })} placeholder="https://example.com" /></Field><Field label="Technology"><SelectInput value={websiteForm.technology} onChange={(event) => setWebsiteForm({ ...websiteForm, technology: event.target.value })}><option value="other">Other</option><option value="react">React</option><option value="nextjs">Next.js</option><option value="php">Core PHP</option><option value="wordpress">WordPress</option></SelectInput></Field><Field label="Hosting provider"><SelectInput value={websiteForm.hosting_provider} onChange={(event) => setWebsiteForm({ ...websiteForm, hosting_provider: event.target.value })}><option value="other">Other</option><option value="hostinger">Hostinger</option><option value="orangehost">OrangeHost</option></SelectInput></Field><Field label="Status"><SelectInput value={websiteForm.status} onChange={(event) => setWebsiteForm({ ...websiteForm, status: event.target.value })}><option value="active">Active</option><option value="inactive">Inactive</option><option value="archived">Archived</option></SelectInput></Field><div className="flex items-end justify-end gap-3"><Button type="button" variant="secondary" onClick={() => { setWebsiteForm(emptyWebsiteForm); setEditingWebsiteId(null); }}>Clear</Button><Button type="submit" disabled={websiteLoading}>{websiteLoading ? "Saving..." : editingWebsiteId ? "Update website" : "Add website"}</Button></div></form></div></div></Modal>
    <Modal open={Boolean(integrationWebsite)} onClose={() => { if (!integrationLoading) setIntegrationWebsite(null); }} title="Generate website tracking script" description={`Paste this script into ${integrationWebsite?.name ?? "this website"} to send all form submissions to CRM.`}><form className="space-y-5" onSubmit={saveIntegration}>{integrationMessage ? <Alert tone={integrationMessage.tone}>{integrationMessage.text}</Alert> : null}<Field label="Integration name"><TextInput required disabled={integrationLoading || Boolean(integrationSecret)} value={integrationName} onChange={(event) => setIntegrationName(event.target.value)} placeholder="Website lead form" /></Field>{integrationSecret && integrationPublicId ? <div className="space-y-3"><div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-sm font-semibold text-amber-900">Website ID</p><p className="mt-2 break-all rounded-lg bg-white px-3 py-2 font-mono text-xs text-foreground">{integrationPublicId}</p></div><div className="rounded-xl border border-amber-200 bg-amber-50 p-4"><p className="text-sm font-semibold text-amber-900">Secret</p><p className="mt-2 break-all rounded-lg bg-white px-3 py-2 font-mono text-xs text-foreground">{integrationSecret}</p></div><div className="rounded-xl border border-border bg-stone-50 p-4"><p className="text-sm font-semibold text-foreground">Paste this in your website header or footer</p><textarea readOnly value={generatedScript} rows={18} className="mt-3 w-full resize-y rounded-lg border border-border bg-white p-3 font-mono text-[11px] leading-5 text-foreground" /></div></div> : <p className="text-xs leading-5 text-muted">A website-specific script will be generated after creation. It captures form submissions and sends them to the CRM automatically.</p>}<div className="flex justify-end gap-3 border-t border-border pt-5"><Button type="button" variant="secondary" disabled={integrationLoading} onClick={() => setIntegrationWebsite(null)}>Close</Button>{!integrationSecret ? <Button type="submit" disabled={integrationLoading || !integrationName.trim()}>{integrationLoading ? "Generating script..." : "Generate script"}</Button> : <Button type="button" onClick={() => navigator.clipboard.writeText(generatedScript)} disabled={!generatedScript}>Copy script</Button>}</div></form></Modal>
  </>;
}