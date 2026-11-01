/** Client-safe types for the dealer monthly report (no server imports). */

export const UNASSIGNED_DEALER_ID = "__unassigned__";

export type DealerMonthlyFilters = {
  year: number;
  month: number; // 1–12
  dealerId?: string | null;
};

export type DealerMonthlyRow = {
  dealerId: string;
  dealerName: string;
  leadsSubmitted: number;
  filesWon: number;
  quotationsSubmitted: number;
  bookedValue: number;
};

export type DealerMonthlyReport = {
  year: number;
  month: number;
  rangeLabel: string;
  rows: DealerMonthlyRow[];
  totals: Omit<DealerMonthlyRow, "dealerId" | "dealerName">;
};

export type DealerReportOption = {
  id: string;
  name: string;
};

export function dealerOwnerId(lead: {
  dealer_id?: string | null;
  created_by?: string | null;
}, dealerIds: Set<string>): string {
  if (lead.dealer_id && dealerIds.has(lead.dealer_id)) return lead.dealer_id;
  if (lead.created_by && dealerIds.has(lead.created_by)) return lead.created_by;
  if (lead.dealer_id) return lead.dealer_id;
  return UNASSIGNED_DEALER_ID;
}

export function canViewDealerMonthlyReport(
  profile: { role: string },
  auths: Set<string>
): boolean {
  if (profile.role === "admin") return true;
  if (auths.has("full_access") || auths.has("view_dealer_monthly_report")) return true;
  // Accounts / sales managers who already see the Dealers directory
  if (profile.role === "accounts" || profile.role === "sales_manager") return true;
  if (auths.has("assign_dealer") || auths.has("approve_dealer_commission")) return true;
  return false;
}
