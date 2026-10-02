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

export async function activateHostingerWebhook(address: string, webhookId: string) {
  const { resourceId, webhook } = await getHostingerWebhook(address, webhookId);
  if (!webhook) throw new Error("Hostinger webhook was not found.");
  const response = await new WebhooksApi(configuration(address)).updateWebhook(resourceId, webhookId, {
    name: webhook.name,
    description: webhook.description ?? null,
    events: webhook.events,
    status: "active",
    url: webhook.url,
  });
  const updated = response.data?.data;
  if (updated?.status !== "active") throw new Error(`Hostinger webhook was not activated. Current status: ${updated?.status ?? "unknown"}.`);
  return { resourceId, webhook: updated };
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

export function isIncompleteEmailBody(textBody?: string | null, htmlBody?: string | null) {
  if (textBody?.trim()) return false;
  const html = htmlBody?.trim() ?? "";
  if (!html) return true;
  const visibleHtml = html
    .replace(/<!--(?:.|\n|\r)*?-->/g, " ")
    .replace(/<(head|script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/&nbsp;|&#160;|&#x0*a0;/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!visibleHtml && !/<(img|picture|video|audio|object|svg|canvas)\b/i.test(html)) return true;
  return /(?:&(?:[a-z]{1,20}|#\d+|#x[\da-f]+);?|<[^>]*|<)\s*$/i.test(html);
}

export async function getHostingerMessage(address: string, folder: string, uid: number, options: { markSeen?: boolean } = {}) {
  const mailbox = await getHostingerMailbox(address);
  const api = new MessagesApi(configuration(address));
  const messagePromise = api.getMessage(mailbox.resourceId, folder, uid);
  const textPromise = options.markSeen === false
    ? null
    : api.getMessageText(mailbox.resourceId, folder, uid);
  const [messageResult, textResult] = await Promise.allSettled([
    messagePromise,
    textPromise ?? Promise.resolve(null),
  ]);
  const renderedBody = textResult.status === "fulfilled" ? textResult.value?.data.data ?? null : null;
  let body = { text: renderedBody?.text || "", html: renderedBody?.html || "" };
  try {
    const source = await api.getMessageSource(mailbox.resourceId, folder, uid);
    const sourceBody = await parseHostingerMessageSource(source.data);
    if (!isIncompleteEmailBody(sourceBody.text, sourceBody.html)) body = sourceBody;
    else if (isIncompleteEmailBody(body.text, body.html)) body = sourceBody;
  } catch (error) {
    console.warn("[hostinger] raw message source recovery failed", { uid, folder, error: error instanceof Error ? error.message : "Unknown error" });
  }
  if (messageResult.status === "rejected" && textResult.status === "rejected" && !body.text.trim() && !body.html.trim()) throw messageResult.reason;
  return {
    mailbox,
    message: messageResult.status === "fulfilled" ? messageResult.value.data.data : {},
    body,
  };
}

function normalizeMessageId(value: string) {
  return value.trim().replace(/^<|>$/g, "").toLowerCase();
}

function normalizeAddress(value?: string | null) {
  return (value ?? "").match(/<([^>]+)>/)?.[1]?.trim().toLowerCase() || (value ?? "").trim().toLowerCase();
}

function normalizeSubject(value?: string | null) {
  return (value ?? "").replace(/^(?:(?:re|fw|fwd):\s*)+/i, "").replace(/\s+/g, " ").trim().toLowerCase();
}

export async function findHostingerMessage(address: string, folder: string, messageId?: string | null, match?: { subject?: string; sender?: string; receivedAt?: string }) {
  const mailbox = await getHostingerMailbox(address);
  const api = new MessagesApi(configuration(address));
  if (messageId?.trim()) {
    const headers = [`Message-ID: ${messageId}`, `Message-ID ${messageId}`];
    for (const header of headers) {
      const search: V1FolderMessagesSearchRequest = {
        since: "", before: "", flags: [], uid: "", subject: "", from: "", to: "", cc: "", body: "",
        header, larger: 0, smaller: 0, text: "",
      };
      try {
        const response = await api.searchMessages(mailbox.resourceId, folder, 1, 10, "-uid", search);
        const exact = response.data.data.find((message) => normalizeMessageId(message.messageId ?? "") === normalizeMessageId(messageId));
        if (exact) return exact;
      } catch {
        continue;
      }
    }
  }

  const receivedAt = match?.receivedAt ? new Date(match.receivedAt).getTime() : Number.NaN;
  const expectedSubject = normalizeSubject(match?.subject);
  const expectedSender = normalizeAddress(match?.sender);
  const pageLimit = 10;
  let totalPages = pageLimit;

  for (let page = 1; page <= Math.min(pageLimit, totalPages); page += 1) {
    const response = await api.listMessages(mailbox.resourceId, folder, page, 100, "-date");
    const messages = response.data.data ?? [];
    const exact = messageId?.trim()
      ? messages.find((item) => normalizeMessageId(item.messageId ?? "") === normalizeMessageId(messageId))
      : null;
    if (exact) return exact;

    if (expectedSubject && expectedSender && Number.isFinite(receivedAt)) {
      const likelyMatch = messages.find((item) => {
        if (normalizeSubject(item.subject) !== expectedSubject) return false;
        if (normalizeAddress(item.from?.address) !== expectedSender) return false;
        const itemTime = new Date(item.date).getTime();
        return Number.isFinite(itemTime) && Math.abs(itemTime - receivedAt) <= 10 * 60 * 1000;
      });
      if (likelyMatch) return likelyMatch;
    }

    totalPages = Math.min(pageLimit, Number(response.data.pagination?.totalPages) || 1);
    if (!messages.length || page >= totalPages) break;
  }

  return null;
}

export async function getHostingerMessageAttachment(address: string, folder: string, uid: number, attachmentId: string) {
  const mailbox = await getHostingerMailbox(address);
  const response = await new MessagesApi(configuration(address)).getMessageAttachment(mailbox.resourceId, folder, uid, attachmentId);
  return response.data;
}

const emailCssValues: Record<string, RegExp[]> = {
  "background": [/^.*$/i],
  "background-color": [/^#[\da-f]{3,8}$/i, /^rgba?\([\d.,%\s]+\)$/i, /^transparent$/i, /^[a-z]{1,20}$/i],
  "background-image": [/^none$/i, /^url\([^)]+\)$/i],
  border: [/^[\w#(),.%\s-]+$/i],
  "border-collapse": [/^(collapse|separate)$/i],
  "border-color": [/^#[\da-f]{3,8}$/i, /^rgba?\([\d.,%\s]+\)$/i, /^transparent$/i, /^[a-z]{1,20}$/i],
  "border-radius": [/^[\d.]+(px|em|rem|%)?(\s+[\d.]+(px|em|rem|%)?){0,3}$/i],
  "border-style": [/^(none|solid|dashed|dotted|double|groove|ridge|inset|outset)(\s+(none|solid|dashed|dotted|double|groove|ridge|inset|outset)){0,3}$/i],
  "border-width": [/^[\d.]+(px|pt|em|rem)?(\s+[\d.]+(px|pt|em|rem)?){0,3}$/i],
  color: [/^#[\da-f]{3,8}$/i, /^rgba?\([\d.,%\s]+\)$/i, /^[a-z]{1,20}$/i],
  display: [/^(block|inline|inline-block|inline-flex|flex|grid|inline-grid|table|table-cell|table-row|none)$/i],
  "font-family": [/^[\w\s"',-]{1,100}$/],
  "font-size": [/^[\d.]+(px|pt|em|rem|%)$/i],
  "font-style": [/^(normal|italic|oblique)$/i],
  "font-weight": [/^(normal|bold|bolder|lighter|[1-9]00)$/i],
  gap: [/^[\d.]+(px|em|rem|%)?$/i],
  "justify-content": [/^(flex-start|flex-end|center|space-between|space-around|space-evenly)$/i],
  "align-items": [/^(flex-start|flex-end|center|stretch|baseline)$/i],
  "align-content": [/^(flex-start|flex-end|center|stretch|space-between|space-around|space-evenly)$/i],
  "flex-direction": [/^(row|row-reverse|column|column-reverse)$/i],
  "flex-wrap": [/^(nowrap|wrap|wrap-reverse)$/i],
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
  overflow: [/^(visible|hidden|auto|scroll)$/i],
  "padding": [/^(0|[\d.]+(px|pt|em|rem|%))(\s+(0|[\d.]+(px|pt|em|rem|%))){0,3}$/i],
  "padding-bottom": [/^(0|[\d.]+(px|pt|em|rem|%))$/i],
  "padding-left": [/^(0|[\d.]+(px|pt|em|rem|%))$/i],
  "padding-right": [/^(0|[\d.]+(px|pt|em|rem|%))$/i],
  "padding-top": [/^(0|[\d.]+(px|pt|em|rem|%))$/i],
  position: [/^(static|relative|absolute|fixed|sticky)$/i],
  "text-align": [/^(left|right|center|justify|start|end)$/i],
  "text-decoration": [/^(none|underline|overline|line-through)(\s+(solid|double|dotted|dashed|wavy))?$/i],
  "text-transform": [/^(none|capitalize|uppercase|lowercase)$/i],
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
    allowedTags: [
      ...sanitizeHtml.defaults.allowedTags,
      "style",
      "table", "thead", "tbody", "tfoot", "tr", "td", "th",
      "div", "section", "article", "header", "footer", "main",
      "span", "p", "br", "hr", "h1", "h2", "h3", "h4", "h5", "h6",
      "ul", "ol", "li", "blockquote", "strong", "b", "em", "i",
      "a", "img", "figure", "figcaption", "iframe"
    ],
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      "*": ["class", "id", "style", "align", "width", "height", "border", "cellpadding", "cellspacing", "valign"],
      a: ["href", "target", "rel", "title"],
      img: ["src", "alt", "title", "width", "height"],
      iframe: ["src", "width", "height", "title", "allowfullscreen", "frameborder"],
    },
    allowedStyles: { "*": emailCssValues },
    allowedSchemes: [...sanitizeHtml.defaults.allowedSchemes, "cid", "mailto"],
    allowedSchemesByTag: {
      a: ["http", "https", "mailto", "tel", "cid"],
      img: ["http", "https", "data", "cid"],
    },
    allowProtocolRelative: true,
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