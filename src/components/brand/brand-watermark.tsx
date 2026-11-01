import { BRAND } from "@/lib/brand";

/** Centered page watermark — always visible behind UI chrome, hidden when printing. */
export function BrandWatermark() {
  return (
    <div
      aria-hidden
      className="pointer-events-none fixed inset-0 z-[30] flex items-center justify-center overflow-hidden print:hidden"
    >
      <span className="select-none font-display text-[clamp(2.5rem,12vw,8rem)] font-semibold tracking-tight text-[#3158a6] opacity-[0.04]">
        {BRAND.name}
      </span>
    </div>
  );
}
