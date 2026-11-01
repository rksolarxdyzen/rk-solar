import type { SolarProposalTemplate } from "@/lib/quotations/quotation-template";

export const METER_PHASES = [
  "single_phase_1_6",
  "three_phase_1_6",
  "three_phase_6_10",
] as const;

export type MeterPhase = (typeof METER_PHASES)[number];

export type MeterPhaseOption = {
  id: MeterPhase;
  label: string;
  amount: number;
};

export function isMeterPhase(value: unknown): value is MeterPhase {
  return typeof value === "string" && (METER_PHASES as readonly string[]).includes(value);
}

export function meterPhaseOptions(
  meterCharges: SolarProposalTemplate["meterCharges"]
): MeterPhaseOption[] {
  return [
    {
      id: "single_phase_1_6",
      label: meterCharges.singlePhase1to6Label,
      amount: Number(meterCharges.singlePhase1to6) || 0,
    },
    {
      id: "three_phase_1_6",
      label: meterCharges.threePhase1to6Label,
      amount: Number(meterCharges.threePhase1to6) || 0,
    },
    {
      id: "three_phase_6_10",
      label: meterCharges.threePhase6to10Label,
      amount: Number(meterCharges.threePhase6to10) || 0,
    },
  ];
}

export function resolveMeterPhaseOption(
  phase: MeterPhase | null | undefined,
  meterCharges: SolarProposalTemplate["meterCharges"]
): MeterPhaseOption | null {
  if (!phase) return null;
  return meterPhaseOptions(meterCharges).find((o) => o.id === phase) ?? null;
}

/** Short labels for commercial proposals (no kW band in the printed line). */
export function commercialMeterPhaseLabel(phase: MeterPhase): string {
  switch (phase) {
    case "single_phase_1_6":
      return "Single Phase";
    case "three_phase_1_6":
    case "three_phase_6_10":
      return "Three Phase";
    default:
      return "Meter";
  }
}

/** Strip "(… kW …)" bands from meter labels for commercial print/display. */
export function sanitizeCommercialMeterLabel(label: string | null | undefined): string | null {
  const raw = label?.trim();
  if (!raw) return null;
  const cleaned = raw.replace(/\s*\([^)]*kW[^)]*\)/gi, "").replace(/\s{2,}/g, " ").trim();
  return cleaned || null;
}
