export function hostingerMailboxSuffix(address: string) {
  const normalized = address.trim().toLowerCase();
  const domain = normalized.split("@")[1];
  if (!domain) throw new Error("A valid mailbox address is required to select Hostinger credentials.");
  const suffix = domain.split(".")[0]?.replace(/[^a-z0-9]/gi, "").toUpperCase();
  if (!suffix) throw new Error("Could not determine the Hostinger mailbox environment-variable suffix.");
  return suffix;
}

function mailboxValue(prefix: string, address: string) {
  return process.env[`${prefix}_${hostingerMailboxSuffix(address)}`]?.trim() || "";
}

export function getHostingerApiToken(address: string) {
  return mailboxValue("HOSTINGER_API_TOKEN", address) || process.env.HOSTINGER_API_TOKEN?.trim() || "";
}

export function getHostingerEncryptionKey(address: string) {
  return mailboxValue("HOSTINGER_WEBHOOK_ENCRYPTION_KEY", address)
    || process.env.HOSTINGER_WEBHOOK_ENCRYPTION_KEY?.trim()
    || getHostingerApiToken(address);
}

export function getHostingerWebhookSecret(address: string) {
  return mailboxValue("HOSTINGER_WEBHOOK_SECRET", address)
    || process.env.HOSTINGER_WEBHOOK_SECRET?.trim()
    || "";
}

export function getConfiguredHostingerMailbox(address: string) {
  return mailboxValue("HOSTINGER_MAILBOX", address) || address.trim().toLowerCase();
}