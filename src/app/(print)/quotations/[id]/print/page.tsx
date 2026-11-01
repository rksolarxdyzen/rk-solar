import { notFound } from "next/navigation";
import { getQuotation, listBomCatalogItems } from "@/actions/quotations";
import { PrintToolbar } from "@/components/quotations/print-toolbar";
import {
  ApplianceQuotationDocument,
  APPLIANCE_QUOTATION_CSS,
} from "@/components/quotations/appliance-quotation-document";
import { SolarProposalDocument, SOLAR_PROPOSAL_CSS } from "@/components/quotations/solar-proposal-document";
import {
  buildCompanyPrintInfo,
  buildQuotationPrintData,
  resolveQuotationTemplate,
} from "@/lib/quotations/quotation-print";
import { buildTierBomPrintLines, tierFromQuote } from "@/lib/quotations/tier-bom";
import {
  resolvePrintTemplateKind,
  usesApplianceProposalPrint,
  usesSolarProposalPrint,
} from "@/lib/quotations/types";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const TOOLBAR_CSS = `
.qp-toolbar { position: sticky; top: 0; z-index: 50; display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; padding: 12px 20px; background: #1e3970; color: #fff; font-size: 13px; }
.qp-toolbar strong { color: #e87a1a; }
.qp-toolbar-actions { display: flex; gap: 8px; }
.qp-btn-ghost { display: inline-flex; align-items: center; border-radius: 8px; border: 1px solid rgba(255,255,255,.25); padding: 6px 14px; color: #fff; text-decoration: none; font-weight: 600; background: transparent; cursor: pointer; font: inherit; }
.qp-btn-ghost:hover { background: rgba(255,255,255,.1); }
.qp-btn-print { display: inline-flex; align-items: center; border-radius: 8px; border: none; background: #e87a1a; padding: 6px 14px; color: #1e3970; font-weight: 700; cursor: pointer; }
.qp-btn-print:hover { background: #c96612; }
`;

export default async function QuotationPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ print?: string }>;
}) {
  const { id } = await params;
  const { print } = await searchParams;
  const quote = await getQuotation(id).catch(() => null);
  if (!quote) notFound();

  const supabase = await createClient();
  const { data: settings } = await supabase
    .from("quotation_company_settings")
    .select(
      "quotation_template, quotation_terms, quotation_notes_footer, from_name, from_phone, from_email, bank_account_name, bank_name, account_number, ifsc_code, branch"
    )
    .eq("company_id", quote.company_id)
    .maybeSingle();

  const template = resolveQuotationTemplate(settings);
  const data = buildQuotationPrintData(quote, template);
  const companyInfo = buildCompanyPrintInfo(settings, null, template);
  const printKind = resolvePrintTemplateKind(quote.template_kind);

  if (usesSolarProposalPrint(printKind)) {
    const bomTier = tierFromQuote(quote);
    const catalog = await listBomCatalogItems().catch(() => []);
    const bomMaterialItems = buildTierBomPrintLines(catalog, {
      tier: bomTier,
      panelCount: quote.panel_count,
      systemSizeKw: quote.system_size_kw,
      moduleTypeName: quote.module_type_name,
      moduleCompanyName: quote.module_company_name,
      moduleCapacityLabel: quote.module_capacity_label,
      inverterTypeName: quote.inverter_type_name,
      inverterSizeLabel: quote.inverter_size_label,
    });

    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: SOLAR_PROPOSAL_CSS + TOOLBAR_CSS }} />
        <PrintToolbar
          quotationNo={quote.quotation_no}
          backHref={`/quotations/${id}`}
          autoPrint={print === "1"}
        />
        <SolarProposalDocument
          mode="print"
          data={data}
          company={companyInfo}
          template={template}
          canViewItemPricing
          bomMaterialItems={bomMaterialItems}
          bomTier={bomTier}
        />
      </>
    );
  }

  if (usesApplianceProposalPrint(printKind)) {
    return (
      <>
        <style dangerouslySetInnerHTML={{ __html: APPLIANCE_QUOTATION_CSS + TOOLBAR_CSS }} />
        <PrintToolbar
          quotationNo={quote.quotation_no}
          backHref={`/quotations/${id}`}
          autoPrint={print === "1"}
        />
        <ApplianceQuotationDocument mode="print" data={data} company={companyInfo} />
      </>
    );
  }

  notFound();
}
