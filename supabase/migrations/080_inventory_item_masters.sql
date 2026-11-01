-- ============================================================
-- 059_inventory_item_masters.sql  (RK Solar inventory port from Sumeru)
-- Master Group → Category → Sub-Category hierarchy on inventory items.
-- Reuses quote_item_categories / quote_brands. Requires 048 (013).
-- ============================================================

-- ------------------------------------------------------------
-- Master groups
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_master_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inventory_master_groups_company_name UNIQUE (company_id, name)
);

CREATE INDEX IF NOT EXISTS idx_inventory_master_groups_company
  ON inventory_master_groups (company_id, sort_order, name);

ALTER TABLE quote_item_categories
  ADD COLUMN IF NOT EXISTS master_group_id UUID REFERENCES inventory_master_groups(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_quote_item_categories_master_group
  ON quote_item_categories (company_id, master_group_id);

-- ------------------------------------------------------------
-- Sub-categories (under quote_item_categories)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_subcategories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  category_id UUID NOT NULL REFERENCES quote_item_categories(id) ON DELETE CASCADE,
  name VARCHAR(80) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inventory_subcategories_company_cat_name UNIQUE (company_id, category_id, name)
);

CREATE INDEX IF NOT EXISTS idx_inventory_subcategories_category
  ON inventory_subcategories (company_id, category_id, sort_order, name);

