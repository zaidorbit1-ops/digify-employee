import { timingSafeEqual } from "node:crypto";
import {
  AccountApi,
  Configuration,
  SendApi,
  type V1SendRequest,
  WebhooksApi,
} from "hostinger-mail-api-sdk";

export type HostingerAttachment = {
  name: string;
  type?: string;
  base64: string;
};

function configuration() {
  const token = process.env.HOSTINGER_API_TOKEN;
  if (!token) throw new Error("Hostinger API token is not configured.");
  return new Configuration({ accessToken: token });
}

export async function getHostingerMailbox(addressOverride?: string) {
  const address = (addressOverride || process.env.HOSTINGER_MAILBOX)?.trim().toLowerCase();
  if (!address) throw new Error("A Hostinger mailbox address is required.");
  const response = await new AccountApi(configuration()).getCurrentAccount();
  const mailbox = response.data?.data?.mailboxes?.find((item) => item.address?.toLowerCase() === address);
  if (!mailbox?.resourceId) throw new Error("The configured Hostinger mailbox is not available to this API token.");
  return mailbox;
}

export async function registerHostingerWebhook(address: string) {
  const mailbox = await getHostingerMailbox(address);
  const url = process.env.HOSTINGER_WEBHOOK_URL || `${String(process.env.CRM_PUBLIC_URL || "").replace(/\/$/, "")}/api/email/hostinger/webhook`;
  if (!url.startsWith("https://")) throw new Error("HOSTINGER_WEBHOOK_URL or CRM_PUBLIC_URL must be an HTTPS URL.");
  const response = await new WebhooksApi(configuration()).createWebhook(mailbox.resourceId, {
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
  await new SendApi(configuration()).sendEmail(mailbox.resourceId, payload);
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