export const COMMISSION_STATUSES = ["pending", "approved", "rejected"] as const;
export type CommissionStatus = (typeof COMMISSION_STATUSES)[number];

export const COMMISSION_STATUS_LABELS: Record<CommissionStatus, string> = {
  pending: "Pending approval",
  approved: "Approved",
  rejected: "Rejected",
};

export type DealerCommission = {
  id: string;
  company_id: string;
  lead_id: string;
  dealer_id: string;
  amount_inr: number | null;
  percent: number | null;
  notes: string | null;
  status: CommissionStatus;
  submitted_by: string | null;
  submitted_at: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_notes: string | null;
  created_at: string;
  updated_at: string;
};

export function isDealerRole(profile: { role: string }): boolean {
  return profile.role === "dealer";
}
