"use client";

import { useEffect } from "react";

/**
 * Optional richer document cache SW (opt-in via NEXT_PUBLIC_RK_SW=1).
 * Default installability uses `/sw.js` from RegisterServiceWorker in root layout.
 * When enabled, this replaces the install SW with the offline shell worker.
 */
export function RkSwRegister() {
  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    if (process.env.NEXT_PUBLIC_RK_SW !== "1") return;

    let cancelled = false;
    void navigator.serviceWorker
      .register("/sw-rks.js", { scope: "/" })
      .then((reg) => {
        if (cancelled) return;
        reg.update().catch(() => undefined);
      })
      .catch(() => undefined);

    return () => {
      cancelled = true;
    };
  }, []);

  return null;
}

export async function hasRkRouteCache(href: string): Promise<boolean> {
  if (typeof caches === "undefined") return false;
  try {
    const url = new URL(href, window.location.origin).href;
    const match = await caches.match(url, { ignoreSearch: false });
    if (match) return true;
    const pageCache = await caches.open("rk-shell-v1-pages");
    const keys = await pageCache.keys();
    const pathname = new URL(url).pathname;
    return keys.some((request) => {
      try {
        return new URL(request.url).pathname === pathname;
      } catch {
        return false;
      }
    });
  } catch {
    return false;
  }
}
