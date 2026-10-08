export const CRM_ALERTS_CHANGED_EVENT = "crm:alerts-preference-change";

function storageKey(userId: string) {
  return `crm-in-app-alerts-enabled:${userId}`;
}

export function getCrmInAppAlertsEnabled(userId: string) {
  try {
    return window.localStorage.getItem(storageKey(userId)) !== "false";
  } catch {
    return true;
  }
}

export function setCrmInAppAlertsEnabled(userId: string, enabled: boolean) {
  try {
    window.localStorage.setItem(storageKey(userId), String(enabled));
  } catch {
    // Keep the current session usable if browser storage is unavailable.
  }
  window.dispatchEvent(new CustomEvent(CRM_ALERTS_CHANGED_EVENT, { detail: { userId, enabled } }));
}

export function crmInAppAlertsStorageKey(userId: string) {
  return storageKey(userId);
}