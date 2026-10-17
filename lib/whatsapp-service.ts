import { existsSync, mkdirSync, rmSync } from "fs";
import { join } from "path";
import QRCode from "qrcode";
import {
  Browsers,
  DisconnectReason,
  makeWASocket,
  useMultiFileAuthState,
  type Chat,
  type Contact,
  type SocketConfig,
  type WAMessage,
  type WASocket,
} from "@whiskeysockets/baileys";
import { getSupabaseServiceRoleClient } from "@/lib/supabase-server";

export type WhatsAppConnectionStatus = "disconnected" | "connecting" | "connected" | "reconnecting";

export type WhatsAppConnectionRecord = {
  id?: number;
  company_id: number;
  company_name: string;
  status: WhatsAppConnectionStatus;
  connected_number: string | null;
  profile_name: string;
  qr_code: string | null;
  last_connected_at: string | null;
  note: string | null;
};

type ConnectionFields = Omit<WhatsAppConnectionRecord, "id" | "company_name">;

type ActiveSession = {
  companyId: number;
  companyName: string;
  profileName: string;
  connectedNumber: string | null;
  status: WhatsAppConnectionStatus;
  qrCode: string | null;
  lastConnectedAt: string | null;
  note: string;
  socket: WASocket;
};

export type WhatsAppInboxChat = {
  jid: string;
  name: string;
  is_group: boolean;
  unread_count: number;
  timestamp: number;
  last_message: string;
};

export type WhatsAppInboxMessage = {
  id: string;
  jid: string;
  from_me: boolean;
  sender_name: string | null;
  text: string;
  timestamp: number;
};

export type WhatsAppInboxSnapshot = {
  status: WhatsAppConnectionStatus;
  sync_status: "waiting" | "syncing" | "complete";
  sync_progress: number | null;
  chats: WhatsAppInboxChat[];
};

type CompanyInboxCache = {
  chats: Map<string, WhatsAppInboxChat>;
  messages: Map<string, Map<string, WhatsAppInboxMessage>>;
  contacts: Map<string, Contact>;
  syncStatus: WhatsAppInboxSnapshot["sync_status"];
  syncProgress: number | null;
};

type WhatsAppRuntimeState = {
  activeSessions: Map<number, ActiveSession>;
  startingSessions: Set<number>;
  startingSessionPromises: Map<number, Promise<void>>;
  reconnectTimers: Map<number, ReturnType<typeof setTimeout>>;
  reconnectAttempts: Map<number, number>;
  stoppedCompanies: Set<number>;
  sessionGenerations: Map<number, number>;
  inboxCaches: Map<number, CompanyInboxCache>;
};

type WhatsAppGlobal = typeof globalThis & {
  __digifyWhatsAppRuntime?: WhatsAppRuntimeState;
};

const DATA_DIR = join(process.cwd(), "data");
const AUTH_ROOT = join(DATA_DIR, "whatsapp-auth");
const whatsappRuntime = ((globalThis as WhatsAppGlobal).__digifyWhatsAppRuntime ??=
  {
    activeSessions: new Map(),
    startingSessions: new Set(),
    startingSessionPromises: new Map(),
    reconnectTimers: new Map(),
    reconnectAttempts: new Map(),
    stoppedCompanies: new Set(),
    sessionGenerations: new Map(),
    inboxCaches: new Map(),
  });
const activeSessions = whatsappRuntime.activeSessions;
const startingSessions = whatsappRuntime.startingSessions;
const startingSessionPromises = whatsappRuntime.startingSessionPromises;
const reconnectTimers = whatsappRuntime.reconnectTimers;
const reconnectAttempts = whatsappRuntime.reconnectAttempts;
const stoppedCompanies = whatsappRuntime.stoppedCompanies;
const sessionGenerations = whatsappRuntime.sessionGenerations;
const inboxCaches = whatsappRuntime.inboxCaches;
const MAX_CACHED_CHATS = 500;
const MAX_CACHED_MESSAGES_PER_CHAT = 150;
type WhatsAppLogger = NonNullable<SocketConfig["logger"]>;
function redactWhatsAppLogValue(value: string) {
  return value
    .replace(/\b\+?\d{7,15}\b/g, "[redacted-number]")
    .replace(/\b[A-Za-z0-9+/_=-]{32,}\b/g, "[redacted-token]");
}

