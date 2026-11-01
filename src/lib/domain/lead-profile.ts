/** Lead / customer profile enums — Phase 5a (required at Won gate). */

export const METER_TYPES = ["residential", "commercial", "common"] as const;
export type MeterType = (typeof METER_TYPES)[number];

export const METER_TYPE_LABELS: Record<MeterType, string> = {
  residential: "Residential",
  commercial: "Commercial",
  common: "Common",
};

export const METER_OWNERSHIPS = [
  "self",
  "wife",
  "husband",
  "mother",
  "father",
  "son",
  "daughter",
] as const;
export type MeterOwnership = (typeof METER_OWNERSHIPS)[number];

export const METER_OWNERSHIP_LABELS: Record<MeterOwnership, string> = {
  self: "Self",
  wife: "Wife",
  husband: "Husband",
  mother: "Mother",
  father: "Father",
  son: "Son",
  daughter: "Daughter",
};

export const PAYMENT_PLANS = ["loan", "cash"] as const;
export type PaymentPlan = (typeof PAYMENT_PLANS)[number];

export const PAYMENT_PLAN_LABELS: Record<PaymentPlan, string> = {
  loan: "Loan",
  cash: "Cash",
};

export function parseMeterType(value: unknown): MeterType | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return (METER_TYPES as readonly string[]).includes(v) ? (v as MeterType) : null;
}

export function parseMeterOwnership(value: unknown): MeterOwnership | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return (METER_OWNERSHIPS as readonly string[]).includes(v)
    ? (v as MeterOwnership)
    : null;
}

export function parsePaymentPlan(value: unknown): PaymentPlan | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return (PAYMENT_PLANS as readonly string[]).includes(v) ? (v as PaymentPlan) : null;
}
