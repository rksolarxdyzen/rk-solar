export const INVERTER_BRANDS = ["Adani", "Waaree", "Xwatt", "VSole", "APS"] as const;
export type InverterBrand = (typeof INVERTER_BRANDS)[number];

export function normalizeInverterBrand(value: string | null | undefined): InverterBrand | "" {
  const n = (value ?? "").trim().toLowerCase();
  if (n === "adani") return "Adani";
  // Legacy "Waree" spelling from older quotes
  if (n === "waaree" || n === "waree") return "Waaree";
  if (n === "xwatt") return "Xwatt";
  if (n === "vsole" || n === "v sole" || n === "v-sole") return "VSole";
  if (n === "aps") return "APS";
  return "";
}

export function isInverterBrand(value: string | null | undefined): value is InverterBrand {
  return normalizeInverterBrand(value) !== "";
}