function reportBaileysLog(level: "info" | "warn" | "error", args: unknown[]) {
  const message = args.slice().reverse().find((value) => typeof value === "string");
  if (
    level === "info" &&
    (typeof message !== "string" ||
      !/^(connected to WA|not logged in, attempting registration|logging in\.\.\.|opened connection to WA)$/.test(message))
  ) {
    return;
  }
  const errors = args.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    return ["err", "error", "uploadError"].flatMap((key) => {
      if (!(key in value)) return [];
      const error = Reflect.get(value, key);
      if (error instanceof Error) {
        return [{ name: error.name, message: redactWhatsAppLogValue(error.message) }];
      }
      if (
        error &&
        typeof error === "object" &&
        "message" in error &&
        typeof error.message === "string"
      ) {
        return [{ message: redactWhatsAppLogValue(error.message) }];
      }
      return [];
    });
  });
  const label = typeof message === "string" ? redactWhatsAppLogValue(message) : "Baileys event";
  const details = errors.length ? { errors } : undefined;
  if (details) console[level](`[WhatsApp][Baileys] ${label}`, details);
  else console[level](`[WhatsApp][Baileys] ${label}`);
}

const diagnosticWhatsAppLogger: WhatsAppLogger = {
  level: "info",
  child: () => diagnosticWhatsAppLogger,
  trace: () => undefined,
  debug: () => undefined,
  info: (...args: unknown[]) => reportBaileysLog("info", args),
  warn: (...args: unknown[]) => reportBaileysLog("warn", args),
  error: (...args: unknown[]) => reportBaileysLog("error", args),
};

function getInboxCache(companyId: number) {
  let cache = inboxCaches.get(companyId);
  if (!cache) {
    cache = {
      chats: new Map(),
      messages: new Map(),
      contacts: new Map(),
      syncStatus: "waiting",
      syncProgress: null,
    };
    inboxCaches.set(companyId, cache);
  }
  return cache;
}

function timestampToMilliseconds(timestamp: unknown) {
  let seconds: number | null = null;
  if (typeof timestamp === "number") seconds = timestamp;
  else if (typeof timestamp === "string") seconds = Number(timestamp);
  else if (
    timestamp &&
    typeof timestamp === "object" &&
    "toNumber" in timestamp &&
    typeof timestamp.toNumber === "function"
  ) {
    seconds = timestamp.toNumber();
  }
  return seconds && Number.isFinite(seconds) ? seconds * 1000 : Date.now();
}

function contactLabel(contact: Contact | undefined) {
  return contact?.name || contact?.verifiedName || contact?.notify || null;
}

function labelForJid(cache: CompanyInboxCache, jid: string, name?: string | null) {
  const contactName = contactLabel(cache.contacts.get(jid));
  if (jid.endsWith("@g.us")) return name?.trim() || contactName || "WhatsApp group";
  return contactName || name?.trim() || jid.split("@")[0] || jid;
}

function updateCachedChat(
  companyId: number,
  jid: string,
  changes: Partial<WhatsAppInboxChat>,
) {
  const cache = getInboxCache(companyId);
  const previous = cache.chats.get(jid);
  const next = {
    jid,
    name: labelForJid(cache, jid, changes.name ?? previous?.name),
    is_group: jid.endsWith("@g.us"),
    unread_count: changes.unread_count ?? previous?.unread_count ?? 0,
    timestamp: changes.timestamp ?? previous?.timestamp ?? 0,
    last_message: changes.last_message ?? previous?.last_message ?? "",
  };
  cache.chats.set(jid, next);
  if (cache.chats.size > MAX_CACHED_CHATS) {
    const oldest = [...cache.chats.values()].sort((left, right) => left.timestamp - right.timestamp)[0];
    if (oldest) {
      cache.chats.delete(oldest.jid);
      cache.messages.delete(oldest.jid);
    }
  }
}

function chatFromBaileys(companyId: number, chat: Chat) {
  if (!chat.id) return;
  updateCachedChat(companyId, chat.id, {
    name: chat.name ?? undefined,
    unread_count: chat.unreadCount ?? undefined,
    timestamp: timestampToMilliseconds(chat.conversationTimestamp),
  });
}

