import type { BomQuotationVariant } from "@/components/quotations/bom-quotation-document";

/** Logo-free equipment art: quotations must not show panel / inverter brand logos. */
export const GENERIC_PANEL_IMAGE = "/brand/generic/solar-panel.svg";
export const GENERIC_INVERTER_IMAGE = "/brand/generic/solar-inverter.svg";

const PREMIUM_IMAGE_MAP: Record<string, string> = {
  "01": "01-pv-solar-modules-dcr.png",
  "02": "02-grid-tie-solar-inverter.png",
  "03": "03-module-mounting-structure.png",
  "04": "04-nut-bolt.png",
  "05": "05-double-hole-end-mid-clamp.png",
  "06": "06-u-hook.png",
  "07": "07-base-plate.png",
  "08": "08-standard-structure-foundation.png",
  "09": "09-maintenance-free-chemical-earthing-system.png",
  "10": "10-lightning-protection.png",
  "11": "11-earththing-bucket.png",
  "12": "12-solar-dc-cables.png",
  "13": "13-ac-cables.png",
  "14": "14-earthing-cables.png",
  "15": "15-lightning-arrester-cable.png",
  "16": "16-ac-dc-protection.png",
  "17": "17-cable-conduit-pipe.png",
  "18": "18-cable-tie.png",
  "19": "19-auto-cleaning-system.png",
};

const REGULAR_IMAGE_BY_NUM: Record<string, string> = {
  "01": "01-pv-solar-modules-dcr.png",
  "02": "02-grid-tie-solar-inverter.png",
  "03": "03-module-mounting-structure.png",
  "04": "04-nut-bolt.png",
  "05": "05-end-mid-clamp.png",
  "06": "06-maintenance-free-chemical-earthing-system.png",
  "07": "07-lightning-protection.png",
  "08": "08-solar-dc-cables.png",
  "09": "09-ac-cables.png",
  "10": "10-earthing-cables.png",
  "11": "11-lightning-arrester-cable.png",
  "12": "12-ac-dc-protection.png",
  "13": "13-cable-conduit-pipe.png",
};

function bomNumber(model: string | null | undefined): string | null {
  const match = model?.match(/(?:PREMIUM|REGULAR)-BOM-(\d+)/i);
  return match ? match[1].padStart(2, "0") : null;
}

/** Panel / inverter rows always get generic art (catalog photos and snapshots carry logos). */
export function genericEquipmentImage(item: {
  model_snapshot?: string | null;
  item_name_snapshot?: string | null;
}): string | null {
  const num = bomNumber(item.model_snapshot);
  if (num === "01") return GENERIC_PANEL_IMAGE;
  if (num === "02") return GENERIC_INVERTER_IMAGE;
  const name = (item.item_name_snapshot ?? "").toLowerCase();
  if (name.includes("inverter")) return GENERIC_INVERTER_IMAGE;
  if (
    /\b(solar|pv)\s+(module|panel)s?\b/.test(name) ||
    /^(module|panel)s?\b/.test(name)
  ) {
    return GENERIC_PANEL_IMAGE;
  }
  return null;
}

export function resolveBomItemImage(
  item: {
    model_snapshot?: string | null;
    item_name_snapshot?: string | null;
    image_url_snapshot?: string | null;
    brand_snapshot?: string | null;
  },
  variant: BomQuotationVariant = "premium"
): string | null {
  const generic = genericEquipmentImage(item);
  if (generic) return generic;

  if (item.image_url_snapshot?.trim()) return item.image_url_snapshot.trim();

  const num = bomNumber(item.model_snapshot);
  if (!num) return null;

  const folder = variant === "regular" ? "bom-regular" : "bom-premium";
  const file =
    variant === "regular"
      ? REGULAR_IMAGE_BY_NUM[num] ?? PREMIUM_IMAGE_MAP[num]
      : PREMIUM_IMAGE_MAP[num];

  if (!file) return null;
  return `/brand/${folder}/${file}`;
}
