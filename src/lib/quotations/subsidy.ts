/** MNRE / PM Surya Ghar style residential rooftop subsidy slabs. */

import type { MeterType } from "@/lib/domain/lead-profile";
import { parseMeterType } from "@/lib/domain/lead-profile";
import type { ProjectType } from "@/lib/quotations/project-type";
import { parseProjectType } from "@/lib/quotations/project-type";

export type SubsidySlabLine = {
  label: string;
  amount: number;
};

export type SubsidyBreakdown = {
  total: number;
  lines: SubsidySlabLine[];
  /** Scheme used for this calculation. */
  scheme: SubsidyScheme;
  /** Short title shown on the quotation. */
  title: string;
  /** Rule notes printed under the subsidy block. */
  notes: string[];
};

export const SUBSIDY_SCHEMES = ["residential", "society_common_meter", "none"] as const;
export type SubsidyScheme = (typeof SUBSIDY_SCHEMES)[number];

export const SUBSIDY_SCHEME_LABELS: Record<SubsidyScheme, string> = {
  residential: "Standard Residential",
  society_common_meter: "Society Common Meter (GHS/RWA)",
  none: "No subsidy",
};

const RATE_FIRST_2KW = 30000;
const RATE_NEXT_1KW = 18000;
const CAP_KW = 3;
const MAX_SUBSIDY = 78000;

/** GHS/RWA common facilities (incl. EV charging) — ₹18,000/kW up to 500 kW (reference formula only). */
const SOCIETY_RATE_PER_KW = 18000;
const SOCIETY_CAP_KW = 500;
const SOCIETY_KW_PER_HOUSE = 3;

export function parseSubsidyScheme(value: unknown): SubsidyScheme {
  if (typeof value !== "string") return "residential";
  const normalized = value.trim().toLowerCase();
  if (normalized === "society_common_meter" || normalized.includes("society")) {
    return "society_common_meter";
  }
  if (normalized === "none" || normalized === "commercial") return "none";
  if (normalized === "residential" || normalized === "standard") return "residential";
  return "residential";
}

export function defaultSubsidySchemeForProjectType(
  projectType: "residential" | "commercial"
): SubsidyScheme {
  return projectType === "commercial" ? "none" : "residential";
}

/**
 * Product Meter Type from stored quote fields (Phase 4).
 * common ← society_common_meter; commercial ← project commercial; else residential.
 */
export function quoteMeterTypeFromFields(
  projectType: unknown,
  subsidyScheme: unknown
): MeterType {
  if (parseProjectType(projectType) === "commercial") return "commercial";
  if (parseSubsidyScheme(subsidyScheme) === "society_common_meter") return "common";
  return "residential";
}

/** Map lead/customer Meter Type → quote project_type + subsidy_scheme defaults. */
export function meterTypeToQuoteDefaults(
  meterType: MeterType | string | null | undefined,
  opts?: { applyResidentialSubsidy?: boolean }
): {
  projectType: ProjectType;
  subsidyScheme: SubsidyScheme;
  applyResidentialSubsidy: boolean;
} {
  const type = parseMeterType(meterType) ?? "residential";
  if (type === "commercial") {
    return {
      projectType: "commercial",
      subsidyScheme: "none",
      applyResidentialSubsidy: false,
    };
  }
  if (type === "common") {
    return {
      projectType: "residential",
      subsidyScheme: "society_common_meter",
      applyResidentialSubsidy: false,
    };
  }
  const apply = opts?.applyResidentialSubsidy !== false;
  return {
    projectType: "residential",
    subsidyScheme: apply ? "residential" : "none",
    applyResidentialSubsidy: apply,
  };
}

