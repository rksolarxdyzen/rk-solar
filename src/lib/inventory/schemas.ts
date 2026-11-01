import { z } from "zod";

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .transform((v) => (v ? v : undefined));

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date")
  .optional();

const quantity = z.coerce.number().positive("Quantity must be more than 0").max(1_000_000);
const money = z.coerce.number().min(0, "Cost cannot be negative").max(100_000_000);

export const serialEntrySchema = z.union([
  z.string().trim().min(1).max(120),
  z.object({
    serial_no: z.string().trim().min(1).max(120),
    raw_scan: z.string().max(2000).optional(),
  }),
]);

const serialsSchema = z.array(serialEntrySchema).max(5000).optional();

export const inventoryItemSchema = z.object({
  /** Optional on input — server always overwrites with the composed hierarchy name. */
  name: z.string().trim().max(200).optional(),
  sku: optionalText(80),
  master_group_id: z.uuid("Choose a master group"),
  category_id: z.uuid("Choose a category"),
  subcategory_id: z.uuid("Choose a sub-category"),
  brand_id: z.uuid().nullable().optional(),
  quote_item_id: z.uuid().nullable().optional(),
  unit_type: z.enum(["nos", "kg", "m"]).default("nos"),
  serial_mode: z.enum(["whole", "extract"]).default("whole"),
  serial_pattern: optionalText(300),
  low_stock_threshold: z.coerce.number().min(0).max(1_000_000).default(0),
  specifications: z.record(z.string(), z.unknown()).default({}),
  is_active: z.boolean().default(true),
});
export type InventoryItemInput = z.input<typeof inventoryItemSchema>;

export const itemDefaultCostSchema = z.object({
  default_unit_cost: z.coerce.number().min(0).max(100_000_000).nullable().optional(),
  gst_percent: z.coerce.number().min(0).max(100).nullable().optional(),
});

export const inventoryMasterNameSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
});

export const inventoryCategoryCreateSchema = z.object({
  name: z.string().trim().min(1, "Category name is required").max(80),
  master_group_id: z.uuid().nullable().optional(),
});

export const inventorySubcategoryCreateSchema = z.object({
  category_id: z.uuid("Choose a category"),
  name: z.string().trim().min(1, "Sub-category name is required").max(80),
});

export const inventoryBrandCreateSchema = z.object({
  name: z.string().trim().min(1, "Group name is required").max(120),
});

export const inwardSchema = z.object({
  movement_date: isoDate,
  supplier_name: optionalText(200),
  supplier_invoice_no: optionalText(100),
  supplier_invoice_date: isoDate,
  notes: optionalText(2000),
  is_opening_stock: z.boolean().optional(),
  lines: z
    .array(
      z.object({
        item_id: z.uuid(),
        quantity: quantity.optional(),
        serials: serialsSchema,
        unit_cost: money.optional(),
        gst_percent: z.coerce.number().min(0).max(100).optional(),
        notes: optionalText(500),
      })
    )
    .min(1, "Add at least one item"),
});
export type InwardInput = z.input<typeof inwardSchema>;

export const dispatchSchema = z
  .object({
    lead_id: z.uuid().optional().nullable(),
    party_id: z.uuid().optional().nullable(),
    movement_date: isoDate,
    vehicle_no: optionalText(40),
    delivered_by: optionalText(120),
    notes: optionalText(2000),
    lines: z
      .array(
        z.object({
          item_id: z.uuid(),
          quantity: quantity.optional(),
          serials: serialsSchema,
          notes: optionalText(500),
        })
      )
      .min(1, "Add at least one item"),
  })
  .superRefine((v, ctx) => {
    const hasLead = Boolean(v.lead_id);
    const hasParty = Boolean(v.party_id);
    if (hasLead === hasParty) {
      ctx.addIssue({ code: "custom", message: "Choose a customer or a company / dealer / vendor", path: ["lead_id"] });
    }
  });
export type DispatchInput = z.input<typeof dispatchSchema>;

export const returnSchema = z
  .object({
    lead_id: z.uuid().optional().nullable(),
    party_id: z.uuid().optional().nullable(),
    movement_date: isoDate,
    notes: optionalText(2000),
    lines: z
      .array(
        z.object({
          item_id: z.uuid(),
          quantity: quantity.optional(),
          serials: serialsSchema,
          condition: z.enum(["good", "defective"]).default("good"),
          notes: optionalText(500),
        })
      )
      .min(1, "Add at least one item"),
  })
  .superRefine((v, ctx) => {
    const hasLead = Boolean(v.lead_id);
    const hasParty = Boolean(v.party_id);
    if (hasLead === hasParty) {
      ctx.addIssue({ code: "custom", message: "Choose a customer or a company / dealer / vendor", path: ["lead_id"] });
    }
  });
export type ReturnInput = z.input<typeof returnSchema>;

export const inventoryPartyCreateSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(200),
  kind: z.enum(["company", "dealer", "vendor"]).default("dealer"),
  phone: optionalText(40),
  city: optionalText(120),
  address: optionalText(500),
  gstin: optionalText(20),
});
export type InventoryPartyCreateInput = z.input<typeof inventoryPartyCreateSchema>;

export const inventoryPartyUpdateSchema = inventoryPartyCreateSchema.extend({
  id: z.uuid(),
  is_active: z.boolean().optional(),
});
export type InventoryPartyUpdateInput = z.input<typeof inventoryPartyUpdateSchema>;

export const adjustmentSchema = z.object({
  reason: z.string().trim().min(3, "Enter a reason").max(500),
  movement_date: isoDate,
  notes: optionalText(2000),
  lines: z
    .array(
      z.object({
        item_id: z.uuid(),
        quantity_delta: z.coerce
          .number()
          .refine((n) => n !== 0, "Change cannot be 0")
          .optional(),
        serial_action: z.enum(["scrap", "defective", "restore"]).optional(),
        serials: serialsSchema,
        notes: optionalText(500),
      })
    )
    .min(1, "Add at least one item"),
});
export type AdjustmentInput = z.input<typeof adjustmentSchema>;

export const reverseSchema = z.object({
  movement_id: z.uuid(),
  reason: z.string().trim().min(3, "Enter a reason").max(500),
});

export const openingImportSchema = z.object({
  file_name: optionalText(200),
  movement_date: isoDate,
  new_items: z
    .array(
      z.object({
        key: z.string().min(1).max(200),
        name: z.string().trim().min(1).max(200),
        sku: optionalText(80),
        master_group_id: z.uuid("Choose a master group"),
        category_id: z.uuid("Choose a category"),
        subcategory_id: z.uuid("Choose a sub-category"),
        brand_id: z.uuid().nullable().optional(),
        unit_type: z.enum(["nos", "kg", "m"]).optional(),
        low_stock_threshold: z.coerce.number().min(0).optional(),
      })
    )
    .max(500)
    .optional(),
  lines: z
    .array(
      z
        .object({
          item_id: z.uuid().optional(),
          item_key: z.string().min(1).max(200).optional(),
          quantity: quantity.optional(),
          serials: serialsSchema,
          unit_cost: money.optional(),
          notes: optionalText(500),
        })
        .refine((l) => l.item_id || l.item_key, "Each row needs an item")
    )
    .min(1, "The file has no stock rows")
    .max(5000),
});
export type OpeningImportInput = z.input<typeof openingImportSchema>;

export const checkSerialsSchema = z.object({
  item_id: z.uuid(),
  serials: z.array(z.string().max(2000)).min(1).max(500),
  mode: z.enum(["inward", "dispatch", "return"]),
  lead_id: z.uuid().optional(),
  party_id: z.uuid().optional(),
});
