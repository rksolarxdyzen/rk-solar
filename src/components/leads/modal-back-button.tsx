"use client";

import { ArrowLeft } from "lucide-react";

export function ModalBackButton({
  onClick,
  label = "Back",
}: {
  onClick: () => void;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="mb-1 inline-flex h-9 items-center gap-1 rounded-lg px-1.5 text-sm font-semibold text-[var(--text-body)] hover:bg-[var(--bg)] hover:text-[var(--text-dark)]"
      aria-label={label}
    >
      <ArrowLeft className="h-4 w-4" />
      {label}
    </button>
  );
}
