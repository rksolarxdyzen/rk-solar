-- ============================================================
-- Seed solar quotation options for RK Solar
-- Run in Supabase SQL editor (re-runnable / idempotent).
--
-- Creates rate_card_* tables if missing (same as 016_rate_card.sql),
-- then seeds packages + catalogue inverters/modules.
--
-- What this fills:
--   1) Rate card: Module type → Panel brand → kW/panel packages
--      (used by New Quotation → Solar builder)
--   2) Catalogue: On-grid inverters (+ a few PV module SKUs for BOM)
--
-- Tenant company id (demo / RK):
--   a0000000-0000-4000-8000-000000000001
-- ============================================================

-- ----------------------------------------------------------
-- Schema (safe if 016 already applied)
-- ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_card_module_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  module_family VARCHAR(40) NOT NULL,
  capacity_label VARCHAR(60) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

CREATE TABLE IF NOT EXISTS rate_card_companies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  module_type_id UUID NOT NULL REFERENCES rate_card_module_types(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (module_type_id, name)
);
CREATE INDEX IF NOT EXISTS idx_rate_card_companies_module ON rate_card_companies(module_type_id);
CREATE INDEX IF NOT EXISTS idx_rate_card_companies_tenant ON rate_card_companies(company_id);

CREATE TABLE IF NOT EXISTS rate_card_packages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  rate_company_id UUID NOT NULL REFERENCES rate_card_companies(id) ON DELETE CASCADE,
  system_size_kw NUMERIC(8,2) NOT NULL,
  panel_count INT NOT NULL CHECK (panel_count > 0),
  list_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  min_sale_price NUMERIC(14,2) NOT NULL DEFAULT 0,
  sort_order INT NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (rate_company_id, system_size_kw, panel_count)
);
CREATE INDEX IF NOT EXISTS idx_rate_card_packages_rate_co ON rate_card_packages(rate_company_id);
CREATE INDEX IF NOT EXISTS idx_rate_card_packages_tenant ON rate_card_packages(company_id);

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS rate_package_id UUID REFERENCES rate_card_packages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS module_type_name VARCHAR(120),
  ADD COLUMN IF NOT EXISTS module_company_name VARCHAR(120),
  ADD COLUMN IF NOT EXISTS module_capacity_label VARCHAR(60),
  ADD COLUMN IF NOT EXISTS system_size_kw NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS panel_count INT,
  ADD COLUMN IF NOT EXISTS system_cost NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS min_sale_price_snapshot NUMERIC(14,2);

CREATE INDEX IF NOT EXISTS idx_quotations_rate_package ON quotations(rate_package_id);

ALTER TABLE rate_card_module_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_card_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE rate_card_packages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rate_card_module_types_select ON rate_card_module_types;
CREATE POLICY rate_card_module_types_select ON rate_card_module_types FOR SELECT
  USING (company_id = auth_company_id() AND is_active_user());

DROP POLICY IF EXISTS rate_card_module_types_manage ON rate_card_module_types;
CREATE POLICY rate_card_module_types_manage ON rate_card_module_types FOR ALL
  USING (company_id = auth_company_id() AND has_authority('manage_catalog_items'))
  WITH CHECK (company_id = auth_company_id() AND has_authority('manage_catalog_items'));

DROP POLICY IF EXISTS rate_card_companies_select ON rate_card_companies;
CREATE POLICY rate_card_companies_select ON rate_card_companies FOR SELECT
  USING (company_id = auth_company_id() AND is_active_user());

DROP POLICY IF EXISTS rate_card_companies_manage ON rate_card_companies;
CREATE POLICY rate_card_companies_manage ON rate_card_companies FOR ALL
  USING (company_id = auth_company_id() AND has_authority('manage_catalog_items'))
  WITH CHECK (company_id = auth_company_id() AND has_authority('manage_catalog_items'));

DROP POLICY IF EXISTS rate_card_packages_select ON rate_card_packages;
CREATE POLICY rate_card_packages_select ON rate_card_packages FOR SELECT
  USING (company_id = auth_company_id() AND is_active_user());

