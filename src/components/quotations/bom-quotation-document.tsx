import { BRAND } from "@/lib/quotations/brand";
import {
  accountsForDocument,
  paymentQrAccount,
  type QuotationBankAccount,
} from "@/lib/quotations/bank-accounts";
import { BOM_QUOTATION_CSS } from "@/components/quotations/bom-quotation-css";
import { CompanyLogoMark } from "@/components/quotations/company-logo-mark";
import { resolveBomItemImage } from "@/lib/quotations/bom-image";
import { formatCoverDate } from "@/components/quotations/solar-proposal-cover";
import {
  fmtMoney,
  formatProposalDate,
  type CompanyInfo,
  type ProposalInput,
  type ProposalLineItem,
} from "@/lib/quotations/solar-proposal-calculations";

export { BOM_QUOTATION_CSS };

export type BomQuotationVariant = "premium" | "regular";

const PACKAGE_COPY = {
  premium: {
    badge: "Premium Package",
    title: "Premium Residential Solar",
    subtitle: "Upgraded material specification for residential rooftops",
    highlights: [
      "10 years maintenance free",
      "Auto cleaning system included",
      "Heavy-duty 80×40 structure",
    ],
    note: "Available inverter as per design. Structure height 8×5. Company reserves the right to change materials. Terms and conditions apply.",
  },
  regular: {
    badge: "Standard Package",
    title: "Standard Residential Solar",
    subtitle: "List of materials — regular specification",
    highlights: [
      "5 years maintenance free",
      "ISI-marked components",
      "Proven 60×40 structure",
    ],
    note: "Available inverter as per design. Structure height 8×5. Company reserves the right to change materials. Terms and conditions apply.",
  },
} as const;

const PREMIUM_BOM_PAGE_SIZE = 12;

function BomBankLines({ accounts }: { accounts: QuotationBankAccount[] }) {
  return (
    <>
      {accounts.map((account, index) => (
        <div key={account.id} style={index > 0 ? { marginTop: 6 } : undefined}>
          <div className="bq-bank-line">
            <strong>{account.accountName || BRAND.bank.accountName}</strong>
          </div>
          <div className="bq-bank-line">{account.bankName}</div>
          <div className="bq-bank-line">A/C: {account.accountNumber}</div>
          <div className="bq-bank-line">IFSC: {account.ifscCode}</div>
          {account.branch ? (
            <div className="bq-bank-line">Branch Name: {account.branch}</div>
          ) : null}
        </div>
      ))}
    </>
  );
}

