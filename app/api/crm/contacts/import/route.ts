import { NextResponse } from "next/server";
import { getCrmAdminClient } from "@/lib/crm-admin";

function fail(error: unknown, fallback: string, status = 500) {
  const value = error as { message?: string };
  return NextResponse.json({ error: error instanceof Error ? error.message : value.message ?? fallback }, { status });
}

function text(value: unknown, max = 255) { return typeof value === "string" ? value.trim().slice(0, max) : ""; }

function validateRow(row: Record<string, unknown>, rowNumber: number) {
  const columns = new Map(Object.entries(row).map(([key, value]) => [key.toLowerCase().replace(/[^a-z0-9]/g, ""), value]));
  const column = (...aliases: string[]) => aliases.map((alias) => columns.get(alias)).find((value) => value !== undefined);
  const firstName = text(column("firstname", "givenname"), 120);
  const lastName = text(column("lastname", "surname", "familyname"), 120);
  const fullName = text(column("fullname", "name", "contactname"), 255) || [firstName, lastName].filter(Boolean).join(" ");
  const email = text(column("email", "emailaddress", "e-mail"), 320).toLowerCase();
  const normalizedRow = { full_name: fullName, first_name: firstName, last_name: lastName, email, phone: text(column("phone", "phonenumber", "mobile", "mobilephone"), 80), source: text(column("source"), 100) };
  const errors: string[] = [];
  if (!fullName) errors.push("Name is required");
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push("Valid email is required");
  return { rowNumber, row: normalizedRow, fullName, email, errors };
}

export async function POST(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return fail(authError, authError, 403);
    const body = await request.json() as { company_id?: number; contact_list_id?: number; rows?: Record<string, unknown>[]; confirm?: boolean };
    const companyId = Number(body.company_id);
    const contactListId = Number(body.contact_list_id);
    if (!Number.isInteger(companyId) || companyId <= 0 || !Number.isInteger(contactListId) || contactListId <= 0 || !Array.isArray(body.rows) || body.rows.length > 10000) return fail("Choose a company and contact list, then provide up to 10,000 rows.", "A valid company, list, and rows array are required.", 400);
    const { data: list, error: listError } = await client.from("crm_contact_lists").select("id").eq("id", contactListId).eq("company_id", companyId).maybeSingle();
    if (listError) throw listError;
    if (!list) return fail("The selected contact list does not belong to this company.", "Contact list is not available.", 400);
    const checked = body.rows.map((row, index) => validateRow(row, index + 1));
    const emails = checked.filter((item) => !item.errors.length).map((item) => item.email);
    const { data: existing, error: existingError } = emails.length
      ? await client.from("crm_contacts").select("id, normalized_email").eq("company_id", companyId).in("normalized_email", emails)
      : { data: [], error: null };
    if (existingError) throw existingError;
    const existingByEmail = new Map((existing ?? []).map((contact) => [contact.normalized_email, contact]));
    const existingIds = (existing ?? []).map((contact) => contact.id);
    const { data: members, error: membersError } = existingIds.length
      ? await client.from("crm_contact_list_members").select("contact_id").eq("contact_list_id", contactListId).in("contact_id", existingIds)
      : { data: [], error: null };
    if (membersError) throw membersError;
    const memberIds = new Set((members ?? []).map((member) => member.contact_id));
    const seen = new Set<string>();
    const results = checked.map((item) => {
      if (!item.errors.length && seen.has(item.email)) item.errors.push("Duplicate email in this file");
      const existingContact = existingByEmail.get(item.email);
      if (!item.errors.length && existingContact && memberIds.has(existingContact.id)) item.errors.push("Contact is already in this list");
      if (!item.errors.length) seen.add(item.email);
      if (existingContact) Object.assign(item, { existingContactId: existingContact.id });
      return item;
    });
    const invalid = results.filter((item) => item.errors.length);
    const valid = results.filter((item) => !item.errors.length);
    if (!body.confirm) return NextResponse.json({ preview: true, total: results.length, valid: valid.length, invalid: invalid.length, rows: results });
    let imported = 0;
    let addedToList = 0;
    const failed: { rowNumber: number; error: string }[] = [];
    for (const item of valid) {
      const existingContact = existingByEmail.get(item.email);
      const { data: contact, error } = existingContact
        ? { data: existingContact, error: null }
        : await client.from("crm_contacts").insert({ company_id: companyId, first_name: text(item.row.first_name, 120) || item.fullName.split(/\s+/)[0], last_name: text(item.row.last_name, 120) || item.fullName.split(/\s+/).slice(1).join(" ") || null, full_name: item.fullName, email: item.email, normalized_email: item.email, phone: text(item.row.phone, 80) || null, status: "active", source: text(item.row.source, 100) || "import", custom_data: {} }).select("id").single();
      if (error || !contact) { failed.push({ rowNumber: item.rowNumber, error: error?.message ?? "Could not create contact." }); continue; }
      const { error: membershipError } = await client.from("crm_contact_list_members").upsert({ contact_list_id: contactListId, contact_id: contact.id }, { onConflict: "contact_list_id,contact_id", ignoreDuplicates: true });
      if (membershipError) { failed.push({ rowNumber: item.rowNumber, error: membershipError.message }); continue; }
      if (existingContact) addedToList += 1;
      else imported += 1;
    }
    return NextResponse.json({ preview: false, total: results.length, imported, added_to_list: addedToList, duplicates: results.filter((item) => item.errors.some((error) => error.toLowerCase().includes("duplicate") || error.toLowerCase().includes("already in this list"))).length, invalid: invalid.length, failed: failed.length, failed_rows: failed });
  } catch (error) {
    return fail(error, "Could not import contacts.");
  }
}