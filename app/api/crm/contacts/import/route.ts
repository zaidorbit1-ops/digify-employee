import { NextResponse } from "next/server";
import { getCrmAdminClient } from "@/lib/crm-admin";

function fail(error: unknown, fallback: string, status = 500) {
  const value = error as { message?: string };
  return NextResponse.json({ error: error instanceof Error ? error.message : value.message ?? fallback }, { status });
}

function text(value: unknown, max = 255) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }

function validateRow(row: Record<string, unknown>, rowNumber: number) {
  const fullName = text(row.full_name ?? row.name ?? [row.first_name, row.last_name].filter(Boolean).join(" "));
  const email = text(row.email, 320).toLowerCase();
  const errors: string[] = [];
  if (!fullName) errors.push("Name is required");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Valid email is required");
  return { rowNumber, row, fullName, email, errors };
}

export async function POST(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return fail(authError, authError, 403);
    const body = await request.json() as { company_id?: number; rows?: Record<string, unknown>[]; confirm?: boolean };
    const companyId = Number(body.company_id);
    if (!Number.isInteger(companyId) || companyId <= 0 || !Array.isArray(body.rows) || body.rows.length > 10000) return fail("A valid company and rows array are required.", "A valid company and rows array are required.", 400);
    const checked = body.rows.map((row, index) => validateRow(row, index + 1));
    const emails = checked.filter((item) => !item.errors.length).map((item) => item.email);
    const { data: existing } = await client.from("crm_contacts").select("normalized_email").eq("company_id", companyId).in("normalized_email", emails);
    const existingEmails = new Set((existing ?? []).map((item) => item.normalized_email));
    const seen = new Set<string>();
    const results = checked.map((item) => {
      if (!item.errors.length && (existingEmails.has(item.email) || seen.has(item.email))) item.errors.push(existingEmails.has(item.email) ? "Duplicate contact already exists" : "Duplicate email in this file");
      if (!item.errors.length) seen.add(item.email);
      return item;
    });
    const invalid = results.filter((item) => item.errors.length);
    const valid = results.filter((item) => !item.errors.length);
    if (!body.confirm) return NextResponse.json({ preview: true, total: results.length, valid: valid.length, invalid: invalid.length, rows: results });
    let imported = 0;
    const failed: { rowNumber: number; error: string }[] = [];
    for (const item of valid) {
      const { error } = await client.from("crm_contacts").insert({ company_id: companyId, first_name: text(item.row.first_name, 120) || item.fullName.split(/\s+/)[0], last_name: text(item.row.last_name, 120) || item.fullName.split(/\s+/).slice(1).join(" ") || null, full_name: item.fullName, email: item.email, normalized_email: item.email, phone: text(item.row.phone, 80) || null, status: "active", source: text(item.row.source, 100) || "import", custom_data: {} });
      if (error) failed.push({ rowNumber: item.rowNumber, error: error.message }); else imported += 1;
    }
    return NextResponse.json({ preview: false, total: results.length, imported, duplicates: results.filter((item) => item.errors.some((error) => error.toLowerCase().includes("duplicate"))).length, invalid: invalid.length, failed: failed.length, failed_rows: failed });
  } catch (error) {
    return fail(error, "Could not import contacts.");
  }
}