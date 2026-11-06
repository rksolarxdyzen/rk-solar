import type { CSSProperties } from "react";
import type { SolarProposalTemplate } from "@/lib/quotations/quotation-template";
import { BRAND } from "@/lib/quotations/brand";
import { CompanyLogoMark } from "@/components/quotations/company-logo-mark";
import { SOLAR_PROPOSAL_CSS } from "@/components/quotations/solar-proposal-css";
import { SolarProposalCoverPage, formatCoverDate } from "@/components/quotations/solar-proposal-cover";
import {
  calculateSolarProposal,
  fmtMoney,
  scopeItems,
  type CompanyInfo,
  type ProposalInput,
  type ProposalLineItem,
} from "@/lib/quotations/solar-proposal-calculations";
import {
  BomMaterialNote,
  BomMaterialTable,
  PreviousWorkSection,
  SUMMARY_PAGE_ITEM_CAP,
  SolarBomMaterialPages,
} from "@/components/quotations/solar-bom-material-pages";
import { overlayQuoteEquipmentOnBom, type BomTier } from "@/lib/quotations/tier-bom";
import { parseProjectType, projectTypeLabel } from "@/lib/quotations/project-type";
import { PANEL_MOUNT_TYPE_LABELS, parsePanelMountType } from "@/lib/quotations/commercial";
import { normalizeInverterBrand } from "@/lib/quotations/inverter-brand";
import { quoteTierCopy } from "@/lib/quotations/tier-quote-copy";
import {
  accountsForDocument,
  bankAccountTitle,
  paymentQrAccount,
} from "@/lib/quotations/bank-accounts";

export type { CompanyInfo, ProposalInput };
export { SOLAR_PROPOSAL_CSS };

const CHART_TICKS = [1, 0.75, 0.5, 0.25, 0];

function shortInr(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "0";
  if (value >= 10000000) return `${(value / 10000000).toFixed(1).replace(/\.0$/, "")}Cr`;
  if (value >= 100000) return `${(value / 100000).toFixed(1).replace(/\.0$/, "")}L`;
  if (value >= 1000) return `${Math.round(value / 1000)}k`;
  return String(Math.round(value));
}

function amt(value: number) {
  if (!Number.isFinite(value)) return "—";
  return Math.round(value).toLocaleString("en-IN");
}

function capacityText(value: number) {
  if (!value || !Number.isFinite(value)) return "—";
  return Number(value.toFixed(3)).toString();
}

function parseWp(name: string) {
  const match = name.match(/(\d{3,4})\s*w(p)?/i);
  return match ? Number(match[1]) : 0;
}

function parseKw(name: string) {
  const match = name.match(/(\d+(?:\.\d+)?)\s*kw/i);
  return match ? Number(match[1]) : 0;
}

function panelTypeFromName(name: string) {
  if (/topcon/i.test(name)) return "TOPCon";
  if (/hjt|heterojunction/i.test(name)) return "HJT";
  if (/perc/i.test(name)) return "PERC";
  if (/bifacial|bificial/i.test(name)) return "Bifacial";
  return name?.trim() || "Solar Panel";
}

function meterPhaseDisplay(data: ProposalInput): string {
  const labeled = data.meterPhaseLabel?.trim();
  if (labeled) return labeled;
  switch (data.meterPhase) {
    case "single_phase_1_6":
      return "Single Phase";
    case "three_phase_1_6":
    case "three_phase_6_10":
      return "Three Phase";
    default:
      return "As per design";
  }
}

function findPanel(items: ProposalLineItem[]) {
  return (
    items.find((item) => /^solar module$/i.test(item.item_name_snapshot)) ||
    items.find(
      (item) => parseWp(item.item_name_snapshot) >= 400 || /panel|module/i.test(item.item_name_snapshot),
    )
  );
}

function findInverter(items: ProposalLineItem[]) {
  return items.find(
    (item) =>
      /inverter/i.test(item.item_name_snapshot) ||
      (parseKw(item.item_name_snapshot) > 0 && parseWp(item.item_name_snapshot) < 400),
  );
}

