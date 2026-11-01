-- ============================================================
-- 062_inventory_delete_item_relaxed.sql
-- handover: 027_inventory_delete_item_relaxed.sql
-- Allow hard-delete when the item has no live stock trail:
-- only reversed movements (or none), and no serial rows left.
-- Requires 018 / 053.
-- ============================================================

CREATE OR REPLACE FUNCTION inventory_delete_item(p_item_id UUID)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := auth_company_id();
  v_name TEXT;
BEGIN
  IF auth.uid() IS NULL OR NOT is_active_user() OR NOT has_authority('manage_inventory_items') THEN
    RAISE EXCEPTION 'You do not have permission to delete inventory items.' USING ERRCODE = '42501';
  END IF;

  SELECT name INTO v_name
  FROM inventory_items
  WHERE id = p_item_id AND company_id = v_company
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Item not found.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM inventory_movement_lines ml
    JOIN inventory_movements m ON m.id = ml.movement_id
    WHERE ml.item_id = p_item_id
      AND m.company_id = v_company
      AND m.reversed_by_id IS NULL
      AND m.movement_type::text <> 'reversal'
  ) OR EXISTS (
    SELECT 1 FROM inventory_serials WHERE item_id = p_item_id AND company_id = v_company
  ) THEN
    RAISE EXCEPTION
      'ITEM_HAS_HISTORY: % has stock entries, so it cannot be deleted. Mark it inactive instead.',
      v_name;
  END IF;

  -- Cleared trail (reversed-only lines): remove orphan line/serial links then the item.
  DELETE FROM inventory_movement_line_serials mls
  USING inventory_movement_lines ml
  WHERE mls.line_id = ml.id AND ml.item_id = p_item_id;

  DELETE FROM inventory_inward_costs c
  USING inventory_movement_lines ml
  WHERE c.line_id = ml.id AND ml.item_id = p_item_id;

  DELETE FROM inventory_movement_lines WHERE item_id = p_item_id;
  DELETE FROM inventory_item_costs WHERE item_id = p_item_id AND company_id = v_company;
  DELETE FROM inventory_items WHERE id = p_item_id AND company_id = v_company;

  RETURN v_name;
END;
$$;

REVOKE ALL ON FUNCTION inventory_delete_item(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION inventory_delete_item(UUID) TO authenticated;
