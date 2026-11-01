import { BRAND } from "@/lib/quotations/brand";
import {
  accountsForDocument,
  bankAccountTitle,
  paymentQrAccount,
} from "@/lib/quotations/bank-accounts";
import { APPLIANCE_QUOTATION_CSS } from "@/components/quotations/appliance-quotation-css";
import { CompanyLogoMark } from "@/components/quotations/company-logo-mark";
import { NonSolarQuotationCover } from "@/components/quotations/non-solar-quotation-cover";
import {
  fmtMoney,
  type CompanyInfo,
  type ProposalInput,
  type ProposalLineItem,
} from "@/lib/quotations/solar-proposal-calculations";

export { APPLIANCE_QUOTATION_CSS };

const DEFAULT_TERMS = `40% advance with order confirmation
50% on material delivery / installation start
10% on completion & handover`;

function lineAmount(item: ProposalLineItem) {
  return Number(item.line_total) || 0;
}

function hasProductImages(items: ProposalLineItem[]) {
  return items.some((item) => item.image_url_snapshot?.trim());
}

function footerBranches(company: CompanyInfo) {
  if (company.address?.trim()) return company.address.trim();
  return BRAND.contact.branches.map((b) => `${b.label}: ${b.address}`).join(" · ");
}

export function ApplianceQuotationDocument({
  data,
  company,
  mode = "print",
}: {
  data: ProposalInput;
  company: CompanyInfo;
  mode?: "print" | "preview";
}) {
  const rootClass = `aq-root${mode === "preview" ? " aq-preview" : ""}`;
  const paymentTerms = data.paymentTerms?.trim() || DEFAULT_TERMS;
  const companyName = company.name || BRAND.name;
  const bankAccounts = accountsForDocument(company);
  const qrAccount = paymentQrAccount(bankAccounts);
  const showImages = hasProductImages(data.items);

  return (
    <article className={rootClass}>
      <NonSolarQuotationCover data={data} company={company} />

      <section className="aq-page" aria-label="Commercial offer">
        <div className="aq-chrome" aria-hidden />
        <div className="aq-body">
          <header className="aq-page-head">
            <div className="aq-page-head-left">
              <div className="aq-page-head-rule" aria-hidden />
              <div>
                <p className="aq-page-kicker">Commercial offer</p>
                <h2 className="aq-page-title">Product line items</h2>
              </div>
            </div>
            <CompanyLogoMark className="aq-page-logo" alt="" textStyle={{ fontSize: 18 }} />
          </header>

          <p className="aq-lead">
            Heat pumps, solar water heaters, commercial RO plants, and allied non-PV products.
            Pricing is unit rate × quantity plus applicable GST. Solar modules, net-metering, and
            rooftop PV components are not included unless listed below.
          </p>

          <div className="aq-table-wrap">
            <table className="aq-table">
              <thead>
                <tr>
                  <th>#</th>
                  {showImages ? <th style={{ width: 56 }} /> : null}
                  <th>Description</th>
                  <th className="num">Qty</th>
                  <th className="num">Rate (₹)</th>
                  <th className="num">GST</th>
                  <th className="num">Amount (₹)</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item, index) => (
                  <tr key={`${item.item_name_snapshot}-${index}`}>
                    <td>{index + 1}</td>
                    {showImages ? (
                      <td>
                        {item.image_url_snapshot?.trim() ? (
                          /* eslint-disable-next-line @next/next/no-img-element */
                          <img
                            className="aq-item-thumb"
                            src={item.image_url_snapshot}
                            alt=""
                          />
                        ) : (
                          <div className="aq-item-thumb-placeholder" aria-hidden />
                        )}
                      </td>
                    ) : null}
                    <td>
                      <div className="aq-item-cell">
                        <div>
                          <div className="aq-item-name">{item.item_name_snapshot}</div>
                          {(item.brand_snapshot || item.model_snapshot) && (
                            <div className="aq-item-meta">
                              {[item.brand_snapshot, item.model_snapshot]
                                .filter(Boolean)
                                .join(" · ")}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="num">
                      {item.quantity} {item.unit}
                    </td>
                    <td className="num">{fmtMoney(Number(item.rate))}</td>
                    <td className="num">{item.gst_percent}%</td>
                    <td className="num">{fmtMoney(lineAmount(item))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="aq-bottom">
            <div className="aq-panel">
              <h3 className="aq-subhead">Payment schedule</h3>
              <p>{paymentTerms}</p>
              {bankAccounts.map((account) => (
                <div key={account.id} className="aq-bank-block">
                  <strong>
                    {bankAccounts.length > 1 ? bankAccountTitle(account) : "Bank details"}
                  </strong>
                  <div>A/C Name — {account.accountName || companyName}</div>
                  <div>A/C No. — {account.accountNumber}</div>
                  <div>Bank — {account.bankName}</div>
                  <div>IFSC — {account.ifscCode}</div>
                  {account.branch ? <div>Branch Name — {account.branch}</div> : null}
                </div>
              ))}
              {qrAccount ? (
                <div className="aq-payment-assets">
                  {qrAccount.upiId ? <div>UPI ID — {qrAccount.upiId}</div> : null}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    className="aq-qr"
                    src={qrAccount.qrUrl}
                    alt="Scan to pay RK Solar"
                  />
                </div>
              ) : null}
            </div>

            <div>
              <div className="aq-totals">
                <div className="aq-totals-head">Summary</div>
                <div className="aq-totals-body">
                  <div className="aq-row">
                    <span>Subtotal</span>
                    <strong>{fmtMoney(Number(data.subtotal))}</strong>
                  </div>
                  {Number(data.discountTotal) > 0 ? (
                    <div className="aq-row">
                      <span>Discount</span>
                      <strong>− {fmtMoney(Number(data.discountTotal))}</strong>
                    </div>
                  ) : null}
                  <div className="aq-row">
                    <span>GST</span>
                    <strong>{fmtMoney(Number(data.gstTotal))}</strong>
                  </div>
                  <div className="aq-row aq-grand">
                    <span>Grand total</span>
                    <strong>{fmtMoney(Number(data.grandTotal))}</strong>
                  </div>
                </div>
              </div>

              {data.notes ? (
                <div className="aq-notes">
                  <h3>Notes</h3>
                  <p>{data.notes}</p>
                </div>
              ) : null}
            </div>
          </div>

          <footer className="aq-footer">
            <strong>{companyName}</strong>
            {company.phone || company.email ? (
              <>
                {" "}
                · {[company.phone, company.email].filter(Boolean).join(" · ")}
              </>
            ) : null}
            <br />
            {footerBranches(company)}
          </footer>
        </div>
      </section>
    </article>
  );
}
