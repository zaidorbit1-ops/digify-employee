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
import sanitizeHtml from "sanitize-html";
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

export async function getHostingerMessage(address: string, folder: string, uid: number) {
  const mailbox = await getHostingerMailbox(address);
  const api = new MessagesApi(configuration(address));
  const [messageResult, textResult] = await Promise.allSettled([
    api.getMessage(mailbox.resourceId, folder, uid),
    api.getMessageText(mailbox.resourceId, folder, uid),
  ]);
  if (messageResult.status === "rejected" && textResult.status === "rejected") throw textResult.reason;
  return {
    mailbox,
    message: messageResult.status === "fulfilled" ? messageResult.value.data.data : {},
    body: textResult.status === "fulfilled" ? textResult.value.data.data : { text: "", html: "" },
  };
}

function normalizeMessageId(value: string) {
  return value.trim().replace(/^<|>$/g, "").toLowerCase();
}

export async function findHostingerMessage(address: string, folder: string, messageId: string) {
  const mailbox = await getHostingerMailbox(address);
  const search: V1FolderMessagesSearchRequest = {
    since: "", before: "", flags: [], uid: "", subject: "", from: "", to: "", cc: "", body: "",
    header: `Message-ID ${messageId}`, larger: 0, smaller: 0, text: "",
  };
  const response = await new MessagesApi(configuration(address)).searchMessages(mailbox.resourceId, folder, 1, 10, "-uid", search);
  return response.data.data.find((message) => normalizeMessageId(message.messageId ?? "") === normalizeMessageId(messageId)) ?? null;
}

export async function getHostingerMessageAttachment(address: string, folder: string, uid: number, attachmentId: string) {
  const mailbox = await getHostingerMailbox(address);
  const response = await new MessagesApi(configuration(address)).getMessageAttachment(mailbox.resourceId, folder, uid, attachmentId);
  return response.data;
}

export function sanitizeEmailHtml(html: string) {
  return sanitizeHtml(html, { allowedSchemes: [...sanitizeHtml.defaults.allowedSchemes, "cid"] });
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