function messageText(message: WAMessage) {
  const content = message.message;
  if (!content) return message.messageStubType ? "Message unavailable" : "";
  return (
    content.conversation ||
    content.extendedTextMessage?.text ||
    content.imageMessage?.caption ||
    content.videoMessage?.caption ||
    content.documentMessage?.caption ||
    (content.imageMessage ? "Image" : "") ||
    (content.videoMessage ? "Video" : "") ||
    (content.audioMessage ? "Audio" : "") ||
    (content.documentMessage ? "Document" : "") ||
    (content.stickerMessage ? "Sticker" : "") ||
    (message.messageStubType ? "Message unavailable" : "")
  );
}

function cacheBaileysMessage(companyId: number, message: WAMessage, countUnread: boolean) {
  const jid = message.key.remoteJid;
  const id = message.key.id;
  if (!jid || !id) return;

  const cache = getInboxCache(companyId);
  const chatMessages = cache.messages.get(jid) ?? new Map<string, WhatsAppInboxMessage>();
  if (!cache.messages.has(jid)) cache.messages.set(jid, chatMessages);

  const text = messageText(message);
  const timestamp = timestampToMilliseconds(message.messageTimestamp);
  const existed = chatMessages.has(id);
  chatMessages.set(id, {
    id,
    jid,
    from_me: Boolean(message.key.fromMe),
    sender_name: message.pushName || null,
    text: text || "Message",
    timestamp,
  });
  while (chatMessages.size > MAX_CACHED_MESSAGES_PER_CHAT) {
    const oldestId = [...chatMessages.values()].sort((left, right) => left.timestamp - right.timestamp)[0]?.id;
    if (!oldestId) break;
    chatMessages.delete(oldestId);
  }

  const chat = cache.chats.get(jid);
  updateCachedChat(companyId, jid, {
    name: chat?.name,
    timestamp: Math.max(chat?.timestamp ?? 0, timestamp),
    last_message: text || "Message",
    unread_count:
      countUnread && !existed && !message.key.fromMe
        ? (chat?.unread_count ?? 0) + 1
        : chat?.unread_count,
  });
}

function normalizePhoneNumber(value: string | null | undefined) {
  if (!value) return null;
  const clean = value.replace(/[^\d+]/g, "");
  return clean ? (clean.startsWith("+") ? clean : `+${clean}`) : null;
}

function toRecord(session: ActiveSession): WhatsAppConnectionRecord {
  return {
    company_id: session.companyId,
    company_name: session.companyName,
    status: session.status,
    connected_number: session.connectedNumber,
    profile_name: session.profileName,
    qr_code: session.qrCode,
    last_connected_at: session.lastConnectedAt,
    note: session.note,
  };
}

async function updateConnection(companyId: number, values: Partial<ConnectionFields>) {
  const { error } = await getSupabaseServiceRoleClient()
    .from("crm_whatsapp_connections")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("company_id", companyId);
  if (error) throw error;
}

function reportEventError(event: string, companyId: number, error: unknown) {
  console.error(`[WhatsApp] Failed to handle ${event} for company ${companyId}:`, error);
}

function getSessionGeneration(companyId: number) {
  return sessionGenerations.get(companyId) ?? 0;
}

function advanceSessionGeneration(companyId: number) {
  const generation = getSessionGeneration(companyId) + 1;
  sessionGenerations.set(companyId, generation);
  return generation;
}

async function waitForSessionStart(companyId: number) {
  await startingSessionPromises.get(companyId);
}

function scheduleReconnect(
  companyId: number,
  companyName: string,
  profileName: string,
  connectedNumber: string | null,
  statusCode?: number,
) {
  if (stoppedCompanies.has(companyId) || reconnectTimers.has(companyId)) return;

  const attempt = reconnectAttempts.get(companyId) ?? 0;
  const delay = statusCode === DisconnectReason.restartRequired && attempt === 0
    ? 250
    : Math.min(2_000 * 2 ** attempt, 60_000);
  reconnectAttempts.set(companyId, attempt + 1);
  const generation = getSessionGeneration(companyId);
  console.info("[WhatsApp] Scheduled reconnect.", {
    companyId,
    attempt: attempt + 1,
    retryInMs: delay,
    generation,
  });
  const timer = setTimeout(() => {
    reconnectTimers.delete(companyId);
    if (stoppedCompanies.has(companyId) || generation !== getSessionGeneration(companyId)) return;
    void connectCompany(companyId, companyName, profileName, connectedNumber, {
      automatic: true,
      expectedGeneration: generation,
    })
      .catch(async (error: unknown) => {
        if (stoppedCompanies.has(companyId) || generation !== getSessionGeneration(companyId)) return;
        reportEventError("automatic reconnect", companyId, error);
        try {
          await updateConnection(companyId, {
            status: "reconnecting",
            qr_code: null,
            note: "Could not restore the saved WhatsApp session. Retrying with a longer delay.",
          });
        } catch (updateError) {
          reportEventError("reconnect status update", companyId, updateError);
        }
        if (!stoppedCompanies.has(companyId) && generation === getSessionGeneration(companyId)) {
          scheduleReconnect(companyId, companyName, profileName, connectedNumber);
        }
      });
  }, delay);
  reconnectTimers.set(companyId, timer);
}

