"use client";

import { METER_TYPES, METER_TYPE_LABELS, type MeterType } from "@/lib/domain/lead-profile";
import { cn } from "@/lib/utils";

const HINTS: Record<MeterType, string> = {
  residential: "PM Surya Ghar slabs · optional apply toggle",
  commercial: "No subsidy",
  common: "Society / GHS — enter subsidy ₹ manually",
};

export function MeterTypeSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: MeterType;
  onChange: (value: MeterType) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      {METER_TYPES.map((type) => (
        <button
          key={type}
          type="button"
          disabled={disabled}
          onClick={() => onChange(type)}
          className={cn(
            "min-h-11 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
            value === type
              ? "border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)] ring-1 ring-[var(--primary)]/30"
              : "border-[var(--border)] bg-white text-[var(--text-muted)] hover:border-[var(--text-muted)] hover:bg-[var(--bg)]"
          )}
        >
          <span className="block">{METER_TYPE_LABELS[type]}</span>
          <span className="mt-0.5 block text-xs font-normal opacity-80">{HINTS[type]}</span>
        </button>
      ))}
    </div>
  );
}
