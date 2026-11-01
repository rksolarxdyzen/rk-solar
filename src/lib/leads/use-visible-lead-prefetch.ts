"use client";

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useOptionalLocalFirstSession } from "@/components/local-first/local-first-session";
import { prefetchLeadDetailsBatch } from "@/lib/local-first/queries/lead-detail";

function connectionAllowsPrefetch() {
  const conn = (
    navigator as Navigator & {
      connection?: { saveData?: boolean; effectiveType?: string };
    }
  ).connection;
  if (conn?.saveData) return false;
  if (conn?.effectiveType === "slow-2g" || conn?.effectiveType === "2g")
    return false;
  return true;
}

function prefetchBudget() {
  const mobile = window.matchMedia("(max-width: 767px)").matches;
  return {
    max: mobile ? 10 : 20,
    delayMs: mobile ? 220 : 80,
    rootMargin: mobile ? "80px 0px" : "160px 0px",
  };
}

function isNearViewport(el: Element, marginPx: number): boolean {
  const rect = el.getBoundingClientRect();
  const vh = window.innerHeight || document.documentElement.clientHeight;
  const vw = window.innerWidth || document.documentElement.clientWidth;
  return (
    rect.bottom >= -marginPx &&
    rect.top <= vh + marginPx &&
    rect.right >= -marginPx &&
    rect.left <= vw + marginPx
  );
}

/**
 * Prefetch modal payloads for cards near the viewport / inside kanban column
 * scrollers. Uses batched `/api/local-first/leads/modal`.
 */
export function useVisibleLeadPrefetch(deps: unknown, paused = false) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const queryClient = useQueryClient();
  const session = useOptionalLocalFirstSession();
  const companyId = session?.companyId;

  useEffect(() => {
    if (paused || !companyId) return;
    const host = rootRef.current;
    if (!host) return;
    if (!connectionAllowsPrefetch()) return;

    // Capture non-null host for nested closures (TS does not keep the guard).
    const rootEl: HTMLElement = host;

    let flushTimer: number | undefined;
    let idleId: number | undefined;
    let timeoutId: number | undefined;
    const seen = new Set<string>();
    const queued: string[] = [];
    const scrollCleanups: Array<() => void> = [];

    function flush() {
      if (queued.length === 0 || !companyId) return;
      const budget = prefetchBudget();
      const batch = queued.splice(0, budget.max);
      void prefetchLeadDetailsBatch(queryClient, companyId, batch);
      if (queued.length > 0) {
        flushTimer = window.setTimeout(flush, budget.delayMs);
      }
    }

    function enqueue(id: string) {
      if (!id || seen.has(id)) return;
      seen.add(id);
      queued.push(id);
      const budget = prefetchBudget();
      window.clearTimeout(flushTimer);
      if (queued.length >= budget.max) {
        flush();
      } else {
        flushTimer = window.setTimeout(flush, budget.delayMs);
      }
    }

    function scan() {
      const budget = prefetchBudget();
      const margin = Number.parseInt(budget.rootMargin, 10) || 120;
      rootEl.querySelectorAll<HTMLElement>("[data-lead-id]").forEach((el) => {
        if (isNearViewport(el, margin)) {
          const id = el.dataset.leadId;
          if (id) enqueue(id);
        }
      });
    }

    const start = () => {
      scan();

      if (typeof IntersectionObserver !== "undefined") {
        const budget = prefetchBudget();
        const io = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (!entry.isIntersecting) continue;
              const id = (entry.target as HTMLElement).dataset.leadId;
              if (id) enqueue(id);
              io.unobserve(entry.target);
            }
          },
          { root: null, rootMargin: budget.rootMargin, threshold: 0.05 }
        );
        rootEl
          .querySelectorAll<HTMLElement>("[data-lead-id]")
          .forEach((el) => io.observe(el));
        scrollCleanups.push(() => io.disconnect());
      }

      // Column / board scrollers: re-scan as user scrolls New downward.
      rootEl.querySelectorAll<HTMLElement>(".kanban-scroll").forEach((scroller) => {
        const onScroll = () => scan();
        scroller.addEventListener("scroll", onScroll, { passive: true });
        scrollCleanups.push(() =>
          scroller.removeEventListener("scroll", onScroll)
        );
      });
    };

    const ric = (
      window as Window & {
        requestIdleCallback?: (
          cb: () => void,
          opts?: { timeout: number }
        ) => number;
        cancelIdleCallback?: (id: number) => void;
      }
    ).requestIdleCallback;

    if (ric) {
      idleId = ric(start, { timeout: 600 });
    } else {
      timeoutId = window.setTimeout(start, 120);
    }

    return () => {
      window.clearTimeout(flushTimer);
      window.clearTimeout(timeoutId);
      (
        window as Window & { cancelIdleCallback?: (id: number) => void }
      ).cancelIdleCallback?.(idleId ?? 0);
      for (const cleanup of scrollCleanups) cleanup();
    };
  }, [deps, paused, companyId, queryClient]);

  return rootRef;
}
