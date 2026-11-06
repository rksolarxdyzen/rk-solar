-- RK Solar — Module 3 quotations (lean catalog + lead-linked quotes)

-- ============================================================
-- EXTEND sales_stage ENUM
-- ============================================================
ALTER TYPE sales_stage ADD VALUE IF NOT EXISTS 'quoted' AFTER 'survey_completed';
ALTER TYPE sales_stage ADD VALUE IF NOT EXISTS 'quote_accepted' AFTER 'quoted';

-- ============================================================
-- AUTHORITIES
-- ============================================================
INSERT INTO authorities (key, label, authority_group) VALUES
  ('view_quotations', 'View Quotations', 'sales'),
  ('create_quotations', 'Create Quotations', 'sales'),
  ('manage_quotations', 'Manage Quotations', 'sales'),
  ('edit_quotation_pricing', 'Edit Quotation Pricing', 'sales'),
  ('accept_quotations', 'Accept Quotations', 'sales'),
  ('manage_catalog_items', 'Manage Catalog Items', 'sales')
ON CONFLICT (key) DO NOTHING;

DO $$
DECLARE
  cid UUID := 'a0000000-0000-4000-8000-000000000001';
  r_admin UUID;
  r_mgr UUID;
BEGIN
  SELECT id INTO r_admin FROM roles WHERE company_id = cid AND slug = 'admin';
  SELECT id INTO r_mgr FROM roles WHERE company_id = cid AND slug = 'sales_manager';

  IF r_admin IS NOT NULL THEN
    INSERT INTO role_authorities (role_id, authority_key, granted)
    SELECT r_admin, key, true FROM (VALUES
      ('view_quotations'),
      ('create_quotations'),
      ('manage_quotations'),
      ('edit_quotation_pricing'),
      ('accept_quotations'),
      ('manage_catalog_items')
    ) AS v(key)
    ON CONFLICT DO NOTHING;
  END IF;

  IF r_mgr IS NOT NULL THEN
    INSERT INTO role_authorities (role_id, authority_key, granted) VALUES
      (r_mgr, 'view_quotations', true),
      (r_mgr, 'create_quotations', true),
      (r_mgr, 'manage_quotations', true),
      (r_mgr, 'edit_quotation_pricing', true),
      (r_mgr, 'accept_quotations', true),
      (r_mgr, 'manage_catalog_items', true)
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ============================================================
-- CATALOG
-- ============================================================
CREATE TABLE quote_item_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  kind VARCHAR(20) NOT NULL DEFAULT 'solar', -- solar | non_solar | both
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, name)
);

CREATE TABLE quote_brands (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(120) NOT NULL,
  category VARCHAR(40),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, name)
);

CREATE TABLE quote_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  brand_id UUID REFERENCES quote_brands(id) ON DELETE SET NULL,
  category_id UUID REFERENCES quote_item_categories(id) ON DELETE SET NULL,
  item_name VARCHAR(200) NOT NULL,
  model VARCHAR(120),
  capacity_label VARCHAR(60),
  unit VARCHAR(24) NOT NULL DEFAULT 'pcs',
  gst_percent NUMERIC(5,2) NOT NULL DEFAULT 18,
  base_rate NUMERIC(14,2) NOT NULL DEFAULT 0,
  template_kind VARCHAR(20) NOT NULL DEFAULT 'both', -- solar | non_solar | both
  warranty_text TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quote_items_company ON quote_items(company_id);
CREATE INDEX idx_quote_items_kind ON quote_items(company_id, template_kind);

CREATE TABLE quotation_company_settings (
  company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  quotation_prefix VARCHAR(24) NOT NULL DEFAULT 'RKS',
  quotation_next_number INT NOT NULL DEFAULT 1,
  quotation_number_padding INT NOT NULL DEFAULT 4,
  quotation_terms TEXT,
  from_name VARCHAR(160),
  from_phone VARCHAR(40),
  from_email VARCHAR(160),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- QUOTATIONS
-- ============================================================
CREATE TABLE quotations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  quotation_no VARCHAR(60) NOT NULL,
  lead_id UUID REFERENCES leads(id) ON DELETE SET NULL,
  template_kind VARCHAR(20) NOT NULL DEFAULT 'solar', -- solar | non_solar
  customer_name VARCHAR(200) NOT NULL,
  customer_phone VARCHAR(40),
  customer_address TEXT,
  customer_city VARCHAR(100),
  status VARCHAR(20) NOT NULL DEFAULT 'draft', -- draft | sent | accepted | rejected
  quote_date DATE NOT NULL DEFAULT CURRENT_DATE,
  valid_till DATE,
  system_size_kw NUMERIC(8,2),
  meter_charges NUMERIC(14,2) NOT NULL DEFAULT 0,
  subsidy NUMERIC(14,2) NOT NULL DEFAULT 0,
  subtotal NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_percent NUMERIC(5,2) NOT NULL DEFAULT 0,
  taxable_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  gst_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  grand_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes TEXT,
  terms TEXT,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, quotation_no)
);

