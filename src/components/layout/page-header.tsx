import { cn } from "@/lib/utils";

/**
 * Shared page chrome for dashboard modules (Phase 3b).
 * Matches dashboard visual language: display title + muted subtitle + optional actions.
 */
export function PageHeader({
  eyebrow,
  title,
  subtitle,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mb-6 flex flex-wrap items-start justify-between gap-x-4 gap-y-3",
        className
      )}
    >
      <div className="min-w-0">
        {eyebrow ? (
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--primary)]">
            {eyebrow}
          </p>
        ) : null}
        <h1
          className={cn(
            "font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--text-dark)] sm:text-2xl",
            eyebrow && "mt-1"
          )}
        >
          {title}
        </h1>
        {subtitle ? (
          <div className="mt-1 max-w-2xl text-sm text-[var(--text-muted)]">
            {subtitle}
          </div>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      ) : null}
    </div>
  );
}
