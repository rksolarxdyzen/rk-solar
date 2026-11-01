import { redirect } from "next/navigation";
import { NewQuotationWorkspace } from "@/components/quotations/new-quotation-workspace";
import {
  getLeadForQuote,
  listCatalogItems,
  listLeadsForQuote,
} from "@/actions/quotations";
import { getCatalogForQuotation } from "@/lib/quotations/data/items";
import { getRateCardPanels } from "@/lib/quotations/data/rate-card";
import { getRateCardInverters } from "@/lib/quotations/data/rate-card-inverters";
import { loadSolarTemplate } from "@/lib/quotations/data/lookups";
import { peekNextQuotationNumber } from "@/lib/quotations/actions/quotation-number";
import { requireAuth, hasAuthority } from "@/lib/auth";
import type { QuoteTemplateKind } from "@/lib/quotations/types";

export default async function NewQuotationPage({
  searchParams,
}: {
  searchParams: Promise<{ leadId?: string; kind?: string }>;
}) {
  const profile = await requireAuth();
  const can =
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    profile.role === "sales_executive" ||
    (await hasAuthority(profile.id, "create_quotations")) ||
    (await hasAuthority(profile.id, "manage_quotations"));
  if (!can) redirect("/quotations");

  const params = await searchParams;
  const kindParam = params.kind;
  const kind = (
    kindParam === "non_solar" || kindParam === "premium" ? kindParam : "solar"
  ) as QuoteTemplateKind;

  const canAddLead =
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    profile.role === "tele_caller" ||
    profile.role === "sales_executive" ||
    (await hasAuthority(profile.id, "add_edit_leads")) ||
    (await hasAuthority(profile.id, "full_access"));

  const canEditQuotationPricing =
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    (await hasAuthority(profile.id, "edit_quotation_pricing"));

  const [leads, catalog, solarCatalog, panels, inverters, template, nextQuotationNo, initialLead] =
    await Promise.all([
      listLeadsForQuote().catch(() => []),
      listCatalogItems(),
      getCatalogForQuotation(),
      getRateCardPanels().catch(() => []),
      getRateCardInverters().catch(() => []),
      loadSolarTemplate(),
      peekNextQuotationNumber().catch(() => undefined),
      params.leadId
        ? getLeadForQuote(params.leadId).catch(() => null)
        : Promise.resolve(null),
    ]);

  const isSolar = kind === "solar" || kind === "premium";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--text-dark)]">
          {kind === "premium"
            ? "New premium solar quotation"
            : isSolar
              ? "New solar quotation"
              : "New non-solar quotation"}
        </h1>
        <p className="text-sm text-[var(--text-muted)]">
          {kind === "premium"
            ? "Build a premium turnkey solar quote using premium per-kW rates from the rate card."
            : isSolar
              ? "Build a turnkey solar quote — link a lead or enter customer details in the builder."
              : "Build a non-solar quotation — heat pumps, solar water heaters, RO, and allied products."}
        </p>
      </div>
      <NewQuotationWorkspace
        leads={leads}
        catalog={catalog}
        solarCatalog={solarCatalog}
        panels={panels}
        inverters={inverters}
        meterCharges={template.meterCharges}
        nextQuotationNo={nextQuotationNo}
        canEditQuotationPricing={canEditQuotationPricing}
        canAddLead={canAddLead}
        initialLead={
          initialLead
            ? {
                id: initialLead.id,
                name: initialLead.name,
                phone: initialLead.phone,
                city: initialLead.city,
                address: initialLead.address,
                sales_stage: initialLead.sales_stage,
                recommended_system_kw: initialLead.recommended_system_kw,
                meter_type: initialLead.meter_type ?? null,
              }
            : null
        }
        initialKind={kind}
      />
    </div>
  );
}
