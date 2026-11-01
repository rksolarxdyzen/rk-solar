"use client";

import { useEffect, useId, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { SoftLink } from "@/components/local-first/soft-link";
import { useRkClientNav } from "@/components/local-first/rk-client-nav";
import { cn } from "@/lib/utils";
import { canAccessNavHref, type NavAccessContext } from "@/lib/nav-access";
import {
  NAV_ENTRIES,
  isNavGroupActive,
  isNavHrefActive,
  type NavEntry,
  type NavGroupItem,
  type NavLinkItem,
} from "@/lib/nav-config";

/** Prefer SoftLink client path so active tab tracks pushState navigations. */
function useNavPathname() {
  const nextPath = usePathname();
  const rkNav = useRkClientNav();
  return rkNav?.path ?? nextPath ?? "/";
}

function filterEntry(entry: NavEntry, ctx: NavAccessContext): NavEntry | null {
  if (entry.kind === "link") {
    return canAccessNavHref(entry.href, ctx) ? entry : null;
  }
  const children = entry.children.filter((c) => canAccessNavHref(c.href, ctx));
  if (children.length === 0) return null;
  return { ...entry, children };
}

function NavLink({
  item,
  onNavigate,
}: {
  item: NavLinkItem;
  onNavigate?: () => void;
}) {
  const pathname = useNavPathname();
  const active = isNavHrefActive(pathname, item);
  const Icon = item.icon;
  return (
    <SoftLink
      href={item.href}
      onClick={onNavigate}
      className={cn(
        "flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition",
        active
          ? "border-[var(--primary)] text-[var(--primary)]"
          : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-dark)]"
      )}
    >
      <Icon className="h-4 w-4" />
      {item.label}
    </SoftLink>
  );
}

function NavDropdown({
  group,
  ctx,
}: {
  group: NavGroupItem;
  ctx: NavAccessContext;
}) {
  const pathname = useNavPathname();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const active = isNavGroupActive(pathname, group);
  const Icon = group.icon;

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    // pointerdown in bubble phase after the toggle button has already handled the open click
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const visibleChildren = group.children.filter((c) => canAccessNavHref(c.href, ctx));
  if (visibleChildren.length === 0) return null;

  return (
    <div className="relative shrink-0" ref={rootRef}>
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className={cn(
          "flex items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm font-medium transition",
          active || open
            ? "border-[var(--primary)] text-[var(--primary)]"
            : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-dark)]"
        )}
      >
        <Icon className="h-4 w-4" />
        {group.label}
        <ChevronDown className={cn("h-3.5 w-3.5 transition", open && "rotate-180")} />
      </button>
      {open ? (
        <div
          id={menuId}
          role="menu"
          className="absolute left-0 top-full z-[60] mt-0.5 min-w-[12rem] overflow-hidden rounded-xl border border-[var(--border)] bg-white py-1 shadow-[var(--shadow-lg)]"
        >
          {visibleChildren.map((child) => {
            const ChildIcon = child.icon;
            const childActive = isNavHrefActive(pathname, child);
            return (
              <SoftLink
                key={child.href}
                href={child.href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className={cn(
                  "flex items-center gap-2 px-3 py-2.5 text-sm font-medium transition",
                  childActive
                    ? "bg-[var(--primary-faint)] text-[var(--primary)]"
                    : "text-[var(--text-body)] hover:bg-[var(--bg)]"
                )}
              >
                <ChildIcon className="h-4 w-4 shrink-0" />
                {child.label}
              </SoftLink>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function AppNav({ ctx }: { ctx: NavAccessContext }) {
  const entries = NAV_ENTRIES.map((e) => filterEntry(e, ctx)).filter(
    (e): e is NavEntry => e != null
  );

  return (
    // overflow-x-auto clips absolute dropdowns — use wrap instead
    <nav className="relative z-[50] mx-auto flex max-w-6xl flex-wrap items-stretch gap-x-0.5 gap-y-0 px-2 sm:px-6">
      {entries.map((entry) =>
        entry.kind === "link" ? (
          <NavLink key={entry.href} item={entry} />
        ) : (
          <NavDropdown key={entry.id} group={entry} ctx={ctx} />
        )
      )}
    </nav>
  );
}
