import { createConnection } from "node:net";
import { connect as tlsConnect } from "node:tls";
import { NextResponse } from "next/server";
import { getCrmAdminClient } from "@/lib/crm-admin";
import { decryptMailboxCredentials, encryptMailboxCredentials } from "@/lib/crm-mailboxes-crypto";

const providerOptions = ["hostinger", "orangehost", "gmail", "outlook", "office365", "other"];
const imapSecurityOptions = ["ssl", "starttls", "none"];
const smtpSecurityOptions = ["ssl", "starttls", "none"];
const statusOptions = ["pending", "connected", "error", "disconnected"];

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function parseMailbox(body: Record<string, unknown>, requirePassword = true) {
  const companyId = Number(body.company_id);
  const emailAddress = normalizeEmail(text(body.email_address));
  const displayName = text(body.display_name);
  const provider = text(body.provider) || "other";
  const imapHost = text(body.imap_host);
  const imapPort = Number(body.imap_port ?? 993);
  const imapSecurity = text(body.imap_security) || "ssl";
  const smtpHost = text(body.smtp_host);
  const smtpPort = Number(body.smtp_port ?? 465);
  const smtpSecurity = text(body.smtp_security) || "ssl";
  const username = text(body.username) || emailAddress;
  const password = text(body.password);

  if (!Number.isInteger(companyId) || companyId <= 0) throw new Error("A valid company is required.");
  if (!emailAddress || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailAddress)) throw new Error("A valid mailbox email is required.");
  if (!imapHost) throw new Error("IMAP host is required.");
  if (!smtpHost) throw new Error("SMTP host is required.");
  if (!Number.isInteger(imapPort) || imapPort < 1 || imapPort > 65535) throw new Error("IMAP port must be a valid TCP port.");
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) throw new Error("SMTP port must be a valid TCP port.");
  if (!providerOptions.includes(provider)) throw new Error("Choose a valid mailbox provider.");
  if (!imapSecurityOptions.includes(imapSecurity)) throw new Error("Choose a valid IMAP security mode.");
  if (!smtpSecurityOptions.includes(smtpSecurity)) throw new Error("Choose a valid SMTP security mode.");
  if (!username) throw new Error("Mailbox login username is required.");
  if (requirePassword && !password) throw new Error("Mailbox password is required.");

  return {
    company_id: companyId,
    email_address: emailAddress,
    display_name: displayName || null,
    provider,
    imap_host: imapHost,
    imap_port: imapPort,
    imap_security: imapSecurity,
    smtp_host: smtpHost,
    smtp_port: smtpPort,
    smtp_security: smtpSecurity,
    username,
    password,
  };
}

function errorResponse(error: unknown, fallback: string) {
  const databaseError = error as { code?: string; message?: string; details?: string; hint?: string };
  const message = error instanceof Error ? error.message : databaseError.message || fallback;
  const status = databaseError.code === "23505" ? 409 : 500;
  return NextResponse.json({ error: message }, { status });
}

async function waitForSocketConnect(socket: ReturnType<typeof createConnection> | ReturnType<typeof tlsConnect>, timeoutMs = 15000) {
  return new Promise<void>((resolve, reject) => {
    const onConnect = () => { cleanup(); resolve(); };
    const onSecureConnect = () => { cleanup(); resolve(); };
    const onError = (error: Error) => { cleanup(); reject(error); };
    const onTimeout = () => { cleanup(); reject(new Error("Connection timed out while connecting to the mailbox server.")); };

    const cleanup = () => {
      socket.off("connect", onConnect);
      socket.off("secureConnect", onSecureConnect);
      socket.off("error", onError);
      socket.off("timeout", onTimeout);
      clearTimeout(timer);
    };

    const timer = setTimeout(() => {
      onTimeout();
    }, timeoutMs);

    socket.once("connect", onConnect);
    socket.once("secureConnect", onSecureConnect);
    socket.once("error", onError);
    socket.once("timeout", onTimeout);
  });
}