async function startSocket(
  companyId: number,
  companyName: string,
  profileName: string,
  connectedNumber: string | null,
  generation: number,
): Promise<boolean> {
  const authDir = join(AUTH_ROOT, `company-${companyId}`);
  mkdirSync(authDir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(authDir);
  if (generation !== getSessionGeneration(companyId) || stoppedCompanies.has(companyId)) return false;
  const socket = makeWASocket({
    auth: state,
    browser: Browsers.macOS("Desktop"),
    syncFullHistory: true,
    markOnlineOnConnect: false,
    logger: diagnosticWhatsAppLogger,
  });
  const hasSavedSession = state.creds.registered;
  console.info("[WhatsApp] Starting session.", {
    companyId,
    hasSavedSession,
    generation,
  });

  const session: ActiveSession = {
    companyId,
    companyName,
    profileName,
    connectedNumber,
    status: hasSavedSession ? "reconnecting" : "connecting",
    qrCode: null,
    lastConnectedAt: null,
    note: hasSavedSession
      ? "Restoring the saved WhatsApp session."
      : "Waiting for WhatsApp to provide a QR code.",
    socket,
  };
  activeSessions.set(companyId, session);

  let receivedFrameCount = 0;
  let receivedByteCount = 0;
  socket.ws.on("message", (data: unknown) => {
    receivedFrameCount += 1;
    if (Buffer.isBuffer(data)) receivedByteCount += data.byteLength;
    else if (data instanceof ArrayBuffer) receivedByteCount += data.byteLength;
    else if (Array.isArray(data)) {
      receivedByteCount += data.reduce(
        (total, chunk) => total + (Buffer.isBuffer(chunk) ? chunk.byteLength : 0),
        0,
      );
    }
  });
  socket.ws.on("close", (code: number, reason: Buffer) => {
    console.warn("[WhatsApp][WebSocket] Closed.", {
      companyId,
      code,
      reason: redactWhatsAppLogValue(reason.toString("utf8")).slice(0, 200),
      receivedFrameCount,
      receivedByteCount,
    });
  });
  socket.ws.on("error", (error: Error) => {
    console.warn("[WhatsApp][WebSocket] Error.", {
      companyId,
      name: error.name,
      message: redactWhatsAppLogValue(error.message),
    });
  });
  socket.ws.on("CB:stream:error", (node: unknown) => {
    const attrs = node && typeof node === "object" ? Reflect.get(node, "attrs") : null;
    const reason = attrs && typeof attrs === "object" ? Reflect.get(attrs, "reason") : null;
    const code = attrs && typeof attrs === "object" ? Reflect.get(attrs, "code") : null;
    console.warn("[WhatsApp][Protocol] Server stream error.", {
      companyId,
      reason: typeof reason === "string" ? redactWhatsAppLogValue(reason).slice(0, 120) : null,
      code: typeof code === "string" ? code.slice(0, 32) : null,
    });
  });
  socket.ws.on("CB:failure", (node: unknown) => {
    const attrs = node && typeof node === "object" ? Reflect.get(node, "attrs") : null;
    const reason = attrs && typeof attrs === "object" ? Reflect.get(attrs, "reason") : null;
    console.warn("[WhatsApp][Protocol] Server rejected connection.", {
      companyId,
      reason: typeof reason === "string" ? reason.slice(0, 32) : null,
    });
  });
  socket.ws.on("unexpected-response", (_request: unknown, response: { statusCode?: number; statusMessage?: string }) => {
    console.warn("[WhatsApp][WebSocket] Unexpected HTTP response.", {
      companyId,
      statusCode: response.statusCode ?? null,
      statusMessage: response.statusMessage ?? null,
    });
  });

  socket.ev.on("creds.update", () => {
    void saveCreds().catch((error: unknown) => reportEventError("credentials update", companyId, error));
  });

  socket.ev.on("messaging-history.set", ({ chats, contacts, messages, isLatest, progress }) => {
    const cache = getInboxCache(companyId);
    cache.syncStatus = isLatest ? "complete" : "syncing";
    cache.syncProgress = typeof progress === "number" ? progress : null;
    for (const contact of contacts) cache.contacts.set(contact.id, contact);
    for (const chat of chats) chatFromBaileys(companyId, chat);
    for (const message of messages) cacheBaileysMessage(companyId, message, false);
  });

  socket.ev.on("messaging-history.status", ({ status }) => {
    if (status === "complete") {
      const cache = getInboxCache(companyId);
      cache.syncStatus = "complete";
      cache.syncProgress = 100;
    }
  });

  socket.ev.on("chats.upsert", (chats) => {
    for (const chat of chats) chatFromBaileys(companyId, chat);
  });

  socket.ev.on("chats.update", (updates) => {
    const cache = getInboxCache(companyId);
    for (const update of updates) {
      if (!update.id) continue;
      const previous = cache.chats.get(update.id);
      updateCachedChat(companyId, update.id, {
        name: update.name ?? previous?.name,
        unread_count: update.unreadCount ?? previous?.unread_count,
        timestamp: update.conversationTimestamp
          ? timestampToMilliseconds(update.conversationTimestamp)
          : previous?.timestamp,
      });
    }
  });

  socket.ev.on("chats.delete", (jids) => {
    const cache = getInboxCache(companyId);
    for (const jid of jids) {
      cache.chats.delete(jid);
      cache.messages.delete(jid);
    }
  });

  socket.ev.on("contacts.upsert", (contacts) => {
    const cache = getInboxCache(companyId);
    for (const contact of contacts) {
      cache.contacts.set(contact.id, contact);
      const chat = cache.chats.get(contact.id);
      if (chat) updateCachedChat(companyId, contact.id, { name: contactLabel(contact) || chat.name });
    }
  });

  socket.ev.on("contacts.update", (updates) => {
    const cache = getInboxCache(companyId);
    for (const update of updates) {
      if (!update.id) continue;
      const previous = cache.contacts.get(update.id);
      cache.contacts.set(update.id, { ...previous, ...update, id: update.id });
      const chat = cache.chats.get(update.id);
      if (chat) updateCachedChat(companyId, update.id, { name: contactLabel(cache.contacts.get(update.id)) || chat.name });
    }
  });

  socket.ev.on("messages.upsert", ({ messages, type }) => {
    for (const message of messages) {
      cacheBaileysMessage(companyId, message, type === "notify");
    }
  });

  socket.ev.on("connection.update", (update) => {
    void (async () => {
      const current = activeSessions.get(companyId);
      if (current !== session || generation !== getSessionGeneration(companyId) || stoppedCompanies.has(companyId)) return;

      if (update.qr) {
        const qrCode = await QRCode.toDataURL(update.qr);
        session.status = "connecting";
        session.qrCode = qrCode;
        session.note = "Scan this QR from WhatsApp > Linked devices.";
        console.info("[WhatsApp] QR code generated.", { companyId, generation });
        await updateConnection(companyId, {
          status: session.status,
          qr_code: qrCode,
          note: session.note,
        });
      }

      if (update.connection === "open") {
        const pendingReconnect = reconnectTimers.get(companyId);
        if (pendingReconnect) clearTimeout(pendingReconnect);
        reconnectTimers.delete(companyId);
        reconnectAttempts.delete(companyId);
        session.status = "connected";
        const socketJid = socket.user?.id ?? "";
        const phoneJid = socketJid.endsWith("@s.whatsapp.net")
          ? socketJid.split("@")[0].split(":")[0]
          : null;
        session.connectedNumber = normalizePhoneNumber(phoneJid) ?? session.connectedNumber;
        session.qrCode = null;
        session.lastConnectedAt = new Date().toISOString();
        session.note = "WhatsApp is connected.";
        await updateConnection(companyId, {
          status: session.status,
          connected_number: session.connectedNumber,
          profile_name: session.profileName,
          qr_code: null,
          last_connected_at: session.lastConnectedAt,
          note: session.note,
        });
      }

      if (update.connection === "close") {
        const error = update.lastDisconnect?.error;
        const statusCode =
          error && typeof error === "object" && "output" in error && error.output &&
          typeof error.output === "object" && "statusCode" in error.output
            ? Number(error.output.statusCode)
            : undefined;
        const loggedOut = statusCode === DisconnectReason.loggedOut;
        session.status = loggedOut ? "disconnected" : "reconnecting";
        session.qrCode = loggedOut ? null : session.qrCode;
        const errorMessage = error instanceof Error ? error.message : "Unknown disconnect error.";
        const attempt = reconnectAttempts.get(companyId) ?? 0;
        const delay = statusCode === DisconnectReason.restartRequired && attempt === 0
          ? 250
          : Math.min(2_000 * 2 ** attempt, 60_000);
        session.note = loggedOut
          ? "WhatsApp logged this linked device out. Reconnect to scan a new QR."
          : `WhatsApp disconnected (${statusCode ?? "network error"}). Retrying in ${Math.ceil(delay / 1000)} seconds.`;
        console.warn("[WhatsApp] Connection closed.", {
          companyId,
          statusCode: statusCode ?? null,
          reason: errorMessage,
          retryInMs: loggedOut ? null : delay,
        });
        try {
          await updateConnection(companyId, {
            status: session.status,
            qr_code: session.qrCode,
            note: session.note,
          });
        } catch (statusError) {
          reportEventError("connection close status update", companyId, statusError);
        }

        activeSessions.delete(companyId);
        if (loggedOut) {
          reconnectAttempts.delete(companyId);
          const authPath = join(AUTH_ROOT, `company-${companyId}`);
          if (existsSync(authPath)) rmSync(authPath, { recursive: true, force: true });
          return;
        }

        scheduleReconnect(companyId, companyName, profileName, connectedNumber, statusCode);
      }
    })().catch((error: unknown) => reportEventError("connection update", companyId, error));
  });
  return true;
}

export async function getAllConnections(companyIds?: number[]) {
  let query = getSupabaseServiceRoleClient()
    .from("crm_whatsapp_connections")
    .select("id, company_id, status, connected_number, profile_name, qr_code, last_connected_at, note, crm_companies(name)")
    .order("created_at", { ascending: true });
  if (companyIds) {
    if (!companyIds.length) return [];
    query = query.in("company_id", companyIds);
  }

  const { data, error } = await query;
  if (error) throw error;

  const records = (data ?? []).map((row) => {
    const company = Array.isArray(row.crm_companies) ? row.crm_companies[0] : row.crm_companies;
    const record: WhatsAppConnectionRecord = {
      id: row.id,
      company_id: row.company_id,
      company_name: company?.name ?? `Company ${row.company_id}`,
      status: row.status as WhatsAppConnectionStatus,
      connected_number: row.connected_number,
      profile_name: row.profile_name,
      qr_code: row.qr_code,
      last_connected_at: row.last_connected_at,
      note: row.note,
    };
    const active = activeSessions.get(row.company_id);
    return active ? toRecord(active) : record;
  });

  for (const record of records) {
    if (
      record.status === "disconnected" ||
      stoppedCompanies.has(record.company_id) ||
      activeSessions.has(record.company_id) ||
      startingSessions.has(record.company_id) ||
      reconnectTimers.has(record.company_id)
    ) continue;
    const generation = getSessionGeneration(record.company_id);
    try {
      await connectCompany(
        record.company_id,
        record.company_name,
        record.profile_name,
        record.connected_number,
        { automatic: true, expectedGeneration: generation },
      );
    } catch (error) {
      if (stoppedCompanies.has(record.company_id) || generation !== getSessionGeneration(record.company_id)) continue;
      reportEventError("session restore", record.company_id, error);
      const detail = error instanceof Error ? error.message : "Unknown session restore error.";
      await updateConnection(record.company_id, {
        status: "reconnecting",
        qr_code: null,
        note: `Could not restore the saved WhatsApp session: ${detail}`,
      });
    }
  }

  for (let index = 0; index < records.length; index += 1) {
    const active = activeSessions.get(records[index].company_id);
    if (active) records[index] = toRecord(active);
  }

  return records.sort((left, right) => left.company_name.localeCompare(right.company_name));
}

export async function connectCompany(
  companyId: number,
  companyName: string,
  profileName?: string,
  connectedNumber: string | null = null,
  options: { automatic?: boolean; expectedGeneration?: number } = {},
) {
  let generation: number;
  if (options.automatic) {
    generation = options.expectedGeneration ?? getSessionGeneration(companyId);
    if (stoppedCompanies.has(companyId) || generation !== getSessionGeneration(companyId)) {
      throw new Error("WhatsApp connection startup was cancelled.");
    }
  } else {
    stoppedCompanies.delete(companyId);
    generation = advanceSessionGeneration(companyId);
  }

  const reconnectTimer = reconnectTimers.get(companyId);
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimers.delete(companyId);
  }
  const existing = activeSessions.get(companyId);
  if (existing) return toRecord(existing);
  if (startingSessions.has(companyId)) {
    const { data, error } = await getSupabaseServiceRoleClient()
      .from("crm_whatsapp_connections")
      .select("company_id, status, connected_number, profile_name, qr_code, last_connected_at, note")
      .eq("company_id", companyId)
      .single();
    if (error) throw error;
    return {
      ...data,
      company_name: companyName,
    } as WhatsAppConnectionRecord;
  }

  startingSessions.add(companyId);
  let finishStartup!: () => void;
  const startupPromise = new Promise<void>((resolve) => {
    finishStartup = resolve;
  });
  startingSessionPromises.set(companyId, startupPromise);
  try {
    const { data: row, error } = await getSupabaseServiceRoleClient()
      .from("crm_whatsapp_connections")
      .select("profile_name, connected_number, last_connected_at, status")
      .eq("company_id", companyId)
      .single();
    if (error) throw error;
    if (generation !== getSessionGeneration(companyId) || stoppedCompanies.has(companyId)) {
      return {
        company_id: companyId,
        company_name: companyName,
        status: "disconnected",
        connected_number: null,
        profile_name: row.profile_name,
        qr_code: null,
        last_connected_at: row.last_connected_at,
        note: "WhatsApp connection was stopped.",
      } satisfies WhatsAppConnectionRecord;
    }
    if (options.automatic && row.status === "disconnected") {
      stoppedCompanies.add(companyId);
      return {
        company_id: companyId,
        company_name: companyName,
        status: "disconnected",
        connected_number: null,
        profile_name: row.profile_name,
        qr_code: null,
        last_connected_at: row.last_connected_at,
        note: "WhatsApp is disconnected.",
      } satisfies WhatsAppConnectionRecord;
    }

    await updateConnection(companyId, {
      status: "connecting",
      connected_number: connectedNumber ?? row.connected_number,
      profile_name: profileName?.trim() || row.profile_name || "Company WhatsApp",
      qr_code: null,
      note: "Starting a Baileys WhatsApp session.",
    });
    if (generation !== getSessionGeneration(companyId) || stoppedCompanies.has(companyId)) {
      return {
        company_id: companyId,
        company_name: companyName,
        status: "disconnected",
        connected_number: null,
        profile_name: row.profile_name,
        qr_code: null,
        last_connected_at: row.last_connected_at,
        note: "WhatsApp connection was stopped.",
      } satisfies WhatsAppConnectionRecord;
    }

    const started = await startSocket(
      companyId,
      companyName,
      profileName?.trim() || row.profile_name || "Company WhatsApp",
      connectedNumber ?? row.connected_number,
      generation,
    );

    if (!started) {
      return {
        company_id: companyId,
        company_name: companyName,
        status: "disconnected",
        connected_number: null,
        profile_name: row.profile_name,
        qr_code: null,
        last_connected_at: row.last_connected_at,
        note: "WhatsApp connection was stopped.",
      } satisfies WhatsAppConnectionRecord;
    }

    const active = activeSessions.get(companyId);
    if (!active) throw new Error(`WhatsApp session for company ${companyId} did not start.`);
    return toRecord(active);
  } finally {
    startingSessions.delete(companyId);
    if (startingSessionPromises.get(companyId) === startupPromise) {
      startingSessionPromises.delete(companyId);
    }
    finishStartup();
  }
}