CREATE INDEX idx_quotations_company ON quotations(company_id);
CREATE INDEX idx_quotations_lead ON quotations(lead_id);
CREATE INDEX idx_quotations_status ON quotations(company_id, status);

CREATE TABLE quotation_items (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  quotation_id UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  item_id UUID REFERENCES quote_items(id) ON DELETE SET NULL,
  sort_order INT NOT NULL DEFAULT 0,
  item_name_snapshot VARCHAR(200) NOT NULL,
  brand_snapshot VARCHAR(120),
  model_snapshot VARCHAR(120),
  quantity NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit VARCHAR(24) NOT NULL DEFAULT 'pcs',
  rate NUMERIC(14,2) NOT NULL DEFAULT 0,
  gst_percent NUMERIC(5,2) NOT NULL DEFAULT 18,
  discount_value NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_quotation_items_quotation ON quotation_items(quotation_id);

-- ============================================================
-- RLS
-- ============================================================
ALTER TABLE quote_item_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotation_company_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotation_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY quote_item_categories_select ON quote_item_categories FOR SELECT
  USING (company_id = auth_company_id() AND is_active_user());
CREATE POLICY quote_item_categories_manage ON quote_item_categories FOR ALL
  USING (company_id = auth_company_id() AND (has_authority('manage_catalog_items') OR has_authority('full_access')))
  WITH CHECK (company_id = auth_company_id() AND (has_authority('manage_catalog_items') OR has_authority('full_access')));

CREATE POLICY quote_brands_select ON quote_brands FOR SELECT
  USING (company_id = auth_company_id() AND is_active_user());
CREATE POLICY quote_brands_manage ON quote_brands FOR ALL
  USING (company_id = auth_company_id() AND (has_authority('manage_catalog_items') OR has_authority('full_access')))
  WITH CHECK (company_id = auth_company_id() AND (has_authority('manage_catalog_items') OR has_authority('full_access')));

CREATE POLICY quote_items_select ON quote_items FOR SELECT
  USING (company_id = auth_company_id() AND is_active_user());
CREATE POLICY quote_items_manage ON quote_items FOR ALL
  USING (company_id = auth_company_id() AND (has_authority('manage_catalog_items') OR has_authority('full_access')))
  WITH CHECK (company_id = auth_company_id() AND (has_authority('manage_catalog_items') OR has_authority('full_access')));

CREATE POLICY quotation_settings_select ON quotation_company_settings FOR SELECT
  USING (company_id = auth_company_id() AND is_active_user());
CREATE POLICY quotation_settings_manage ON quotation_company_settings FOR ALL
  USING (company_id = auth_company_id() AND (has_authority('manage_quotations') OR has_authority('full_access')))
  WITH CHECK (company_id = auth_company_id() AND (has_authority('manage_quotations') OR has_authority('full_access')));

CREATE POLICY quotations_select ON quotations FOR SELECT
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('view_quotations')
      OR has_authority('create_quotations')
      OR has_authority('manage_quotations')
      OR has_authority('full_access')
    )
  );

CREATE POLICY quotations_insert ON quotations FOR INSERT
  WITH CHECK (
    company_id = auth_company_id()
    AND (has_authority('create_quotations') OR has_authority('manage_quotations') OR has_authority('full_access'))
  );

CREATE POLICY quotations_update ON quotations FOR UPDATE
  USING (
    company_id = auth_company_id()
    AND (has_authority('create_quotations') OR has_authority('manage_quotations') OR has_authority('accept_quotations') OR has_authority('full_access'))
  );

CREATE POLICY quotations_delete ON quotations FOR DELETE
  USING (
    company_id = auth_company_id()
    AND (has_authority('manage_quotations') OR has_authority('full_access'))
  );

CREATE POLICY quotation_items_select ON quotation_items FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM quotations q
      WHERE q.id = quotation_items.quotation_id
        AND q.company_id = auth_company_id()
        AND (
          has_authority('view_quotations')
          OR has_authority('create_quotations')
          OR has_authority('manage_quotations')
          OR has_authority('full_access')
        )
    )
  );

CREATE POLICY quotation_items_manage ON quotation_items FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM quotations q
      WHERE q.id = quotation_items.quotation_id
        AND q.company_id = auth_company_id()
        AND (has_authority('create_quotations') OR has_authority('manage_quotations') OR has_authority('full_access'))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM quotations q
      WHERE q.id = quotation_items.quotation_id
        AND q.company_id = auth_company_id()
        AND (has_authority('create_quotations') OR has_authority('manage_quotations') OR has_authority('full_access'))
    )
  );

