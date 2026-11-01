"use client";

import { cn } from "@/lib/utils";

export type QuoteTier = "premium" | "regular";

export function QuoteTierToggle({
  value,
  onChange,
  disabled,
}: {
  value: QuoteTier;
  onChange: (tier: QuoteTier) => void;
  disabled?: boolean;
}) {
  return (
    <div className="inline-flex rounded-xl border border-[var(--border)] bg-[var(--bg)] p-1">
      {(
        [
          { id: "premium" as const, label: "Premium" },
          { id: "regular" as const, label: "Regular / General" },
        ] as const
      ).map((opt) => (
        <button
          key={opt.id}
          type="button"
          disabled={disabled}
          onClick={() => onChange(opt.id)}
          className={cn(
            "rounded-lg px-4 py-2 text-sm font-semibold transition",
            value === opt.id
              ? "bg-[var(--primary)] text-white shadow-sm"
              : "text-[var(--text-muted)] hover:text-[var(--text-dark)]",
            disabled && "cursor-not-allowed opacity-50"
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
