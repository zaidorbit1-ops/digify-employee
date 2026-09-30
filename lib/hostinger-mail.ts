import { timingSafeEqual } from "node:crypto";
import {
  AccountApi,
  Configuration,
  MessagesApi,
  SendApi,
  type V1FolderMessagesSearchRequest,
  type V1SendRequest,
  WebhooksApi,
} from "hostinger-mail-api-sdk";
import { simpleParser } from "mailparser";
import sanitizeHtml from "sanitize-html";
import postcss from "postcss";
import { getConfiguredHostingerMailbox, getHostingerApiToken } from "@/lib/hostinger-env";

export type HostingerAttachment = {
  name: string;
  type?: string;
  base64: string;
};

function configuration(address: string) {
  const token = getHostingerApiToken(address);
  if (!token) throw new Error(`Hostinger API token is not configured for ${address}.`);
  return new Configuration({ accessToken: token });
}

export async function getHostingerMailbox(addressOverride?: string) {
  const requestedAddress = (addressOverride || process.env.HOSTINGER_MAILBOX)?.trim().toLowerCase();
  const address = requestedAddress || "";
  if (!address) throw new Error("A Hostinger mailbox address is required.");
  const configuredAddress = getConfiguredHostingerMailbox(address);
  if (configuredAddress !== address) throw new Error(`HOSTINGER_MAILBOX_${address.split("@")[1].split(".")[0].toUpperCase()} must match ${address}.`);
  const response = await new AccountApi(configuration(address)).getCurrentAccount();
  const mailbox = response.data?.data?.mailboxes?.find((item) => item.address?.toLowerCase() === address);
  if (!mailbox?.resourceId) throw new Error("The configured Hostinger mailbox is not available to this API token.");
  return mailbox;
}

export async function registerHostingerWebhook(address: string) {
  const mailbox = await getHostingerMailbox(address);
  const url = process.env.HOSTINGER_WEBHOOK_URL || `${String(process.env.CRM_PUBLIC_URL || "").replace(/\/$/, "")}/api/email/hostinger/webhook`;
  if (!url.startsWith("https://")) throw new Error("HOSTINGER_WEBHOOK_URL or CRM_PUBLIC_URL must be an HTTPS URL.");
  const response = await new WebhooksApi(configuration(address)).createWebhook(mailbox.resourceId, {
    name: `CRM ${address}`,
    description: "CRM incoming email delivery",
    events: ["message.received"],
    status: "active",
    url,
  });
  const webhook = response.data?.data;
  if (!webhook?.id || !webhook.secret) throw new Error("Hostinger did not return the webhook registration secret.");
  return { resourceId: mailbox.resourceId, webhookId: webhook.id, secret: webhook.secret };
}

export async function getHostingerWebhook(address: string, webhookId: string) {
  const mailbox = await getHostingerMailbox(address);
  const response = await new WebhooksApi(configuration(address)).getWebhook(mailbox.resourceId, webhookId);
  return { resourceId: mailbox.resourceId, webhook: response.data?.data };
}

export async function testHostingerWebhook(address: string, resourceId: string, webhookId: string) {
  const response = await new WebhooksApi(configuration(address)).testWebhook(resourceId, webhookId);
  return response.data?.data;
}

export async function regenerateHostingerWebhookSecret(address: string, webhookId: string) {
  const mailbox = await getHostingerMailbox(address);
  const response = await new WebhooksApi(configuration(address)).regenerateWebhookSecret(mailbox.resourceId, webhookId);
  const webhook = response.data?.data;
  if (!webhook?.id || !webhook.secret) throw new Error("Hostinger did not return a regenerated webhook secret.");
  return { resourceId: mailbox.resourceId, webhookId: webhook.id, secret: webhook.secret };
}

async function parseHostingerMessageSource(source: unknown) {
  let rawMessage: Buffer;
  if (typeof source === "string") rawMessage = Buffer.from(source);
  else if (Buffer.isBuffer(source)) rawMessage = source;
  else if (source instanceof Uint8Array) rawMessage = Buffer.from(source);
  else if (source instanceof ArrayBuffer) rawMessage = Buffer.from(source);
  else if (source && typeof source === "object" && "arrayBuffer" in source && typeof source.arrayBuffer === "function") {
    rawMessage = Buffer.from(await source.arrayBuffer());
  } else {
    throw new Error("Hostinger returned an unsupported raw message format.");
  }

  const parsed = await simpleParser(rawMessage);
  return { text: parsed.text || "", html: typeof parsed.html === "string" ? parsed.html : "" };
}