/** Strict matrix for server upsert (Phase 4). */
export function enforceQuotationSubsidyMatrix(input: {
  projectType: unknown;
  subsidyScheme: unknown;
  subsidy: unknown;
}): { projectType: ProjectType; subsidyScheme: SubsidyScheme; subsidy: number } {
  const projectType = parseProjectType(input.projectType);
  const subsidyScheme = parseSubsidyScheme(input.subsidyScheme);
  const subsidy = Number(input.subsidy);

  if (projectType === "commercial") {
    if ((Number.isFinite(subsidy) && subsidy !== 0) || subsidyScheme !== "none") {
      throw new Error(
        "Commercial quotes cannot include subsidy — scheme must be None and amount ₹0."
      );
    }
    return { projectType: "commercial", subsidyScheme: "none", subsidy: 0 };
  }

  if (subsidyScheme === "society_common_meter") {
    if (input.subsidy == null || input.subsidy === "" || !Number.isFinite(Number(input.subsidy))) {
      throw new Error("Common meter quotes require an explicit subsidy amount (enter 0 if none).");
    }
    if (Number(input.subsidy) < 0) {
      throw new Error("Subsidy cannot be negative.");
    }
    return {
      projectType: "residential",
      subsidyScheme: "society_common_meter",
      subsidy: Number(input.subsidy),
    };
  }

  if (subsidyScheme === "none") {
    return { projectType: "residential", subsidyScheme: "none", subsidy: 0 };
  }

  return {
    projectType: "residential",
    subsidyScheme: "residential",
    subsidy: Math.max(0, Number.isFinite(subsidy) ? subsidy : 0),
  };
}

/**
 * Residential subsidy from DC system size (kW).
 * Commercial / non-residential callers should pass projectType and get 0.
 */
export function calcResidentialSubsidy(
  systemSizeKw: number,
  projectType: "residential" | "commercial" = "residential"
): SubsidyBreakdown {
  if (projectType !== "residential" || !Number.isFinite(systemSizeKw) || systemSizeKw <= 0) {
    return {
      total: 0,
      lines: [],
      scheme: "none",
      title: "Subsidy",
      notes: [],
    };
  }

  const kw = Math.min(systemSizeKw, CAP_KW);
  const first = Math.min(kw, 2);
  const second = Math.max(0, kw - 2);

  const firstAmt = Math.round(first * RATE_FIRST_2KW);
  const secondAmt = Math.round(second * RATE_NEXT_1KW);
  const total = Math.min(firstAmt + secondAmt, MAX_SUBSIDY);

  const lines: SubsidySlabLine[] = [];
  if (firstAmt > 0) {
    lines.push({
      label: `Up To 2.00 Kw = Rs ${RATE_FIRST_2KW.toLocaleString("en-IN")} Per Kw`,
      amount: firstAmt,
    });
  }
  if (secondAmt > 0) {
    lines.push({
      label: `From 2.01 Kw To 3.0 Kw = Rs ${RATE_NEXT_1KW.toLocaleString("en-IN")} Per Kw`,
      amount: secondAmt,
    });
  }

  return {
    total,
    lines,
    scheme: "residential",
    title: "Residential Subsidy (PM Surya Ghar)",
    notes: [
      "Credited directly to the customer bank account after work completion.",
      "Standard residential rooftop slabs apply (capped at 3 kW / ₹78,000).",
    ],
  };
}

/**
 * Society / GHS-RWA common meter subsidy formula (reference only).
 * Phase 4: Common quotes use **manual** ₹ entry; call this only if suggesting a formula amount.
 */
export function calcSocietyCommonMeterSubsidy(systemSizeKw: number): SubsidyBreakdown {
  if (!Number.isFinite(systemSizeKw) || systemSizeKw <= 0) {
    return {
      total: 0,
      lines: [],
      scheme: "society_common_meter",
      title: "Society Common Meter Subsidy (GHS/RWA)",
      notes: societySubsidyNotes(0),
    };
  }

  const eligibleKw = Math.min(systemSizeKw, SOCIETY_CAP_KW);
  const total = Math.round(eligibleKw * SOCIETY_RATE_PER_KW);
  const indicativeHouses = Math.max(1, Math.ceil(eligibleKw / SOCIETY_KW_PER_HOUSE));

  return {
    total,
    lines: [
      {
        label: `Rs ${SOCIETY_RATE_PER_KW.toLocaleString("en-IN")} Per kW × ${eligibleKw.toLocaleString("en-IN", { maximumFractionDigits: 2 })} kW`,
        amount: total,
      },
    ],
    scheme: "society_common_meter",
    title: "Society Common Meter Subsidy (GHS/RWA)",
    notes: societySubsidyNotes(indicativeHouses),
  };
}

