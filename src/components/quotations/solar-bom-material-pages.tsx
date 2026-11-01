import { BRAND } from "@/lib/quotations/brand";
import { CompanyLogoMark } from "@/components/quotations/company-logo-mark";
import { resolveBomItemImage } from "@/lib/quotations/bom-image";
import type { BomTier } from "@/lib/quotations/tier-bom";
import type { ProposalLineItem } from "@/lib/quotations/solar-proposal-calculations";
import { resolvePreviousWorkPhotos } from "@/lib/quotations/quotation-template";
import type { SolarProposalTemplate } from "@/lib/quotations/quotation-template";
import {
  OTHER_PRODUCTS,
  OTHER_PRODUCT_PAGE_COUNT,
} from "@/lib/quotations/other-products";

/** First component list page always shows up to this many rows. */
const FIRST_BOM_PAGE_SIZE = 10;
/** Further pages pack remaining rows (gallery is a separate full page). */
const CONTINUATION_BOM_PAGE_SIZE = 14;
const DEFAULT_OTHER_PRODUCTS_TITLE = "Our Other Products";

/** Pack pages to capacity — never split evenly (e.g. 19 → 18 + 1, not 10 + 9). */
function chunkItems<T>(items: T[], maxPerPage: number, maxLastPage = maxPerPage): T[][] {
  if (items.length === 0) return [];
  if (items.length <= maxLastPage) return [items];

  const chunks: T[][] = [];
  let index = 0;

  while (index < items.length) {
    const remaining = items.length - index;
    if (remaining <= maxLastPage) {
      chunks.push(items.slice(index));
      break;
    }

    const nextSize = Math.min(maxPerPage, remaining);
    const afterThis = remaining - nextSize;

    if (afterThis > 0 && afterThis < 4 && nextSize > 4) {
      chunks.push(items.slice(index, index + nextSize - 1));
      index += nextSize - 1;
      continue;
    }

    chunks.push(items.slice(index, index + nextSize));
    index += nextSize;
  }

  return chunks;
}

/** Page 1: 10 components; remaining items packed onto the next page(s). */
function chunkBomMaterialItems(items: ProposalLineItem[]): ProposalLineItem[][] {
  if (items.length === 0) return [];

  if (items.length <= FIRST_BOM_PAGE_SIZE) {
    return [items];
  }

  const pages: ProposalLineItem[][] = [items.slice(0, FIRST_BOM_PAGE_SIZE)];
  const rest = items.slice(FIRST_BOM_PAGE_SIZE);
  pages.push(...chunkItems(rest, CONTINUATION_BOM_PAGE_SIZE, CONTINUATION_BOM_PAGE_SIZE));
  return pages;
}