export async function getHostingerMessage(address: string, folder: string, uid: number) {
  const mailbox = await getHostingerMailbox(address);
  const api = new MessagesApi(configuration(address));
  const [messageResult, textResult] = await Promise.allSettled([
    api.getMessage(mailbox.resourceId, folder, uid),
    api.getMessageText(mailbox.resourceId, folder, uid),
  ]);
  const renderedBody = textResult.status === "fulfilled" ? textResult.value.data.data : null;
  let body = { text: renderedBody?.text || "", html: renderedBody?.html || "" };
  if (!body.text.trim() && !body.html.trim()) {
    try {
      const source = await api.getMessageSource(mailbox.resourceId, folder, uid);
      body = await parseHostingerMessageSource(source.data);
    } catch (error) {
      console.warn("[hostinger] raw message source fallback failed", { uid, folder, error: error instanceof Error ? error.message : "Unknown error" });
    }
  }
  if (messageResult.status === "rejected" && textResult.status === "rejected" && !body.text.trim() && !body.html.trim()) throw textResult.reason;
  return {
    mailbox,
    message: messageResult.status === "fulfilled" ? messageResult.value.data.data : {},
    body,
  };
}

function normalizeMessageId(value: string) {
  return value.trim().replace(/^<|>$/g, "").toLowerCase();
}

export async function findHostingerMessage(address: string, folder: string, messageId: string) {
  const mailbox = await getHostingerMailbox(address);
  const api = new MessagesApi(configuration(address));
  const headers = [`Message-ID: ${messageId}`, `Message-ID ${messageId}`];
  for (const header of headers) {
    const search: V1FolderMessagesSearchRequest = {
      since: "", before: "", flags: [], uid: "", subject: "", from: "", to: "", cc: "", body: "",
      header, larger: 0, smaller: 0, text: "",
    };
    try {
      const response = await api.searchMessages(mailbox.resourceId, folder, 1, 10, "-uid", search);
      const match = response.data.data.find((message) => normalizeMessageId(message.messageId ?? "") === normalizeMessageId(messageId));
      if (match) return match;
    } catch {
      continue;
    }
  }

  const recent = await api.listMessages(mailbox.resourceId, folder, 1, 100, "-date");
  return recent.data.data.find((message) => normalizeMessageId(message.messageId ?? "") === normalizeMessageId(messageId)) ?? null;
}

export async function getHostingerMessageAttachment(address: string, folder: string, uid: number, attachmentId: string) {
  const mailbox = await getHostingerMailbox(address);
  const response = await new MessagesApi(configuration(address)).getMessageAttachment(mailbox.resourceId, folder, uid, attachmentId);
  return response.data;
}

