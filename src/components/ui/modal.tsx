"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function Modal({
  open,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = "md",
  layer = "default",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  /** Stays outside the scroll body (e.g. Save / Cancel). */
  footer?: React.ReactNode;
  size?: "md" | "lg" | "xl";
  layer?: "default" | "nested";
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open || !mounted) return null;

  const sizes = { md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 flex items-end justify-center overflow-hidden bg-black/40 sm:items-center sm:overflow-y-auto sm:p-4 sm:backdrop-blur-sm",
        layer === "nested" ? "z-[260]" : "z-50"
      )}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          "flex max-h-[92dvh] w-full flex-col rounded-t-2xl bg-white shadow-[var(--shadow-lg)] sm:my-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-[var(--radius-xl)]",
          sizes[size]
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[var(--border)] p-4 sm:p-5">
          <div className="min-w-0">
            <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--text-dark)]">
              {title}
            </h3>
            {subtitle && <p className="mt-0.5 text-sm text-[var(--text-muted)]">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg)]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-[var(--border)] bg-white p-4 sm:p-5">{footer}</div>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
