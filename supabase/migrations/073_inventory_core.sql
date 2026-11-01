-- ============================================================
-- 048_inventory_core.sql  (RK Solar inventory port from Sumeru)
-- Inventory + serial tracking: enums, tables, helpers, views, RLS.
-- Stock tables have no write policies: all stock changes go through
-- the SECURITY DEFINER RPCs in 049_inventory_rpcs.sql.
-- Plan: docs/plan-inventory-serials-2026.md
-- ============================================================

-- ------------------------------------------------------------
-- Enums
-- ------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE inventory_unit AS ENUM ('nos', 'kg', 'm');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE inventory_movement_type AS ENUM (
    'inward', 'dispatch', 'return', 'service_issue', 'adjustment', 'reversal'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE serial_status AS ENUM ('in_stock', 'dispatched', 'defective', 'scrapped');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE serial_scan_mode AS ENUM ('whole', 'extract');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE inventory_return_condition AS ENUM ('good', 'defective');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ------------------------------------------------------------
-- Helpers
-- ------------------------------------------------------------

-- Trim, drop control characters and inner whitespace, uppercase.
CREATE OR REPLACE FUNCTION normalize_serial(p_value TEXT)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT NULLIF(
    upper(regexp_replace(regexp_replace(COALESCE(p_value, ''), '[[:cntrl:]]', '', 'g'), '\s+', '', 'g')),
    ''
  )
$$;

CREATE OR REPLACE FUNCTION is_company_admin_grantor()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
      AND role = 'admin'
      AND is_active = true
  )
$$;

-- Pricing access is role-based only: Owner, or a role the Owner granted the key to.
-- Deliberately ignores user_authorities, full_access and the has_authority enum fallback.
CREATE OR REPLACE FUNCTION role_grants_purchase_cost(p_role_id UUID, p_manage_only BOOLEAN DEFAULT false)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_role_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM role_authorities ra
    WHERE ra.role_id = p_role_id
      AND ra.granted = true
      AND ra.authority_key = ANY (
        CASE WHEN p_manage_only
          THEN ARRAY['manage_purchase_cost']
          ELSE ARRAY['view_purchase_cost', 'manage_purchase_cost']
        END
      )
  )
$$;

CREATE OR REPLACE FUNCTION can_view_purchase_cost()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_company_admin_grantor() OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.is_active = true
      AND role_grants_purchase_cost(p.role_id, false)
  )
$$;

CREATE OR REPLACE FUNCTION can_manage_purchase_cost()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_company_admin_grantor() OR EXISTS (
    SELECT 1 FROM profiles p
    WHERE p.id = auth.uid()
      AND p.is_active = true
      AND role_grants_purchase_cost(p.role_id, true)
  )
$$;