DROP POLICY IF EXISTS rate_card_packages_manage ON rate_card_packages;
CREATE POLICY rate_card_packages_manage ON rate_card_packages FOR ALL
  USING (company_id = auth_company_id() AND has_authority('manage_catalog_items'))
  WITH CHECK (company_id = auth_company_id() AND has_authority('manage_catalog_items'));

-- ----------------------------------------------------------
-- Seed data
-- ----------------------------------------------------------
DO $$
DECLARE
  cid UUID := 'a0000000-0000-4000-8000-000000000001';

  -- Rate card module types
  mt_topcon720 UUID;
  mt_topcon610 UUID;
  mt_mono540 UUID;
  mt_hjt700 UUID;

  -- Rate card brands (panel companies)
  co_avaada UUID;
  co_adani720 UUID;
  co_adani610 UUID;
  co_waaree610 UUID;
  co_rayzon UUID;
  co_renewsys UUID;

  -- Catalogue categories / brands
  c_modules UUID;
  c_inverters UUID;
  b_adani UUID;
  b_waaree UUID;
  b_polycab UUID;
  b_sungrow UUID;
  b_growatt UUID;
  b_vsole UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM companies WHERE id = cid) THEN
    RAISE EXCEPTION 'Company % not found. Update cid to your companies.id', cid;
  END IF;

  -- ----------------------------------------------------------
  -- 1) RATE CARD — module types
  -- ----------------------------------------------------------
  INSERT INTO rate_card_module_types (company_id, name, module_family, capacity_label, sort_order)
  VALUES (cid, 'TOPCON (700/710/720WP)', 'TOPCON', '700/710/720WP', 1)
  ON CONFLICT (company_id, name) DO UPDATE
    SET module_family = EXCLUDED.module_family,
        capacity_label = EXCLUDED.capacity_label,
        sort_order = EXCLUDED.sort_order,
        is_active = true
  RETURNING id INTO mt_topcon720;
  SELECT id INTO mt_topcon720 FROM rate_card_module_types
  WHERE company_id = cid AND name = 'TOPCON (700/710/720WP)';

  INSERT INTO rate_card_module_types (company_id, name, module_family, capacity_label, sort_order)
  VALUES (cid, 'TOPCON (610/615/620 WP)', 'TOPCON', '615/620WP', 2)
  ON CONFLICT (company_id, name) DO UPDATE
    SET module_family = EXCLUDED.module_family,
        capacity_label = EXCLUDED.capacity_label,
        sort_order = EXCLUDED.sort_order,
        is_active = true
  RETURNING id INTO mt_topcon610;
  SELECT id INTO mt_topcon610 FROM rate_card_module_types
  WHERE company_id = cid AND name = 'TOPCON (610/615/620 WP)';

  INSERT INTO rate_card_module_types (company_id, name, module_family, capacity_label, sort_order)
  VALUES (cid, 'MONO BI FACIAL 540WP', 'MONO_BI_FACIAL', '540WP', 3)
  ON CONFLICT (company_id, name) DO UPDATE
    SET module_family = EXCLUDED.module_family,
        capacity_label = EXCLUDED.capacity_label,
        sort_order = EXCLUDED.sort_order,
        is_active = true
  RETURNING id INTO mt_mono540;
  SELECT id INTO mt_mono540 FROM rate_card_module_types
  WHERE company_id = cid AND name = 'MONO BI FACIAL 540WP';

  INSERT INTO rate_card_module_types (company_id, name, module_family, capacity_label, sort_order)
  VALUES (cid, 'HJT (690/700WP)', 'HJT', '700WP', 4)
  ON CONFLICT (company_id, name) DO UPDATE
    SET module_family = EXCLUDED.module_family,
        capacity_label = EXCLUDED.capacity_label,
        sort_order = EXCLUDED.sort_order,
        is_active = true
  RETURNING id INTO mt_hjt700;
  SELECT id INTO mt_hjt700 FROM rate_card_module_types
  WHERE company_id = cid AND name = 'HJT (690/700WP)';

  -- ----------------------------------------------------------
  -- Panel brands under each module type
  -- ----------------------------------------------------------
  INSERT INTO rate_card_companies (company_id, module_type_id, name, sort_order)
  VALUES (cid, mt_topcon720, 'Avaada', 1)
  ON CONFLICT (module_type_id, name) DO UPDATE SET is_active = true, sort_order = EXCLUDED.sort_order
  RETURNING id INTO co_avaada;
  SELECT id INTO co_avaada FROM rate_card_companies WHERE module_type_id = mt_topcon720 AND name = 'Avaada';

  INSERT INTO rate_card_companies (company_id, module_type_id, name, sort_order)
  VALUES (cid, mt_topcon720, 'Adani', 2)
  ON CONFLICT (module_type_id, name) DO UPDATE SET is_active = true, sort_order = EXCLUDED.sort_order
  RETURNING id INTO co_adani720;
  SELECT id INTO co_adani720 FROM rate_card_companies WHERE module_type_id = mt_topcon720 AND name = 'Adani';

  INSERT INTO rate_card_companies (company_id, module_type_id, name, sort_order)
  VALUES (cid, mt_topcon610, 'Adani', 1)
  ON CONFLICT (module_type_id, name) DO UPDATE SET is_active = true, sort_order = EXCLUDED.sort_order
  RETURNING id INTO co_adani610;
  SELECT id INTO co_adani610 FROM rate_card_companies WHERE module_type_id = mt_topcon610 AND name = 'Adani';

  INSERT INTO rate_card_companies (company_id, module_type_id, name, sort_order)
  VALUES (cid, mt_topcon610, 'Waaree', 2)
  ON CONFLICT (module_type_id, name) DO UPDATE SET is_active = true, sort_order = EXCLUDED.sort_order
  RETURNING id INTO co_waaree610;
  SELECT id INTO co_waaree610 FROM rate_card_companies WHERE module_type_id = mt_topcon610 AND name = 'Waaree';

  INSERT INTO rate_card_companies (company_id, module_type_id, name, sort_order)
  VALUES (cid, mt_mono540, 'Rayzon Solar', 1)
  ON CONFLICT (module_type_id, name) DO UPDATE SET is_active = true, sort_order = EXCLUDED.sort_order
  RETURNING id INTO co_rayzon;
  SELECT id INTO co_rayzon FROM rate_card_companies WHERE module_type_id = mt_mono540 AND name = 'Rayzon Solar';

  INSERT INTO rate_card_companies (company_id, module_type_id, name, sort_order)
  VALUES (cid, mt_hjt700, 'RenewSys', 1)
  ON CONFLICT (module_type_id, name) DO UPDATE SET is_active = true, sort_order = EXCLUDED.sort_order
  RETURNING id INTO co_renewsys;
  SELECT id INTO co_renewsys FROM rate_card_companies WHERE module_type_id = mt_hjt700 AND name = 'RenewSys';

  -- ----------------------------------------------------------
  -- System size packages (kW + panel count + list/min price)
  -- ON CONFLICT updates prices if the package already exists
  -- ----------------------------------------------------------
  INSERT INTO rate_card_packages
    (company_id, rate_company_id, system_size_kw, panel_count, list_price, min_sale_price, sort_order)
  VALUES
    -- Avaada TOPCON 720
    (cid, co_avaada, 2.88, 4, 132000, 132000, 1),
    (cid, co_avaada, 3.60, 5, 173000, 173000, 2),
    (cid, co_avaada, 4.32, 6, 205000, 205000, 3),
    (cid, co_avaada, 5.04, 7, 233000, 233000, 4),
    (cid, co_avaada, 5.76, 8, 257000, 257000, 5),
    (cid, co_avaada, 7.20, 10, 310000, 310000, 6),
    (cid, co_avaada, 10.08, 14, 450000, 450000, 7),
    -- Adani TOPCON 720
    (cid, co_adani720, 2.88, 4, 138000, 138000, 1),
    (cid, co_adani720, 3.60, 5, 179000, 179000, 2),
    (cid, co_adani720, 5.04, 7, 245000, 245000, 3),
    (cid, co_adani720, 7.20, 10, 325000, 325000, 4),
    (cid, co_adani720, 10.08, 14, 470000, 470000, 5),
    -- Adani TOPCON 610
    (cid, co_adani610, 2.48, 4, 139000, 139000, 1),
    (cid, co_adani610, 3.10, 5, 163000, 163000, 2),
    (cid, co_adani610, 3.72, 6, 188000, 188000, 3),
    (cid, co_adani610, 4.96, 8, 254000, 254000, 4),
    (cid, co_adani610, 6.20, 10, 310000, 310000, 5),
    (cid, co_adani610, 9.92, 16, 529000, 529000, 6),
    -- Waaree TOPCON 610
    (cid, co_waaree610, 2.48, 4, 139000, 139000, 1),
    (cid, co_waaree610, 3.10, 5, 163000, 163000, 2),
    (cid, co_waaree610, 3.72, 6, 188000, 188000, 3),
    (cid, co_waaree610, 4.96, 8, 254000, 254000, 4),
    (cid, co_waaree610, 6.20, 10, 310000, 310000, 5),
    (cid, co_waaree610, 9.92, 16, 529000, 529000, 6),
    -- Rayzon Mono 540
    (cid, co_rayzon, 2.16, 4, 111000, 111000, 1),
    (cid, co_rayzon, 3.24, 6, 148000, 148000, 2),
    (cid, co_rayzon, 4.32, 8, 194000, 194000, 3),
    (cid, co_rayzon, 5.40, 10, 238000, 238000, 4),
    (cid, co_rayzon, 8.10, 15, 393000, 393000, 5),
    -- RenewSys HJT 700
    (cid, co_renewsys, 2.80, 4, 145000, 145000, 1),
    (cid, co_renewsys, 4.20, 6, 210000, 210000, 2),
    (cid, co_renewsys, 5.60, 8, 275000, 275000, 3),
    (cid, co_renewsys, 7.00, 10, 335000, 335000, 4),
    (cid, co_renewsys, 10.50, 15, 485000, 485000, 5)
  ON CONFLICT (rate_company_id, system_size_kw, panel_count) DO UPDATE
    SET list_price = EXCLUDED.list_price,
        min_sale_price = EXCLUDED.min_sale_price,
        sort_order = EXCLUDED.sort_order,
        is_active = true;

  -- ----------------------------------------------------------
  -- 2) CATALOGUE — inverters + module SKUs (BOM / inverter picker)
  -- ----------------------------------------------------------
  INSERT INTO quote_item_categories (company_id, name, kind, sort_order)
  VALUES
    (cid, 'PV Modules', 'solar', 10),
    (cid, 'On-Grid Inverters', 'solar', 20)
  ON CONFLICT (company_id, name) DO UPDATE
    SET kind = EXCLUDED.kind, sort_order = EXCLUDED.sort_order;

  SELECT id INTO c_modules FROM quote_item_categories WHERE company_id = cid AND name = 'PV Modules';
  SELECT id INTO c_inverters FROM quote_item_categories WHERE company_id = cid AND name = 'On-Grid Inverters';

  INSERT INTO quote_brands (company_id, name, category) VALUES
    (cid, 'Adani', 'module'),
    (cid, 'Waaree', 'module'),
    (cid, 'Polycab', 'inverter'),
    (cid, 'Sungrow', 'inverter'),
    (cid, 'Growatt', 'inverter'),
    (cid, 'VSOLE', 'inverter')
  ON CONFLICT (company_id, name) DO NOTHING;

  SELECT id INTO b_adani FROM quote_brands WHERE company_id = cid AND name = 'Adani';
  SELECT id INTO b_waaree FROM quote_brands WHERE company_id = cid AND name = 'Waaree';
  SELECT id INTO b_polycab FROM quote_brands WHERE company_id = cid AND name = 'Polycab';
  SELECT id INTO b_sungrow FROM quote_brands WHERE company_id = cid AND name = 'Sungrow';
  SELECT id INTO b_growatt FROM quote_brands WHERE company_id = cid AND name = 'Growatt';
  SELECT id INTO b_vsole FROM quote_brands WHERE company_id = cid AND name = 'VSOLE';

  -- PV modules (optional BOM rows; rate card still drives package pricing)
  INSERT INTO quote_items (
    company_id, brand_id, category_id, item_name, model, capacity_label,
    unit, gst_percent, base_rate, template_kind, is_active
  )
  SELECT v.*
  FROM (VALUES
    (cid, b_adani, c_modules, 'Adani TOPCON Bifacial Module', 'ASF-720', '720 Wp', 'pcs', 12::numeric, 0::numeric, 'solar', true),
    (cid, b_adani, c_modules, 'Adani TOPCON Bifacial Module', 'ASF-615', '615 Wp', 'pcs', 12::numeric, 0::numeric, 'solar', true),
    (cid, b_waaree, c_modules, 'Waaree TOPCON Bifacial Module', 'WS-620', '620 Wp', 'pcs', 12::numeric, 0::numeric, 'solar', true),
    (cid, b_waaree, c_modules, 'Waaree Mono Bifacial Module', 'WS-540', '540 Wp', 'pcs', 12::numeric, 0::numeric, 'solar', true)
  ) AS v(company_id, brand_id, category_id, item_name, model, capacity_label, unit, gst_percent, base_rate, template_kind, is_active)
  WHERE NOT EXISTS (
    SELECT 1 FROM quote_items qi
    WHERE qi.company_id = v.company_id AND qi.item_name = v.item_name AND qi.model = v.model
  );

  -- On-grid inverters (required for solar quotation inverter dropdown)
  INSERT INTO quote_items (
    company_id, brand_id, category_id, item_name, model, capacity_label,
    unit, gst_percent, base_rate, template_kind, is_active
  )
  SELECT v.*
  FROM (VALUES
    (cid, b_polycab, c_inverters, 'Polycab On-Grid Inverter', 'PC-3K', '3 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_polycab, c_inverters, 'Polycab On-Grid Inverter', 'PC-5K', '5 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_sungrow, c_inverters, 'Sungrow On-Grid Inverter', 'SG5.0RT', '5 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_sungrow, c_inverters, 'Sungrow On-Grid Inverter', 'SG8.0RT', '8 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_growatt, c_inverters, 'Growatt On-Grid Inverter', 'MIN 3000TL-X', '3 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_growatt, c_inverters, 'Growatt On-Grid Inverter', 'MIN 5000TL-X', '5 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_vsole, c_inverters, 'VSOLE On-Grid Inverter', 'VS-5K', '5 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_vsole, c_inverters, 'VSOLE On-Grid Inverter', 'VS-10K', '10 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true)
  ) AS v(company_id, brand_id, category_id, item_name, model, capacity_label, unit, gst_percent, base_rate, template_kind, is_active)
  WHERE NOT EXISTS (
    SELECT 1 FROM quote_items qi
    WHERE qi.company_id = v.company_id AND qi.item_name = v.item_name AND qi.model = v.model
  );

  RAISE NOTICE 'Solar rate card + catalogue seed complete for company %', cid;
END $$;

-- Optional checks:
-- SELECT name, module_family, capacity_label FROM rate_card_module_types WHERE company_id = 'a0000000-0000-4000-8000-000000000001' ORDER BY sort_order;
-- SELECT mt.name AS module, rc.name AS brand, COUNT(p.id) AS packages
-- FROM rate_card_module_types mt
-- JOIN rate_card_companies rc ON rc.module_type_id = mt.id
-- LEFT JOIN rate_card_packages p ON p.rate_company_id = rc.id
-- WHERE mt.company_id = 'a0000000-0000-4000-8000-000000000001'
-- GROUP BY mt.name, rc.name ORDER BY mt.name, rc.name;
-- SELECT item_name, model, capacity_label FROM quote_items
-- WHERE company_id = 'a0000000-0000-4000-8000-000000000001' AND template_kind = 'solar' AND is_active
-- ORDER BY item_name, model;