export async function updateCompanyConnection(companyId: number, profileName: string) {
  const normalized = profileName.trim();
  if (!normalized) throw new Error("Profile name is required.");
  const session = activeSessions.get(companyId);
  if (session) session.profileName = normalized;
  await updateConnection(companyId, { profile_name: normalized });
}

export async function disconnectCompany(companyId: number) {
  stoppedCompanies.add(companyId);
  advanceSessionGeneration(companyId);
  const reconnectTimer = reconnectTimers.get(companyId);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimers.delete(companyId);
  reconnectAttempts.delete(companyId);
  await waitForSessionStart(companyId);
  const session = activeSessions.get(companyId);
  if (session) {
    activeSessions.delete(companyId);
    try {
      await session.socket.logout();
    } catch (error) {
      reportEventError("logout", companyId, error);
      session.socket.end(error instanceof Error ? error : undefined);
    }
  }

  const authPath = join(AUTH_ROOT, `company-${companyId}`);
  if (existsSync(authPath)) rmSync(authPath, { recursive: true, force: true });

  inboxCaches.delete(companyId);
  await updateConnection(companyId, {
    status: "disconnected",
    connected_number: null,
    qr_code: null,
    note: "WhatsApp was disconnected. Connect again to link a device.",
  });
}

export async function resetCompanySession(
  companyId: number,
  companyName: string,
  profileName?: string,
) {
  stoppedCompanies.add(companyId);
  advanceSessionGeneration(companyId);

  const reconnectTimer = reconnectTimers.get(companyId);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimers.delete(companyId);
  reconnectAttempts.delete(companyId);

  const session = activeSessions.get(companyId);
  if (session) {
    activeSessions.delete(companyId);
    session.socket.end(new Error("Starting a fresh WhatsApp QR session."));
  }

  await waitForSessionStart(companyId);

  const authPath = join(AUTH_ROOT, `company-${companyId}`);
  if (existsSync(authPath)) rmSync(authPath, { recursive: true, force: true });
  inboxCaches.delete(companyId);

  await updateConnection(companyId, {
    status: "connecting",
    connected_number: null,
    qr_code: null,
    profile_name: profileName?.trim() || undefined,
    note: "Starting a fresh WhatsApp session. Waiting for a new QR code.",
  });

  stoppedCompanies.delete(companyId);
  console.info("[WhatsApp] Fresh QR reset completed; starting unregistered session.", {
    companyId,
    generation: getSessionGeneration(companyId),
  });
  return connectCompany(companyId, companyName, profileName, null);
}