-- ------------------------------------------------------------
-- Item master
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  sku VARCHAR(80),
  category_id UUID REFERENCES quote_item_categories(id) ON DELETE SET NULL,
  brand_id UUID REFERENCES quote_brands(id) ON DELETE SET NULL,
  quote_item_id UUID REFERENCES quote_items(id) ON DELETE SET NULL,
  unit_type inventory_unit NOT NULL DEFAULT 'nos',
  track_serials BOOLEAN NOT NULL DEFAULT false,
  serial_mode serial_scan_mode NOT NULL DEFAULT 'whole',
  serial_pattern TEXT,
  low_stock_threshold NUMERIC(14,3) NOT NULL DEFAULT 0 CHECK (low_stock_threshold >= 0),
  specifications JSONB NOT NULL DEFAULT '{}'::jsonb,
  image_path TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inventory_items_serial_unit CHECK (NOT track_serials OR unit_type = 'nos'),
  CONSTRAINT inventory_items_name_not_blank CHECK (btrim(name) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_company_name_uq
  ON inventory_items (company_id, lower(name));
CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_company_sku_uq
  ON inventory_items (company_id, lower(sku)) WHERE sku IS NOT NULL;
CREATE INDEX IF NOT EXISTS inventory_items_company_idx
  ON inventory_items (company_id, is_active);

-- ------------------------------------------------------------
-- Movements (one ledger for every stock change)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_movement_counters (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  movement_type inventory_movement_type NOT NULL,
  year INT NOT NULL,
  last_no INT NOT NULL DEFAULT 0,
  PRIMARY KEY (company_id, movement_type, year)
);

CREATE TABLE IF NOT EXISTS inventory_movements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  movement_type inventory_movement_type NOT NULL,
  movement_no VARCHAR(40) NOT NULL,
  is_opening_stock BOOLEAN NOT NULL DEFAULT false,
  lead_id UUID REFERENCES leads(id) ON DELETE RESTRICT,
  ticket_id UUID REFERENCES service_tickets(id) ON DELETE SET NULL,
  supplier_name VARCHAR(200),
  supplier_invoice_no VARCHAR(100),
  supplier_invoice_date DATE,
  vehicle_no VARCHAR(40),
  delivered_by VARCHAR(120),
  movement_date DATE NOT NULL DEFAULT CURRENT_DATE,
  reason TEXT,
  notes TEXT,
  reverses_id UUID REFERENCES inventory_movements(id) ON DELETE RESTRICT,
  reversed_by_id UUID REFERENCES inventory_movements(id) ON DELETE SET NULL,
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, movement_no),
  CONSTRAINT inventory_movements_lead_required CHECK (
    movement_type NOT IN ('dispatch', 'return', 'service_issue') OR lead_id IS NOT NULL
  ),
  CONSTRAINT inventory_movements_reversal_link CHECK (
    (movement_type = 'reversal') = (reverses_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS inventory_movements_company_date_idx
  ON inventory_movements (company_id, movement_date DESC, created_at DESC);
CREATE INDEX IF NOT EXISTS inventory_movements_lead_idx
  ON inventory_movements (company_id, lead_id) WHERE lead_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS inventory_movement_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  movement_id UUID NOT NULL REFERENCES inventory_movements(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  -- Signed: + inward/return, - dispatch/service. Serial items: +/- number of serials.
  quantity_delta NUMERIC(14,3) NOT NULL CHECK (quantity_delta <> 0),
  -- Return lines (and their reversals). Defective bulk returns do not count as stock.
  return_condition inventory_return_condition,
  -- Serial adjustments: scrap / defective / restore.
  serial_action VARCHAR(20),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS inventory_movement_lines_movement_idx
  ON inventory_movement_lines (movement_id);
CREATE INDEX IF NOT EXISTS inventory_movement_lines_item_idx
  ON inventory_movement_lines (company_id, item_id);

-- ------------------------------------------------------------
-- Serials (one row per physical unit)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_serials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES inventory_items(id) ON DELETE RESTRICT,
  serial_no VARCHAR(120) NOT NULL,
  status serial_status NOT NULL DEFAULT 'in_stock',
  current_lead_id UUID REFERENCES leads(id) ON DELETE RESTRICT,
  inward_line_id UUID REFERENCES inventory_movement_lines(id) ON DELETE SET NULL,
  raw_scan TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, serial_no),
  CONSTRAINT inventory_serials_normalized CHECK (serial_no = normalize_serial(serial_no)),
  CONSTRAINT inventory_serials_lead_when_dispatched CHECK (
    (status = 'dispatched') = (current_lead_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS inventory_serials_item_status_idx
  ON inventory_serials (item_id, status);
CREATE INDEX IF NOT EXISTS inventory_serials_lead_idx
  ON inventory_serials (current_lead_id) WHERE current_lead_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS inventory_movement_line_serials (
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  line_id UUID NOT NULL REFERENCES inventory_movement_lines(id) ON DELETE CASCADE,
  serial_id UUID NOT NULL REFERENCES inventory_serials(id) ON DELETE RESTRICT,
  PRIMARY KEY (line_id, serial_id)
);

CREATE INDEX IF NOT EXISTS inventory_movement_line_serials_serial_idx
  ON inventory_movement_line_serials (serial_id);

-- ------------------------------------------------------------
-- Purchase cost (view_purchase_cost / manage_purchase_cost only)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_item_costs (
  item_id UUID PRIMARY KEY REFERENCES inventory_items(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  default_unit_cost NUMERIC(14,2) CHECK (default_unit_cost IS NULL OR default_unit_cost >= 0),
  updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory_inward_costs (
  line_id UUID PRIMARY KEY REFERENCES inventory_movement_lines(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  unit_cost NUMERIC(14,2) NOT NULL CHECK (unit_cost >= 0),
  gst_percent NUMERIC(5,2) CHECK (gst_percent IS NULL OR (gst_percent >= 0 AND gst_percent <= 100)),
  created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- Item write rules: serial tracking follows the category
-- (Panel / Inverter only), same-company references, and the
-- serial/bulk type and unit are frozen once stock exists.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION inventory_items_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_category_name TEXT;
BEGIN
  NEW.name := btrim(NEW.name);
  NEW.sku := NULLIF(btrim(COALESCE(NEW.sku, '')), '');
  NEW.serial_pattern := NULLIF(btrim(COALESCE(NEW.serial_pattern, '')), '');

  IF TG_OP = 'UPDATE' AND NEW.company_id <> OLD.company_id THEN
    RAISE EXCEPTION 'An item cannot move to another company.';
  END IF;

  IF NEW.category_id IS NOT NULL THEN
    SELECT name INTO v_category_name
    FROM quote_item_categories
    WHERE id = NEW.category_id AND company_id = NEW.company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Category not found.';
    END IF;
  END IF;

  IF NEW.brand_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM quote_brands WHERE id = NEW.brand_id AND company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Brand not found.';
  END IF;

  IF NEW.quote_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM quote_items WHERE id = NEW.quote_item_id AND company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Catalog item not found.';
  END IF;

  NEW.track_serials := COALESCE(lower(btrim(v_category_name)) ~ '^(panel|inverter)s?$', false);
  IF NEW.track_serials THEN
    NEW.unit_type := 'nos';
  END IF;

  IF TG_OP = 'UPDATE'
     AND (NEW.track_serials IS DISTINCT FROM OLD.track_serials OR NEW.unit_type IS DISTINCT FROM OLD.unit_type)
     AND EXISTS (SELECT 1 FROM inventory_movement_lines WHERE item_id = NEW.id)
  THEN
    RAISE EXCEPTION 'This item already has stock entries, so its type (serial or bulk) and unit cannot change.';
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS inventory_items_before_write ON inventory_items;
CREATE TRIGGER inventory_items_before_write
  BEFORE INSERT OR UPDATE ON inventory_items
  FOR EACH ROW EXECUTE FUNCTION inventory_items_before_write();

DROP TRIGGER IF EXISTS inventory_serials_updated_at ON inventory_serials;
CREATE TRIGGER inventory_serials_updated_at
  BEFORE UPDATE ON inventory_serials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ------------------------------------------------------------
-- Stock helpers (used by RPCs)
-- ------------------------------------------------------------

-- Bulk on-hand: all lines except defective returns (and their reversals).
CREATE OR REPLACE FUNCTION inventory_bulk_on_hand(p_item_id UUID)
RETURNS NUMERIC
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(SUM(quantity_delta) FILTER (WHERE return_condition IS DISTINCT FROM 'defective'), 0)
  FROM inventory_movement_lines
  WHERE item_id = p_item_id
$$;

-- Used at a customer = dispatched - returned, ignoring reversed movements.
CREATE OR REPLACE FUNCTION inventory_customer_used(p_lead_id UUID, p_item_id UUID)
RETURNS NUMERIC
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(-SUM(ml.quantity_delta), 0)
  FROM inventory_movements m
  JOIN inventory_movement_lines ml ON ml.movement_id = m.id
  WHERE m.lead_id = p_lead_id
    AND ml.item_id = p_item_id
    AND m.movement_type IN ('dispatch', 'service_issue', 'return')
    AND m.reversed_by_id IS NULL
$$;

-- ------------------------------------------------------------
-- Views (security_invoker: caller's RLS applies)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW inventory_stock_on_hand
WITH (security_invoker = true) AS
SELECT
  x.*,
  (x.on_hand <= 0) AS is_out,
  (x.on_hand > 0 AND x.low_stock_threshold > 0 AND x.on_hand <= x.low_stock_threshold) AS is_low
FROM (
  SELECT
    i.id AS item_id,
    i.company_id,
    i.name,
    i.sku,
    i.category_id,
    i.brand_id,
    i.unit_type,
    i.track_serials,
    i.low_stock_threshold,
    i.image_path,
    i.is_active,
    COALESCE(CASE WHEN i.track_serials THEN s.in_stock ELSE b.qty END, 0)::NUMERIC(14,3) AS on_hand,
    COALESCE(s.dispatched, 0) AS serials_dispatched,
    COALESCE(s.defective, 0) AS serials_defective
  FROM inventory_items i
  LEFT JOIN LATERAL (
    SELECT SUM(ml.quantity_delta) FILTER (WHERE ml.return_condition IS DISTINCT FROM 'defective') AS qty
    FROM inventory_movement_lines ml
    WHERE ml.item_id = i.id
  ) b ON NOT i.track_serials
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) FILTER (WHERE st.status = 'in_stock') AS in_stock,
      COUNT(*) FILTER (WHERE st.status = 'dispatched') AS dispatched,
      COUNT(*) FILTER (WHERE st.status = 'defective') AS defective
    FROM inventory_serials st
    WHERE st.item_id = i.id
  ) s ON i.track_serials
) x;

CREATE OR REPLACE VIEW inventory_customer_material
WITH (security_invoker = true) AS
SELECT
  m.company_id,
  m.lead_id,
  ml.item_id,
  SUM(CASE WHEN m.movement_type IN ('dispatch', 'service_issue') THEN -ml.quantity_delta ELSE 0 END)::NUMERIC(14,3) AS dispatched,
  SUM(CASE WHEN m.movement_type = 'return' THEN ml.quantity_delta ELSE 0 END)::NUMERIC(14,3) AS returned,
  (-SUM(ml.quantity_delta))::NUMERIC(14,3) AS used,
  MAX(m.movement_date) AS last_movement_date
FROM inventory_movements m
JOIN inventory_movement_lines ml ON ml.movement_id = m.id
WHERE m.lead_id IS NOT NULL
  AND m.movement_type IN ('dispatch', 'service_issue', 'return')
  AND m.reversed_by_id IS NULL
GROUP BY m.company_id, m.lead_id, ml.item_id;

-- Serial items: sum of the inward cost of each in-stock unit.
-- Bulk items: on-hand x weighted average inward cost (fallback: default cost).
CREATE OR REPLACE VIEW inventory_stock_value
WITH (security_invoker = true) AS
SELECT
  oh.company_id,
  oh.item_id,
  oh.on_hand,
  CASE
    WHEN oh.track_serials THEN sv.total_value
    ELSE oh.on_hand * COALESCE(avgc.avg_cost, ic.default_unit_cost)
  END::NUMERIC(16,2) AS stock_value,
  CASE
    WHEN oh.track_serials THEN CASE WHEN oh.on_hand > 0 THEN sv.total_value / oh.on_hand END
    ELSE COALESCE(avgc.avg_cost, ic.default_unit_cost)
  END::NUMERIC(14,2) AS unit_cost,
  CASE
    WHEN oh.track_serials THEN COALESCE(sv.missing_cost, 0)
    ELSE CASE WHEN oh.on_hand > 0 AND avgc.avg_cost IS NULL AND ic.default_unit_cost IS NULL THEN 1 ELSE 0 END
  END AS missing_cost_count
FROM inventory_stock_on_hand oh
LEFT JOIN inventory_item_costs ic ON ic.item_id = oh.item_id
LEFT JOIN LATERAL (
  SELECT SUM(ml.quantity_delta * c.unit_cost) / NULLIF(SUM(ml.quantity_delta), 0) AS avg_cost
  FROM inventory_movement_lines ml
  JOIN inventory_movements m ON m.id = ml.movement_id
  JOIN inventory_inward_costs c ON c.line_id = ml.id
  WHERE ml.item_id = oh.item_id
    AND m.movement_type = 'inward'
    AND m.reversed_by_id IS NULL
) avgc ON NOT oh.track_serials
LEFT JOIN LATERAL (
  SELECT
    SUM(COALESCE(c.unit_cost, ic.default_unit_cost, 0)) AS total_value,
    COUNT(*) FILTER (WHERE c.unit_cost IS NULL AND ic.default_unit_cost IS NULL) AS missing_cost
  FROM inventory_serials s
  LEFT JOIN inventory_inward_costs c ON c.line_id = s.inward_line_id
  WHERE s.item_id = oh.item_id
    AND s.status = 'in_stock'
) sv ON oh.track_serials
WHERE can_view_purchase_cost();

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
ALTER TABLE inventory_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movement_counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_serials ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_movement_line_serials ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_item_costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_inward_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_items_select ON inventory_items;
CREATE POLICY inventory_items_select ON inventory_items FOR SELECT
  USING (
    company_id = auth_company_id() AND is_active_user()
    AND (has_authority('view_inventory') OR has_authority('manage_inventory_items'))
  );

DROP POLICY IF EXISTS inventory_items_insert ON inventory_items;
CREATE POLICY inventory_items_insert ON inventory_items FOR INSERT
  WITH CHECK (
    company_id = auth_company_id() AND is_active_user()
    AND has_authority('manage_inventory_items')
  );

DROP POLICY IF EXISTS inventory_items_update ON inventory_items;
CREATE POLICY inventory_items_update ON inventory_items FOR UPDATE
  USING (
    company_id = auth_company_id() AND is_active_user()
    AND has_authority('manage_inventory_items')
  )
  WITH CHECK (
    company_id = auth_company_id() AND is_active_user()
    AND has_authority('manage_inventory_items')
  );

DROP POLICY IF EXISTS inventory_movements_select ON inventory_movements;
CREATE POLICY inventory_movements_select ON inventory_movements FOR SELECT
  USING (company_id = auth_company_id() AND is_active_user() AND has_authority('view_inventory'));

DROP POLICY IF EXISTS inventory_movement_lines_select ON inventory_movement_lines;
CREATE POLICY inventory_movement_lines_select ON inventory_movement_lines FOR SELECT
  USING (company_id = auth_company_id() AND is_active_user() AND has_authority('view_inventory'));

DROP POLICY IF EXISTS inventory_serials_select ON inventory_serials;
CREATE POLICY inventory_serials_select ON inventory_serials FOR SELECT
  USING (company_id = auth_company_id() AND is_active_user() AND has_authority('view_inventory'));

DROP POLICY IF EXISTS inventory_movement_line_serials_select ON inventory_movement_line_serials;
CREATE POLICY inventory_movement_line_serials_select ON inventory_movement_line_serials FOR SELECT
  USING (company_id = auth_company_id() AND is_active_user() AND has_authority('view_inventory'));

-- inventory_movement_counters: no policies (RPC only).

DROP POLICY IF EXISTS inventory_item_costs_select ON inventory_item_costs;
CREATE POLICY inventory_item_costs_select ON inventory_item_costs FOR SELECT
  USING (company_id = auth_company_id() AND can_view_purchase_cost());

DROP POLICY IF EXISTS inventory_item_costs_insert ON inventory_item_costs;
CREATE POLICY inventory_item_costs_insert ON inventory_item_costs FOR INSERT
  WITH CHECK (
    company_id = auth_company_id() AND can_manage_purchase_cost()
    AND EXISTS (SELECT 1 FROM inventory_items i WHERE i.id = item_id AND i.company_id = auth_company_id())
  );

DROP POLICY IF EXISTS inventory_item_costs_update ON inventory_item_costs;
CREATE POLICY inventory_item_costs_update ON inventory_item_costs FOR UPDATE
  USING (company_id = auth_company_id() AND can_manage_purchase_cost())
  WITH CHECK (company_id = auth_company_id() AND can_manage_purchase_cost());

DROP POLICY IF EXISTS inventory_item_costs_delete ON inventory_item_costs;
CREATE POLICY inventory_item_costs_delete ON inventory_item_costs FOR DELETE
  USING (company_id = auth_company_id() AND can_manage_purchase_cost());

DROP POLICY IF EXISTS inventory_inward_costs_select ON inventory_inward_costs;
CREATE POLICY inventory_inward_costs_select ON inventory_inward_costs FOR SELECT
  USING (company_id = auth_company_id() AND can_view_purchase_cost());

-- ------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------
REVOKE ALL ON inventory_stock_on_hand, inventory_customer_material, inventory_stock_value FROM anon;
GRANT SELECT ON inventory_stock_on_hand, inventory_customer_material, inventory_stock_value TO authenticated;

REVOKE ALL ON FUNCTION inventory_bulk_on_hand(UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION inventory_customer_used(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION role_grants_purchase_cost(UUID, BOOLEAN) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION is_company_admin_grantor() TO authenticated;
GRANT EXECUTE ON FUNCTION can_view_purchase_cost() TO authenticated;
GRANT EXECUTE ON FUNCTION can_manage_purchase_cost() TO authenticated;