async function readResponse(socket: ReturnType<typeof createConnection> | ReturnType<typeof tlsConnect>, timeoutMs = 15000) {
  return new Promise<string>((resolve) => {
    let buffer = "";
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
    };
    const onTimeout = () => {
      cleanup();
      resolve(buffer);
    };
    const onClose = () => {
      cleanup();
      resolve(buffer);
    };
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("timeout", onTimeout);
      socket.off("close", onClose);
      clearTimeout(timer);
    };

    const timer = setTimeout(() => {
      cleanup();
      resolve(buffer);
    }, timeoutMs);

    socket.on("data", onData);
    socket.once("timeout", onTimeout);
    socket.once("close", onClose);
    socket.setTimeout(timeoutMs);
  });
}

async function readImapLine(socket: ReturnType<typeof createConnection> | ReturnType<typeof tlsConnect>, timeoutMs = 15000) {
  return new Promise<string>((resolve, reject) => {
    let buffer = "";
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lineEnd = buffer.indexOf("\r\n");
      if (lineEnd >= 0) {
        cleanup();
        resolve(buffer.slice(0, lineEnd + 2));
      }
    };
    const onError = (error: Error) => { cleanup(); reject(error); };
    const onClose = () => { cleanup(); resolve(buffer); };
    const onTimeout = () => { cleanup(); reject(new Error("The IMAP server did not send a continuation response.")); };
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
      socket.off("close", onClose);
      socket.off("timeout", onTimeout);
      clearTimeout(timer);
    };
    const timer = setTimeout(onTimeout, timeoutMs);

    socket.on("data", onData);
    socket.once("error", onError);
    socket.once("close", onClose);
    socket.setTimeout(timeoutMs);
  });
}

async function upgradeToTls(socket: ReturnType<typeof createConnection>, host: string, security: string) {
  if (security !== "starttls") return socket;

  socket.write("STARTTLS\r\n");
  const response = await readResponse(socket, 15000);
  const textResponse = response.toUpperCase();
  if (!textResponse.includes("220")) {
    throw new Error("The mail server did not accept STARTTLS.");
  }

  const upgraded = tlsConnect({
    socket,
    host,
    rejectUnauthorized: false,
    servername: host,
  });

  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error) => reject(error);
    const onReady = () => {
      upgraded.off("error", onError);
      resolve();
    };
    upgraded.once("secureConnect", onReady);
    upgraded.once("error", onError);
  });

  return upgraded;
}

