/** Shared Accounts receivables / milestone remaining math. */

export type MilestoneAmounts = {
  token: number;
  pre_dispatch: number;
  final: number;
};

export type PaymentSlice = {
  milestone: string;
  amount: number;
  verification_status: string;
};

export function sumVerifiedByMilestone(payments: PaymentSlice[]): MilestoneAmounts {
  const out: MilestoneAmounts = { token: 0, pre_dispatch: 0, final: 0 };
  for (const p of payments) {
    if (p.verification_status !== "verified") continue;
    const key = p.milestone as keyof MilestoneAmounts;
    if (key in out) out[key] += Number(p.amount) || 0;
  }
  return out;
}

export function sumNonRejectedPayments(payments: PaymentSlice[]): number {
  return payments
    .filter((p) => p.verification_status !== "rejected")
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
}

export function milestoneRemaining(
  planned: number,
  verifiedForMilestone: number
): number {
  return Math.max(0, Math.round((planned - verifiedForMilestone) * 100) / 100);
}

/** Settlement discount reduces what is still owed: Final first, then Pre-dispatch, then Token. */
export function applySettlementDiscount(
  remaining: MilestoneAmounts,
  discount: number
): MilestoneAmounts {
  let left = Math.max(0, Number(discount) || 0);
  const out = { ...remaining };
  for (const key of ["final", "pre_dispatch", "token"] as const) {
    const cut = Math.min(out[key], left);
    out[key] = Math.round((out[key] - cut) * 100) / 100;
    left -= cut;
  }
  return out;
}

export function companySubsidyPendingAmount(input: {
  companyBearsSubsidy: boolean;
  subsidyAmountAtWon?: number | null;
  subsidyVerifiedAt?: string | null;
}): number {
  if (!input.companyBearsSubsidy) return 0;
  if (input.subsidyVerifiedAt) return 0;
  return Math.max(0, Number(input.subsidyAmountAtWon) || 0);
}

export function assertPaymentWithinQuoteCap(input: {
  projectTotal: number | null;
  existingNonRejectedTotal: number;
  newAmount: number;
  replacingAmount?: number;
}): { ok: true } | { ok: false; message: string; overBy: number } {
  if (input.projectTotal == null || !(input.projectTotal > 0)) {
    return {
      ok: false,
      message: "Cannot record payment until an accepted quotation or Won payment plan exists",
      overBy: 0,
    };
  }
  const replacing = Number(input.replacingAmount) || 0;
  const nextTotal =
    input.existingNonRejectedTotal - replacing + (Number(input.newAmount) || 0);
  const overBy = Math.round((nextTotal - input.projectTotal) * 100) / 100;
  if (overBy > 0) {
    return {
      ok: false,
      message: `Payment exceeds quotation amount by ₹${overBy.toLocaleString("en-IN")}`,
      overBy,
    };
  }
  return { ok: true };
}
