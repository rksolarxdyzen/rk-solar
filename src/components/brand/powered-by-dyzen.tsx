import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

/** Discreet platform credit. RK remains the primary tenant brand. */
export function PoweredByDyzen({
  className,
  tone = "muted",
}: {
  className?: string;
  tone?: "muted" | "onDark";
}) {
  return (
    <p
      className={cn(
        "text-center text-[11px] font-medium tracking-wide",
        tone === "onDark" ? "text-white/45" : "text-[var(--text-light)]",
        className
      )}
    >
      {BRAND.poweredBy}
    </p>
  );
}
