import type { PortalPayment } from "@/lib/domain/portal";
import { assertPaymentWithinQuoteCap } from "@/lib/accounts/receivables-math";

export type LeadPaymentBalance = {
  projectTotal: number | null;
  /** Accounts settlement discount (waived amount). */
  discount: number;
  paid: number;
  pending: number;
  remaining: number | null;
  source: "quotation" | "won_plan" | "none";
};

export { assertPaymentWithinQuoteCap };

/** Staff + portal shared remaining-balance math. */
export function summarizeLeadPaymentBalance(input: {
  quoteGrandTotal?: number | null;
  wonTokenAmount?: number | null;
  wonPreDispatchAmount?: number | null;
  wonFinalAmount?: number | null;
  settlementDiscount?: number | null;
  payments: Array<Pick<PortalPayment, "amount" | "verification_status">>;
}): LeadPaymentBalance {
  const quoteTotal =
    input.quoteGrandTotal != null && !Number.isNaN(Number(input.quoteGrandTotal))
      ? Number(input.quoteGrandTotal)
      : null;
  const wonPlan =
    (Number(input.wonTokenAmount) || 0) +
    (Number(input.wonPreDispatchAmount) || 0) +
    (Number(input.wonFinalAmount) || 0);

  let projectTotal: number | null = null;
  let source: LeadPaymentBalance["source"] = "none";
  if (quoteTotal != null && quoteTotal > 0) {
    projectTotal = quoteTotal;
    source = "quotation";
  } else if (wonPlan > 0) {
    projectTotal = wonPlan;
    source = "won_plan";
  }

  const discount = Math.max(0, Number(input.settlementDiscount) || 0);
  const counted = input.payments.filter((p) => p.verification_status !== "rejected");
  const paid = counted.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const pending = counted
    .filter((p) => p.verification_status === "pending")
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const remaining =
    projectTotal == null
      ? null
      : Math.max(0, Math.round((projectTotal - discount - paid) * 100) / 100);

  return { projectTotal, discount, paid, pending, remaining, source };
}
