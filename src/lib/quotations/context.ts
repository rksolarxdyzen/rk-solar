import { createClient } from "@/lib/supabase/server";
import { requireAuth, getUserAuthorities } from "@/lib/auth";

export type QuotationContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  userId: string;
  companyId: string;
  role: string;
  canViewQuotations: boolean;
  canManageQuotations: boolean;
  canEditQuotations: boolean;
  canDeleteQuotations: boolean;
  canViewRecycleBin: boolean;
  canRestoreQuotations: boolean;
  canPurgeQuotations: boolean;
  canEditQuotationTemplate: boolean;
  canManageCatalog: boolean;
  canEditQuotationPricing: boolean;
};

/**
 * Resolves the CRM auth context for quotation/catalog features.
 * Maps KT authorities + roles ΓåÆ quotation capabilities.
 */
export async function getQuotationContext(): Promise<QuotationContext> {
  const profile = await requireAuth();
  const supabase = await createClient();
  const auths = await getUserAuthorities(profile.id);
  const has = (k: string) => auths.has("full_access") || auths.has(k as never);

  const isAdmin = profile.role === "admin";
  const isManager = isAdmin || profile.role === "sales_manager";
  const isSales = isManager || profile.role === "sales_executive";

  const canWrite = isSales || has("create_quotations") || has("manage_quotations");
  const canManageQuotations = canWrite;
  const canEditQuotations = canWrite;
  const canViewQuotations = canWrite || has("view_quotations");
  const canDeleteQuotations =
    isAdmin || has("delete_quotations") || has("manage_quotations");
  const canRestoreQuotations =
    isAdmin || has("restore_quotations") || has("manage_quotations");
  const canViewRecycleBin = canDeleteQuotations || canRestoreQuotations;
  const canPurgeQuotations = isAdmin || auths.has("full_access");
  const canManageCatalog = isManager || has("manage_catalog_items");
  const canEditQuotationTemplate =
    isManager || has("manage_catalog_items") || has("manage_quotations");
  const canEditQuotationPricing = isManager || has("edit_quotation_pricing");

  return {
    supabase,
    userId: profile.id,
    companyId: profile.company_id,
    role: profile.role,
    canViewQuotations,
    canManageQuotations,
    canEditQuotations,
    canDeleteQuotations,
    canViewRecycleBin,
    canRestoreQuotations,
    canPurgeQuotations,
    canEditQuotationTemplate,
    canManageCatalog,
    canEditQuotationPricing,
  };
}
