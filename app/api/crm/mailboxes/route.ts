import { NextResponse } from "next/server";
import { getCrmAdminClient } from "@/lib/crm-admin";
import { getHostingerMailbox, registerHostingerWebhook } from "@/lib/hostinger-mail";
import { encryptHostingerWebhookSecret } from "@/lib/hostinger-secrets";

const statuses = ["pending", "connected", "error", "disconnected"];

function text(value: unknown, max = 320) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function mailboxEmail(value: unknown) {
  const result = text(value).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(result)) throw new Error("A valid Hostinger mailbox email is required.");
  return result;
}

function errorResponse(error: unknown, fallback: string, status = 500) {
  const value = error as { code?: string; message?: string };
  return NextResponse.json({ error: error instanceof Error ? error.message : value.message || fallback }, { status: value.code === "23505" ? 409 : status });
}

async function authorizedClient() {
  const result = await getCrmAdminClient();
  if (result.error) throw Object.assign(new Error(result.error), { status: 403 });
  return result.client;
}

export async function GET(request: Request) {
  try {
    const client = await authorizedClient();
    const companyId = Number(new URL(request.url).searchParams.get("company_id"));
    if (!Number.isInteger(companyId) || companyId <= 0) return errorResponse(null, "A valid company is required.", 400);
    const { data, error } = await client.from("crm_mailboxes").select("id, company_id, email_address, display_name, status, last_webhook_at, last_error, created_at, updated_at").eq("company_id", companyId).order("email_address");
    if (error) throw error;
    return NextResponse.json({ mailboxes: data ?? [] });
  } catch (error) {
    return errorResponse(error, "Could not load Hostinger mailboxes.", (error as { status?: number }).status ?? 500);
  }
}

export async function POST(request: Request) {
  try {
    const client = await authorizedClient();
    const body = await request.json() as Record<string, unknown>;
    if (text(body.action) === "test") {
      const id = Number(body.id);
      const { data: mailbox, error } = await client.from("crm_mailboxes").select("id, email_address, webhook_id, encrypted_webhook_secret").eq("id", id).maybeSingle();
      if (error) throw error;
      if (!mailbox) return errorResponse(null, "Mailbox not found.", 404);
      const hostingerMailbox = await getHostingerMailbox(mailbox.email_address);
      const registration = mailbox.webhook_id && mailbox.encrypted_webhook_secret ? null : await registerHostingerWebhook(mailbox.email_address);
      await client.from("crm_mailboxes").update({ status: "connected", hostinger_resource_id: hostingerMailbox.resourceId, webhook_id: registration?.webhookId ?? mailbox.webhook_id, encrypted_webhook_secret: registration ? encryptHostingerWebhookSecret(registration.secret) : undefined, last_error: null, updated_at: new Date().toISOString() }).eq("id", id);
      return NextResponse.json({ ok: true, message: registration ? "Hostinger API and webhook verified." : "Hostinger API connection verified." });
    }
    const companyId = Number(body.company_id);
    const email = mailboxEmail(body.email_address);
    if (!Number.isInteger(companyId) || companyId <= 0) return errorResponse(null, "A valid company is required.", 400);
    const { data, error } = await client.from("crm_mailboxes").insert({ company_id: companyId, email_address: email, display_name: text(body.display_name, 255) || null, status: "pending" }).select("id, company_id, email_address, display_name, status, last_webhook_at, last_error, created_at, updated_at").single();
    if (error) throw error;
    try {
      const registration = await registerHostingerWebhook(email);
      const { data: connected, error: connectionError } = await client.from("crm_mailboxes").update({ status: "connected", hostinger_resource_id: registration.resourceId, webhook_id: registration.webhookId, encrypted_webhook_secret: encryptHostingerWebhookSecret(registration.secret), last_error: null, updated_at: new Date().toISOString() }).eq("id", data.id).select("id, company_id, email_address, display_name, status, last_webhook_at, last_error, created_at, updated_at").single();
      if (connectionError) throw connectionError;
      return NextResponse.json({ mailbox: connected }, { status: 201 });
    } catch (registrationError) {
      const reason = registrationError instanceof Error ? registrationError.message : "Hostinger webhook registration failed.";
      await client.from("crm_mailboxes").update({ status: "error", last_error: reason, updated_at: new Date().toISOString() }).eq("id", data.id);
      return NextResponse.json({ mailbox: { ...data, status: "error", last_error: reason }, warning: reason }, { status: 201 });
    }
  } catch (error) {
    return errorResponse(error, "Could not create Hostinger mailbox.", (error as { status?: number }) .status ?? 400);
  }
}

export async function PATCH(request: Request) {
  try {
    const client = await authorizedClient();
    const body = await request.json() as Record<string, unknown>;
    const id = Number(body.id);
    if (!Number.isInteger(id) || id <= 0) return errorResponse(null, "A valid mailbox is required.", 400);
    const values: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (body.email_address !== undefined) values.email_address = mailboxEmail(body.email_address);
    if (body.display_name !== undefined) values.display_name = text(body.display_name, 255) || null;
    if (body.status !== undefined && statuses.includes(text(body.status))) values.status = text(body.status);
    const { data, error } = await client.from("crm_mailboxes").update(values).eq("id", id).select("id, company_id, email_address, display_name, status, last_webhook_at, last_error, created_at, updated_at").single();
    if (error) throw error;
    return NextResponse.json({ mailbox: data });
  } catch (error) {
    return errorResponse(error, "Could not update Hostinger mailbox.", (error as { status?: number }).status ?? 400);
  }
}

export async function DELETE(request: Request) {
  try {
    const client = await authorizedClient();
    const id = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(id) || id <= 0) return errorResponse(null, "A valid mailbox is required.", 400);
    const { error } = await client.from("crm_mailboxes").delete().eq("id", id);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Could not delete Hostinger mailbox.");
  }
}
