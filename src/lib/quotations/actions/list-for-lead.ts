"use server";

import {
  getAcceptedQuotationForLead,
  getQuotationsForLead,
} from "@/lib/quotations/data/quotations";
import { requireAuth, getUserAuthorities } from "@/lib/auth";

async function requireQuotationView() {
  const profile = await requireAuth();
  const auths = await getUserAuthorities(profile.id);
  const canView =
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    profile.role === "sales_executive" ||
    auths.has("full_access") ||
    auths.has("view_quotations") ||
    auths.has("create_quotations") ||
    auths.has("manage_quotations");

  if (!canView) {
    throw new Error("You do not have permission to view quotations.");
  }
  return profile;
}

export async function listCustomerQuotations(leadId: string, phone?: string | null) {
  await requireQuotationView();
  return getQuotationsForLead(leadId, phone);
}

export async function getLeadAcceptedQuotation(leadId: string, phone?: string | null) {
  await requireQuotationView();
  return getAcceptedQuotationForLead(leadId, phone);
}
