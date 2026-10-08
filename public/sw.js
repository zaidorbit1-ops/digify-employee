const CACHE_NAME = "digify-shell-v2";
const SHELL_ASSETS = [
  "/",
  "/login",
  "/manifest.webmanifest",
  "/logo.png",
  "/icon-512.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_ASSETS)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key !== CACHE_NAME)
          .map((key) => caches.delete(key)),
      ))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const requestedUrl = new URL(event.notification.data?.url || "/dashboard/internal-chat", self.location.origin);
  const targetUrl = requestedUrl.origin === self.location.origin ? requestedUrl.href : "/dashboard";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => "focus" in client);
      if (existing) return existing.navigate(targetUrl).then((client) => client?.focus());
      return self.clients.openWindow(targetUrl);
    }),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = { title: "New notification", body: event.data?.text() ?? "" };
  }
  event.waitUntil(self.registration.showNotification(payload.title || "New notification", {
    body: payload.body || "",
    icon: "/logo.png",
    badge: "/logo.png",
    tag: payload.tag,
    data: { url: payload.url || "/dashboard" },
  }));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (
    request.method !== "GET" ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith("/api/")
  )
    return;

  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("/login")));
    return;
  }

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (
          response.ok &&
          (url.pathname.startsWith("/_next/static/") ||
            (url.pathname === "/logo.png" || url.pathname === "/icon-512.svg"))
        ) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request)),
  );
});
