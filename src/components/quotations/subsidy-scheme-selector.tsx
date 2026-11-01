"use client";

import {
  SUBSIDY_SCHEMES,
  SUBSIDY_SCHEME_LABELS,
  type SubsidyScheme,
} from "@/lib/quotations/subsidy";
import { cn } from "@/lib/utils";

export function SubsidySchemeSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: SubsidyScheme;
  onChange: (value: SubsidyScheme) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid gap-2">
      {SUBSIDY_SCHEMES.map((scheme) => (
        <button
          key={scheme}
          type="button"
          disabled={disabled}
          onClick={() => onChange(scheme)}
          className={cn(
            "min-h-11 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
            value === scheme
              ? "border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)] ring-1 ring-[var(--primary)]/30"
              : "border-[var(--border)] bg-white text-[var(--text-muted)] hover:border-[var(--text-muted)] hover:bg-[var(--bg)]"
          )}
        >
          <span className="block">{SUBSIDY_SCHEME_LABELS[scheme]}</span>
          {scheme === "society_common_meter" && (
            <span className="mt-0.5 block text-xs font-normal opacity-80">
              ₹18,000/kW up to 500 kW · GHS/RWA common facilities & EV charging
            </span>
          )}
          {scheme === "residential" && (
            <span className="mt-0.5 block text-xs font-normal opacity-80">
              PM Surya Ghar slabs · capped at 3 kW / ₹78,000
            </span>
          )}
        </button>
      ))}
    </div>
  );
}
