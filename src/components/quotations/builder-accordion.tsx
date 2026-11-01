"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      className={cn("h-5 w-5 text-slate-400 transition-transform", open && "rotate-90")}
      aria-hidden
    >
      <path d="m9 18 6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckBadge() {
  return (
    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent-100 text-accent-700">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="h-3.5 w-3.5" aria-hidden>
        <path d="M20 6 9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

export function BuilderAccordionStep({
  title,
  subtitle,
  open,
  onToggle,
  complete,
  children,
}: {
  title: string;
  subtitle?: string;
  open: boolean;
  onToggle: () => void;
  complete?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border-2 border-brand-200/80 bg-white shadow-sm">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left transition hover:bg-brand-50/40 sm:px-5"
        aria-expanded={open}
      >
        <div className="min-w-0">
          <span className="text-base font-semibold text-brand-800 sm:text-lg">{title}</span>
          {subtitle ? <p className="mt-0.5 text-xs font-normal text-slate-500">{subtitle}</p> : null}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {complete ? <CheckBadge /> : null}
          <Chevron open={open} />
        </div>
      </button>
      {open ? <div className="border-t border-brand-100 px-4 pb-5 pt-4 sm:px-5">{children}</div> : null}
    </section>
  );
}
