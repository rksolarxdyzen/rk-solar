export type InventoryUnit = "nos" | "kg" | "m";
export type InventoryMovementType =
  | "inward"
  | "dispatch"
  | "return"
  | "service_issue"
  | "adjustment"
  | "reversal";
export type SerialStatus = "in_stock" | "dispatched" | "defective" | "scrapped";
export type SerialScanMode = "whole" | "extract";
export type ReturnCondition = "good" | "defective";
export type SerialAction = "scrap" | "defective" | "restore";
export type SerialCheckMode = "inward" | "dispatch" | "return";
export type InventoryPartyKind = "company" | "dealer" | "vendor";

export const INVENTORY_PARTY_KIND_LABELS: Record<InventoryPartyKind, string> = {
  company: "Company",
  dealer: "Dealer",
  vendor: "Vendor",
};

export interface InventoryParty {
  id: string;
  name: string;
  kind: InventoryPartyKind;
  phone: string | null;
  city: string | null;
  address: string | null;
  gstin: string | null;
  is_active: boolean;
}

export const INVENTORY_UNIT_LABELS: Record<InventoryUnit, string> = {
  nos: "Nos",
  kg: "Kg",
  m: "Meter",
};

export const MOVEMENT_TYPE_LABELS: Record<InventoryMovementType, string> = {
  inward: "Inward",
  dispatch: "Dispatch",
  return: "Return",
  service_issue: "Service issue",
  adjustment: "Adjustment",
  reversal: "Reversal",
};

export const SERIAL_STATUS_LABELS: Record<SerialStatus, string> = {
  in_stock: "In stock",
  dispatched: "Dispatched",
  defective: "Defective",
  scrapped: "Scrapped",
};

export interface InventoryItem {
  id: string;
  company_id: string;
  name: string;
  sku: string | null;
  master_group_id: string | null;
  category_id: string | null;
  subcategory_id: string | null;
  brand_id: string | null;
  quote_item_id: string | null;
  unit_type: InventoryUnit;
  track_serials: boolean;
  serial_mode: SerialScanMode;
  serial_pattern: string | null;
  low_stock_threshold: number;
  specifications: Record<string, unknown>;
  image_path: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface StockOnHandRow {
  item_id: string;
  company_id: string;
  name: string;
  sku: string | null;
  master_group_id: string | null;
  category_id: string | null;
  subcategory_id: string | null;
  brand_id: string | null;
  unit_type: InventoryUnit;
  track_serials: boolean;
  low_stock_threshold: number;
  image_path: string | null;
  is_active: boolean;
  on_hand: number;
  serials_dispatched: number;
  serials_defective: number;
  is_out: boolean;
  is_low: boolean;
}

export interface StockValueRow {
  company_id: string;
  item_id: string;
  on_hand: number;
  stock_value: number | null;
  unit_cost: number | null;
  missing_cost_count: number;
}

export interface CustomerMaterialRow {
  company_id: string;
  lead_id: string;
  item_id: string;
  dispatched: number;
  returned: number;
  used: number;
  last_movement_date: string | null;
}

export interface InventoryMovement {
  id: string;
  company_id: string;
  movement_type: InventoryMovementType;
  movement_no: string;
  is_opening_stock: boolean;
  lead_id: string | null;
  party_id: string | null;
  ticket_id: string | null;
  supplier_name: string | null;
  supplier_invoice_no: string | null;
  supplier_invoice_date: string | null;
  vehicle_no: string | null;
  delivered_by: string | null;
  movement_date: string;
  reason: string | null;
  notes: string | null;
  reverses_id: string | null;
  reversed_by_id: string | null;
  created_by: string | null;
  created_at: string;
}

export interface InventorySerial {
  id: string;
  company_id: string;
  item_id: string;
  serial_no: string;
  status: SerialStatus;
  current_lead_id: string | null;
  current_party_id: string | null;
  inward_line_id: string | null;
  raw_scan: string | null;
  created_at: string;
  updated_at: string;
}

export interface SerialCheckResult {
  input: string;
  serial_no: string | null;
  ok: boolean;
  message: string | null;
}

export interface PostedMovement {
  id: string;
  movement_no: string;
  serials?: number;
}

export interface OpeningImportResult {
  movements: number;
  serials: number;
  items_created: number;
}
