-- ============================================================
-- 034_quotation_per_kw_rate_card.sql
-- Per-kW turnkey rates on rate card companies + quotation tier
-- ============================================================

ALTER TABLE rate_card_companies
  ADD COLUMN IF NOT EXISTS panel_wattage INT,
  ADD COLUMN IF NOT EXISTS residential_regular_rate_per_kw NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS residential_premium_rate_per_kw NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS commercial_regular_rate_per_kw NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS commercial_premium_rate_per_kw NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS use_per_kw_pricing BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS tier_type VARCHAR(20) NOT NULL DEFAULT 'premium',
  ADD COLUMN IF NOT EXISTS rate_per_kw_snapshot NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS net_payable_amount NUMERIC(14,2);

ALTER TABLE quotations DROP CONSTRAINT IF EXISTS quotations_tier_type_check;
ALTER TABLE quotations
  ADD CONSTRAINT quotations_tier_type_check CHECK (tier_type IN ('premium', 'regular'));

-- Backfill panel wattage from module type capacity label
UPDATE rate_card_companies rc
SET panel_wattage = sub.wattage
FROM (
  SELECT
    rc2.id,
    CASE
      WHEN mt.capacity_label ~* '540' THEN 540
      WHEN mt.capacity_label ~* '545' THEN 545
      WHEN mt.capacity_label ~* '550' THEN 550
      WHEN mt.capacity_label ~* '610|615|620' THEN 615
      WHEN mt.capacity_label ~* '700|710|720' THEN 720
      ELSE 540
    END AS wattage
  FROM rate_card_companies rc2
  JOIN rate_card_module_types mt ON mt.id = rc2.module_type_id
  WHERE rc2.panel_wattage IS NULL
) sub
WHERE rc.id = sub.id;

-- Backfill per-kW rates from existing lump-sum packages (avg list / kW)
UPDATE rate_card_companies rc
SET
  residential_regular_rate_per_kw = ROUND(sub.avg_rate, 0),
  residential_premium_rate_per_kw = ROUND(sub.avg_rate * 1.08, 0),
  commercial_regular_rate_per_kw = ROUND(sub.avg_rate * 0.94, 0),
  commercial_premium_rate_per_kw = ROUND(sub.avg_rate * 1.02, 0)
FROM (
  SELECT
    rc2.id,
    AVG(p.list_price / NULLIF(p.system_size_kw, 0)) AS avg_rate
  FROM rate_card_companies rc2
  JOIN rate_card_packages p ON p.rate_company_id = rc2.id AND p.is_active = true
  GROUP BY rc2.id
  HAVING AVG(p.list_price / NULLIF(p.system_size_kw, 0)) > 0
) sub
WHERE rc.id = sub.id
  AND rc.residential_regular_rate_per_kw IS NULL;

-- Spec-aligned overrides for common panel brands (when present)
UPDATE rate_card_companies rc
SET
  panel_wattage = 540,
  residential_regular_rate_per_kw = 48000,
  residential_premium_rate_per_kw = 52000,
  commercial_regular_rate_per_kw = 45000,
  commercial_premium_rate_per_kw = 49000
FROM rate_card_module_types mt
WHERE rc.module_type_id = mt.id
  AND rc.name ILIKE '%adani%'
  AND mt.capacity_label ~* '540';

UPDATE rate_card_companies rc
SET
  panel_wattage = 545,
  residential_regular_rate_per_kw = 50000,
  residential_premium_rate_per_kw = 55000,
  commercial_regular_rate_per_kw = 47000,
  commercial_premium_rate_per_kw = 51000
FROM rate_card_module_types mt
WHERE rc.module_type_id = mt.id
  AND rc.name ILIKE '%waaree%'
  AND mt.capacity_label ~* '540|545';

UPDATE rate_card_companies rc
SET
  panel_wattage = 550,
  residential_regular_rate_per_kw = 52000,
  residential_premium_rate_per_kw = 57000,
  commercial_regular_rate_per_kw = 49000,
  commercial_premium_rate_per_kw = 53000
FROM rate_card_module_types mt
WHERE rc.module_type_id = mt.id
  AND rc.name ILIKE '%goldi%';
