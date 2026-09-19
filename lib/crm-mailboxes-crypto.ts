import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const algorithm = "aes-256-gcm";

function encryptionKey() {
  const secret = process.env.CRM_MAILBOXES_ENCRYPTION_KEY || process.env.COMPANY_ACCOUNTS_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("CRM_MAILBOXES_ENCRYPTION_KEY is required to manage CRM mailbox credentials.");
  }
  return createHash("sha256").update(secret).digest();
}

export function encryptMailboxCredentials(credentials: { username: string; password: string }) {
  const payload = JSON.stringify({
    username: credentials.username,
    password: credentials.password,
  });

  const iv = randomBytes(12);
  const cipher = createCipheriv(algorithm, encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(payload, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return ["v1", iv.toString("base64url"), authTag.toString("base64url"), encrypted.toString("base64url")].join(":");
}

export function decryptMailboxCredentials(payload: string): { username: string; password: string } {
  const [version, ivValue, tagValue, encryptedValue] = payload.split(":");
  if (version !== "v1" || !ivValue || !tagValue || !encryptedValue) {
    throw new Error("Stored mailbox credentials have an invalid encryption format.");
  }

  const decipher = createDecipheriv(algorithm, encryptionKey(), Buffer.from(ivValue, "base64url"));
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(encryptedValue, "base64url")), decipher.final()]).toString("utf8");

  try {
    const parsed = JSON.parse(decrypted) as { username?: string; password?: string };
    if (typeof parsed.username !== "string" || typeof parsed.password !== "string") {
      throw new Error("Mailbox credential payload is invalid.");
    }
    return { username: parsed.username, password: parsed.password };
  } catch {
    throw new Error("Stored mailbox credentials could not be decrypted.");
  }
}