export async function deleteCompanyConnection(companyId: number) {
  stoppedCompanies.add(companyId);
  advanceSessionGeneration(companyId);
  const reconnectTimer = reconnectTimers.get(companyId);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimers.delete(companyId);
  reconnectAttempts.delete(companyId);
  await waitForSessionStart(companyId);
  const session = activeSessions.get(companyId);
  if (session) {
    activeSessions.delete(companyId);
    try {
      await session.socket.logout();
    } catch (error) {
      reportEventError("logout before delete", companyId, error);
      session.socket.end(error instanceof Error ? error : undefined);
    }
  }

  const authPath = join(AUTH_ROOT, `company-${companyId}`);
  if (existsSync(authPath)) rmSync(authPath, { recursive: true, force: true });

  const { error } = await getSupabaseServiceRoleClient()
    .from("crm_whatsapp_connections")
    .delete()
    .eq("company_id", companyId);
  if (error) throw error;
  inboxCaches.delete(companyId);
}

export function getCompanyInboxSnapshot(companyId: number): WhatsAppInboxSnapshot {
  const cache = getInboxCache(companyId);
  const session = activeSessions.get(companyId);
  return {
    status: session?.status ?? "disconnected",
    sync_status: cache.syncStatus,
    sync_progress: cache.syncProgress,
    chats: [...cache.chats.values()].sort((left, right) => right.timestamp - left.timestamp),
  };
}

export async function ensureCompanySession(companyId: number) {
  if (activeSessions.has(companyId) || startingSessions.has(companyId)) return;
  await getAllConnections([companyId]);
}

export function getCompanyInboxMessages(companyId: number, jid: string, before?: number) {
  const cache = getInboxCache(companyId);
  return [...(cache.messages.get(jid)?.values() ?? [])]
    .filter((message) => before === undefined || message.timestamp < before)
    .sort((left, right) => left.timestamp - right.timestamp);
}

export async function sendCompanyTextMessage(companyId: number, jid: string, text: string) {
  const session = activeSessions.get(companyId);
  if (!session || session.status !== "connected") {
    throw new Error("This company's WhatsApp account is not connected.");
  }
  const result = await session.socket.sendMessage(jid, { text });
  if (!result) throw new Error("WhatsApp did not confirm the message send.");
  cacheBaileysMessage(companyId, result, false);
  return result.key.id;
}