const emailCssValues: Record<string, RegExp[]> = {
  "background-color": [/^#[\da-f]{3,8}$/i, /^rgba?\([\d.,%\s]+\)$/i, /^[a-z]{1,20}$/i],
  border: [/^[\w#(),.%\s-]+$/i],
  "border-color": [/^#[\da-f]{3,8}$/i, /^rgba?\([\d.,%\s]+\)$/i, /^[a-z]{1,20}$/i],
  "border-radius": [/^[\d.]+(px|em|rem|%)?(\s+[\d.]+(px|em|rem|%)?){0,3}$/i],
  "border-style": [/^(none|solid|dashed|dotted|double|groove|ridge|inset|outset)(\s+(none|solid|dashed|dotted|double|groove|ridge|inset|outset)){0,3}$/i],
  "border-width": [/^[\d.]+(px|pt|em|rem)?(\s+[\d.]+(px|pt|em|rem)?){0,3}$/i],
  color: [/^#[\da-f]{3,8}$/i, /^rgba?\([\d.,%\s]+\)$/i, /^[a-z]{1,20}$/i],
  display: [/^(block|inline|inline-block|table|table-cell|table-row|none)$/i],
  "font-family": [/^[\w\s"',-]{1,100}$/],
  "font-size": [/^[\d.]+(px|pt|em|rem|%)$/i],
  "font-style": [/^(normal|italic|oblique)$/i],
  "font-weight": [/^(normal|bold|bolder|lighter|[1-9]00)$/i],
  height: [/^(auto|[\d.]+(px|pt|em|rem|%)|\d+%)$/i],
  "line-height": [/^(normal|[\d.]+(px|pt|em|rem|%)?)$/i],
  margin: [/^(auto|0|[\d.]+(px|pt|em|rem|%))(\s+(auto|0|[\d.]+(px|pt|em|rem|%))){0,3}$/i],
  "margin-bottom": [/^(auto|0|[\d.]+(px|pt|em|rem|%))$/i],
  "margin-left": [/^(auto|0|[\d.]+(px|pt|em|rem|%))$/i],
  "margin-right": [/^(auto|0|[\d.]+(px|pt|em|rem|%))$/i],
  "margin-top": [/^(auto|0|[\d.]+(px|pt|em|rem|%))$/i],
  "max-height": [/^(none|[\d.]+(px|pt|em|rem|%))$/i],
  "max-width": [/^(none|[\d.]+(px|pt|em|rem|%))$/i],
  "min-height": [/^(0|[\d.]+(px|pt|em|rem|%))$/i],
  "min-width": [/^(0|[\d.]+(px|pt|em|rem|%))$/i],
  padding: [/^(0|[\d.]+(px|pt|em|rem|%))(\s+(0|[\d.]+(px|pt|em|rem|%))){0,3}$/i],
  "padding-bottom": [/^(0|[\d.]+(px|pt|em|rem|%))$/i],
  "padding-left": [/^(0|[\d.]+(px|pt|em|rem|%))$/i],
  "padding-right": [/^(0|[\d.]+(px|pt|em|rem|%))$/i],
  "padding-top": [/^(0|[\d.]+(px|pt|em|rem|%))$/i],
  "text-align": [/^(left|right|center|justify|start|end)$/i],
  "text-decoration": [/^(none|underline|overline|line-through)(\s+(solid|double|dotted|dashed|wavy))?$/i],
  "vertical-align": [/^(baseline|sub|super|top|text-top|middle|bottom|text-bottom)$/i],
  width: [/^(auto|[\d.]+(px|pt|em|rem|%)|\d+%)$/i],
  "white-space": [/^(normal|nowrap|pre|pre-wrap|pre-line|break-spaces)$/i],
};

function sanitizeEmailStylesheet(css: string) {
  try {
    const stylesheet = postcss.parse(css);
    stylesheet.walkAtRules((rule) => {
      if (rule.name.toLowerCase() !== "media") rule.remove();
    });
    stylesheet.walkDecls((declaration) => {
      const allowedValues = emailCssValues[declaration.prop.toLowerCase()];
      if (!allowedValues?.some((pattern) => pattern.test(declaration.value))) declaration.remove();
    });
    stylesheet.walkRules((rule) => {
      if (!rule.nodes?.length) rule.remove();
    });
    return stylesheet.toString();
  } catch {
    return "";
  }
}

export function sanitizeEmailHtml(html: string) {
  const preparedHtml = html.replace(/<style\b([^>]*)>([\s\S]*?)<\/style\s*>/gi, (_match, attributes: string, css: string) => `<style${attributes}>${sanitizeEmailStylesheet(css)}</style>`);
  return sanitizeHtml(preparedHtml, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, "style"],
    allowedAttributes: { ...sanitizeHtml.defaults.allowedAttributes, "*": ["class", "id", "style"] },
    allowedStyles: { "*": emailCssValues },
    allowedSchemes: [...sanitizeHtml.defaults.allowedSchemes, "cid"],
    allowVulnerableTags: true,
  });
}

function splitAddresses(value?: string) {
  return (value ?? "").split(",").map((item) => item.trim()).filter(Boolean);
}

export async function sendHostingerEmail(input: {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  text?: string;
  html?: string;
  displayName?: string;
  mailboxAddress?: string;
  attachments?: HostingerAttachment[];
  inReplyTo?: { uid: number; folder: string };
}) {
  const mailbox = await getHostingerMailbox(input.mailboxAddress);
  const payload: V1SendRequest = {
    to: splitAddresses(input.to),
    cc: splitAddresses(input.cc),
    bcc: splitAddresses(input.bcc),
    displayName: input.displayName || "",
    subject: input.subject,
    text: input.text || "",
    html: input.html || "",
    attachments: (input.attachments ?? []).map((attachment) => ({
      filename: attachment.name,
      contentType: attachment.type || "application/octet-stream",
      content: attachment.base64.includes(",") ? attachment.base64.split(",", 2)[1] : attachment.base64,
      encoding: "base64",
      cid: "",
    })),
    inReplyTo: input.inReplyTo ?? { uid: 0, folder: "" },
    forwardOf: { uid: 0, folder: "" },
  };
  if (!input.inReplyTo) delete (payload as Partial<V1SendRequest>).inReplyTo;
  delete (payload as Partial<V1SendRequest>).forwardOf;
  await new SendApi(configuration(mailbox.address)).sendEmail(mailbox.resourceId, payload);
  return mailbox;
}

export function hostingerWebhookSecretMatches(request: Request) {
  const expected = process.env.HOSTINGER_WEBHOOK_SECRET;
  if (!expected) return false;
  const supplied = request.headers.get("x-webhook-secret") || request.headers.get("x-hostinger-webhook-secret") || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return constantTimeSecretMatches(supplied, expected);
}

export function constantTimeSecretMatches(supplied: string | null | undefined, expected: string | null | undefined) {
  if (!supplied || !expected || supplied.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
}