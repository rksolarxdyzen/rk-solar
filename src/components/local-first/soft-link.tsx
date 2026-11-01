"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useContext,
  type ComponentProps,
  type MouseEvent,
  type ReactNode,
} from "react";
import { QueryClientContext } from "@tanstack/react-query";
import { useOptionalLocalFirstSession } from "@/components/local-first/local-first-session";
import {
  hasRkClientPage,
  isRkWorkspacePath,
  useRkClientNav,
  warmRkPageModule,
} from "@/components/local-first/rk-client-nav";
import { prefetchRouteQueries } from "@/lib/local-first/nav-prefetch";

type SoftLinkProps = {
  href: string;
  className?: string;
  children?: ReactNode;
  warmQueries?: boolean;
  onClick?: ComponentProps<"a">["onClick"];
  onMouseEnter?: ComponentProps<"a">["onMouseEnter"];
  onFocus?: ComponentProps<"a">["onFocus"];
  onPointerDown?: ComponentProps<"a">["onPointerDown"];
  role?: string;
  title?: string;
  "aria-label"?: string;
};

/**
 * Dyzen SoftLink: within the CRM shell, preventDefault + client navigate
 * (pushState + RkClientOutlet page swap). Outside registered routes, normal
 * App Router Link. Query modules warm on hover; no RSC document prefetch.
 */
export function SoftLink({
  href,
  onClick,
  onMouseEnter,
  onFocus,
  onPointerDown,
  warmQueries = true,
  className,
  children,
  role,
  title,
  "aria-label": ariaLabel,
}: SoftLinkProps) {
  const router = useRouter();
  const queryClient = useContext(QueryClientContext);
  const session = useOptionalLocalFirstSession();
  const companyId = session?.companyId ?? null;
  const rkNav = useRkClientNav();
  const path = href.split("?")[0]?.split("#")[0] || href;

  const warmModules = useCallback(() => {
    if (!path) return;
    if (warmQueries && queryClient && companyId) {
      prefetchRouteQueries(queryClient, companyId, path);
    }
    if (isRkWorkspacePath(path)) warmRkPageModule(path);
    else if (path.startsWith("/")) router.prefetch(path);
  }, [path, queryClient, companyId, warmQueries, router]);

  return (
    <Link
      href={href}
      prefetch={false}
      className={className}
      role={role}
      title={title}
      aria-label={ariaLabel}
      onMouseEnter={(event) => {
        warmModules();
        onMouseEnter?.(event);
      }}
      onFocus={(event) => {
        warmModules();
        onFocus?.(event);
      }}
      onPointerDown={(event) => {
        warmModules();
        onPointerDown?.(event);
      }}
      onClick={(event: MouseEvent<HTMLAnchorElement>) => {
        onClick?.(event);
        if (event.defaultPrevented) return;
        if (
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          event.button !== 0
        ) {
          return;
        }
        if (!path.startsWith("/")) return;

        const clientNav =
          rkNav && isRkWorkspacePath(path) && hasRkClientPage(path)
            ? rkNav
            : null;

        if (clientNav) {
          event.preventDefault();
          warmModules();
          clientNav.navigate(path);
          return;
        }

        warmModules();
      }}
    >
      {children}
    </Link>
  );
}
