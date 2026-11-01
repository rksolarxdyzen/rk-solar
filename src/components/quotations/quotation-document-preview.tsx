import { SolarProposalDocument, SOLAR_PROPOSAL_CSS, type CompanyInfo, type ProposalInput } from "@/components/quotations/solar-proposal-document";
import type { SolarProposalTemplate } from "@/lib/quotations/quotation-template";

type Props = {
  data: ProposalInput;
  company: CompanyInfo;
  template: SolarProposalTemplate;
  pricingLocked?: boolean;
  canViewItemPricing?: boolean;
};

export function QuotationDocumentPreview({ data, company, template, pricingLocked = false, canViewItemPricing = false }: Props) {
  return (
    <div className="quotation-preview-shell">
      <style dangerouslySetInnerHTML={{ __html: SOLAR_PROPOSAL_CSS }} />
      <div className="quotation-preview-stage items-start">
        <SolarProposalDocument
          mode="preview"
          data={data}
          company={company}
          template={template}
          pricingLocked={pricingLocked}
          canViewItemPricing={canViewItemPricing}
        />
      </div>
    </div>
  );
}
