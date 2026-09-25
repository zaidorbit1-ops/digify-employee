import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

function key() {
  const secret = process.env.HOSTINGER_WEBHOOK_ENCRYPTION_KEY || process.env.HOSTINGER_API_TOKEN;
  if (!secret) throw new Error("HOSTINGER_WEBHOOK_ENCRYPTION_KEY is required.");
  return createHash("sha256").update(secret).digest();
}

export function encryptHostingerWebhookSecret(value: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `v1:${iv.toString("base64url")}:${cipher.getAuthTag().toString("base64url")}:${encrypted.toString("base64url")}`;
}

export function decryptHostingerWebhookSecret(payload: string) {
  const [version, iv, tag, encrypted] = String(payload || "").split(":");
  if (version !== "v1" || !iv || !tag || !encrypted) throw new Error("Invalid Hostinger webhook secret.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64url")), decipher.final()]).toString("utf8");
}