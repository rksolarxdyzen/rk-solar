-- ============================================================
-- 053_inventory_delete_item.sql  (RK Solar inventory port from Sumeru)
-- Delete an inventory item that was never used. Items with any
-- stock entry or serial keep their history and can only be marked
-- inactive. Requires 048–050.
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

  IF EXISTS (SELECT 1 FROM inventory_movement_lines WHERE item_id = p_item_id)
     OR EXISTS (SELECT 1 FROM inventory_serials WHERE item_id = p_item_id) THEN
    RAISE EXCEPTION 'ITEM_HAS_HISTORY: % has stock entries, so it cannot be deleted. Mark it inactive instead.', v_name;
  END IF;

  DELETE FROM inventory_items WHERE id = p_item_id AND company_id = v_company;
  RETURN v_name;
END;
$$;

REVOKE ALL ON FUNCTION inventory_delete_item(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION inventory_delete_item(UUID) TO authenticated;
