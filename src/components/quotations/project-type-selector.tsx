"use client";

import { PROJECT_TYPES, PROJECT_TYPE_LABELS, type ProjectType } from "@/lib/quotations/project-type";
import { cn } from "@/lib/utils";

export function ProjectTypeSelector({
  value,
  onChange,
  disabled = false,
}: {
  value: ProjectType;
  onChange: (value: ProjectType) => void;
  disabled?: boolean;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {PROJECT_TYPES.map((type) => (
        <button
          key={type}
          type="button"
          disabled={disabled}
          onClick={() => onChange(type)}
          className={cn(
            "min-h-11 rounded-xl border px-3 py-2 text-sm font-medium capitalize transition disabled:cursor-not-allowed disabled:opacity-50",
            value === type
              ? "border-[var(--primary)] bg-[var(--primary-light)] text-[var(--primary)] ring-1 ring-[var(--primary)]/30"
              : "border-[var(--border)] bg-white text-[var(--text-muted)] hover:border-[var(--text-muted)] hover:bg-[var(--bg)]"
          )}
        >
          {PROJECT_TYPE_LABELS[type]}
        </button>
      ))}
    </div>
  );
}
