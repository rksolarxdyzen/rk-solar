-- ============================================================
-- 061_inventory_item_name_per_subcategory.sql
-- handover: 026_inventory_item_name_per_subcategory.sql
-- Allow the same item name under different sub-categories
-- (e.g. Polycab under multiple inverter sub-categories).
-- Same name + same sub-category (or both null) stays unique.
-- Requires 048/013 + 059/024 (subcategory_id column).
-- ============================================================

DROP INDEX IF EXISTS inventory_items_company_name_uq;

-- NULL subcategory treated as one bucket (sentinel UUID).
CREATE UNIQUE INDEX IF NOT EXISTS inventory_items_company_name_sub_uq
  ON inventory_items (
    company_id,
    lower(name),
    (COALESCE(subcategory_id, '00000000-0000-0000-0000-000000000000'::uuid))
  );

-- Opening import: only reject when name collides in the same sub-category
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
  v_sub UUID;
BEGIN
  IF jsonb_typeof(payload -> 'new_items') = 'array' AND jsonb_array_length(payload -> 'new_items') > 0 THEN
    IF NOT has_authority('manage_inventory_items') THEN
      RAISE EXCEPTION 'Creating new items needs the Manage Inventory Items permission.' USING ERRCODE = '42501';
    END IF;
    FOR v_new IN SELECT * FROM jsonb_array_elements(payload -> 'new_items') LOOP
      IF NULLIF(btrim(v_new ->> 'name'), '') IS NULL OR NULLIF(v_new ->> 'key', '') IS NULL THEN
        RAISE EXCEPTION 'Each new item needs a name.';
      END IF;
      v_sub := NULLIF(v_new ->> 'subcategory_id', '')::UUID;
      IF EXISTS (
        SELECT 1 FROM inventory_items
        WHERE company_id = v_company
          AND lower(name) = lower(btrim(v_new ->> 'name'))
          AND subcategory_id IS NOT DISTINCT FROM v_sub
      ) THEN
        RAISE EXCEPTION
          'Item "%" already exists in this sub-category. Map the rows to it instead of creating it.',
          btrim(v_new ->> 'name');
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
        v_sub,
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

GRANT EXECUTE ON FUNCTION inventory_import_opening_stock(JSONB) TO authenticated;
