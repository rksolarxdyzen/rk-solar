import { CompanyLogoMark } from "@/components/quotations/company-logo-mark";
import { formatCoverDate } from "@/components/quotations/solar-proposal-cover";
import { BRAND } from "@/lib/quotations/brand";
import { type CompanyInfo, type ProposalInput } from "@/lib/quotations/solar-proposal-calculations";

const COVER_TAGLINE = "Heat pumps · Solar water heaters · Commercial RO & allied products";

export function NonSolarQuotationCover({
  data,
  company,
}: {
  data: ProposalInput;
  company: CompanyInfo;
}) {
  const quoteDate = formatCoverDate(data.quoteDate);
  const validTill = data.validTill ? formatCoverDate(data.validTill) : "—";
  const companyName = company.name || BRAND.name;

  return (
    <section className="sp-page sp-cover sp-cover-v9 ns-cover" aria-label="Quotation cover">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="sp-cover-v9-photo" src={BRAND.logo.nonSolarCover} alt="" />
      <div className="sp-cover-v9-top-gold" aria-hidden />
      <div className="sp-cover-v9-bottom-gold" aria-hidden />

      <CompanyLogoMark className="sp-cover-v9-logo" textStyle={{ fontSize: 28 }} />

      <div className="sp-cover-v9-main">
        <div className="sp-cover-v9-title ns-cover-title-only">Quotation</div>
        <p className="ns-cover-tagline">{COVER_TAGLINE}</p>
        <div className="sp-cover-v9-rule" aria-hidden />
        <div className="sp-cover-v9-meta">
          <div>Date : {quoteDate}</div>
          <div>Quotation No. : {data.quotationNo}</div>
          <div>Valid Till : {validTill}</div>
        </div>
      </div>

      <div className="sp-cover-v9-details">
        <div className="ns-cover-details-card">
          <div className="sp-cover-v9-block">
            <h3>Prepared For,</h3>
            <span>{data.customerName || "—"}</span>
            {data.customerPhone ? <span>{data.customerPhone}</span> : null}
            {data.customerAddress ? (
              <div className="sp-cover-v9-address">{data.customerAddress}</div>
            ) : null}
          </div>
          <div className="sp-cover-v9-block">
            <h3>By,</h3>
            <span>{companyName}</span>
            {company.phone ? <span>{company.phone}</span> : null}
            {company.email ? <span>{company.email}</span> : null}
          </div>
        </div>
      </div>
    </section>
  );
}