function societySubsidyNotes(indicativeHouses: number): string[] {
  return [
    "Applicable for GHS/RWA common facilities, including EV charging.",
    `Rate: ₹${SOCIETY_RATE_PER_KW.toLocaleString("en-IN")} per kW, up to ${SOCIETY_CAP_KW} kW capacity.`,
    `Guideline: @ ${SOCIETY_KW_PER_HOUSE} kW per house${
      indicativeHouses > 0 ? ` (≈ ${indicativeHouses} houses for this system size)` : ""
    }.`,
    "Upper limit of 500 kW is inclusive of individual rooftop plants already installed in the same GHS/RWA.",
    "Subsidy is credited as per applicable scheme rules after work completion.",
  ];
}

/** Manual common-meter subsidy snapshot for print (no auto slab lines). */
export function manualCommonMeterSubsidy(amount: number): SubsidyBreakdown {
  const total = Math.max(0, Number(amount) || 0);
  return {
    total,
    lines: total > 0 ? [{ label: "Society / common meter subsidy (manual)", amount: total }] : [],
    scheme: "society_common_meter",
    title: "Society Common Meter Subsidy",
    notes: [
      "Subsidy amount entered manually (varies by flats / society rules).",
      "Credited as per applicable scheme rules after work completion.",
    ],
  };
}

/** Resolve auto-calc subsidy from scheme + system size (residential formula / society formula / none). */
export function calcQuotationSubsidy(
  systemSizeKw: number,
  scheme: SubsidyScheme
): SubsidyBreakdown {
  if (scheme === "none") {
    return {
      total: 0,
      lines: [],
      scheme: "none",
      title: "Subsidy",
      notes: [],
    };
  }
  if (scheme === "society_common_meter") {
    return calcSocietyCommonMeterSubsidy(systemSizeKw);
  }
  return calcResidentialSubsidy(systemSizeKw, "residential");
}

/** Print/display breakdown respecting Phase 4 matrix + stored amount. */
export function resolveQuotationSubsidyBreakdown(input: {
  systemSizeKw: number;
  projectType: unknown;
  subsidyScheme: unknown;
  subsidy: unknown;
}): SubsidyBreakdown {
  const scheme = parseSubsidyScheme(input.subsidyScheme);
  const projectType = parseProjectType(input.projectType);
  const stored = Math.max(0, Number(input.subsidy) || 0);

  if (projectType === "commercial" || scheme === "none") {
    return {
      total: 0,
      lines: [],
      scheme: "none",
      title: "Subsidy",
      notes: [],
    };
  }

  if (scheme === "society_common_meter") {
    return { ...manualCommonMeterSubsidy(stored), total: stored };
  }

  const calc = calcResidentialSubsidy(input.systemSizeKw, "residential");
  if (stored === calc.total) return calc;
  return {
    ...calc,
    total: stored,
    lines: stored > 0 ? [{ label: "Residential subsidy (as quoted)", amount: stored }] : [],
  };
}

export function assertSystemCostAllowed(systemCost: number, minSalePrice: number): void {
  if (!Number.isFinite(systemCost) || systemCost < 0) {
    throw new Error("System cost must be a valid amount.");
  }
  if (systemCost < minSalePrice) {
    throw new Error(
      `System cost cannot be below minimum sale price of ₹${Math.round(minSalePrice).toLocaleString("en-IN")}.`
    );
  }
}
