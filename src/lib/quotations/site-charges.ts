import { inr } from "@/lib/quotations/format";

export type HeightCharge = {
  enabled: boolean;
  quantity: number;
  unit: string;
  ratePerUnit: number;
  gstPercent: number;
};

export type FloorCharge = {
  enabled: boolean;
  buildingType: "residential" | "commercial";
  floorCount: number;
  ratePerFloor: number;
  gstPercent: number;
};

export type SiteCharges = {
  height: HeightCharge;
  floors: FloorCharge;
};

export const HEIGHT_UNIT_PRESETS = ["ft", "m"] as const;
export const HEIGHT_QTY_PRESETS = [1, 2, 3, 5] as const;
export const HEIGHT_RATE_PRESETS = [250, 350, 500] as const;

export const FLOOR_RATE_DEFAULTS: Record<FloorCharge["buildingType"], number> = {
  residential: 500,
  commercial: 800,
};

export function defaultSiteCharges(): SiteCharges {
  return {
    height: {
      enabled: false,
      quantity: 1,
      unit: "ft",
      ratePerUnit: 250,
      gstPercent: 18,
    },
    floors: {
      enabled: false,
      buildingType: "residential",
      floorCount: 1,
      ratePerFloor: FLOOR_RATE_DEFAULTS.residential,
      gstPercent: 18,
    },
  };
}

export function normalizeSiteCharges(raw: unknown): SiteCharges {
  const base = defaultSiteCharges();
  if (!raw || typeof raw !== "object") return base;
  const o = raw as Record<string, unknown>;
  const h = o.height && typeof o.height === "object" ? (o.height as Record<string, unknown>) : {};
  const f = o.floors && typeof o.floors === "object" ? (o.floors as Record<string, unknown>) : {};
  const buildingType = f.buildingType === "commercial" ? "commercial" : "residential";
  return {
    height: {
      enabled: Boolean(h.enabled),
      quantity: Math.max(0, Number(h.quantity ?? base.height.quantity)),
      unit: String(h.unit ?? base.height.unit),
      ratePerUnit: Math.max(0, Number(h.ratePerUnit ?? base.height.ratePerUnit)),
      gstPercent: Math.min(100, Math.max(0, Number(h.gstPercent ?? base.height.gstPercent))),
    },
    floors: {
      enabled: Boolean(f.enabled),
      buildingType,
      floorCount: Math.max(0, Number(f.floorCount ?? base.floors.floorCount)),
      ratePerFloor: Math.max(0, Number(f.ratePerFloor ?? FLOOR_RATE_DEFAULTS[buildingType])),
      gstPercent: Math.min(100, Math.max(0, Number(f.gstPercent ?? base.floors.gstPercent))),
    },
  };
}

export type SiteChargeLine = {
  key: string;
  label: string;
  subtotal: number;
  gst: number;
  total: number;
  gstPercent: number;
  unit: string;
  quantity: number;
  rate: number;
};

function lineFromBase(
  key: string,
  label: string,
  quantity: number,
  unit: string,
  rate: number,
  gstPercent: number
): SiteChargeLine | null {
  if (quantity <= 0 || rate <= 0) return null;
  const subtotal = quantity * rate;
  const gst = (subtotal * gstPercent) / 100;
  return {
    key,
    label,
    subtotal,
    gst,
    total: subtotal + gst,
    gstPercent,
    unit,
    quantity,
    rate,
  };
}

export function calcHeightLine(height: HeightCharge): SiteChargeLine | null {
  if (!height.enabled) return null;
  return lineFromBase(
    "height",
    `Extra height (${height.quantity} ${height.unit} @ ${inr(height.ratePerUnit)}/${height.unit}, excl. GST)`,
    height.quantity,
    height.unit,
    height.ratePerUnit,
    height.gstPercent
  );
}

export function calcFloorLine(floors: FloorCharge): SiteChargeLine | null {
  if (!floors.enabled) return null;
  const typeLabel = floors.buildingType === "residential" ? "Residential" : "Commercial";
  return lineFromBase(
    "floors",
    `Floor surcharge — ${typeLabel} (${floors.floorCount} floor${floors.floorCount === 1 ? "" : "s"} @ ${inr(floors.ratePerFloor)}/floor)`,
    floors.floorCount,
    "floor",
    floors.ratePerFloor,
    floors.gstPercent
  );
}

export function calcSiteChargeLines(charges: SiteCharges): SiteChargeLine[] {
  return [calcHeightLine(charges.height), calcFloorLine(charges.floors)].filter(
    (l): l is SiteChargeLine => l !== null
  );
}

export function calcSiteChargesTotals(charges: SiteCharges) {
  const lines = calcSiteChargeLines(charges);
  return lines.reduce(
    (acc, line) => ({
      subtotal: acc.subtotal + line.subtotal,
      gst: acc.gst + line.gst,
      total: acc.total + line.total,
      lines,
    }),
    { subtotal: 0, gst: 0, total: 0, lines: [] as SiteChargeLine[] }
  );
}

export function siteLinesToQuoteItems(lines: SiteChargeLine[]) {
  return lines.map((line) => ({
    itemName: line.label,
    brand: "Site charge",
    model: "",
    quantity: line.quantity,
    unit: line.unit,
    rate: line.rate,
    gstPercent: line.gstPercent,
    discountValue: 0,
  }));
}
