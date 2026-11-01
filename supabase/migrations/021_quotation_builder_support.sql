-- ============================================================
-- 021_quotation_builder_support.sql
-- Columns required by the rate-card solar quotation builder:
-- site charges snapshot, line-item image snapshots, quotation
-- numbering formats, and catalog/brand image storage.
-- ============================================================

-- Site charges (height / floor access) snapshot on the quotation
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS site_charges JSONB;

COMMENT ON COLUMN public.quotations.site_charges IS
  'Snapshot of height / floor access charges configured on the quotation.';

-- Image snapshots printed on the BOM
ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS image_url_snapshot TEXT,
  ADD COLUMN IF NOT EXISTS brand_image_url_snapshot TEXT;

-- Catalog item extras used by the item master / image upload actions
ALTER TABLE quote_items
  ADD COLUMN IF NOT EXISTS image_storage_path TEXT,
  ADD COLUMN IF NOT EXISTS aliases TEXT;

-- Brand logos (BOM "Brand" column)
ALTER TABLE quote_brands
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS logo_storage_path TEXT;

-- Quotation numbering formats + stored template / bank details
ALTER TABLE quotation_company_settings
  ADD COLUMN IF NOT EXISTS quotation_numbering_format VARCHAR(40) NOT NULL DEFAULT 'prefix_year_seq',
  ADD COLUMN IF NOT EXISTS quotation_numbering_period VARCHAR(20),
  ADD COLUMN IF NOT EXISTS quotation_notes_footer TEXT,
  ADD COLUMN IF NOT EXISTS quotation_template JSONB,
  ADD COLUMN IF NOT EXISTS bank_account_name VARCHAR(160),
  ADD COLUMN IF NOT EXISTS bank_name VARCHAR(160),
  ADD COLUMN IF NOT EXISTS account_number VARCHAR(60),
  ADD COLUMN IF NOT EXISTS ifsc_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS branch VARCHAR(120);
