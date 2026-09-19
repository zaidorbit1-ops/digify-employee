"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/empty-state";
import { Field, SelectInput, TextInput } from "@/components/ui/field";
import { PageHeader } from "@/components/ui/page-header";

type Website = {
  id: number;
  name: string;
  website_url: string;
  company_id: number;
  custom_fields?: Array<{ name: string; label?: string; aliases?: string[] }> | null;
};

type Company = {
  id: number;
  name: string;
  crm_websites?: Website[];
};

type Message = {
  text: string;
  tone?: "success" | "danger";
};

function normalizeCustomFieldName(value: string) {
  return value.trim().replace(/\s+/g, "_").replace(/[^a-zA-Z0-9_]/g, "").replace(/^_+|_+$/g, "").toLowerCase();
}

export default function CrmCustomFieldsPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [websiteId, setWebsiteId] = useState("");
  const [fields, setFields] = useState<Array<{ name: string; label: string }>>([]);
  const [message, setMessage] = useState<Message | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedCompany = useMemo(() => companies.find((company) => String(company.id) === companyId) ?? null, [companies, companyId]);
  const selectedWebsite = useMemo(() => (selectedCompany?.crm_websites ?? []).find((website) => String(website.id) === websiteId) ?? null, [selectedCompany, websiteId]);

  async function loadCompanies() {
    const response = await fetch("/api/crm/companies", { cache: "no-store" });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error ?? "Could not load companies.");
    const nextCompanies = result.companies ?? [];
    setCompanies(nextCompanies);
    if (!companyId && nextCompanies.length) {
      setCompanyId(String(nextCompanies[0].id));
    }
  }

  useEffect(() => {
    loadCompanies().catch((error) => setMessage({ text: error instanceof Error ? error.message : "Could not load companies.", tone: "danger" }));
  }, []);

  useEffect(() => {
    if (!companyId) {
      setWebsiteId("");
      setFields([]);
      return;
    }
    const company = companies.find((item) => String(item.id) === companyId);
    const websites = company?.crm_websites ?? [];
    if (!websites.length) {
      setWebsiteId("");
      setFields([]);
      return;
    }
    if (!websiteId || !websites.some((website) => String(website.id) === websiteId)) {
      setWebsiteId(String(websites[0].id));
    }
  }, [companyId, companies, websiteId]);

  useEffect(() => {
    if (!selectedWebsite) {
      setFields([]);
      return;
    }
    const websiteFields = Array.isArray(selectedWebsite.custom_fields)
      ? selectedWebsite.custom_fields.map((field) => ({
          name: field.name ?? "",
          label: field.label ?? field.name ?? "",
        }))
      : [];
    setFields(websiteFields);
  }, [selectedWebsite]);

  function addField() {
    setFields((current) => [...current, { name: "", label: "" }]);
  }

  function updateField(index: number, value: string) {
    setFields((current) => current.map((field, fieldIndex) => {
      if (fieldIndex !== index) return field;
      const cleaned = value.trim();
      return {
        name: normalizeCustomFieldName(cleaned),
        label: cleaned,
      };
    }));
  }

  function removeField(index: number) {
    setFields((current) => current.filter((_, fieldIndex) => fieldIndex !== index));
  }

  async function saveFields() {
    if (!selectedWebsite) return;
    setSaving(true);
    setMessage(null);
    try {
      const payload = {
        ...selectedWebsite,
        custom_fields: fields
          .filter((field) => field.name || field.label)
          .map((field) => ({
            name: field.name || normalizeCustomFieldName(field.label || ""),
            label: field.label || field.name || "",
            aliases: [field.name || normalizeCustomFieldName(field.label || "")].filter(Boolean),
          })),
      };
      const response = await fetch("/api/crm/websites", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, id: selectedWebsite.id }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Could not save custom fields.");
      await loadCompanies();
      setMessage({ text: "Custom fields saved successfully.", tone: "success" });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Could not save custom fields.", tone: "danger" });
    } finally {
      setSaving(false);
    }
  }

  return <>
    <PageHeader eyebrow="Business CRM / Custom fields" title="Custom fields" description="Select a website, define its custom form fields, and generate a script that auto-captures them on form submit." />
    {message ? <div className="mb-5"><Alert tone={message.tone}>{message.text}</Alert></div> : null}

    <Card className="p-5">
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Company">
          <SelectInput value={companyId} onChange={(event) => setCompanyId(event.target.value)}>
            <option value="">Select a company</option>
            {companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}
          </SelectInput>
        </Field>

        <Field label="Website">
          <SelectInput value={websiteId} onChange={(event) => setWebsiteId(event.target.value)} disabled={!selectedCompany || !((selectedCompany.crm_websites ?? []).length)}>
            <option value="">Select a website</option>
            {(selectedCompany?.crm_websites ?? []).map((website) => <option key={website.id} value={website.id}>{website.name}</option>)}
          </SelectInput>
        </Field>
      </div>

      {selectedWebsite ? <div className="mt-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-foreground">Fields for {selectedWebsite.name}</p>
            <p className="text-xs text-muted">These names will be auto-detected from matching form inputs when the tracking script runs.</p>
          </div>
          <Button type="button" variant="secondary" onClick={addField}>Add field</Button>
        </div>

        <div className="space-y-3">
          {fields.length ? fields.map((field, index) => (
            <div key={`field-row-${index}`} className="grid gap-3 rounded-xl border border-border bg-[#fffaf9] p-3 md:grid-cols-[1fr_auto]">
              <TextInput
                value={field.label}
                onChange={(event) => updateField(index, event.target.value)}
                placeholder="Example: service, budget, area, message, words_count"
              />
              <Button type="button" variant="secondary" onClick={() => removeField(index)}>Remove</Button>
            </div>
          )) : <p className="rounded-xl border border-dashed border-border bg-[#fffaf9] p-4 text-sm text-muted">No custom fields configured yet for this website.</p> }
        </div>

        <div className="flex justify-end">
          <Button type="button" onClick={saveFields} disabled={saving}>{saving ? "Saving..." : "Save custom fields"}</Button>
        </div>
      </div> : <div className="mt-6 rounded-xl border border-dashed border-border bg-[#fffaf9] p-5 text-sm text-muted">Select a company and website to begin creating custom field mappings.</div> }
    </Card>
  </>; 
}