async function testMailboxConnection(mailbox: {
  email_address: string;
  imap_host: string;
  imap_port: number;
  imap_security: string;
  smtp_host: string;
  smtp_port: number;
  smtp_security: string;
  username: string;
  password: string;
}) {
  const errors: string[] = [];

  async function testImap() {
    try {
      const socket = mailbox.imap_security === "ssl"
        ? tlsConnect({ host: mailbox.imap_host, port: mailbox.imap_port, rejectUnauthorized: false, servername: mailbox.imap_host })
        : createConnection({ host: mailbox.imap_host, port: mailbox.imap_port });

      await waitForSocketConnect(socket, 20000);

      const greeting = await readResponse(socket, 10000);
      if (!greeting) {
        throw new Error(`IMAP server at ${mailbox.imap_host}:${mailbox.imap_port} did not respond.`);
      }

      const upgraded = mailbox.imap_security === "starttls" ? await upgradeToTls(socket as ReturnType<typeof createConnection>, mailbox.imap_host, mailbox.imap_security) : socket;
      upgraded.write(`A1 LOGIN {${Buffer.byteLength(mailbox.username, "utf8")}}\r\n`);
      const usernamePrompt = await readImapLine(upgraded);
      if (!usernamePrompt.trimStart().startsWith("+")) {
        throw new Error(`IMAP server rejected the username prompt. Response: ${usernamePrompt.trim() || "No response."}`);
      }
      upgraded.write(`${mailbox.username} {${Buffer.byteLength(mailbox.password, "utf8")}}\r\n`);
      const passwordPrompt = await readImapLine(upgraded);
      if (!passwordPrompt.trimStart().startsWith("+")) {
        throw new Error(`IMAP server rejected the password prompt. Response: ${passwordPrompt.trim() || "No response."}`);
      }
      upgraded.write(`${mailbox.password}\r\n`);
      const loginResult = await readResponse(upgraded, 15000);
      const taggedLoginResult = loginResult.match(/(?:^|\r\n)A1\s+(OK|NO|BAD)\b[^\r\n]*/i)?.[0]?.trim() ?? "";
      const loginStatus = taggedLoginResult.match(/^A1\s+(OK|NO|BAD)\b/i)?.[1]?.toUpperCase();
      if (loginStatus !== "OK") {
        const responseText = loginResult.trim() || "No detailed IMAP error response was returned.";
        throw new Error(`IMAP login failed for ${mailbox.email_address}. Response: ${responseText}`);
      }
      upgraded.end();
    } catch (error) {
      const message = error instanceof Error ? error.message : "IMAP test failed.";
      errors.push(message);
    }
  }

  async function testSmtp() {
    try {
      const socket = mailbox.smtp_security === "ssl"
        ? tlsConnect({ host: mailbox.smtp_host, port: mailbox.smtp_port, rejectUnauthorized: false, servername: mailbox.smtp_host })
        : createConnection({ host: mailbox.smtp_host, port: mailbox.smtp_port });

      await waitForSocketConnect(socket, 20000);

      const greeting = await readResponse(socket, 10000);
      if (!greeting) {
        throw new Error(`SMTP server at ${mailbox.smtp_host}:${mailbox.smtp_port} did not respond.`);
      }

      const upgraded = mailbox.smtp_security === "starttls" ? await upgradeToTls(socket as ReturnType<typeof createConnection>, mailbox.smtp_host, mailbox.smtp_security) : socket;
      upgraded.write("EHLO localhost\r\n");
      await readResponse(upgraded, 15000);
      upgraded.write("AUTH LOGIN\r\n");
      const authPrompt = await readResponse(upgraded, 15000);
      if (!authPrompt.includes("334")) {
        throw new Error(`SMTP server did not accept AUTH LOGIN for ${mailbox.email_address}. Response: ${authPrompt.trim() || "No detailed SMTP auth response was returned."}`);
      }
      upgraded.write(Buffer.from(mailbox.username, "utf8").toString("base64") + "\r\n");
      const usernameReply = await readResponse(upgraded, 15000);
      if (!usernameReply.includes("334")) {
        throw new Error(`SMTP username challenge was rejected for ${mailbox.email_address}. Response: ${usernameReply.trim() || "No response."}`);
      }
      upgraded.write(Buffer.from(mailbox.password, "utf8").toString("base64") + "\r\n");
      const passwordReply = await readResponse(upgraded, 15000);
      const normalized = passwordReply.toUpperCase();
      if (normalized.includes("535") || normalized.includes("535") || normalized.includes("NO") || normalized.includes("BAD") || normalized.includes("ERROR")) {
        const responseText = passwordReply.trim() || "No detailed SMTP error response was returned.";
        throw new Error(`SMTP login failed for ${mailbox.email_address}. Response: ${responseText}`);
      }
      upgraded.end();
    } catch (error) {
      const message = error instanceof Error ? error.message : "SMTP test failed.";
      errors.push(message);
    }
  }

  await Promise.all([testImap(), testSmtp()]);

  if (errors.length) {
    const uniqueErrors = [...new Set(errors)].join(" | ");
    return { ok: false, error: uniqueErrors };
  }

  return { ok: true, message: "Mailbox connection test passed for IMAP and SMTP." };
}

export async function GET(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });

    const companyId = Number(new URL(request.url).searchParams.get("company_id"));
    if (!Number.isInteger(companyId) || companyId <= 0) {
      return NextResponse.json({ error: "A valid company is required." }, { status: 400 });
    }

    const { data, error } = await client
      .from("crm_mailboxes")
      .select("*")
      .eq("company_id", companyId)
      .order("email_address");

    if (error) throw error;
    return NextResponse.json({ mailboxes: data ?? [] });
  } catch (error) {
    return errorResponse(error, "Could not load CRM mailboxes.");
  }
}

