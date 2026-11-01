"use client";

import { useMemo, useState } from "react";
import { QuotationBuilderForm } from "@/components/quotations/quotation-builder-form";
import { QuotationBuilderFormAppliance } from "@/components/quotations/quotation-builder-form-appliance";
import type { QuoteLeadOption } from "@/components/quotations/quote-customer-picker";
import { QuoteTierToggle, type QuoteTier } from "@/components/quotations/quote-tier-toggle";
import {
  QUOTE_TEMPLATE_LABELS,
  usesSolarRateCardBuilder,
  type CatalogItem,
  type QuoteTemplateKind,
} from "@/lib/quotations/types";
import type { CatalogItem as SolarCatalogItem } from "@/lib/quotations/catalog-items";
import type { RateCardPanel } from "@/lib/quotations/rate-card-panels";
import type { RateCardInverter } from "@/lib/quotations/rate-card-inverters";
import type { DEFAULT_SOLAR_TEMPLATE } from "@/lib/quotations/quotation-template";
import { meterTypeToQuoteDefaults } from "@/lib/quotations/subsidy";
import { parseMeterType } from "@/lib/domain/lead-profile";

const EMPTY_CUSTOMER = {
  id: null as string | null,
  name: "",
  phone: "",
  city: null as string | null,
  address: null as string | null,
  recommended_system_kw: null as number | null,
  meter_type: null as string | null,
};

function leadToCustomer(lead: QuoteLeadOption | null) {
  if (!lead) return EMPTY_CUSTOMER;
  return {
    id: lead.id,
    name: lead.name,
    phone: lead.phone,
    city: lead.city ?? null,
    address: lead.address ?? null,
    recommended_system_kw: lead.recommended_system_kw ?? null,
    meter_type: lead.meter_type ?? null,
  };
}

export function NewQuotationWorkspace({
  leads,
  catalog,
  solarCatalog,
  panels,
  inverters,
  meterCharges,
  nextQuotationNo,
  canEditQuotationPricing = false,
  canAddLead = false,
  initialLead = null,
  initialKind = "solar",
}: {
  leads: QuoteLeadOption[];
  catalog: CatalogItem[];
  solarCatalog: SolarCatalogItem[];
  panels: RateCardPanel[];
  inverters: RateCardInverter[];
  meterCharges?: typeof DEFAULT_SOLAR_TEMPLATE.meterCharges;
  nextQuotationNo?: string;
  canEditQuotationPricing?: boolean;
  canAddLead?: boolean;
  initialLead?: QuoteLeadOption | null;
  initialKind?: QuoteTemplateKind;
}) {
  const kind = initialKind;
  const isSolar = usesSolarRateCardBuilder(kind);
  const isPremiumFlow = kind === "premium";
  const [tier, setTier] = useState<QuoteTier>(isPremiumFlow ? "premium" : "premium");

  const initialCustomer = useMemo(() => leadToCustomer(initialLead), [initialLead]);

  // Do not include tier in the key — switching Premium/Regular must only recalculate pricing.
  const formKey = `${initialCustomer.id ?? "custom"}-${kind}`;
  const meterDefaults = meterTypeToQuoteDefaults(parseMeterType(initialCustomer.meter_type));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-white px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-[var(--text-dark)]">
            {isPremiumFlow
              ? QUOTE_TEMPLATE_LABELS.premium
              : isSolar
                ? QUOTE_TEMPLATE_LABELS.solar
                : "Non-solar quotation"}
          </p>
          <p className="text-xs text-[var(--text-muted)]">
            {isSolar
              ? isPremiumFlow
                ? "Premium per-kW rate card · same proposal PDF as solar"
                : "Turnkey per-kW pricing · type a name in Customer Details to link a lead"
              : "Non-solar products and non-PV packages · type a name in Customer to link a lead"}
          </p>
        </div>
        {isSolar ? (
          <QuoteTierToggle
            value={tier}
            onChange={setTier}
            disabled={isPremiumFlow}
          />
        ) : null}
      </div>

      {isSolar ? (
        <QuotationBuilderForm
          key={formKey}
          catalog={solarCatalog}
          panels={panels}
          inverters={inverters}
          leads={leads}
          canAddLead={canAddLead}
          meterCharges={meterCharges}
          canEditQuotationPricing={canEditQuotationPricing}
          quoteTier={tier}
          defaultValues={{
            leadId: initialCustomer.id ?? undefined,
            customerName: initialCustomer.name,
            customerPhone: initialCustomer.phone,
            address: initialCustomer.address ?? "",
            projectType: meterDefaults.projectType,
            subsidyScheme: meterDefaults.subsidyScheme,
            subsidy: meterDefaults.subsidyScheme === "none" ? 0 : undefined,
            ...(nextQuotationNo ? { quotationNo: nextQuotationNo } : {}),
          }}
        />
      ) : (
        <QuotationBuilderFormAppliance
          key={formKey}
          customer={initialCustomer}
          catalog={catalog}
          leads={leads}
          canAddLead={canAddLead}
          canEditQuotationPricing={canEditQuotationPricing}
        />
      )}
    </div>
  );
}
