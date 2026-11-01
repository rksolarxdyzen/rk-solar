export const PAYMENT_MILESTONES = ["token", "pre_dispatch", "final"] as const;
export type PaymentMilestone = (typeof PAYMENT_MILESTONES)[number];

export const PAYMENT_METHODS = [
  "upi",
  "bank_transfer",
  "cash",
  "cheque",
  "card",
  "other",
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_VERIFICATION_STATUSES = [
  "pending",
  "verified",
  "rejected",
] as const;
export type PaymentVerificationStatus =
  (typeof PAYMENT_VERIFICATION_STATUSES)[number];

export const PAYMENT_MILESTONE_LABELS: Record<PaymentMilestone, string> = {
  token: "Token / Advance",
  pre_dispatch: "Pre-Dispatch",
  final: "Final Settlement",
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  upi: "UPI",
  bank_transfer: "Bank transfer",
  cash: "Cash",
  cheque: "Cheque",
  card: "Card",
  other: "Other",
};

export const PAYMENT_STATUS_LABELS: Record<PaymentVerificationStatus, string> = {
  pending: "Pending verification",
  verified: "Verified",
  rejected: "Rejected",
};

export type PaymentRow = {
  id: string;
  company_id: string;
  lead_id: string;
  quotation_id: string | null;
  milestone: PaymentMilestone;
  amount: number;
  method: string;
  transaction_id: string | null;
  paid_at: string | null;
  bank_reference: string | null;
  verification_status: PaymentVerificationStatus;
  recorded_by: string | null;
  verified_by: string | null;
  verified_at: string | null;
  rejection_reason: string | null;
  notes: string | null;
  created_at: string;
};

export type FeasibilityReport = {
  id: string;
  company_id: string;
  lead_id: string;
  title: string;
  notes: string | null;
  file_url: string | null;
  storage_path?: string | null;
  status: "submitted" | "approved" | "rejected";
  uploaded_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  created_at: string;
};

function hasNonRejectedMilestone(
  existing: Array<{ milestone: string; verification_status: string }>,
  m: PaymentMilestone
) {
  return existing.some(
    (p) => p.milestone === m && p.verification_status !== "rejected"
  );
}

const FINAL_RECORD_STAGES = new Set([
  "installation_completed",
  "final_pending_verification",
  "final_verified",
  "liaison_in_progress",
  "meter_installed",
  "subsidy_pending",
  "subsidy_received_pending_accounts",
]);

/** Which milestone can be recorded for the current lead stage. */
export function nextRecordableMilestone(
  stage: string,
  existing: Array<{ milestone: string; verification_status: string }>
): PaymentMilestone | null {
  if (stage === "lost") return null;

  const hasToken = hasNonRejectedMilestone(existing, "token");
  const hasPre = hasNonRejectedMilestone(existing, "pre_dispatch");
  const hasFinal = hasNonRejectedMilestone(existing, "final");

  if (
    (stage === "quote_accepted" || stage === "token_pending_verification") &&
    !hasToken
  ) {
    return "token";
  }
  // Pre-dispatch after a Token row exists — not after token verify + feasibility.
  if (hasToken && !hasPre) {
    return "pre_dispatch";
  }
  if (FINAL_RECORD_STAGES.has(stage) && !hasFinal) {
    return "final";
  }
  return null;
}
