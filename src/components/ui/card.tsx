import { cn } from "@/lib/utils";

export function Card({
  children,
  className,
  hover,
}: {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-lg border border-[var(--border)] bg-white p-4",
        hover && "transition hover:shadow-[var(--shadow)]",
        className
      )}
    >
      {children}
    </div>
  );
}

export function StatCard({
  label,
  value,
  sub,
  color = "default",
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: "primary" | "success" | "warn" | "error" | "default";
}) {
  const colors = {
    primary: "text-[var(--primary)]",
    success: "text-[var(--success)]",
    warn: "text-[var(--warn)]",
    error: "text-[var(--error)]",
    default: "text-[var(--text-dark)]",
  };

  return (
    <Card className="relative">
      <p className="text-[0.68rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </p>
      <p className={cn("mt-1 text-2xl font-bold tracking-tight", colors[color])}>{value}</p>
      {sub && <p className="mt-1 text-xs text-[var(--text-muted)]">{sub}</p>}
    </Card>
  );
}