function MaterialTable({
  items,
  startIndex,
  tier,
}: {
  items: ProposalLineItem[];
  startIndex: number;
  tier: BomTier;
  moduleBrand?: string | null;
}) {
  return (
    <table className="sp-bom-material-table">
      <thead>
        <tr>
          <th>#</th>
          <th />
          <th>Component</th>
          <th>Qty</th>
        </tr>
      </thead>
      <tbody>
        {items.map((item, index) => {
          const rowNum = startIndex + index + 1;
          const img = resolveBomItemImage(item, tier);
          return (
            <tr key={`${item.model_snapshot ?? item.item_name_snapshot}-${rowNum}`}>
              <td className="sp-bom-mat-num">{rowNum}</td>
              <td className="sp-bom-mat-img-cell">
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="sp-bom-mat-img" src={img} alt="" />
                ) : null}
              </td>
              <td className="sp-bom-mat-name-cell">
                <div className="sp-bom-mat-name">{item.item_name_snapshot}</div>
                {item.brand_snapshot ? (
                  <div className="sp-bom-mat-meta">Make: {item.brand_snapshot}</div>
                ) : null}
              </td>
              <td className="sp-bom-mat-qty">Included</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PageHead({
  kicker,
  title,
  logoUrl,
}: {
  kicker: string;
  title: string;
  logoUrl?: string | null;
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

/** Items that fit below the system summary grid on the first System package page. */
export const SUMMARY_PAGE_ITEM_CAP = 10;

export function chunkBomMaterialPages(items: ProposalLineItem[]) {
  return chunkBomMaterialItems(items);
}

export function BomMaterialTable({
  items,
  startIndex,
  tier,
  moduleBrand,
}: {
  items: ProposalLineItem[];
  startIndex: number;
  tier: BomTier;
  moduleBrand?: string | null;
}) {
  return (
    <MaterialTable
      items={items}
      startIndex={startIndex}
      tier={tier}
      moduleBrand={moduleBrand}
    />
  );
}

export function BomMaterialNote() {
  return (
    <p className="sp-bom-material-note">
      Component list is indicative; exact makes may vary within approved brands. No component unit
      rates are shown — turnkey pricing is on the offer page.
    </p>
  );
}

export function PreviousWorkSection({
  heading,
  photos,
  layout = "grid",
}: {
  heading: string;
  photos: SolarProposalTemplate["previousWorkPhotos"];
  layout?: "grid" | "catalog";
}) {
  if (layout === "catalog") {
    const slots = resolvePreviousWorkPhotos(photos).slice(0, OTHER_PRODUCT_PAGE_COUNT);
    return (
      <div className="sp-portfolio-section sp-portfolio-section--catalog">
        {heading ? <h3 className="sp-portfolio-heading">{heading}</h3> : null}
        <div className="sp-other-stack">
          {slots.map((photo, index) => {
            const copy = OTHER_PRODUCTS[index];
            if (!copy) return null;
            const flip = index % 2 === 1;
            return (
              <article
                key={`${photo.url}-${index}`}
                className={`sp-other-row${flip ? " sp-other-row--flip" : ""}`}
              >
                <div className="sp-other-media">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt={copy.title} />
                </div>
                <div className="sp-other-copy">
                  <p className="sp-other-kicker">Also available</p>
                  <h3 className="sp-other-title">{copy.title}</h3>
                  {copy.tagline ? <p className="sp-other-tag">{copy.tagline}</p> : null}
                  <ul className="sp-other-features">
                    {copy.features.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  {copy.note ? <p className="sp-other-note">{copy.note}</p> : null}
                </div>
              </article>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div className="sp-portfolio-section">
      {heading ? <h3 className="sp-portfolio-heading">{heading}</h3> : null}
      <div className="sp-portfolio-grid">
        {resolvePreviousWorkPhotos(photos)
          .slice(0, OTHER_PRODUCT_PAGE_COUNT)
          .map((photo, index) => (
          <figure key={`${photo.url}-${index}`} className="sp-portfolio-card">
            <div className="sp-portfolio-square">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt={photo.caption || `Product ${index + 1}`} />
            </div>
          </figure>
        ))}
      </div>
    </div>
  );
}

export function SolarBomMaterialPages({
  items,
  tier,
  title = "Bill of materials",
  moduleBrand,
  logoUrl,
  previousWorkTitle,
  previousWorkPhotos,
}: {
  items: ProposalLineItem[];
  tier: BomTier;
  title?: string;
  moduleBrand?: string | null;
  logoUrl?: string | null;
  previousWorkTitle?: string;
  previousWorkPhotos?: SolarProposalTemplate["previousWorkPhotos"];
}) {
  const showPreviousWork = Boolean(previousWorkPhotos?.length);
  const pages = chunkBomMaterialItems(items);
  const galleryTitle = previousWorkTitle?.trim() || DEFAULT_OTHER_PRODUCTS_TITLE;

  if (pages.length === 0 && !showPreviousWork) return null;

  const tierLabel = tier === "premium" ? "Premium" : "Regular";
  const pageTitle =
    title ?? (tier === "regular" ? "List of materials" : "Bill of materials");
  const pageKicker =
    tier === "regular" ? "Residential package" : `${tierLabel} specification`;

  let rowOffset = 0;

  return (
    <>
      {pages.map((pageItems, pageIndex) => {
        const startIndex = rowOffset;
        rowOffset += pageItems.length;
        const isLastPage = pageIndex === pages.length - 1;
        return (
          <section key={`sp-bom-${pageIndex}`} className="sp-page sp-page-bom-material">
            <div className="sp-body">
              <PageHead
                kicker={`${pageKicker}${pages.length > 1 ? ` · ${pageIndex + 1}/${pages.length}` : ""}`}
                title={pageTitle}
                logoUrl={logoUrl}
              />
              <div className="sp-bom-table-fill">
                <MaterialTable
                  items={pageItems}
                  startIndex={startIndex}
                  tier={tier}
                  moduleBrand={moduleBrand}
                />
              </div>
              {isLastPage ? <BomMaterialNote /> : null}
            </div>
          </section>
        );
      })}
      {showPreviousWork ? (
        <section className="sp-page sp-page-portfolio">
          <div className="sp-body">
            <PageHead
              kicker={pageKicker}
              title={galleryTitle}
              logoUrl={logoUrl}
            />
            <PreviousWorkSection heading="" photos={previousWorkPhotos!} layout="catalog" />
          </div>
        </section>
      ) : null}
    </>
  );
}
