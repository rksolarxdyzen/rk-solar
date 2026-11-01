"use client";

import { cn } from "@/lib/utils";

export function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="relative border-b border-[var(--border)]">
      <div className="flex gap-0 overflow-x-auto scroll-smooth pb-px [-webkit-overflow-scrolling:touch]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "shrink-0 whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium transition min-h-[44px]",
              active === tab.id
                ? "border-[var(--primary)] font-semibold text-[var(--primary)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-body)]"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
