-- ============================================================
-- 016_rate_card.sql — Rate card packages + quotation snapshots
-- Module type → company → system-size packages (list + min sale)
-- ============================================================

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

-- Quotation package snapshots
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

-- RLS
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

-- Seed rate card for every tenant company (idempotent by module type name)
DO $$
DECLARE
  c RECORD;
  mt_topcon700 UUID;
  mt_topcon610 UUID;
  mt_mono UUID;
  co_avaada UUID;
  co_adani610 UUID;
  co_waree UUID;
  co_rayzon UUID;
  co_adani_mono UUID;
BEGIN
  FOR c IN SELECT id FROM companies LOOP
    -- Skip if already seeded
    IF EXISTS (
      SELECT 1 FROM rate_card_module_types
      WHERE company_id = c.id AND name = 'TOPCON (700/710/720WP)'
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO rate_card_module_types (company_id, name, module_family, capacity_label, sort_order)
    VALUES (c.id, 'TOPCON (700/710/720WP)', 'TOPCON', '700/710/720WP', 1)
    RETURNING id INTO mt_topcon700;

    INSERT INTO rate_card_module_types (company_id, name, module_family, capacity_label, sort_order)
    VALUES (c.id, 'TOPCON (610/615/620 WP)', 'TOPCON', '615/620WP', 2)
    RETURNING id INTO mt_topcon610;

    INSERT INTO rate_card_module_types (company_id, name, module_family, capacity_label, sort_order)
    VALUES (c.id, 'MONO BI FACIAL 540WP', 'MONO_BI_FACIAL', '540WP', 3)
    RETURNING id INTO mt_mono;

    INSERT INTO rate_card_companies (company_id, module_type_id, name, sort_order)
    VALUES (c.id, mt_topcon700, 'Avaada', 1) RETURNING id INTO co_avaada;

    INSERT INTO rate_card_companies (company_id, module_type_id, name, sort_order)
    VALUES (c.id, mt_topcon610, 'Adani', 1) RETURNING id INTO co_adani610;

    INSERT INTO rate_card_companies (company_id, module_type_id, name, sort_order)
    VALUES (c.id, mt_topcon610, 'Waree', 2) RETURNING id INTO co_waree;

    INSERT INTO rate_card_companies (company_id, module_type_id, name, sort_order)
    VALUES (c.id, mt_mono, 'Rayzon Solar', 1) RETURNING id INTO co_rayzon;

    INSERT INTO rate_card_companies (company_id, module_type_id, name, sort_order)
    VALUES (c.id, mt_mono, 'Adani', 2) RETURNING id INTO co_adani_mono;

    -- Avaada TOPCON 700 packages
    INSERT INTO rate_card_packages
      (company_id, rate_company_id, system_size_kw, panel_count, list_price, min_sale_price, sort_order)
    VALUES
      (c.id, co_avaada, 2.88, 4, 132000, 132000, 1),
      (c.id, co_avaada, 3.60, 5, 173000, 173000, 2),
      (c.id, co_avaada, 4.32, 6, 205000, 205000, 3),
      (c.id, co_avaada, 5.04, 7, 233000, 233000, 4),
      (c.id, co_avaada, 5.76, 8, 257000, 257000, 5),
      (c.id, co_avaada, 7.90, 9, 280000, 280000, 6),
      (c.id, co_avaada, 10.00, 13, 436000, 436000, 7);

    -- Adani + Waree TOPCON 610 (shared list prices)
    INSERT INTO rate_card_packages
      (company_id, rate_company_id, system_size_kw, panel_count, list_price, min_sale_price, sort_order)
    VALUES
      (c.id, co_adani610, 2.48, 4, 139000, 139000, 1),
      (c.id, co_adani610, 3.10, 5, 163000, 163000, 2),
      (c.id, co_adani610, 3.72, 6, 188000, 188000, 3),
      (c.id, co_adani610, 4.32, 7, 223000, 223000, 4),
      (c.id, co_adani610, 4.96, 8, 254000, 254000, 5),
      (c.id, co_adani610, 5.58, 9, 281000, 281000, 6),
      (c.id, co_adani610, 8.06, 13, 451000, 451000, 7),
      (c.id, co_adani610, 9.92, 16, 529000, 529000, 8),
      (c.id, co_waree, 2.48, 4, 139000, 139000, 1),
      (c.id, co_waree, 3.10, 5, 163000, 163000, 2),
      (c.id, co_waree, 3.72, 6, 188000, 188000, 3),
      (c.id, co_waree, 4.32, 7, 223000, 223000, 4),
      (c.id, co_waree, 4.96, 8, 254000, 254000, 5),
      (c.id, co_waree, 5.58, 9, 281000, 281000, 6),
      (c.id, co_waree, 8.06, 13, 451000, 451000, 7),
      (c.id, co_waree, 9.92, 16, 529000, 529000, 8);

    -- Rayzon Mono
    INSERT INTO rate_card_packages
      (company_id, rate_company_id, system_size_kw, panel_count, list_price, min_sale_price, sort_order)
    VALUES
      (c.id, co_rayzon, 2.18, 4, 111000, 111000, 1),
      (c.id, co_rayzon, 3.24, 6, 148000, 148000, 2),
      (c.id, co_rayzon, 3.78, 7, 170000, 170000, 3),
      (c.id, co_rayzon, 4.32, 8, 194000, 194000, 4),
      (c.id, co_rayzon, 4.86, 9, 219000, 219000, 5),
      (c.id, co_rayzon, 5.40, 10, 238000, 238000, 6),
      (c.id, co_rayzon, 5.94, 11, 256000, 256000, 7),
      (c.id, co_rayzon, 8.10, 15, 393000, 393000, 8),
      (c.id, co_rayzon, 9.72, 18, 456000, 456000, 9);

    -- Adani Mono (higher column)
    INSERT INTO rate_card_packages
      (company_id, rate_company_id, system_size_kw, panel_count, list_price, min_sale_price, sort_order)
    VALUES
      (c.id, co_adani_mono, 2.18, 4, 121000, 121000, 1),
      (c.id, co_adani_mono, 3.24, 6, 163000, 163000, 2),
      (c.id, co_adani_mono, 3.78, 7, 188000, 188000, 3),
      (c.id, co_adani_mono, 4.32, 8, 214000, 214000, 4),
      (c.id, co_adani_mono, 4.86, 9, 241000, 241000, 5),
      (c.id, co_adani_mono, 5.40, 10, 263000, 263000, 6),
      (c.id, co_adani_mono, 5.94, 11, 284000, 284000, 7),
      (c.id, co_adani_mono, 8.10, 15, 431000, 431000, 8),
      (c.id, co_adani_mono, 9.72, 18, 501000, 501000, 9);
  END LOOP;
END $$;
