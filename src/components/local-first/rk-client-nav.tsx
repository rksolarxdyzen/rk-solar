"use client";

import {
  createContext,
  Suspense,
  lazy,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { usePathname } from "next/navigation";
import { trackNavPath } from "@/lib/local-first/nav-history";
import { RK_ROUTE_HREFS } from "@/lib/local-first/nav-prefetch";
import { isQuotationDetailPath } from "@/lib/local-first/quotation-detail-path";

type RkClientNav = {
  path: string;
  navigate: (href: string) => void;
  isRkPath: (href: string) => boolean;
};

const Ctx = createContext<RkClientNav | null>(null);

function normalize(href: string): string {
  const path = href.split("?")[0]?.split("#")[0] ?? href;
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path || "/";
}

export function isRkWorkspacePath(href: string): boolean {
  const path = normalize(href);
  if ((RK_ROUTE_HREFS as readonly string[]).includes(path)) return true;
  return isQuotationDetailPath(path);
}

/**
 * Lazy CRM page modules — SoftLink swaps these without an App Router RSC trip
 * (Dyzen HomeClientNav / OpsClientNav pattern).
 */
const loaders: Record<string, () => Promise<{ default: ComponentType }>> = {
  "/": () => import("@/components/local-first/pages/dashboard-page"),
  "/pipeline": () => import("@/components/local-first/pages/pipeline-page"),
  "/customers": () => import("@/components/local-first/pages/customers-page"),
  "/quotations": () => import("@/components/local-first/pages/quotations-page"),
  "/payments": () => import("@/components/local-first/pages/payments-page"),
  "/installation": () =>
    import("@/components/local-first/pages/installation-page"),
  "/liaison": () => import("@/components/local-first/pages/liaison-page"),
  "/dealers": () => import("@/components/local-first/pages/dealers-page"),
  "/maintenance": () =>
    import("@/components/local-first/pages/maintenance-page"),
  "/team": () => import("@/components/local-first/pages/team-page"),
  "/grievances": () => import("@/components/local-first/pages/grievances-page"),
  "/lead-import": () =>
    import("@/components/local-first/pages/lead-import-page"),
  "/ingest": () => import("@/components/local-first/pages/ingest-page"),
  "/catalog": () => import("@/components/local-first/pages/catalog-page"),
  "/reports/sales-reps": () =>
    import("@/components/local-first/pages/sales-reps-report-page"),
  "/reports/dealers": () =>
    import("@/components/local-first/pages/dealers-report-page"),
  "/accounts/receivables": () =>
    import("@/components/local-first/pages/receivables-page"),
};

const loadQuotationDetail = () =>
  import("@/components/local-first/pages/quotation-detail-page");

const QuotationDetailLazy = lazy(loadQuotationDetail);

const lazyPages: Record<string, React.LazyExoticComponent<ComponentType>> =
  Object.fromEntries(
    Object.entries(loaders).map(([path, load]) => [path, lazy(load)])
  );

function RkLoadingFallback() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading page">
      <div className="h-3 w-28 animate-pulse rounded bg-[var(--border)]" />
      <div className="h-9 w-56 animate-pulse rounded-lg bg-[var(--border)]" />
      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <div className="h-36 animate-pulse rounded-2xl border border-[var(--border)] bg-white" />
        <div className="h-36 animate-pulse rounded-2xl border border-[var(--border)] bg-white" />
      </div>
    </div>
  );
}

export function RkClientNavProvider({ children }: { children: ReactNode }) {
  const nextPath = normalize(usePathname() || "/");
  const [path, setPath] = useState(nextPath);

  // Sync from App Router only when Next actually changes the path
  // (full document load / hard Link). SoftLink pushState does not update
  // usePathname(), so this must not overwrite client navigations.
  useEffect(() => {
    setPath(nextPath);
    trackNavPath(nextPath);
  }, [nextPath]);

  useEffect(() => {
    function onPop() {
      setPath(normalize(window.location.pathname));
    }
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  // Background-load page modules so the first SoftLink click is not a chunk wait.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const load of [...Object.values(loaders), loadQuotationDetail]) {
        if (cancelled) return;
        await load().catch(() => undefined);
        await new Promise((r) => setTimeout(r, 40));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const navigate = useCallback((href: string) => {
    const next = normalize(href);
    if (!isRkWorkspacePath(next)) return;
    if (normalize(window.location.pathname) !== next) {
      window.history.pushState({ rkClientNav: true }, "", next);
    }
    trackNavPath(next);
    setPath(next);
    warmRkPageModule(next);
  }, []);

  const value = useMemo<RkClientNav>(
    () => ({
      path,
      navigate,
      isRkPath: isRkWorkspacePath,
    }),
    [path, navigate]
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRkClientNav(): RkClientNav | null {
  return useContext(Ctx);
}

/**
 * Dyzen-style outlet: if the active path has a client page module, always
 * render it. Never gate on `path !== usePathname()` — that left the URL
 * updated while App Router `children` stayed on the previous RSC tree.
 */
export function RkClientOutlet({ children }: { children: ReactNode }) {
  const nav = useRkClientNav();
  const path = normalize(nav?.path || "");
  const Page = isQuotationDetailPath(path)
    ? QuotationDetailLazy
    : path
      ? lazyPages[path]
      : null;
  if (!Page) return <>{children}</>;
  return (
    <Suspense fallback={<RkLoadingFallback />}>
      <Page />
    </Suspense>
  );
}

export function hasRkClientPage(href: string): boolean {
  const path = normalize(href);
  if (isQuotationDetailPath(path)) return true;
  return Boolean(loaders[path]);
}

export function warmRkPageModule(href: string): void {
  const path = normalize(href);
  if (isQuotationDetailPath(path)) {
    void loadQuotationDetail().catch(() => undefined);
    return;
  }
  const load = loaders[path];
  if (load) void load().catch(() => undefined);
}

/**
 * No RSC document prefetch. SoftLink client swaps do not need it, and
 * `Next-Router-Prefetch` poisoned Flight on this app ("page couldn't load").
 */
export function seedRkDocumentCache(_href: string): void {}
