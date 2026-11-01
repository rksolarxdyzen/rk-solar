-- ============================================================
-- 035_rate_card_flat_panels.sql
-- Flat panel rows on rate_card_companies (panel_name free text)
-- ============================================================

ALTER TABLE rate_card_companies
  ADD COLUMN IF NOT EXISTS panel_name VARCHAR(200);

-- Backfill panel name from module type + brand
UPDATE rate_card_companies rc
SET panel_name = TRIM(
  CASE
    WHEN mt.name IS NOT NULL AND rc.name IS NOT NULL AND mt.name <> rc.name
      THEN mt.name || ' — ' || rc.name
    WHEN mt.name IS NOT NULL THEN mt.name
    ELSE rc.name
  END
)
FROM rate_card_module_types mt
WHERE rc.module_type_id = mt.id
  AND (rc.panel_name IS NULL OR rc.panel_name = '');

UPDATE rate_card_companies
SET panel_name = name
WHERE panel_name IS NULL OR panel_name = '';

ALTER TABLE rate_card_companies
  ALTER COLUMN module_type_id DROP NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_rate_card_companies_tenant_panel_name
  ON rate_card_companies (company_id, panel_name)
  WHERE panel_name IS NOT NULL AND is_active = true;
