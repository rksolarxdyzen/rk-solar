import { notFound, redirect } from "next/navigation";
import { QuotationBuilderForm } from "@/components/quotations/quotation-builder-form";
import { QuotationBuilderFormAppliance } from "@/components/quotations/quotation-builder-form-appliance";
import { getQuotation, listCatalogItems, listLeadsForQuote } from "@/actions/quotations";
import { getCatalogForQuotation } from "@/lib/quotations/data/items";
import { getRateCardPanels } from "@/lib/quotations/data/rate-card";
import { getRateCardInverters } from "@/lib/quotations/data/rate-card-inverters";
import { loadSolarTemplate } from "@/lib/quotations/data/lookups";
import { quotationToBuilderDefaults } from "@/lib/quotations/quotation-defaults";
import { requireAuth, hasAuthority } from "@/lib/auth";

export default async function EditQuotationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireAuth();
  const can =
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    profile.role === "sales_executive" ||
    (await hasAuthority(profile.id, "create_quotations")) ||
    (await hasAuthority(profile.id, "manage_quotations"));
  if (!can) redirect("/quotations");

  const canEditQuotationPricing =
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    (await hasAuthority(profile.id, "edit_quotation_pricing"));

  const canAddLead =
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    profile.role === "tele_caller" ||
    profile.role === "sales_executive" ||
    (await hasAuthority(profile.id, "add_edit_leads")) ||
    (await hasAuthority(profile.id, "full_access"));

  const { id } = await params;
  const quote = await getQuotation(id).catch(() => null);
  if (!quote) notFound();

  const heading = (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--text-dark)]">
        Edit {quote.quotation_no}
      </h1>
    </div>
  );

  if (quote.template_kind === "solar" || quote.template_kind === "premium") {
    const [solarCatalog, panels, inverters, template, leads] = await Promise.all([
      getCatalogForQuotation(),
      getRateCardPanels().catch(() => []),
      getRateCardInverters().catch(() => []),
      loadSolarTemplate(),
      listLeadsForQuote().catch(() => []),
    ]);

    const defaults = quotationToBuilderDefaults(quote);
    const quoteTier =
      quote.template_kind === "premium" || defaults.tierType !== "regular"
        ? "premium"
        : "regular";

    return (
      <div className="space-y-6">
        {heading}
        <QuotationBuilderForm
          catalog={solarCatalog}
          panels={panels}
          inverters={inverters}
          leads={leads}
          canAddLead={canAddLead}
          meterCharges={template.meterCharges}
          canEditQuotationPricing={canEditQuotationPricing}
          quoteTier={quoteTier}
          defaultValues={defaults}
        />
      </div>
    );
  }

  const catalog = await listCatalogItems();

  if (quote.template_kind === "non_solar") {
    const [leads] = await Promise.all([listLeadsForQuote().catch(() => [])]);

    return (
      <div className="space-y-6">
        {heading}
        <QuotationBuilderFormAppliance
          customer={{
            id: quote.lead_id,
            name: quote.customer_name,
            phone: quote.customer_phone ?? "",
            address: quote.customer_address,
            city: quote.customer_city,
          }}
          catalog={catalog}
          leads={leads}
          canAddLead={canAddLead}
          initial={quote}
          canEditQuotationPricing={canEditQuotationPricing}
        />
      </div>
    );
  }

  redirect(`/quotations/${id}`);
}
