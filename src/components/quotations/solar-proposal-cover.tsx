import { CompanyLogoMark } from "@/components/quotations/company-logo-mark";
import { BRAND } from "@/lib/quotations/brand";

type CoverProps = {
  capacityLabel: string;
  quoteDate: string;
  quotationNo: string;
  validTill: string;
  customerName: string;
  customerPhone?: string | null;
  customerAddress?: string | null;
  companyName: string;
  preparedBy?: string;
  preparedByPhone?: string;
  phone?: string;
  email?: string;
  address?: string;
  coverImageUrl?: string;
  coverTitle?: string;
  logoUrl?: string;
};

export function formatCoverDate(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
}

export function SolarProposalCoverPage({
  capacityLabel,
  quoteDate,
  quotationNo,
  validTill,
  customerName,
  customerPhone,
  customerAddress,
  companyName,
  preparedBy,
  preparedByPhone,
  phone,
  email,
  address,
  coverImageUrl,
  coverTitle,
  logoUrl,
}: CoverProps) {
  const byPhone = preparedByPhone || phone || "";
  const showPreparedBy = Boolean(preparedBy?.trim()) && preparedBy!.trim() !== companyName.trim();
  const photo = coverImageUrl?.trim() || BRAND.logo.coverHome;

  return (
    <section className="sp-page sp-cover sp-cover-v9" aria-label="Proposal cover">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="sp-cover-v9-photo" src={photo} alt="" />
      <div className="sp-cover-v9-top-gold" aria-hidden />
      <div className="sp-cover-v9-bottom-gold" aria-hidden />

      <CompanyLogoMark
        className="sp-cover-v9-logo"
        src={logoUrl}
        textStyle={{ fontSize: 28 }}
      />

      <div className="sp-cover-v9-main">
        <div className="sp-cover-v9-kw">{capacityLabel}</div>
        <div className="sp-cover-v9-title">{coverTitle || "SOLAR PROPOSAL"}</div>
        <div className="sp-cover-v9-rule" aria-hidden />
        <div className="sp-cover-v9-meta">
          <div>Date : {quoteDate}</div>
          <div>Proposal No. : {quotationNo}</div>
          <div>Valid Till : {validTill || "—"}</div>
        </div>
      </div>

      <div className="sp-cover-v9-details">
        <div className="sp-cover-v9-block">
          <h3>Prepared For,</h3>
          <span>{customerName || "—"}</span>
          {customerPhone ? <span>{customerPhone}</span> : null}
          {customerAddress ? <div className="sp-cover-v9-address">{customerAddress}</div> : null}
        </div>
        <div className="sp-cover-v9-block">
          <h3>By,</h3>
          <span>{companyName}</span>
          {showPreparedBy ? <span>{preparedBy}</span> : null}
          {byPhone ? <span>{byPhone}</span> : null}
          {email ? <span>{email}</span> : null}
          {address
            ? address.split("\n").map((line) => (
                <span key={line} className="sp-cover-v9-address-line">
                  {line}
                </span>
              ))
            : null}
        </div>
      </div>
    </section>
  );
}
