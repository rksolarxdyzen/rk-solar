-- ============================================================
-- 065_inventory_brand_label_group.sql
-- handover: 030_inventory_brand_label_group.sql
-- User-facing label: Brand → Group (column brand_id / quote_brands unchanged).
-- Requires 059/024 (+ 064/029 if applied).
-- ============================================================

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
    RAISE EXCEPTION 'Group name is required.';
  END IF;
  IF length(v_name) > 120 THEN
    RAISE EXCEPTION 'Group name is too long.';
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

-- Align trigger message with Group label (full body from 064).
CREATE OR REPLACE FUNCTION inventory_items_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_category_name TEXT;
  v_master_name TEXT;
  v_cat_master UUID;
  v_sub_cat UUID;
BEGIN
  NEW.name := btrim(NEW.name);
  NEW.sku := NULLIF(btrim(COALESCE(NEW.sku, '')), '');
  NEW.serial_pattern := NULLIF(btrim(COALESCE(NEW.serial_pattern, '')), '');

  IF TG_OP = 'UPDATE' AND NEW.company_id <> OLD.company_id THEN
    RAISE EXCEPTION 'An item cannot move to another company.';
  END IF;

  IF NEW.master_group_id IS NULL THEN
    RAISE EXCEPTION 'Choose a master group.';
  END IF;
  IF NEW.category_id IS NULL THEN
    RAISE EXCEPTION 'Choose a category.';
  END IF;
  IF NEW.subcategory_id IS NULL THEN
    RAISE EXCEPTION 'Choose a sub-category.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM inventory_master_groups
    WHERE id = NEW.master_group_id AND company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Master group not found.';
  END IF;

  SELECT name INTO v_master_name
  FROM inventory_master_groups
  WHERE id = NEW.master_group_id AND company_id = NEW.company_id;

  SELECT name, master_group_id INTO v_category_name, v_cat_master
  FROM quote_item_categories
  WHERE id = NEW.category_id AND company_id = NEW.company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Category not found.';
  END IF;
  IF v_cat_master IS NOT NULL THEN
    IF NEW.master_group_id IS DISTINCT FROM v_cat_master THEN
      RAISE EXCEPTION 'Category belongs to a different master group.';
    END IF;
  END IF;

  IF NEW.brand_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM quote_brands WHERE id = NEW.brand_id AND company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Group not found.';
  END IF;

  IF NEW.quote_item_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM quote_items WHERE id = NEW.quote_item_id AND company_id = NEW.company_id
  ) THEN
    RAISE EXCEPTION 'Catalog item not found.';
  END IF;

  SELECT category_id INTO v_sub_cat
  FROM inventory_subcategories
  WHERE id = NEW.subcategory_id AND company_id = NEW.company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sub-category not found.';
  END IF;
  IF v_sub_cat IS DISTINCT FROM NEW.category_id THEN
    RAISE EXCEPTION 'Sub-category does not belong to the selected category.';
  END IF;

  NEW.track_serials :=
    COALESCE(lower(btrim(v_master_name)) ~ '^(panel|inverter)s?$', false)
    OR COALESCE(lower(btrim(v_category_name)) ~ '^(panel|inverter)s?$', false);
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