-- ============================================================
-- SEED KT catalog + settings
-- ============================================================
DO $$
DECLARE
  cid UUID := 'a0000000-0000-4000-8000-000000000001';
  c_modules UUID;
  c_inverters UUID;
  c_meter UUID;
  c_nonsolar UUID;
  b_adani UUID;
  b_waaree UUID;
  b_polycab UUID;
  b_generic UUID;
BEGIN
  INSERT INTO quotation_company_settings (company_id, quotation_prefix, quotation_terms, from_name)
  VALUES (
    cid,
    'RKS',
    'Prices inclusive of applicable GST unless noted. Validity 15 days. Payment as per agreed milestones.',
    'RK Bhabhor'
  )
  ON CONFLICT (company_id) DO NOTHING;

  INSERT INTO quote_item_categories (company_id, name, kind, sort_order)
  VALUES (cid, 'PV Modules', 'solar', 10)
  ON CONFLICT (company_id, name) DO UPDATE SET kind = EXCLUDED.kind
  RETURNING id INTO c_modules;
  SELECT id INTO c_modules FROM quote_item_categories WHERE company_id = cid AND name = 'PV Modules';

  INSERT INTO quote_item_categories (company_id, name, kind, sort_order)
  VALUES (cid, 'On-Grid Inverters', 'solar', 20)
  ON CONFLICT (company_id, name) DO UPDATE SET kind = EXCLUDED.kind
  RETURNING id INTO c_inverters;
  SELECT id INTO c_inverters FROM quote_item_categories WHERE company_id = cid AND name = 'On-Grid Inverters';

  INSERT INTO quote_item_categories (company_id, name, kind, sort_order)
  VALUES (cid, 'Meter & Discom', 'solar', 30)
  ON CONFLICT (company_id, name) DO UPDATE SET kind = EXCLUDED.kind
  RETURNING id INTO c_meter;
  SELECT id INTO c_meter FROM quote_item_categories WHERE company_id = cid AND name = 'Meter & Discom';

  INSERT INTO quote_item_categories (company_id, name, kind, sort_order)
  VALUES (cid, 'Home Appliances', 'non_solar', 40)
  ON CONFLICT (company_id, name) DO UPDATE SET kind = EXCLUDED.kind
  RETURNING id INTO c_nonsolar;
  SELECT id INTO c_nonsolar FROM quote_item_categories WHERE company_id = cid AND name = 'Home Appliances';

  INSERT INTO quote_brands (company_id, name, category) VALUES
    (cid, 'Adani', 'module'),
    (cid, 'Waaree', 'module'),
    (cid, 'Polycab', 'inverter'),
    (cid, 'Generic', 'other')
  ON CONFLICT (company_id, name) DO NOTHING;

  SELECT id INTO b_adani FROM quote_brands WHERE company_id = cid AND name = 'Adani';
  SELECT id INTO b_waaree FROM quote_brands WHERE company_id = cid AND name = 'Waaree';
  SELECT id INTO b_polycab FROM quote_brands WHERE company_id = cid AND name = 'Polycab';
  SELECT id INTO b_generic FROM quote_brands WHERE company_id = cid AND name = 'Generic';

  INSERT INTO quote_items (
    company_id, brand_id, category_id, item_name, model, capacity_label, unit, gst_percent, base_rate, template_kind
  )
  SELECT * FROM (VALUES
    (cid, b_adani, c_modules, 'TopCon Bifacial Module', 'ASF-XXX', '545 Wp', 'pcs', 12::numeric, 12500::numeric, 'solar'),
    (cid, b_waaree, c_modules, 'Mono PERC Module', 'WS-XXX', '540 Wp', 'pcs', 12::numeric, 11800::numeric, 'solar'),
    (cid, b_polycab, c_inverters, 'On-Grid Inverter', 'PC-5K', '5 kW', 'pcs', 18::numeric, 45000::numeric, 'solar'),
    (cid, b_generic, c_meter, 'GEB/MGVCL Meter Charges', 'METER', NULL, 'lot', 18::numeric, 15000::numeric, 'solar'),
    (cid, b_generic, c_nonsolar, 'RO Water Purifier', 'RO-75', '75 LPH', 'pcs', 18::numeric, 18000::numeric, 'non_solar'),
    (cid, b_generic, c_nonsolar, 'Solar Water Heater', 'SWH-200', '200 LPD', 'pcs', 18::numeric, 28000::numeric, 'non_solar')
  ) AS v(company_id, brand_id, category_id, item_name, model, capacity_label, unit, gst_percent, base_rate, template_kind)
  WHERE NOT EXISTS (
    SELECT 1 FROM quote_items qi
    WHERE qi.company_id = cid AND qi.item_name = v.item_name AND qi.model = v.model
  );
END $$;
