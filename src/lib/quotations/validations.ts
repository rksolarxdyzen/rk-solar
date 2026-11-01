import { z } from "zod";
import { PROJECT_TYPES } from "@/lib/quotations/project-type";
import { METER_PHASES } from "@/lib/quotations/meter-phase";
import { SUBSIDY_SCHEMES } from "@/lib/quotations/subsidy";
import { PANEL_MOUNT_TYPES } from "@/lib/quotations/commercial";

/** Treat "" / null as missing so optional UUIDs don't fail validation. */
const optionalUuid = z.preprocess(
  (v) => (v === "" || v === null || v === undefined ? undefined : v),
  z.string().uuid().optional()
);

const optionalNullableUuid = z.preprocess(
  (v) => (v === "" || v === undefined ? null : v),
  z.string().uuid().nullable().optional()
);

export const quoteItemSchema = z.object({
  itemId: optionalUuid,
  itemName: z.string().min(1),
  brand: z.string().optional(),
  model: z.string().optional(),
  quantity: z.coerce.number().positive(),
  unit: z.string().min(1),
  rate: z.coerce.number().nonnegative(),
  gstPercent: z.coerce.number().min(0).max(100),
  discountValue: z.coerce.number().min(0).default(0),
  imageUrl: z.string().optional(),
  brandImageUrl: z.string().optional(),
});

const heightChargeSchema = z.object({
  enabled: z.boolean().default(false),
  quantity: z.coerce.number().min(0).default(1),
  unit: z.string().min(1).default("ft"),
  ratePerUnit: z.coerce.number().nonnegative().default(250),
  gstPercent: z.coerce.number().min(0).max(100).default(18),
});

const floorChargeSchema = z.object({
  enabled: z.boolean().default(false),
  buildingType: z.enum(["residential", "commercial"]).default("residential"),
  floorCount: z.coerce.number().min(0).default(1),
  ratePerFloor: z.coerce.number().nonnegative().default(500),
  gstPercent: z.coerce.number().min(0).max(100).default(18),
});

export const siteChargesSchema = z.object({
  height: heightChargeSchema,
  floors: floorChargeSchema,
});

export const quotationSchema = z.object({
  id: optionalUuid,
  leadId: optionalUuid,
  customerName: z.string().min(1),
  customerPhone: z.string().min(10),
  address: z.string().optional(),
  projectType: z.enum(PROJECT_TYPES).default("residential"),
  quotationNo: z.string().min(1),
  quoteDate: z.string().min(1),
  validTill: z.string().min(1),
  status: z.enum(["draft", "sent", "accepted", "rejected"]).default("draft"),
  notes: z.string().optional(),
  terms: z.string().optional(),
  siteCharges: siteChargesSchema.optional(),
  items: z.array(quoteItemSchema).min(1),
  ratePackageId: optionalNullableUuid,
  moduleTypeName: z.string().optional().nullable(),
  moduleCompanyName: z.string().optional().nullable(),
  moduleCapacityLabel: z.string().optional().nullable(),
  inverterTypeName: z.string().optional().nullable(),
  inverterSizeLabel: z.string().optional().nullable(),
  systemSizeKw: z.coerce.number().nonnegative().optional().nullable(),
  panelCount: z.coerce.number().int().nonnegative().optional().nullable(),
  systemCost: z.coerce.number().nonnegative().optional().nullable(),
  minSalePriceSnapshot: z.coerce.number().nonnegative().optional().nullable(),
  /** Quote-level discount as percent of system cost (0–100). Linked with discountAmount. */
  discountPercent: z.coerce.number().min(0).max(100).optional().nullable(),
  /** Quote-level discount amount in ₹. Linked with discountPercent. */
  discountAmount: z.coerce.number().nonnegative().optional().nullable(),
  subsidyScheme: z.enum(SUBSIDY_SCHEMES).default("residential"),
  subsidy: z.coerce.number().nonnegative().optional().nullable(),
  meterPhase: z.enum(METER_PHASES).optional().nullable(),
  meterChargeAmount: z.coerce.number().nonnegative().optional().nullable(),
  meterPhaseLabel: z.string().optional().nullable(),
  /** Commercial: ₹/kW exclusive of GST */
  pricePerKwExclGst: z.coerce.number().nonnegative().optional().nullable(),
  /** Commercial: GST % on base price (default 8.9) */
  commercialGstPercent: z.coerce.number().min(0).max(100).optional().nullable(),
  /** Commercial: GEDA charges */
  gedaChargeAmount: z.coerce.number().nonnegative().optional().nullable(),
  /** Commercial: panel mounting option */
  panelMountType: z.enum(PANEL_MOUNT_TYPES).optional().nullable(),
  /** Premium | Regular tier for per-kW solar quotes */
  tierType: z.enum(["premium", "regular"]).default("premium"),
  /** Snapshot of ₹/kW used at quote time (GST inclusive turnkey) */
  ratePerKwSnapshot: z.coerce.number().nonnegative().optional().nullable(),
  /** system cost after discount minus subsidy */
  netPayableAmount: z.coerce.number().nonnegative().optional().nullable(),
});

export type QuotationPayload = z.infer<typeof quotationSchema>;
export type SiteChargesPayload = z.infer<typeof siteChargesSchema>;
