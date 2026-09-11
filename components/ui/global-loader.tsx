"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

export function GlobalLoader() {
  const pathname = usePathname();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setLoading(false);
  }, [pathname]);

  useEffect(() => {
    function handleClick(event: MouseEvent) {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const target =
        event.target instanceof Element ? event.target.closest("a") : null;
      if (!target || target.target === "_blank") return;
      const href = target.getAttribute("href");
      if (
        !href ||
        href.startsWith("#") ||
        href.startsWith("mailto:") ||
        href.startsWith("tel:")
      )
        return;
      const url = new URL(href, window.location.href);
      if (url.pathname.startsWith("/api/")) return;
      if (
        url.origin !== window.location.origin ||
        url.pathname === window.location.pathname
      )
        return;
      setLoading(true);
    }

    document.addEventListener("click", handleClick, true);
    return () => document.removeEventListener("click", handleClick, true);
  }, []);

  if (!loading) return null;

  return (
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-stone-950/10 backdrop-blur-[2px]"
      role="status"
      aria-live="polite"
      aria-label="Loading page"
    >
      <div className="loader-panel flex items-center gap-3 rounded-2xl border border-white/80 bg-white/90 px-5 py-4 shadow-[0_20px_70px_rgba(94,67,63,0.18)]">
        <span className="loader-orbit" aria-hidden="true">
          <span />
        </span>
        <span className="text-sm font-semibold text-foreground">Loading</span>
      </div>
    </div>
  );
}
