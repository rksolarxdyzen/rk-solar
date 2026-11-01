import { BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function BrandMark({
  className,
  imageClassName,
  variant = "full",
}: {
  className?: string;
  /** Kept for call-site compat; applies to the text wordmark. */
  imageClassName?: string;
  variant?: "full" | "mark";
}) {
  return (
    <div className={cn("flex min-w-0 items-center", className)}>
      <span
        className={cn(
          "font-display font-semibold tracking-tight text-[#3158a6]",
          variant === "full"
            ? "text-xl sm:text-2xl"
            : "text-base sm:text-lg",
          imageClassName
        )}
        aria-label={BRAND.name}
      >
        {variant === "mark" ? "RK" : BRAND.name}
      </span>
    </div>
  );
}
