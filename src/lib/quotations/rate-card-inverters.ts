export type RateCardInverter = {
  id: string;
  inverter_name: string;
  inverter_size: string;
  sort_order: number;
  is_active: boolean;
};

export function sortRateCardInverters(inverters: RateCardInverter[]): RateCardInverter[] {
  return [...inverters].sort(
    (a, b) =>
      a.sort_order - b.sort_order ||
      a.inverter_name.localeCompare(b.inverter_name, undefined, { sensitivity: "base" })
  );
}

export function inverterSizeLabel(inverter: RateCardInverter | null | undefined): string {
  return inverter?.inverter_size?.trim() ?? "";
}

export function filterInvertersByQuery(inverters: RateCardInverter[], query: string): RateCardInverter[] {
  const q = query.trim().toLowerCase();
  if (!q) return inverters;
  return inverters.filter(
    (inv) =>
      inv.inverter_name.toLowerCase().includes(q) ||
      inv.inverter_size.toLowerCase().includes(q)
  );
}

export function parseInverterSizeKw(sizeLabel: string): number {
  const withUnit = sizeLabel.match(/(\d+(?:\.\d+)?)\s*kw/i);
  if (withUnit) return Number(withUnit[1]);
  // Catalog sizes are often entered as bare numbers (e.g. "3" meaning 3 kW).
  const bare = sizeLabel.trim().match(/^(\d+(?:\.\d+)?)$/);
  return bare ? Number(bare[1]) : 0;
}