function PageChrome({
  kicker,
  title,
  logoUrl,
}: {
  kicker: string;
  title: string;
  logoUrl?: string;
}) {
  return (
    <>
      <div className="sp-page-chrome" aria-hidden />
      <div className="sp-page-head">
        <div className="sp-page-head-left">
          <div className="sp-page-head-rule" aria-hidden />
          <div>
            <p className="sp-page-kicker">{kicker}</p>
            <h1 className="sp-page-title">{title}</h1>
          </div>
        </div>
        <CompanyLogoMark
          className="sp-page-logo"
          src={logoUrl}
          alt=""
          textStyle={{ fontSize: 18 }}
        />
      </div>
    </>
  );
}

export function SolarProposalDocument({
  data,
  company,
  template,
  mode = "print",
  pricingLocked = false,
  bomMaterialItems = [],
  bomTier = "premium",
}: {
  data: ProposalInput;
  company: CompanyInfo;
  template: SolarProposalTemplate;
  mode?: "print" | "preview";
  pricingLocked?: boolean;
  canViewItemPricing?: boolean;
  /** Full tier BOM lines (images + qty) appended after the system summary page */
  bomMaterialItems?: ProposalLineItem[];
  bomTier?: BomTier;
}) {
  const calc = calculateSolarProposal(data, template);
  const primary = template.primaryColor || BRAND.colors.blue;
  const accent = template.accentColor || BRAND.colors.orange;
  const preparedBy = template.preparedBy || company.name || BRAND.name;
  const preparedByPhone = template.preparedByPhone || company.phone || "";
  const phone = template.companyPhone || company.phone || BRAND.contact.phone;
  const email = template.companyEmail || company.email || BRAND.contact.email;
  const address = template.companyAddress || company.address || BRAND.contact.address;
  const website = template.companyWebsite || BRAND.contact.website;
  const thanksCompany =
    template.thanksCompanyName?.trim() || company.name || BRAND.name;
  const thanksBranches =
    template.thanksBranches?.filter((b) => b.label?.trim() || b.address?.trim()) ?? [];
  const docs = template.requiredDocuments?.length
    ? template.requiredDocuments
    : [
        "Copy of Latest Electricity Bill",
        "House Tax Bill / Index / 7/12 Extract",
        "Copy of Aadhaar Card",
        "Copy of Pan Card",
        "Bank Passbook / Cancelled Cheque",
        "Customer Contact Detail",
      ];

  const panel = findPanel(data.items);
  const inverter = findInverter(data.items);
  const panelName =
    data.moduleTypeName?.trim() ||
    data.moduleCompanyName?.trim() ||
    panel?.brand_snapshot?.trim() ||
    "";
  const panelQty =
    (data.panelCount != null && Number(data.panelCount) > 0
      ? Number(data.panelCount)
      : null) ??
    (panel ? Number(panel.quantity) || 0 : 0);
  const panelWpFromName = panel
    ? parseWp(panel.model_snapshot || "") || parseWp(panel.item_name_snapshot)
    : 0;
  const panelWpDisplay =
    data.moduleCapacityLabel?.trim() ||
    (panelWpFromName > 0 ? `${panelWpFromName}W` : "") ||
    "—";
  const panelBrand = panelName;
  const panelTypeLabel = panelName
    ? panelTypeFromName(panelName)
    : panel
      ? panelTypeFromName(panel.model_snapshot || panel.item_name_snapshot)
      : "—";
  const inverterSizeDisplay =
    data.inverterSizeLabel?.trim() ||
    (inverter?.model_snapshot?.trim() || "") ||
    (inverter ? String(parseKw(inverter.item_name_snapshot) || calc.inverterKw || "") : "") ||
    (calc.inverterKw ? String(calc.inverterKw) : "");
  const inverterKw =
    parseKw(inverterSizeDisplay) ||
    (inverter ? parseKw(inverter.item_name_snapshot) : 0) ||
    calc.inverterKw;
  const inverterQty = inverter ? Number(inverter.quantity) || 1 : inverterKw ? 1 : 0;
  const inverterBrand =
    normalizeInverterBrand(data.inverterTypeName) ||
    data.inverterTypeName?.trim() ||
    inverter?.brand_snapshot?.trim() ||
    "";
  const phaseLabel = meterPhaseDisplay(data);
  const mountType = parsePanelMountType(data.panelMountType);
  const mountLabel = mountType ? PANEL_MOUNT_TYPE_LABELS[mountType] : null;
  const tierLabel =
    data.tierType === "regular" ? "Regular" : data.tierType === "premium" ? "Premium" : null;
  const effectiveTier: "premium" | "regular" =
    data.tierType === "regular" || data.tierType === "premium"
      ? data.tierType
      : bomTier === "regular"
        ? "regular"
        : "premium";
  const tierCopy = quoteTierCopy(effectiveTier, parseProjectType(data.projectType));
  const systemKwDisplay =
    data.systemSizeKw != null && Number(data.systemSizeKw) > 0
      ? Number(data.systemSizeKw)
      : calc.capacityKw;
  const capacityKwLabel = systemKwDisplay ? `${capacityText(systemKwDisplay)} kW` : "—";
  const perKwRate =
    systemKwDisplay > 0 && calc.listSystemCost > 0
      ? calc.listSystemCost / systemKwDisplay
      : 0;
  const projectCost = calc.payableBeforeSubsidy;
  const terms = scopeItems(template.termsText);
  const ourScope = scopeItems(template.ourScope);
  const customerScope = scopeItems(template.customerScope);
  const coverPhoto = template.coverImageUrl || template.installImageUrl || BRAND.logo.coverHome;
  const savingsPhoto = template.systemImageUrl || template.installImageUrl || BRAND.logo.coverHome;
  const bomWithSelection = overlayQuoteEquipmentOnBom(bomMaterialItems, {
    moduleTypeName: panelName,
    moduleCompanyName: data.moduleCompanyName,
    moduleCapacityLabel: data.moduleCapacityLabel,
    inverterTypeName: inverterBrand,
    inverterSizeLabel: inverterSizeDisplay,
  });
  const inlineBomItems =
    bomWithSelection.length > 0 && bomWithSelection.length <= SUMMARY_PAGE_ITEM_CAP
      ? bomWithSelection
      : [];
  const pagedBomItems =
    bomWithSelection.length > SUMMARY_PAGE_ITEM_CAP ? bomWithSelection : [];
  const yearSavings = Array.from({ length: 15 }, (_, index) => {
    return calc.annualSav * Math.pow(1 + template.escalation / 100, index);
  });
  const maxSav = Math.max(...yearSavings, 1);

  const cssVars = {
    ["--sp-primary" as string]: primary,
    ["--sp-accent" as string]: accent,
    ["--sp-navy" as string]: BRAND.colors.navy,
  } as CSSProperties;
  const rootClass = ["sp-root", mode === "preview" ? "sp-preview" : ""].filter(Boolean).join(" ");
  const projectLabel = projectTypeLabel(data.projectType);
  const paymentLines = calc.paymentSteps.filter((step) => step.amount > 0);
  const bankAccounts = accountsForDocument(company, template);
  const qrAccount = paymentQrAccount(bankAccounts);
  const offerLead = (template.offerLeadText || "").replace(/\{capacity\}/gi, capacityKwLabel);

  return (
    <article className={rootClass} style={cssVars}>
      <SolarProposalCoverPage
        capacityLabel={capacityKwLabel.replace("kW", "KW")}
        quoteDate={formatCoverDate(data.quoteDate)}
        quotationNo={data.quotationNo}
        validTill={formatCoverDate(data.validTill)}
        customerName={data.customerName}
        customerPhone={data.customerPhone}
        customerAddress={data.customerAddress}
        companyName={company.name || BRAND.name}
        preparedBy={preparedBy}
        preparedByPhone={preparedByPhone}
        phone={phone}
        email={email}
        address={address}
        coverImageUrl={coverPhoto}
        coverTitle={template.coverTitle}
        logoUrl={template.logoUrl}
      />

      <section className="sp-page">
        <div className="sp-body">
          <PageChrome
            kicker={projectLabel}
            title={template.offerPageTitle}
            logoUrl={template.logoUrl}
          />
          <p className="sp-lead">{offerLead}</p>
          {!pricingLocked ? (
            <table className="sp-price-table">
              <thead>
                <tr>
                  <th>Description</th>
                  <th className="amt">Amount (INR)</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td>Per kW Rate (GST included)</td>
                  <td className="amt">{amt(perKwRate)}</td>
                </tr>
                <tr>
                  <td>Roof ON-Grid Solar Power Plant System</td>
                  <td className="amt">{amt(calc.listSystemCost)}</td>
                </tr>
                <tr>
                  <td>
                    Net-Metering Cost
                    {phaseLabel && phaseLabel !== "As per design" ? ` (${phaseLabel})` : ""}
                  </td>
                  <td className="amt">{amt(calc.nm)}</td>
                </tr>
                {calc.add > 0 ? <tr><td>Additional Charges</td><td className="amt">{amt(calc.add)}</td></tr> : null}
                {calc.discountAmount > 0 ? (
                  <tr><td>Discount</td><td className="amt">{amt(calc.discountAmount)}</td></tr>
                ) : null}
                <tr className="strong"><td>Grand Total Cost Of The Project</td><td className="amt">{amt(projectCost)}</td></tr>
                {calc.sub > 0 ? (
                  <>
                    <tr><td>MNRE Subsidy</td><td className="amt">{amt(calc.sub)}</td></tr>
                    <tr className="strong"><td>Final Effective Cost to Customer After Subsidy</td><td className="amt">{amt(calc.totalCost)}</td></tr>
                  </>
                ) : null}
              </tbody>
            </table>
          ) : (
            <p className="sp-lead">Pricing details are available on request from your sales representative.</p>
          )}

          <div className="sp-invest-split">
            <div className="sp-panel">
              <h3 className="sp-subhead">Payment schedule</h3>
              <ol className="sp-pay-list">
                {paymentLines.map((step) => (
                  <li key={`${step.amount}-${step.label}`}>
                    <span className="sp-pay-pct">
                      {projectCost > 0 ? Math.round((step.amount / projectCost) * 100) : "—"}%
                    </span>
                    <span className="sp-pay-text">
                      {step.tag ? <span className="sp-pay-tag">{step.tag}</span> : null}
                      {fmtMoney(step.amount)} — {step.label}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
            <div className="sp-panel">
              <h3 className="sp-subhead">Payment details</h3>
              <p className="sp-lead" style={{ marginBottom: 8 }}>{template.paymentDetailsIntro}</p>
              <div
                className={
                  bankAccounts.length > 1 ? "sp-bank-list sp-bank-list-multi" : "sp-bank-list"
                }
              >
                {bankAccounts.map((account) => (
                  <div key={account.id} className="sp-bank-block">
                    <strong>
                      {bankAccounts.length > 1 ? bankAccountTitle(account) : "Bank details"}
                    </strong>
                    <div>A/C Name — {account.accountName || company.name || BRAND.name}</div>
                    <div>A/C No. — {account.accountNumber || "—"}</div>
                    <div>Bank — {account.bankName || "—"}</div>
                    <div>IFSC — {account.ifscCode || "—"}</div>
                    {account.branch ? <div>Branch Name — {account.branch}</div> : null}
                  </div>
                ))}
              </div>
              {qrAccount ? (
                <div className="sp-payment-assets">
                  <figure className="sp-qr-figure">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={qrAccount.qrUrl}
                      alt="Scan to pay RK Bhabhor"
                      className="sp-qr-reference"
                    />
                    {qrAccount.upiId ? (
                      <figcaption className="sp-qr-upi">
                        UPI ID: <strong>{qrAccount.upiId}</strong>
                      </figcaption>
                    ) : null}
                  </figure>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className="sp-page sp-page-bom-system">
        <div className="sp-body">
          <PageChrome
            kicker={[projectLabel, tierLabel].filter(Boolean).join(" · ") || template.bomPageKicker}
            title={template.bomPageTitle}
            logoUrl={template.logoUrl}
          />
          {template.installImageUrl?.trim() ? (
            <div className="sp-system-hero">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={template.installImageUrl} alt="" />
            </div>
          ) : null}
          <div className="sp-bom-meta" style={{ marginBottom: 12, fontSize: 12, color: "#475569" }}>
            <strong>{projectLabel}</strong>
            {capacityKwLabel !== "—" ? <> · System {capacityKwLabel}</> : null}
            {phaseLabel ? <> · {phaseLabel}</> : null}
            {mountLabel ? <> · {mountLabel}</> : null}
          </div>
          <div className="sp-bom-grid-wrap">
            <div className="sp-bom-section">
              <h3>Panel</h3>
              <div className="sp-bom-grid">
                <div className="sp-bom-field"><label>Make / model</label><strong>{panelName || "—"}</strong></div>
                <div className="sp-bom-field"><label>Watt peak</label><strong>{panelWpDisplay}</strong></div>
                <div className="sp-bom-field"><label>Panel qty</label><strong>{panelQty || "—"}</strong></div>
                <div className="sp-bom-field"><label>Panel type</label><strong>{panelTypeLabel}</strong></div>
              </div>
              {panelBrand ? <div className="sp-bom-brand">{panelBrand}</div> : null}
            </div>
            <div className="sp-bom-section">
              <h3>Inverter</h3>
              <div className="sp-bom-grid">
                <div className="sp-bom-field"><label>Make</label><strong>{inverterBrand || "—"}</strong></div>
                <div className="sp-bom-field"><label>Inverter size</label><strong>{inverterSizeDisplay || "—"}</strong></div>
                <div className="sp-bom-field"><label>Phase</label><strong>{phaseLabel}</strong></div>
                <div className="sp-bom-field"><label>Qty</label><strong>{inverterQty || "—"}</strong></div>
              </div>
              {inverterBrand ? <div className="sp-bom-brand">{inverterBrand}</div> : null}
            </div>
            <div className="sp-bom-section">
              <h3>Cables</h3>
              <div className="sp-bom-grid two">
                <div className="sp-bom-field"><label>AC cable</label><strong>Polycab / KEI / Reputed</strong></div>
                <div className="sp-bom-field"><label>DC cable</label><strong>Polycab / KEI / Reputed</strong></div>
                <div className="sp-bom-field"><label>Earthing cable</label><strong>Aluminium</strong></div>
                <div className="sp-bom-field"><label>LA cable</label><strong>Aluminium</strong></div>
              </div>
            </div>
            <div className="sp-bom-section">
              <h3>Structure</h3>
              <div className="sp-bom-grid two">
                <div className="sp-bom-field">
                  <label>Module mounting structure</label>
                  <strong>{tierCopy.structureMounting}</strong>
                </div>
                <div className="sp-bom-field">
                  <label>Rafter</label>
                  <strong>{tierCopy.structureRafter}</strong>
                </div>
                <div className="sp-bom-field"><label>Height</label><strong>As per site</strong></div>
                {mountLabel ? (
                  <div className="sp-bom-field"><label>Mount</label><strong>{mountLabel}</strong></div>
                ) : null}
                <div className="sp-bom-field"><label>Project</label><strong>{projectLabel}</strong></div>
              </div>
            </div>
            <div className="sp-bom-section">
              <h3>Warranty &amp; service</h3>
              <table className="sp-warranty-table">
                <tbody>
                  {tierCopy.warrantyRows.map((row) => (
                    <tr key={row.label}>
                      <td className="label">{row.label}</td>
                      <td className="value">{row.value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="sp-bom-section sp-bom-section-bos">
              <h3>Balance of system</h3>
              <div className="sp-bom-grid two sp-bos-grid">
                <div className="sp-bom-field">
                  <label>ACDB</label>
                  <strong>{template.acdb}</strong>
                </div>
                <div className="sp-bom-field">
                  <label>DCDB</label>
                  <strong>{template.dcdb}</strong>
                </div>
                <div className="sp-bom-field">
                  <label>Net meter</label>
                  <strong>{template.netMeter}</strong>
                </div>
                <div className="sp-bom-field">
                  <label>Earthing &amp; LA</label>
                  <strong>
                    Earth pits {template.earthPits} · LA {template.lightningArrestor}
                  </strong>
                </div>
              </div>
            </div>
            {inlineBomItems.length > 0 ? (
              <div className="sp-bom-material-inline">
                <h3 className="sp-subhead">
                  {bomTier === "regular" ? "List of materials" : "Components"}
                </h3>
                <BomMaterialTable
                  items={inlineBomItems}
                  startIndex={0}
                  tier={bomTier}
                  moduleBrand={panelBrand}
                />
                <BomMaterialNote />
              </div>
            ) : null}
            {pagedBomItems.length === 0 ? (
              <PreviousWorkSection
                heading={template.previousWorkTitle || "Our Other Products"}
                photos={template.previousWorkPhotos}
              />
            ) : null}
          </div>
        </div>
      </section>

      <SolarBomMaterialPages
        items={pagedBomItems}
        tier={bomTier}
        title={bomTier === "regular" ? "List of materials" : "Component list"}
        moduleBrand={panelBrand}
        logoUrl={template.logoUrl}
        previousWorkTitle={template.previousWorkTitle}
        previousWorkPhotos={pagedBomItems.length > 0 ? template.previousWorkPhotos : undefined}
      />

      <section className="sp-page sp-page-merged">
        <div className="sp-body">
          <PageChrome
            kicker={template.coverHeroSub || "Smart Solar Solutions for a Sustainable Future"}
            title={template.scopePageTitle}
            logoUrl={template.logoUrl}
          />
          <div className="sp-merged-scope-savings">
            <div className="sp-scope-cols sp-scope-cols-compact">
              <div className="sp-scope-col ours">
                <h3 className="sp-subhead">Our scope</h3>
                <ol className="sp-scope-list">
                  {ourScope.map((item, index) => (
                    <li key={item}>
                      <span className="sp-scope-num">{index + 1}</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ol>
              </div>
              <div className="sp-scope-col yours">
                <h3 className="sp-subhead">Customer scope</h3>
                <ol className="sp-scope-list">
                  {customerScope.map((item, index) => (
                    <li key={item}>
                      <span className="sp-scope-num">{index + 1}</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="sp-kpi-band">
              <div className="sp-kpi-band-hero">
                <div className="sp-kpi-band-copy">
                  <p className="sp-kpi-band-label">Your system</p>
                  <p className="sp-kpi-band-kw">{capacityKwLabel}</p>
                  <p className="sp-kpi-band-blurb">{template.savingsBlurb}</p>
                </div>
                <div className="sp-kpi-band-photo">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={savingsPhoto} alt="" />
                </div>
              </div>
              <div className="sp-kpi-grid sp-kpi-grid-band">
                <div className="sp-kpi-card sp-kpi-card-band">
                  <div className="sp-kpi-label">Payback</div>
                  <div className="sp-kpi-value">{calc.payback ? Math.round(calc.payback) : "—"}</div>
                  <div className="sp-kpi-unit">Years</div>
                </div>
                <div className="sp-kpi-card sp-kpi-card-band">
                  <div className="sp-kpi-label">Yearly generation</div>
                  <div className="sp-kpi-value">{amt(calc.annualGen)}</div>
                  <div className="sp-kpi-unit">Units / year</div>
                </div>
                <div className="sp-kpi-card sp-kpi-card-band">
                  <div className="sp-kpi-label">Annual savings</div>
                  <div className="sp-kpi-value">{amt(calc.annualSav)}</div>
                  <div className="sp-kpi-unit">₹ / year</div>
                </div>
                <div className="sp-kpi-card sp-kpi-card-band">
                  <div className="sp-kpi-label">Project cost</div>
                  <div className="sp-kpi-value">{pricingLocked ? "—" : amt(projectCost)}</div>
                  <div className="sp-kpi-unit">₹</div>
                </div>
                <div className="sp-kpi-card sp-kpi-card-band">
                  <div className="sp-kpi-label">Trees saved</div>
                  <div className="sp-kpi-value">{amt(calc.trees)}</div>
                  <div className="sp-kpi-unit">Equivalent</div>
                </div>
                <div className="sp-kpi-card sp-kpi-card-band">
                  <div className="sp-kpi-label">CO₂ reduction</div>
                  <div className="sp-kpi-value">{amt(calc.co2)}</div>
                  <div className="sp-kpi-unit">Tonnes / year</div>
                </div>
              </div>
            </div>

            <div className="sp-merged-chart-docs sp-merged-chart-docs-inline">
              <div className="sp-chart-block sp-chart-block-compact">
                <p className="sp-chart-sub">Year-wise savings (15 years)</p>
                <div className="sp-bar-chart sp-bar-chart-compact">
                  <div className="sp-bar-y">
                    {CHART_TICKS.map((tick) => (
                      <span key={tick} style={{ bottom: `${tick * 100}%` }}>
                        {shortInr(maxSav * tick)}
                      </span>
                    ))}
                  </div>
                  <div className="sp-bar-plot">
                    {CHART_TICKS.filter((tick) => tick > 0).map((tick) => (
                      <div key={tick} className="sp-bar-grid" style={{ bottom: `${tick * 100}%` }} />
                    ))}
                    <div className="sp-bar-row">
                      {yearSavings.map((value, index) => (
                        <div
                          key={index}
                          className="sp-bar"
                          style={{ height: `${Math.max(2, (value / maxSav) * 100)}%` }}
                          title={`Year ${index + 1}: ${fmtMoney(value)}`}
                        />
                      ))}
                    </div>
                  </div>
                </div>
                <div className="sp-bar-x">
                  {yearSavings.map((_, index) => (
                    <span key={index}>{index + 1}</span>
                  ))}
                </div>
                <div className="sp-chart-axis">
                  <span>Amount (₹)</span>
                  <span>Year</span>
                </div>
              </div>

              <div className="sp-docs-stack">
                <div className="sp-docs-panel">
                  <h3 className="sp-subhead sp-docs-panel-title">Required documents</h3>
                  <p className="sp-docs-intro sp-docs-intro-compact">
                    Documents required to proceed with your solar installation:
                  </p>
                  <table className="sp-docs-table sp-docs-table-compact">
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Document name</th>
                      </tr>
                    </thead>
                    <tbody>
                      {docs.map((doc, index) => (
                        <tr key={doc}>
                          <td className="sr">{index + 1}</td>
                          <td>{doc}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="sp-docs-terms sp-docs-terms-compact sp-docs-panel">
                  <h3 className="sp-subhead">Terms &amp; conditions</h3>
                  <ol>
                    {terms.map((term, index) => (
                      <li key={`${index}-${term}`}>{term}</li>
                    ))}
                  </ol>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="sp-page">
        <div className="sp-body sp-thanks-page">
          <PageChrome
            kicker={template.thanksPageKicker}
            title={template.thanksPageTitle}
            logoUrl={template.logoUrl}
          />
          <div className="sp-thanks-msg">{template.thanksMessage}</div>

          <div className="sp-thanks-contact-card">
            <h2 className="sp-thanks-company">{thanksCompany}</h2>
            <div className="sp-thanks-contact-grid">
              {address ? (
                <div className="sp-thanks-address">
                  <span className="sp-thanks-ico" aria-hidden>
                    ⌖
                  </span>
                  <span>{address}</span>
                </div>
              ) : (
                <div />
              )}
              <div className="sp-thanks-contact-cols">
                {phone ? (
                  <div className="sp-thanks-line">
                    <span className="sp-thanks-ico" aria-hidden>
                      ☎
                    </span>
                    <span>{phone}</span>
                  </div>
                ) : null}
                {website ? (
                  <div className="sp-thanks-line">
                    <span className="sp-thanks-ico" aria-hidden>
                      ○
                    </span>
                    <span>{website}</span>
                  </div>
                ) : null}
                {email ? (
                  <div className="sp-thanks-line">
                    <span className="sp-thanks-ico" aria-hidden>
                      ✉
                    </span>
                    <span>{email}</span>
                  </div>
                ) : null}
              </div>
            </div>
            {template.thanksCustomerCare?.trim() ? (
              <div className="sp-thanks-pill sp-thanks-pill-care">
                {template.thanksCustomerCare.trim()}
              </div>
            ) : null}
            {template.thanksBranchesNote?.trim() ? (
              <div className="sp-thanks-pill sp-thanks-pill-branches">
                {template.thanksBranchesNote.trim()}
              </div>
            ) : null}
          </div>

          {thanksBranches.length > 0 ? (
            <div className="sp-branches-section">
              <h3 className="sp-branches-heading">{template.thanksBranchesHeading}</h3>
              <div className="sp-branch-grid">
                {thanksBranches.map((branch, index) => (
                  <div key={`${branch.label}-${index}`} className="sp-branch-card">
                    <div className="sp-branch-index">{index + 1}</div>
                    <div className="sp-branch-body">
                      <div className="sp-branch-name">{branch.label || `Branch ${index + 1}`}</div>
                      <div className="sp-branch-address">{branch.address}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
      </section>
    </article>
  );
}