-- ------------------------------------------------------------
-- Item FKs
-- ------------------------------------------------------------
ALTER TABLE inventory_items
  ADD COLUMN IF NOT EXISTS master_group_id UUID REFERENCES inventory_master_groups(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS subcategory_id UUID REFERENCES inventory_subcategories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_inventory_items_master_group
  ON inventory_items (company_id, master_group_id);
CREATE INDEX IF NOT EXISTS idx_inventory_items_subcategory
  ON inventory_items (company_id, subcategory_id);

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
ALTER TABLE inventory_master_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE inventory_subcategories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_master_groups_select ON inventory_master_groups;
CREATE POLICY inventory_master_groups_select ON inventory_master_groups FOR SELECT
  USING (
    company_id = auth_company_id() AND is_active_user()
    AND (
      has_authority('view_inventory')
      OR has_authority('manage_inventory_items')
      OR has_authority('manage_catalog_items')
      OR has_authority('view_quotations')
    )
  );

DROP POLICY IF EXISTS inventory_subcategories_select ON inventory_subcategories;
CREATE POLICY inventory_subcategories_select ON inventory_subcategories FOR SELECT
  USING (
    company_id = auth_company_id() AND is_active_user()
    AND (
      has_authority('view_inventory')
      OR has_authority('manage_inventory_items')
      OR has_authority('manage_catalog_items')
      OR has_authority('view_quotations')
    )
  );

-- Direct table writes stay catalog-gated; inventory creates via RPCs below.
DROP POLICY IF EXISTS inventory_master_groups_manage ON inventory_master_groups;
CREATE POLICY inventory_master_groups_manage ON inventory_master_groups FOR ALL
  USING (
    company_id = auth_company_id() AND is_active_user()
    AND (has_authority('manage_inventory_items') OR has_authority('manage_catalog_items'))
  )
  WITH CHECK (
    company_id = auth_company_id() AND is_active_user()
    AND (has_authority('manage_inventory_items') OR has_authority('manage_catalog_items'))
  );

DROP POLICY IF EXISTS inventory_subcategories_manage ON inventory_subcategories;
CREATE POLICY inventory_subcategories_manage ON inventory_subcategories FOR ALL
  USING (
    company_id = auth_company_id() AND is_active_user()
    AND (has_authority('manage_inventory_items') OR has_authority('manage_catalog_items'))
  )
  WITH CHECK (
    company_id = auth_company_id() AND is_active_user()
    AND (has_authority('manage_inventory_items') OR has_authority('manage_catalog_items'))
  );

-- Allow inventory managers to insert/update categories & brands (shared masters)
DROP POLICY IF EXISTS quote_item_categories_manage ON quote_item_categories;
CREATE POLICY quote_item_categories_manage ON quote_item_categories FOR ALL
  USING (
    company_id = auth_company_id()
    AND (has_authority('manage_catalog_items') OR has_authority('manage_inventory_items'))
  )
  WITH CHECK (
    company_id = auth_company_id()
    AND (has_authority('manage_catalog_items') OR has_authority('manage_inventory_items'))
  );

DROP POLICY IF EXISTS quote_brands_manage ON quote_brands;
CREATE POLICY quote_brands_manage ON quote_brands FOR ALL
  USING (
    company_id = auth_company_id()
    AND (has_authority('manage_catalog_items') OR has_authority('manage_inventory_items'))
  )
  WITH CHECK (
    company_id = auth_company_id()
    AND (has_authority('manage_catalog_items') OR has_authority('manage_inventory_items'))
  );

-- ------------------------------------------------------------
-- Item write trigger: hierarchy consistency
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION inventory_items_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_category_name TEXT;
  v_cat_master UUID;
  v_sub_cat UUID;
BEGIN
  NEW.name := btrim(NEW.name);
  NEW.sku := NULLIF(btrim(COALESCE(NEW.sku, '')), '');
  NEW.serial_pattern := NULLIF(btrim(COALESCE(NEW.serial_pattern, '')), '');

  IF TG_OP = 'UPDATE' AND NEW.company_id <> OLD.company_id THEN
    RAISE EXCEPTION 'An item cannot move to another company.';
  END IF;

  IF NEW.master_group_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM inventory_master_groups
    WHERE id = NEW.master_group_id AND company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Master group not found.';
  END IF;

  IF NEW.category_id IS NOT NULL THEN
    SELECT name, master_group_id INTO v_category_name, v_cat_master
    FROM quote_item_categories
    WHERE id = NEW.category_id AND company_id = NEW.company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Category not found.';
    END IF;
    -- Auto-fill master group from category when category is linked
    IF v_cat_master IS NOT NULL THEN
      IF NEW.master_group_id IS NULL THEN
        NEW.master_group_id := v_cat_master;
      ELSIF NEW.master_group_id IS DISTINCT FROM v_cat_master THEN
        RAISE EXCEPTION 'Category belongs to a different master group.';
      END IF;
    END IF;
  ELSE
    v_category_name := NULL;
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

  IF NEW.subcategory_id IS NOT NULL THEN
    SELECT category_id INTO v_sub_cat
    FROM inventory_subcategories
    WHERE id = NEW.subcategory_id AND company_id = NEW.company_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Sub-category not found.';
    END IF;
    IF NEW.category_id IS NULL THEN
      RAISE EXCEPTION 'Choose a category before a sub-category.';
    END IF;
    IF v_sub_cat IS DISTINCT FROM NEW.category_id THEN
      RAISE EXCEPTION 'Sub-category does not belong to the selected category.';
    END IF;
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

-- ------------------------------------------------------------
-- Stock view: expose new FKs
-- CREATE OR REPLACE cannot insert/rename columns mid-list (42P16).
-- Drop dependents first, then recreate both views.
-- ------------------------------------------------------------
DROP VIEW IF EXISTS inventory_stock_value CASCADE;
DROP VIEW IF EXISTS inventory_stock_on_hand CASCADE;

CREATE VIEW inventory_stock_on_hand
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
    i.master_group_id,
    i.subcategory_id,
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

CREATE VIEW inventory_stock_value
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
-- Create-master RPCs (idempotent by name)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION inventory_can_manage_masters()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_active_user() AND (
    has_authority('manage_inventory_items') OR has_authority('manage_catalog_items')
  );
$$;

CREATE OR REPLACE FUNCTION inventory_create_master_group(p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_name TEXT;
  v_row inventory_master_groups%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT inventory_can_manage_masters() THEN
    RAISE EXCEPTION 'You do not have permission to manage inventory masters.' USING ERRCODE = '42501';
  END IF;
  v_company := auth_company_id();
  v_name := NULLIF(btrim(COALESCE(p_name, '')), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Master group name is required.';
  END IF;
  IF length(v_name) > 80 THEN
    RAISE EXCEPTION 'Master group name is too long.';
  END IF;

  SELECT * INTO v_row FROM inventory_master_groups
  WHERE company_id = v_company AND lower(name) = lower(v_name)
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('id', v_row.id, 'name', v_row.name, 'idempotent', true);
  END IF;

  INSERT INTO inventory_master_groups (company_id, name)
  VALUES (v_company, v_name)
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('id', v_row.id, 'name', v_row.name, 'idempotent', false);
END;
$$;

CREATE OR REPLACE FUNCTION inventory_create_category(p_name TEXT, p_master_group_id UUID DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_name TEXT;
  v_master UUID;
  v_row quote_item_categories%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT inventory_can_manage_masters() THEN
    RAISE EXCEPTION 'You do not have permission to manage inventory masters.' USING ERRCODE = '42501';
  END IF;
  v_company := auth_company_id();
  v_name := NULLIF(btrim(COALESCE(p_name, '')), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Category name is required.';
  END IF;
  IF length(v_name) > 80 THEN
    RAISE EXCEPTION 'Category name is too long.';
  END IF;

  v_master := p_master_group_id;
  IF v_master IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM inventory_master_groups WHERE id = v_master AND company_id = v_company
  ) THEN
    RAISE EXCEPTION 'Master group not found.';
  END IF;

  SELECT * INTO v_row FROM quote_item_categories
  WHERE company_id = v_company AND lower(name) = lower(v_name)
  LIMIT 1;
  IF FOUND THEN
    IF v_master IS NOT NULL AND v_row.master_group_id IS DISTINCT FROM v_master THEN
      UPDATE quote_item_categories SET master_group_id = v_master WHERE id = v_row.id
      RETURNING * INTO v_row;
    END IF;
    RETURN jsonb_build_object(
      'id', v_row.id, 'name', v_row.name,
      'master_group_id', v_row.master_group_id, 'idempotent', true
    );
  END IF;

  INSERT INTO quote_item_categories (company_id, name, sort_order, master_group_id)
  VALUES (v_company, v_name, 100, v_master)
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id, 'name', v_row.name,
    'master_group_id', v_row.master_group_id, 'idempotent', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION inventory_create_subcategory(p_category_id UUID, p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_name TEXT;
  v_row inventory_subcategories%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT inventory_can_manage_masters() THEN
    RAISE EXCEPTION 'You do not have permission to manage inventory masters.' USING ERRCODE = '42501';
  END IF;
  v_company := auth_company_id();
  v_name := NULLIF(btrim(COALESCE(p_name, '')), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Sub-category name is required.';
  END IF;
  IF length(v_name) > 80 THEN
    RAISE EXCEPTION 'Sub-category name is too long.';
  END IF;
  IF p_category_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM quote_item_categories WHERE id = p_category_id AND company_id = v_company
  ) THEN
    RAISE EXCEPTION 'Category not found.';
  END IF;

  SELECT * INTO v_row FROM inventory_subcategories
  WHERE company_id = v_company AND category_id = p_category_id AND lower(name) = lower(v_name)
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object(
      'id', v_row.id, 'name', v_row.name,
      'category_id', v_row.category_id, 'idempotent', true
    );
  END IF;

  INSERT INTO inventory_subcategories (company_id, category_id, name)
  VALUES (v_company, p_category_id, v_name)
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id, 'name', v_row.name,
    'category_id', v_row.category_id, 'idempotent', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION inventory_create_brand(p_name TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_name TEXT;
  v_row quote_brands%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT inventory_can_manage_masters() THEN
    RAISE EXCEPTION 'You do not have permission to manage inventory masters.' USING ERRCODE = '42501';
  END IF;
  v_company := auth_company_id();
  v_name := NULLIF(btrim(COALESCE(p_name, '')), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Brand name is required.';
  END IF;
  IF length(v_name) > 120 THEN
    RAISE EXCEPTION 'Brand name is too long.';
  END IF;

  SELECT * INTO v_row FROM quote_brands
  WHERE company_id = v_company AND lower(name) = lower(v_name)
  LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('id', v_row.id, 'name', v_row.name, 'idempotent', true);
  END IF;

  INSERT INTO quote_brands (company_id, name)
  VALUES (v_company, v_name)
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('id', v_row.id, 'name', v_row.name, 'idempotent', false);
END;
$$;

REVOKE ALL ON FUNCTION inventory_can_manage_masters() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION inventory_create_master_group(TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION inventory_create_category(TEXT, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION inventory_create_subcategory(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION inventory_create_brand(TEXT) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION inventory_create_master_group(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION inventory_create_category(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION inventory_create_subcategory(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION inventory_create_brand(TEXT) TO authenticated;

GRANT SELECT ON inventory_master_groups, inventory_subcategories TO authenticated;

-- ------------------------------------------------------------
-- Opening import: persist master_group_id / subcategory_id on new items
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION inventory_import_opening_stock(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := inventory__require('inventory_inward');
  v_lines JSONB := inventory__lines(payload);
  v_new JSONB;
  v_map JSONB := '{}'::jsonb;
  v_item_id UUID;
  v_resolved JSONB := '[]'::jsonb;
  v_line JSONB;
  v_group RECORD;
  v_result JSONB;
  v_all_serials TEXT[] := '{}';
  v_dup TEXT;
  v_movements INT := 0;
  v_serials INT := 0;
  v_items_created INT := 0;
  v_header JSONB;
BEGIN
  IF jsonb_typeof(payload -> 'new_items') = 'array' AND jsonb_array_length(payload -> 'new_items') > 0 THEN
    IF NOT has_authority('manage_inventory_items') THEN
      RAISE EXCEPTION 'Creating new items needs the Manage Inventory Items permission.' USING ERRCODE = '42501';
    END IF;
    FOR v_new IN SELECT * FROM jsonb_array_elements(payload -> 'new_items') LOOP
      IF NULLIF(btrim(v_new ->> 'name'), '') IS NULL OR NULLIF(v_new ->> 'key', '') IS NULL THEN
        RAISE EXCEPTION 'Each new item needs a name.';
      END IF;
      IF EXISTS (
        SELECT 1 FROM inventory_items
        WHERE company_id = v_company AND lower(name) = lower(btrim(v_new ->> 'name'))
      ) THEN
        RAISE EXCEPTION 'Item "%" already exists. Map the rows to it instead of creating it.', btrim(v_new ->> 'name');
      END IF;
      INSERT INTO inventory_items (
        company_id, name, sku, master_group_id, category_id, subcategory_id, brand_id,
        unit_type, low_stock_threshold, specifications, created_by
      ) VALUES (
        v_company,
        btrim(v_new ->> 'name'),
        NULLIF(btrim(v_new ->> 'sku'), ''),
        NULLIF(v_new ->> 'master_group_id', '')::UUID,
        NULLIF(v_new ->> 'category_id', '')::UUID,
        NULLIF(v_new ->> 'subcategory_id', '')::UUID,
        NULLIF(v_new ->> 'brand_id', '')::UUID,
        COALESCE(NULLIF(v_new ->> 'unit_type', ''), 'nos')::inventory_unit,
        COALESCE(NULLIF(v_new ->> 'low_stock_threshold', '')::NUMERIC, 0),
        COALESCE(v_new -> 'specifications', '{}'::jsonb),
        auth.uid()
      ) RETURNING id INTO v_item_id;
      v_map := jsonb_set(v_map, ARRAY[v_new ->> 'key'], to_jsonb(v_item_id::TEXT));
      v_items_created := v_items_created + 1;
    END LOOP;
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
    IF NULLIF(v_line ->> 'item_id', '') IS NULL THEN
      IF NOT v_map ? COALESCE(v_line ->> 'item_key', '') THEN
        RAISE EXCEPTION 'A row is not matched to an item.';
      END IF;
      v_line := jsonb_set(v_line, '{item_id}', v_map -> (v_line ->> 'item_key'));
    END IF;
    v_resolved := v_resolved || jsonb_build_array(v_line);
    v_all_serials := v_all_serials || inventory__line_serials(v_line);
  END LOOP;

  SELECT s INTO v_dup FROM unnest(v_all_serials) s WHERE s IS NOT NULL GROUP BY s HAVING COUNT(*) > 1 LIMIT 1;
  IF v_dup IS NOT NULL THEN
    RAISE EXCEPTION 'Serial % appears more than once in the file.', v_dup;
  END IF;

  v_header := jsonb_build_object(
    'supplier_name', 'Opening stock',
    'movement_date', payload ->> 'movement_date',
    'notes', 'Excel import' || COALESCE(': ' || NULLIF(btrim(payload ->> 'file_name'), ''), '')
  );

  FOR v_group IN
    SELECT l ->> 'item_id' AS item_id, jsonb_agg(l) AS lines
    FROM jsonb_array_elements(v_resolved) l
    GROUP BY l ->> 'item_id'
  LOOP
    v_result := inventory__post_inward(v_company, v_header, v_group.lines, true);
    v_movements := v_movements + 1;
    v_serials := v_serials + COALESCE((v_result ->> 'serials')::INT, 0);
  END LOOP;

  PERFORM inventory__audit(v_company, NULL, 'inventory_opening_import', NULL,
    jsonb_build_object('file_name', payload ->> 'file_name', 'movements', v_movements,
                       'serials', v_serials, 'items_created', v_items_created,
                       'rows', jsonb_array_length(v_lines)));

  RETURN jsonb_build_object(
    'movements', v_movements, 'serials', v_serials, 'items_created', v_items_created
  );
END;
$$;
