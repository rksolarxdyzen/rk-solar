"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";

export function CatalogTabs({
  active,
}: {
  active: "items" | "rate-card" | "inverters";
}) {
  return (
    <div className="flex gap-2 border-b border-[var(--border)] pb-px">
      <Link
        href="/catalog"
        className={cn(
          "border-b-2 px-3 py-2 text-sm font-semibold transition",
          active === "items"
            ? "border-[var(--primary)] text-[var(--primary)]"
            : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-dark)]"
        )}
      >
        Item master
      </Link>
      <Link
        href="/catalog?tab=rate-card"
        className={cn(
          "border-b-2 px-3 py-2 text-sm font-semibold transition",
          active === "rate-card"
            ? "border-[var(--primary)] text-[var(--primary)]"
            : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-dark)]"
        )}
      >
        Rate card
      </Link>
      <Link
        href="/catalog?tab=inverters"
        className={cn(
          "border-b-2 px-3 py-2 text-sm font-semibold transition",
          active === "inverters"
            ? "border-[var(--primary)] text-[var(--primary)]"
            : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-dark)]"
        )}
      >
        Inverters
      </Link>
    </div>
  );
}
