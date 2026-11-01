/** Tier-specific structure & warranty copy shown on solar proposals. */

import type { ProjectType } from "@/lib/quotations/project-type";

export type QuoteTierCopy = {
  structureMounting: string;
  structureRafter: string;
  warrantyRows: Array<{ label: string; value: string }>;
};

export const PREMIUM_TIER_COPY: QuoteTierCopy = {
  structureMounting: "80 Micron HDGI 80×40 mm",
  structureRafter: "60×40 mm",
  warrantyRows: [
    { label: "Panel warranty", value: "30 Years" },
    { label: "Inverter warranty", value: "10 Years" },
  ],
};

export const REGULAR_TIER_COPY: QuoteTierCopy = {
  structureMounting: "80 Micron HDGI 60×40 mm",
  structureRafter: "40×40 mm",
  warrantyRows: [
    { label: "Panel performance warranty", value: "30 Years" },
    { label: "Inverter warranty", value: "10 Years" },
  ],
};

/** Maintenance & structure warranty years (RK portal spec). */
export function serviceWarrantyYears(
  projectType: ProjectType,
  tier: "premium" | "regular"
): { maintenance: number; structure: number } {
  if (projectType === "commercial") return { maintenance: 5, structure: 5 };
  if (tier === "premium") return { maintenance: 10, structure: 10 };
  return { maintenance: 5, structure: 5 };
}

export function quoteTierCopy(
  tier: "premium" | "regular" | null | undefined,
  projectType: ProjectType = "residential"
): QuoteTierCopy {
  const resolvedTier: "premium" | "regular" = tier === "regular" ? "regular" : "premium";
  const base = resolvedTier === "regular" ? REGULAR_TIER_COPY : PREMIUM_TIER_COPY;
  const svc = serviceWarrantyYears(projectType, resolvedTier);
  return {
    ...base,
    warrantyRows: [
      ...base.warrantyRows,
      { label: "Maintenance", value: `${svc.maintenance} Years` },
      { label: "Structure warranty", value: `${svc.structure} Years` },
    ],
  };
}
