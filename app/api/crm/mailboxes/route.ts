import { NextResponse } from "next/server";
import { getCrmAdminClient } from "@/lib/crm-admin";
import { getHostingerMailbox, getHostingerWebhook, registerHostingerWebhook } from "@/lib/hostinger-mail";
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
      const checks: Array<{ name: string; ok: boolean; reason: string }> = [];
      const addCheck = (name: string, ok: boolean, reason: string) => checks.push({ name, ok, reason });
      addCheck("HOSTINGER_API_TOKEN", Boolean(process.env.HOSTINGER_API_TOKEN), process.env.HOSTINGER_API_TOKEN ? "Server token is configured." : "HOSTINGER_API_TOKEN is missing from the deployed server environment.");
      addCheck("HOSTINGER_WEBHOOK_ENCRYPTION_KEY", Boolean(process.env.HOSTINGER_WEBHOOK_ENCRYPTION_KEY || process.env.HOSTINGER_API_TOKEN), process.env.HOSTINGER_WEBHOOK_ENCRYPTION_KEY || process.env.HOSTINGER_API_TOKEN ? "Encryption key is available." : "Set HOSTINGER_WEBHOOK_ENCRYPTION_KEY on the server.");
      const webhookUrl = process.env.HOSTINGER_WEBHOOK_URL || `${String(process.env.CRM_PUBLIC_URL || "").replace(/\/$/, "")}/api/email/hostinger/webhook`;
      let parsedUrl: URL | null = null;
      try { parsedUrl = new URL(webhookUrl); } catch { parsedUrl = null; }
      addCheck("HOSTINGER_WEBHOOK_URL", Boolean(parsedUrl?.protocol === "https:"), parsedUrl?.protocol === "https:" ? "HTTPS webhook URL is configured." : "Webhook URL is missing or is not HTTPS.");
      let hostingerMailbox: Awaited<ReturnType<typeof getHostingerMailbox>> | null = null;
      try {
        hostingerMailbox = await getHostingerMailbox(mailbox.email_address);
        addCheck("Hostinger mailbox access", true, `Token can access ${mailbox.email_address}.`);
      } catch (hostingerError) {
        addCheck("Hostinger mailbox access", false, hostingerError instanceof Error ? hostingerError.message : "Hostinger mailbox lookup failed.");
      }
      let registration: { resourceId: string; webhookId: string; secret: string } | null = null;
      if (hostingerMailbox && (!mailbox.webhook_id || !mailbox.encrypted_webhook_secret)) {
        try {
          registration = await registerHostingerWebhook(mailbox.email_address);
          addCheck("Webhook registration", true, "A webhook was registered and its secret was returned.");
        } catch (registrationError) {
          addCheck("Webhook registration", false, registrationError instanceof Error ? registrationError.message : "Hostinger webhook registration failed.");
        }
      } else if (hostingerMailbox && mailbox.webhook_id) {
        try {
          const result = await getHostingerWebhook(mailbox.email_address, mailbox.webhook_id);
          const active = result.webhook?.status === "active";
          addCheck("Webhook status", active, active ? "Registered webhook is active." : `Webhook status is ${result.webhook?.status || "unknown"}.`);
          addCheck("Webhook target", result.webhook?.url === webhookUrl, result.webhook?.url === webhookUrl ? "Webhook points to the configured CRM URL." : `Webhook points to ${result.webhook?.url || "an unknown URL"}.`);
        } catch (webhookError) {
          addCheck("Webhook lookup", false, webhookError instanceof Error ? webhookError.message : "Hostinger webhook lookup failed.");
        }
      }
      if (!registration) addCheck("Webhook secret storage", Boolean(mailbox.encrypted_webhook_secret), mailbox.encrypted_webhook_secret ? "Webhook secret is encrypted in CRM storage." : "No encrypted webhook secret is stored for this mailbox.");
      const failed = checks.filter((check) => !check.ok);
      if (failed.length) {
        const reason = failed.map((check) => `${check.name}: ${check.reason}`).join(" | ");
        await client.from("crm_mailboxes").update({ status: "error", last_error: reason, updated_at: new Date().toISOString() }).eq("id", id);
        return NextResponse.json({ ok: false, error: "Mailbox health check failed.", checks }, { status: 400 });
      }
      const resourceId = registration?.resourceId ?? hostingerMailbox?.resourceId;
      await client.from("crm_mailboxes").update({ status: "connected", hostinger_resource_id: resourceId, webhook_id: registration?.webhookId ?? mailbox.webhook_id, encrypted_webhook_secret: registration ? encryptHostingerWebhookSecret(registration.secret) : undefined, last_error: null, updated_at: new Date().toISOString() }).eq("id", id);
      return NextResponse.json({ ok: true, message: "All Hostinger mailbox checks passed.", checks });
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
