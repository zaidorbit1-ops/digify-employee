import nodemailer from "nodemailer";
import { NextResponse } from "next/server";
import { getCrmAdminClient } from "@/lib/crm-admin";
import { decryptMailboxCredentials } from "@/lib/crm-mailboxes-crypto";

const statuses = ["draft", "active", "archived"] as const;
const allowedVariables = ["first_name", "last_name", "email", "company_name"];

type TemplatePayload = {
  id?: number;
  company_id?: number;
  name?: string;
  subject?: string;
  html_body?: string;
  text_body?: string;
  variables?: string[];
  status?: string;
};

function fail(error: unknown, fallback: string, status = 500) {
  const value = error as { message?: string };
  return NextResponse.json({ error: error instanceof Error ? error.message : value.message ?? fallback }, { status });
}

function clean(value: unknown, max = 100000) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function parseTemplate(body: TemplatePayload) {
  const companyId = Number(body.company_id);
  const name = clean(body.name, 150);
  const subject = clean(body.subject, 500);
  const htmlBody = clean(body.html_body);
  const textBody = clean(body.text_body, 100000) || null;
  const status = clean(body.status, 20) || "draft";
  const variables = Array.isArray(body.variables) ? [...new Set(body.variables.filter((item) => allowedVariables.includes(item)))] : [];
  if (!Number.isInteger(companyId) || companyId <= 0) throw new Error("A valid company is required.");
  if (!name) throw new Error("Template name is required.");
  if (!subject) throw new Error("Template subject is required.");
  if (!htmlBody) throw new Error("HTML/body content is required.");
  if (!statuses.includes(status as (typeof statuses)[number])) throw new Error("Choose a valid template status.");
  return { company_id: companyId, name, subject, html_body: htmlBody, text_body: textBody, variables, status };
}

function renderVariables(value: string, values: Record<string, string>) {
  return value.replace(/\{\{\s*(first_name|last_name|email|company_name)\s*\}\}/g, (_, key: string) => values[key] ?? "");
}

export async function GET(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return fail(authError, authError, 403);
    const companyId = Number(new URL(request.url).searchParams.get("company_id"));
    let query = client.from("crm_email_templates").select("*").order("updated_at", { ascending: false });
    if (companyId) query = query.eq("company_id", companyId);
    const { data, error } = await query;
    if (error) throw error;
    return NextResponse.json({ templates: data ?? [] });
  } catch (error) {
    return fail(error, "Could not load email templates.");
  }
}

export async function POST(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return fail(authError, authError, 403);
    const body = await request.json() as TemplatePayload & { action?: string; template_id?: number; mailbox_id?: number; to?: string };
    if (body.action === "duplicate") {
      const templateId = Number(body.template_id);
      const { data: source, error: sourceError } = await client.from("crm_email_templates").select("*").eq("id", templateId).single();
      if (sourceError) throw sourceError;
      const { data, error } = await client.from("crm_email_templates").insert({ ...source, id: undefined, name: `${source.name} copy`, status: "draft", created_at: undefined, updated_at: undefined }).select().single();
      if (error) throw error;
      return NextResponse.json({ template: data }, { status: 201 });
    }
    if (body.action === "test") {
      const templateId = Number(body.template_id);
      const mailboxId = Number(body.mailbox_id);
      const recipient = clean(body.to, 320);
      if (!Number.isInteger(templateId) || !Number.isInteger(mailboxId) || !recipient) return fail("Template, mailbox, and recipient are required.", "Template, mailbox, and recipient are required.", 400);
      const [{ data: template, error: templateError }, { data: mailbox, error: mailboxError }] = await Promise.all([
        client.from("crm_email_templates").select("*").eq("id", templateId).single(),
        client.from("crm_mailboxes").select("*").eq("id", mailboxId).single(),
      ]);
      if (templateError) throw templateError;
      if (mailboxError) throw mailboxError;
      const credentials = decryptMailboxCredentials(mailbox.encrypted_credentials ?? "");
      const values = { first_name: "Test", last_name: "Recipient", email: recipient, company_name: "Your company" };
      const transporter = nodemailer.createTransport({ host: mailbox.smtp_host, port: Number(mailbox.smtp_port), secure: mailbox.smtp_security === "ssl", requireTLS: mailbox.smtp_security === "starttls", tls: { rejectUnauthorized: false }, auth: { user: credentials.username, pass: credentials.password } });
      await transporter.sendMail({ from: mailbox.email_address, to: recipient, subject: `[TEST] ${renderVariables(template.subject, values)}`, html: renderVariables(template.html_body, values), text: renderVariables(template.text_body || template.subject, values) });
      return NextResponse.json({ ok: true, message: "Test email sent successfully." });
    }
    const parsed = parseTemplate(body);
    const { data, error } = await client.from("crm_email_templates").insert(parsed).select().single();
    if (error) throw error;
    return NextResponse.json({ template: data }, { status: 201 });
  } catch (error) {
    return fail(error, "Could not create email template.", 400);
  }
}

export async function PATCH(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return fail(authError, authError, 403);
    const body = await request.json() as TemplatePayload;
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return fail("A valid template is required.", "A valid template is required.", 400);
    const parsed = parseTemplate(body);
    const { data, error } = await client.from("crm_email_templates").update({ ...parsed, updated_at: new Date().toISOString() }).eq("id", id).select().single();
    if (error) throw error;
    return NextResponse.json({ template: data });
  } catch (error) {
    return fail(error, "Could not update email template.", 400);
  }
}

export async function DELETE(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return fail(authError, authError, 403);
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) return fail("A valid template is required.", "A valid template is required.", 400);
    const { error } = await client.from("crm_email_templates").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return fail(error, "Could not delete email template.");
  }
}
