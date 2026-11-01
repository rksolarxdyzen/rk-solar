"use server";

import { listCatalogAdmin } from "@/actions/catalog";
import { getRateCardPanels } from "@/lib/quotations/data/rate-card";
import { getRateCardInverters } from "@/lib/quotations/data/rate-card-inverters";
import { getQuotationContext } from "@/lib/quotations/context";

export async function loadCatalogPageData() {
  const { canManageCatalog } = await getQuotationContext();
  if (!canManageCatalog) {
    return { canManageCatalog: false as const, catalog: null, ratePanels: [], rateInverters: [] };
  }
  const [catalog, ratePanels, rateInverters] = await Promise.all([
    listCatalogAdmin(),
    getRateCardPanels(),
    getRateCardInverters(),
  ]);
  return { canManageCatalog: true as const, catalog, ratePanels, rateInverters };
}
