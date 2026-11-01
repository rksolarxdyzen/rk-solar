/** `/quotations/<uuid>` only — not new / edit / print / bin / template. */
const QUOTE_DETAIL_RE =
  /^\/quotations\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;

function normalize(href: string): string {
  const path = href.split("?")[0]?.split("#")[0] ?? href;
  if (path.length > 1 && path.endsWith("/")) return path.slice(0, -1);
  return path || "/";
}

export function matchQuotationDetailId(href: string): string | null {
  const m = normalize(href).match(QUOTE_DETAIL_RE);
  return m?.[1] ?? null;
}

export function isQuotationDetailPath(href: string): boolean {
  return matchQuotationDetailId(href) != null;
}