export async function POST(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });

    const body = await request.json() as Record<string, unknown>;
    const action = text(body.action);

    if (action === "test") {
      const mailboxId = Number(body.id);
      if (!Number.isInteger(mailboxId) || mailboxId <= 0) {
        return NextResponse.json({ error: "A valid mailbox is required." }, { status: 400 });
      }

      const { data: mailbox, error: mailboxError } = await client.from("crm_mailboxes").select("*").eq("id", mailboxId).maybeSingle();
      if (mailboxError) throw mailboxError;
      if (!mailbox) return NextResponse.json({ error: "Mailbox not found." }, { status: 404 });

      const credentials = decryptMailboxCredentials(mailbox.encrypted_credentials ?? "");
      const username: string = credentials.username;
      const password: string = credentials.password;
      const result = await testMailboxConnection({
        email_address: mailbox.email_address,
        imap_host: mailbox.imap_host,
        imap_port: Number(mailbox.imap_port),
        imap_security: mailbox.imap_security,
        smtp_host: mailbox.smtp_host,
        smtp_port: Number(mailbox.smtp_port),
        smtp_security: mailbox.smtp_security,
        username,
        password,
      });

      await client
        .from("crm_mailboxes")
        .update({
          status: result.ok ? "connected" : "error",
          last_error: result.ok ? null : result.error,
          last_sync_at: result.ok ? new Date().toISOString() : mailbox.last_sync_at,
          updated_at: new Date().toISOString(),
        })
        .eq("id", mailboxId);

      if (!result.ok) {
        return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
      }

      return NextResponse.json({ ok: true, message: result.message });
    }

    const parsed = parseMailbox(body, true);
    const { data: company, error: companyError } = await client.from("crm_companies").select("id").eq("id", parsed.company_id).maybeSingle();
    if (companyError) throw companyError;
    if (!company) return NextResponse.json({ error: "CRM company not found." }, { status: 404 });

    const encryptedCredentials = encryptMailboxCredentials({ username: parsed.username, password: parsed.password ?? "" });
    const { data, error } = await client
      .from("crm_mailboxes")
      .insert({
        company_id: parsed.company_id,
        email_address: parsed.email_address,
        display_name: parsed.display_name,
        provider: parsed.provider,
        imap_host: parsed.imap_host,
        imap_port: parsed.imap_port,
        imap_security: parsed.imap_security,
        smtp_host: parsed.smtp_host,
        smtp_port: parsed.smtp_port,
        smtp_security: parsed.smtp_security,
        encrypted_credentials: encryptedCredentials,
        status: "pending",
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ mailbox: data }, { status: 201 });
  } catch (error) {
    return errorResponse(error, "Could not create CRM mailbox.");
  }
}

export async function PATCH(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });

    const body = await request.json() as Record<string, unknown>;
    const mailboxId = Number(body.id);
    if (!Number.isInteger(mailboxId) || mailboxId <= 0) {
      return NextResponse.json({ error: "A valid mailbox is required." }, { status: 400 });
    }

    const { data: existing, error: lookupError } = await client.from("crm_mailboxes").select("*").eq("id", mailboxId).single();
    if (lookupError) throw lookupError;

    const parsed = parseMailbox(body, false);
    const username: string = parsed.username || existing.email_address;
    const password: string = parsed.password && parsed.password.length > 0 ? parsed.password : (() => {
      const decrypted = decryptMailboxCredentials(existing.encrypted_credentials ?? "");
      return decrypted.password;
    })();

    const updatedValues = {
      company_id: parsed.company_id,
      email_address: parsed.email_address,
      display_name: parsed.display_name,
      provider: parsed.provider,
      imap_host: parsed.imap_host,
      imap_port: parsed.imap_port,
      imap_security: parsed.imap_security,
      smtp_host: parsed.smtp_host,
      smtp_port: parsed.smtp_port,
      smtp_security: parsed.smtp_security,
      encrypted_credentials: encryptMailboxCredentials({ username, password }),
      status: statusOptions.includes(text(body.status)) ? text(body.status) : existing.status,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await client.from("crm_mailboxes").update(updatedValues).eq("id", mailboxId).select().single();
    if (error) throw error;
    return NextResponse.json({ mailbox: data });
  } catch (error) {
    return errorResponse(error, "Could not update CRM mailbox.");
  }
}

export async function DELETE(request: Request) {
  try {
    const { client, error: authError } = await getCrmAdminClient();
    if (authError) return NextResponse.json({ error: authError }, { status: 403 });

    const mailboxId = Number(new URL(request.url).searchParams.get("id"));
    if (!Number.isInteger(mailboxId) || mailboxId <= 0) {
      return NextResponse.json({ error: "A valid mailbox is required." }, { status: 400 });
    }

    const { error } = await client.from("crm_mailboxes").delete().eq("id", mailboxId);
    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (error) {
    return errorResponse(error, "Could not delete CRM mailbox.");
  }
}
