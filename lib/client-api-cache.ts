"use client";

type CachedResponse = {
  body: string;
  headers: Headers;
  status: number;
  statusText: string;
  cachedAt: number;
  revalidatedAt: number;
};

const CACHE_TTL_MS = 30_000;
const REVALIDATE_COOLDOWN_MS = 5_000;
const MAX_CACHE_ENTRIES = 60;
const MAX_RESPONSE_BYTES = 512 * 1024;
const cache = new Map<string, CachedResponse>();
const inFlightRequests = new Map<string, Promise<Response>>();
let activeUserId: string | null = null;
let originalFetch: typeof window.fetch | null = null;
let cacheRevision = 0;

function clearCache() {
  cacheRevision += 1;
  cache.clear();
  inFlightRequests.clear();
}

function isCacheableRequest(input: RequestInfo | URL, init?: RequestInit) {
  if (typeof window === "undefined" || !activeUserId) return null;
  const request = input instanceof Request ? input : null;
  const method = (init?.method ?? request?.method ?? "GET").toUpperCase();
  const rawUrl = input instanceof Request ? input.url : input.toString();
  let url: URL;
  try {
    url = new URL(rawUrl, window.location.origin);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin || !url.pathname.startsWith("/api/")) return null;
  if (
    url.pathname.includes("/tracking/")
    || url.pathname.endsWith("/attachment")
    || url.pathname.startsWith("/api/email/")
  ) return null;
  return { method, url };
}

function responseFromCache(entry: CachedResponse) {
  return new Response(entry.body, {
    status: entry.status,
    statusText: entry.statusText,
    headers: entry.headers,
  });
}

async function storeResponse(key: string, response: Response, revision: number) {
  if (!response.ok || !response.headers.get("content-type")?.includes("application/json")) return;
  const contentLength = Number(response.headers.get("content-length") ?? 0);
  if (contentLength > MAX_RESPONSE_BYTES) return;

  const body = await response.clone().text();
  if (new TextEncoder().encode(body).byteLength > MAX_RESPONSE_BYTES) return;
  if (revision !== cacheRevision || !activeUserId || !key.startsWith(`${activeUserId}:`)) return;

  const now = Date.now();
  cache.delete(key);
  cache.set(key, {
    body,
    headers: new Headers(response.headers),
    status: response.status,
    statusText: response.statusText,
    cachedAt: now,
    revalidatedAt: now,
  });
  while (cache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = cache.keys().next().value;
    if (oldestKey === undefined) break;
    cache.delete(oldestKey);
  }
}

function installFetchCache() {
  if (typeof window === "undefined" || originalFetch) return;
  originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = isCacheableRequest(input, init);
    if (!request) return originalFetch!(input, init);

    const key = `${activeUserId}:${request.url.href}`;
    if (request.method !== "GET") {
      clearCache();
      return originalFetch!(input, init);
    }

    const entry = cache.get(key);
    const now = Date.now();
    if (entry && now - entry.cachedAt <= CACHE_TTL_MS) {
      if (now - entry.revalidatedAt >= REVALIDATE_COOLDOWN_MS) {
        entry.revalidatedAt = now;
        const revision = cacheRevision;
        void originalFetch!(input, init)
          .then((response) => storeResponse(key, response, revision))
          .catch((error: unknown) => {
            console.error("[client-api-cache] Background refresh failed", error);
          });
      }
      return responseFromCache(entry);
    }

    const pending = inFlightRequests.get(key);
    if (pending) return pending.then((response) => response.clone());

    const revision = cacheRevision;
    const requestPromise = originalFetch!(input, init)
      .then(async (response) => {
        await storeResponse(key, response, revision);
        return response;
      })
      .catch((error: unknown) => {
        cache.delete(key);
        throw error;
      })
      .finally(() => {
        if (inFlightRequests.get(key) === requestPromise) inFlightRequests.delete(key);
      });
    inFlightRequests.set(key, requestPromise);
    return requestPromise;
  };
}

export function setAuthenticatedApiCacheUser(userId: string | null) {
  if (activeUserId !== userId) {
    clearCache();
    activeUserId = userId;
  }
  installFetchCache();
}
