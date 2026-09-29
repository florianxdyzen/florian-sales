import { BRAND } from "@/lib/quotations/brand";
import { resolveBomItemImage } from "@/lib/quotations/bom-image";
import type { BomTier } from "@/lib/quotations/tier-bom";
import type { ProposalLineItem } from "@/lib/quotations/solar-proposal-calculations";
import { resolvePreviousWorkPhotos } from "@/lib/quotations/quotation-template";
import type { SolarProposalTemplate } from "@/lib/quotations/quotation-template";

/** Max rows on a continuation BOM page (no footer note). */
const MAX_ITEMS_PER_PAGE = 14;
/** Max rows on the final BOM page when the footer note is shown. */
const MAX_ITEMS_LAST_PAGE = 15;

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

    // If a full page would leave only a sliver on the last page, pull one row forward.
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

function MaterialTable({
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
          const img = resolveBomItemImage(item, tier, { moduleBrand });
          return (
            <tr key={`${item.model_snapshot ?? item.item_name_snapshot}-${rowNum}`}>
              <td className="sp-bom-mat-num">{rowNum}</td>
              <td className="sp-bom-mat-img-cell">
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img className="sp-bom-mat-img" src={img} alt="" />
                ) : null}
              </td>
              <td>
                <div className="sp-bom-mat-name">{item.item_name_snapshot}</div>
                {item.brand_snapshot ? (
                  <div className="sp-bom-mat-meta">Make: {item.brand_snapshot}</div>
                ) : null}
              </td>
              <td className="sp-bom-mat-qty">
                {item.quantity} {item.unit}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function PageHead({ kicker, title }: { kicker: string; title: string }) {
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
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="sp-page-logo" src={BRAND.logo.primary} alt="" />
      </div>
    </>
  );
}

/** Items that fit below the system summary grid on the first System package page. */
export const SUMMARY_PAGE_ITEM_CAP = 10;

export function chunkBomMaterialPages(items: ProposalLineItem[]) {
  return chunkItems(items, MAX_ITEMS_PER_PAGE, MAX_ITEMS_LAST_PAGE);
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
}: {
  heading: string;
  photos: SolarProposalTemplate["previousWorkPhotos"];
}) {
  return (
    <div className="sp-portfolio-section">
      <h3 className="sp-portfolio-heading">{heading}</h3>
      <div className="sp-portfolio-grid">
        {resolvePreviousWorkPhotos(photos).map((photo, index) => (
          <figure key={`${photo.url}-${index}`} className="sp-portfolio-card">
            <div className="sp-portfolio-square">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={photo.url} alt={photo.caption || `Previous work ${index + 1}`} />
              {photo.caption ? (
                <figcaption className="sp-portfolio-caption">{photo.caption}</figcaption>
              ) : null}
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
  previousWorkTitle,
  previousWorkPhotos,
}: {
  items: ProposalLineItem[];
  tier: BomTier;
  title?: string;
  moduleBrand?: string | null;
  previousWorkTitle?: string;
  previousWorkPhotos?: SolarProposalTemplate["previousWorkPhotos"];
}) {
  if (items.length === 0) return null;

  const pages = chunkItems(items, MAX_ITEMS_PER_PAGE, MAX_ITEMS_LAST_PAGE);
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
        return (
        <section key={`sp-bom-${pageIndex}`} className="sp-page sp-page-bom-material">
          <div className="sp-body">
            <PageHead
              kicker={`${pageKicker}${pages.length > 1 ? ` · ${pageIndex + 1}/${pages.length}` : ""}`}
              title={pageTitle}
            />
            <MaterialTable
              items={pageItems}
              startIndex={startIndex}
              tier={tier}
              moduleBrand={moduleBrand}
            />
            {pageIndex === pages.length - 1 ? (
              <>
                <BomMaterialNote />
                {previousWorkPhotos ? (
                  <PreviousWorkSection
                    heading={previousWorkTitle || "Previous Work"}
                    photos={previousWorkPhotos}
                  />
                ) : null}
              </>
            ) : null}
          </div>
        </section>
        );
      })}
    </>
  );
}
