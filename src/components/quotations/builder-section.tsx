"use client";

import { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function BuilderSection({
  step,
  title,
  description,
  icon,
  accent = "brand",
  children,
  className,
}: {
  step?: number;
  title: string;
  description?: string;
  icon?: ReactNode;
  accent?: "brand" | "amber" | "violet" | "slate";
  children: ReactNode;
  className?: string;
}) {
  const accentBar = {
    brand: "border-l-brand-500",
    amber: "border-l-amber-500",
    violet: "border-l-violet-500",
    slate: "border-l-slate-400",
  }[accent];

  const iconBg = {
    brand: "border-brand-100 bg-brand-50 text-brand-700",
    amber: "border-amber-100 bg-amber-50 text-amber-700",
    violet: "border-violet-100 bg-violet-50 text-violet-700",
    slate: "border-slate-200 bg-slate-50 text-slate-600",
  }[accent];

  return (
    <section
      className={cn(
        "overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm",
        "border-l-4",
        accentBar,
        className
      )}
    >
      <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50/90 to-white px-4 py-4 sm:px-5">
        <div className="flex items-start gap-3">
          {icon ? (
            <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border", iconBg)}>
              {icon}
            </div>
          ) : step !== undefined ? (
            <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border text-sm font-bold", iconBg)}>
              {step}
            </div>
          ) : null}
          <div className="min-w-0">
            <h2 className="text-base font-semibold text-slate-900 sm:text-lg">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
        </div>
      </div>
      <div className="p-4 sm:p-5">{children}</div>
    </section>
  );
}