function chunkItems<T>(items: T[], size: number): T[][] {
  if (items.length === 0) return [[]];
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function itemImage(item: ProposalLineItem, variant: BomQuotationVariant): string | null {
  return resolveBomItemImage(item, variant);
}

function PageHead({ kicker, title }: { kicker: string; title: string }) {
  return (
    <div className="bq-head">
      <div className="bq-head-left">
        <p className="bq-head-kicker">{kicker}</p>
        <h2>{title}</h2>
      </div>
      <CompanyLogoMark className="bq-head-logo" alt="" textStyle={{ fontSize: 16 }} />
    </div>
  );
}

function PremiumBomTable({
  items,
  startIndex,
  variant = "premium",
}: {
  items: ProposalLineItem[];
  startIndex: number;
  variant?: BomQuotationVariant;
}) {
  return (
    <table className="bq-prem-table">
      <thead>
        <tr>
          <th>#</th>
          <th />
          <th>Component</th>
          <th style={{ textAlign: "right" }}>Qty</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, index) => {
          const img = itemImage(item, variant);
          const rowNum = startIndex + index + 1;
          return (
            <tr key={`${item.item_name_snapshot}-${rowNum}`}>
              <td className="bq-prem-num">{rowNum}</td>
              <td className="bq-prem-img-cell">
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="bq-prem-img" src={img} alt="" />
                ) : null}
              </td>
              <td>
                <div className="bq-prem-name">{item.item_name_snapshot}</div>
                {item.brand_snapshot ? (
                  <div className="bq-prem-meta">Make: {item.brand_snapshot}</div>
                ) : null}
              </td>
              <td className="bq-prem-qty">Included</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PremiumCover({
  data,
  company,
  capacity,
}: {
  data: ProposalInput;
  company: CompanyInfo;
  capacity: string;
}) {
  const copy = PACKAGE_COPY.premium;
  return (
    <section className="bq-page bq-cover" aria-label="Cover">
      <div className="bq-cover-bar" aria-hidden />
      <div className="bq-cover-header">
        <div className="bq-cover-header-left">
          <CompanyLogoMark className="bq-cover-logo" textStyle={{ fontSize: 22 }} />
          <div className="bq-badge">{copy.badge}</div>
        </div>
        <div className="bq-cover-header-meta">
          Quotation
          <strong>{data.quotationNo}</strong>
          {formatCoverDate(data.quoteDate)}
        </div>
      </div>

      <div className="bq-cover-main">
        <div className="bq-cover-content">
          <h1 className="bq-cover-title">{copy.title}</h1>
          <p className="bq-cover-sub">{copy.subtitle}</p>

          <div className="bq-cover-highlights">
            {copy.highlights.map((line) => (
              <div key={line} className="bq-cover-pill">
                {line}
              </div>
            ))}
          </div>

          <div className="bq-cover-customer">
            <div className="bq-cover-customer-head">Customer &amp; project details</div>
            <div className="bq-cover-customer-grid">
              <div className="bq-cover-field">
                <label>Prepared for</label>
                <strong>{data.customerName}</strong>
              </div>
              <div className="bq-cover-field">
                <label>Contact</label>
                <strong>{data.customerPhone || "—"}</strong>
              </div>
              <div className="bq-cover-field">
                <label>System capacity</label>
                <strong>{capacity}</strong>
              </div>
              <div className="bq-cover-field">
                <label>Valid till</label>
                <strong>{data.validTill ? formatCoverDate(data.validTill) : "—"}</strong>
              </div>
              {data.customerAddress ? (
                <div className="bq-cover-field" style={{ gridColumn: "1 / -1" }}>
                  <label>Site address</label>
                  <strong>{data.customerAddress}</strong>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <div className="bq-cover-photo-wrap">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="bq-cover-photo" src={BRAND.logo.coverHome} alt="" />
          <div className="bq-cover-photo-overlay">
            <strong>Premium BOM</strong>
            <span>
              {company.name || BRAND.name}
              {company.phone ? ` · ${company.phone}` : ""}
            </span>
          </div>
        </div>
      </div>

      <div className="bq-cover-footer">
        <span>
          <strong>{company.name || BRAND.name}</strong>
          {company.email ? ` · ${company.email}` : ""}
        </span>
        <span>{data.items.length} components included</span>
      </div>
    </section>
  );
}

export function BomQuotationDocument({
  variant,
  data,
  company,
  mode = "print",
}: {
  variant: BomQuotationVariant;
  data: ProposalInput;
  company: CompanyInfo;
  mode?: "print" | "preview";
}) {
  const copy = PACKAGE_COPY[variant];
  const rootClass = `bq-root bq-${variant}${mode === "preview" ? " bq-preview" : ""}`;
  const capacity =
    data.systemSizeKw && Number(data.systemSizeKw) > 0
      ? `${Number(data.systemSizeKw)} kW`
      : "As per design";
  const meter = Number(data.meterChargeAmount) || 0;
  const subsidy = Number(data.subsidy) || 0;
  const payable = Math.max(0, Number(data.grandTotal) - subsidy);
  const bomPages = chunkItems(data.items, PREMIUM_BOM_PAGE_SIZE);
  const bankAccounts = accountsForDocument(company);
  const qrAccount = paymentQrAccount(bankAccounts);

  return (
    <article className={rootClass}>
      {variant === "premium" ? (
        <PremiumCover data={data} company={company} capacity={capacity} />
      ) : (
        <section className="bq-page bq-cover" aria-label="Cover">
          <div className="bq-cover-top">
            <div className="bq-cover-top-inner">
              <div>
                <div className="bq-badge">{copy.badge}</div>
                <h1 className="bq-cover-title" style={{ color: "#fff", marginTop: 12, fontSize: 26 }}>
                  {copy.title}
                </h1>
                <p className="bq-cover-sub" style={{ color: "#cbd5e1" }}>
                  {copy.subtitle}
                </p>
              </div>
              <CompanyLogoMark className="bq-cover-logo" textStyle={{ fontSize: 22 }} />
            </div>
          </div>
          <div className="bq-cover-body">
            <div className="bq-cover-band">
              <strong>{company.name || BRAND.name}</strong>
              <div style={{ marginTop: 4, fontSize: 11, color: "#475569" }}>
                Residential solar material quotation
              </div>
            </div>
            <div className="bq-cover-meta">
              <div>
                <label>Customer</label>
                <strong>{data.customerName}</strong>
              </div>
              <div>
                <label>Quote no.</label>
                <strong>{data.quotationNo}</strong>
              </div>
              <div>
                <label>Capacity</label>
                <strong>{capacity}</strong>
              </div>
              <div>
                <label>Date</label>
                <strong>{formatProposalDate(data.quoteDate)}</strong>
              </div>
            </div>
          </div>
        </section>
      )}

      {bomPages.map((pageItems, pageIndex) => (
        <section key={`bom-${pageIndex}`} className="bq-page">
          <div className="bq-body">
            <PageHead
              kicker={`Bill of materials${bomPages.length > 1 ? ` · Part ${pageIndex + 1} of ${bomPages.length}` : ""}`}
              title="Component list"
            />

            {variant === "regular" && pageIndex === 0 ? (
              <div className="bq-highlights">
                {copy.highlights.map((line) => (
                  <div key={line} className="bq-highlight">
                    {line}
                  </div>
                ))}
              </div>
            ) : null}

            <PremiumBomTable
              items={pageItems}
              startIndex={pageIndex * PREMIUM_BOM_PAGE_SIZE}
              variant={variant}
            />

            {pageIndex === bomPages.length - 1 ? (
              <p className="bq-page-note">{copy.note}</p>
            ) : null}
          </div>
        </section>
      ))}

      <section className="bq-page">
        <div className="bq-body" style={variant === "premium" ? { minHeight: "auto" } : undefined}>
          <PageHead kicker="Commercial offer" title="Investment summary" />

          {variant === "premium" ? (
            <div className="bq-commercial-wrap">
              <div className="bq-summary">
                <div className="bq-summary-head">Price breakdown</div>
                <div className="bq-summary-body">
                  <div className="bq-row">
                    <span>Subtotal</span>
                    <strong>{fmtMoney(Number(data.subtotal))}</strong>
                  </div>
                  <div className="bq-row">
                    <span>Discount</span>
                    <strong>{fmtMoney(Number(data.discountTotal))}</strong>
                  </div>
                  <div className="bq-row">
                    <span>GST</span>
                    <strong>{fmtMoney(Number(data.gstTotal))}</strong>
                  </div>
                  {meter > 0 ? (
                    <div className="bq-row">
                      <span>Meter charges</span>
                      <strong>{fmtMoney(meter)}</strong>
                    </div>
                  ) : null}
                  {subsidy > 0 ? (
                    <div className="bq-row">
                      <span>Subsidy</span>
                      <strong>- {fmtMoney(subsidy)}</strong>
                    </div>
                  ) : null}
                  <div className="bq-row bq-grand">
                    <span>Net payable</span>
                    <strong>{fmtMoney(payable)}</strong>
                  </div>
                </div>
              </div>

              <div className="bq-payment">
                <h3>Payment details</h3>
                <div className="bq-pay-row">
                  <div>
                    <BomBankLines accounts={bankAccounts} />
                  </div>
                  {qrAccount ? (
                    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img className="bq-qr" src={qrAccount.qrUrl} alt="Payment QR" />
                      {qrAccount.upiId ? (
                        <div className="bq-bank-line">UPI ID: {qrAccount.upiId}</div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              </div>

              {(data.paymentTerms || data.notes || copy.note) && (
                <div className="bq-terms-block">
                  {data.paymentTerms ? <div>{data.paymentTerms}</div> : null}
                  {data.notes ? <div style={{ marginTop: data.paymentTerms ? 6 : 0 }}>{data.notes}</div> : null}
                  {!data.paymentTerms && !data.notes ? <div>{copy.note}</div> : null}
                </div>
              )}
            </div>
          ) : (
            <div className="bq-commercial">
              <div className="bq-summary">
                <div className="bq-summary-head">Price breakdown</div>
                <div className="bq-summary-body">
                  <div className="bq-row">
                    <span>Subtotal</span>
                    <strong>{fmtMoney(Number(data.subtotal))}</strong>
                  </div>
                  <div className="bq-row">
                    <span>Discount</span>
                    <strong>{fmtMoney(Number(data.discountTotal))}</strong>
                  </div>
                  <div className="bq-row">
                    <span>GST</span>
                    <strong>{fmtMoney(Number(data.gstTotal))}</strong>
                  </div>
                  {meter > 0 ? (
                    <div className="bq-row">
                      <span>Meter charges</span>
                      <strong>{fmtMoney(meter)}</strong>
                    </div>
                  ) : null}
                  {subsidy > 0 ? (
                    <div className="bq-row">
                      <span>Subsidy</span>
                      <strong>- {fmtMoney(subsidy)}</strong>
                    </div>
                  ) : null}
                  <div className="bq-row bq-grand">
                    <span>Net payable</span>
                    <strong>{fmtMoney(payable)}</strong>
                  </div>
                </div>
              </div>

              <div className="bq-payment">
                <h3>Payment details</h3>
                <BomBankLines accounts={bankAccounts} />
                {qrAccount ? (
                  <div className="bq-qr-wrap">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img className="bq-qr" src={qrAccount.qrUrl} alt="Payment QR" />
                    {qrAccount.upiId ? (
                      <div className="bq-bank-line">UPI ID: {qrAccount.upiId}</div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {variant === "regular" && (data.paymentTerms || data.notes) && (
            <div className="bq-terms">
              {data.paymentTerms ? <div>{data.paymentTerms}</div> : null}
              {data.notes ? <div style={{ marginTop: 6 }}>{data.notes}</div> : null}
            </div>
          )}

          {variant === "regular" ? (
            <p className="bq-terms" style={{ marginTop: 8 }}>
              {copy.note}
            </p>
          ) : null}

          <div className="bq-footer">
            {company.name || BRAND.name}
            {company.phone ? ` · ${company.phone}` : ""}
            {company.email ? ` · ${company.email}` : ""}
          </div>
        </div>
      </section>
    </article>
  );
}
