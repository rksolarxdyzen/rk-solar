/** Client-safe types/constants for the sales rep monthly report (no server imports). */

export const UNASSIGNED_REP_ID = "__unassigned__";

export type SalesRepMonthlyFilters = {
  year: number;
  month: number; // 1–12
  salesRepId?: string | null;
};

export type SalesRepMonthlyRow = {
  salesRepId: string;
  salesRepName: string;
  closedDeals: number;
  bookedValue: number;
  paymentsRecorded: number;
  paymentsVerified: number;
};

export type SalesRepMonthlyReport = {
  year: number;
  month: number;
  rangeLabel: string;
  rows: SalesRepMonthlyRow[];
  totals: Omit<SalesRepMonthlyRow, "salesRepId" | "salesRepName">;
};

export type SalesRepOption = {
  id: string;
  name: string;
};

export function salespersonId(lead: {
  assigned_telecaller_id?: string | null;
  assigned_to?: string | null;
}): string {
  return lead.assigned_telecaller_id ?? lead.assigned_to ?? UNASSIGNED_REP_ID;
}

export function canViewSalesRepReport(
  profile: { role: string },
  auths: Set<string>
): boolean {
  if (profile.role === "admin") return true;
  if (auths.has("full_access") || auths.has("view_sales_rep_report")) return true;
  return false;
}
