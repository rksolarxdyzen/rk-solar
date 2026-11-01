/** Commercial quotation pricing & mount options */

/** Default commercial GST on system base price (editable per quote). */
export const COMMERCIAL_GST_PERCENT = 8.9;

export function normalizeCommercialGstPercent(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return COMMERCIAL_GST_PERCENT;
  return Math.min(100, Math.round(n * 100) / 100);
}

export const PANEL_MOUNT_TYPES = [
  "rcc_terrace",
  "direct_shed",
  "half_shed_half_terrace",
] as const;

export type PanelMountType = (typeof PANEL_MOUNT_TYPES)[number];

export const PANEL_MOUNT_TYPE_LABELS: Record<PanelMountType, string> = {
  rcc_terrace: "On RCC Terrace",
  direct_shed: "Direct shed mount",
  half_shed_half_terrace: "Half shed & Half Terrace Both",
};

export function parsePanelMountType(value: unknown): PanelMountType | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if ((PANEL_MOUNT_TYPES as readonly string[]).includes(v)) {
    return v as PanelMountType;
  }
  return null;
}

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Commercial pricing: ₹/kW exclusive of GST + GST breakdown. */
export function calcCommercialSystemPricing(
  systemSizeKw: number,
  pricePerKwExclGst: number,
  gstPercent: number = COMMERCIAL_GST_PERCENT
) {
  const size = Math.max(0, Number(systemSizeKw) || 0);
  const rate = Math.max(0, Number(pricePerKwExclGst) || 0);
  const base = r2(size * rate);
  const gst = r2((base * gstPercent) / 100);
  const total = r2(base + gst);
  return { base, gst, total, gstPercent, size, rate };
}

/** Infer excl. ₹/kW from an inclusive package total (e.g. when loading a rate-card package). */
export function inferPricePerKwExclFromInclusive(
  systemSizeKw: number,
  inclusiveTotal: number,
  gstPercent: number = COMMERCIAL_GST_PERCENT
): number {
  const size = Math.max(0, Number(systemSizeKw) || 0);
  const total = Math.max(0, Number(inclusiveTotal) || 0);
  if (size <= 0 || total <= 0) return 0;
  const base = total / (1 + gstPercent / 100);
  return r2(base / size);
}
