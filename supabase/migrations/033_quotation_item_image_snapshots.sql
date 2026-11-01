-- Ensure quotation line-item image snapshots exist (required for premium/general BOM quotes).
-- Safe to re-run if migration 021 was skipped or partially applied.

ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS image_url_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS brand_image_url_snapshot TEXT;
