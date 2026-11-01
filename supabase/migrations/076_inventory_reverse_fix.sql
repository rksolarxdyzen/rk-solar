-- ============================================================
-- 051_inventory_reverse_fix.sql  (RK Solar inventory port from Sumeru)
-- Fix inventory_reverse_movement:
--  * Entries can be reversed newest-first (return, then dispatch,
--    then inward); reversed entries and reversal rows no longer
--    count as "moved since".
--  * Reversing an inward frees serials that had reversed history.
-- Requires 049_inventory_rpcs.sql. Safe to re-run.
-- ============================================================
-- Undo an inward, dispatch or return by recording a reversal.
-- Blocked when a serial on it has moved since, or when stock would go negative.
CREATE OR REPLACE FUNCTION inventory_reverse_movement(p_movement_id UUID, p_reason TEXT)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := inventory__require('inventory_adjust');
  v_reason TEXT := NULLIF(btrim(p_reason), '');
  v_m inventory_movements%ROWTYPE;
  v_line RECORD;
  v_bad RECORD;
  v_item inventory_items%ROWTYPE;
  v_new_id UUID;
  v_new_line_id UUID;
  v_no TEXT;
  v_removed TEXT[] := '{}';
BEGIN
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'A reason is required to reverse an entry.';
  END IF;

  SELECT * INTO v_m FROM inventory_movements
  WHERE id = p_movement_id AND company_id = v_company
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Entry not found.';
  END IF;
  IF v_m.reversed_by_id IS NOT NULL THEN
    RAISE EXCEPTION '% is already reversed.', v_m.movement_no;
  END IF;
  IF v_m.movement_type NOT IN ('inward', 'dispatch', 'return') THEN
    RAISE EXCEPTION 'Only inward, dispatch and return entries can be reversed. Record an adjustment instead.';
  END IF;

  PERFORM 1 FROM inventory_items
  WHERE id IN (SELECT item_id FROM inventory_movement_lines WHERE movement_id = v_m.id)
  ORDER BY id FOR UPDATE;

  PERFORM 1 FROM inventory_serials
  WHERE id IN (
    SELECT ls.serial_id FROM inventory_movement_line_serials ls
    JOIN inventory_movement_lines ml ON ml.id = ls.line_id
    WHERE ml.movement_id = v_m.id
  )
  ORDER BY id FOR UPDATE;

  -- Every serial on this entry must not have moved since
  -- (later entries that are already reversed, and reversal entries, cancel out).
  SELECT s.serial_no INTO v_bad
  FROM inventory_movement_line_serials ls
  JOIN inventory_movement_lines ml ON ml.id = ls.line_id
  JOIN inventory_serials s ON s.id = ls.serial_id
  WHERE ml.movement_id = v_m.id
    AND EXISTS (
      SELECT 1
      FROM inventory_movement_line_serials ls2
      JOIN inventory_movement_lines ml2 ON ml2.id = ls2.line_id
      JOIN inventory_movements m2 ON m2.id = ml2.movement_id
      WHERE ls2.serial_id = ls.serial_id
        AND m2.id <> v_m.id
        AND m2.created_at > v_m.created_at
        AND m2.reversed_by_id IS NULL
        AND m2.movement_type <> 'reversal'
    )
  LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Serial % has moved since %. Reverse the later entries first.', v_bad.serial_no, v_m.movement_no;
  END IF;

  -- Bulk stock / customer balance checks.
  FOR v_line IN
    SELECT ml.item_id, SUM(ml.quantity_delta) AS delta,
           SUM(ml.quantity_delta) FILTER (WHERE ml.return_condition IS DISTINCT FROM 'defective') AS stock_delta
    FROM inventory_movement_lines ml
    JOIN inventory_items i ON i.id = ml.item_id
    WHERE ml.movement_id = v_m.id AND NOT i.track_serials
    GROUP BY ml.item_id
  LOOP
    SELECT * INTO v_item FROM inventory_items WHERE id = v_line.item_id;
    IF COALESCE(v_line.stock_delta, 0) > 0
       AND inventory_bulk_on_hand(v_line.item_id) - v_line.stock_delta < 0 THEN
      RAISE EXCEPTION 'Not enough % left in stock to reverse %.', v_item.name, v_m.movement_no;
    END IF;
    IF v_m.movement_type = 'dispatch'
       AND inventory_customer_used(v_m.lead_id, v_line.item_id) + v_line.delta < 0 THEN
      RAISE EXCEPTION 'Some % from % was already returned. Reverse the return first.', v_item.name, v_m.movement_no;
    END IF;
  END LOOP;

  v_no := inventory__next_no(v_company, 'reversal');
  INSERT INTO inventory_movements (
    company_id, movement_type, movement_no, lead_id, movement_date, reason, notes, reverses_id, created_by
  ) VALUES (
    v_company, 'reversal', v_no, v_m.lead_id, CURRENT_DATE, v_reason,
    'Reversal of ' || v_m.movement_no, v_m.id, auth.uid()
  ) RETURNING id INTO v_new_id;

  FOR v_line IN SELECT * FROM inventory_movement_lines WHERE movement_id = v_m.id LOOP
    INSERT INTO inventory_movement_lines (
      company_id, movement_id, item_id, quantity_delta, return_condition, serial_action, notes
    ) VALUES (
      v_company, v_new_id, v_line.item_id, -v_line.quantity_delta, v_line.return_condition, v_line.serial_action,
      'Reversal of ' || v_m.movement_no
    ) RETURNING id INTO v_new_line_id;

    IF v_m.movement_type = 'inward' THEN
      -- Undo a wrong inward: free the serial numbers so they can be entered again.
      SELECT v_removed || COALESCE(array_agg(s.serial_no::TEXT), '{}'::TEXT[]) INTO v_removed
      FROM inventory_movement_line_serials ls JOIN inventory_serials s ON s.id = ls.serial_id
      WHERE ls.line_id = v_line.id;

      -- Any later history of these serials is reversed pairs (checked above); drop those links too.
      DELETE FROM inventory_movement_line_serials
      WHERE serial_id IN (SELECT id FROM inventory_serials WHERE inward_line_id = v_line.id);
      DELETE FROM inventory_serials WHERE inward_line_id = v_line.id;
    ELSE
      INSERT INTO inventory_movement_line_serials (company_id, line_id, serial_id)
      SELECT v_company, v_new_line_id, ls.serial_id
      FROM inventory_movement_line_serials ls WHERE ls.line_id = v_line.id;

      IF v_m.movement_type = 'dispatch' THEN
        UPDATE inventory_serials SET status = 'in_stock', current_lead_id = NULL
        WHERE id IN (SELECT serial_id FROM inventory_movement_line_serials WHERE line_id = v_line.id);
      ELSE
        UPDATE inventory_serials SET status = 'dispatched', current_lead_id = v_m.lead_id
        WHERE id IN (SELECT serial_id FROM inventory_movement_line_serials WHERE line_id = v_line.id);
      END IF;
    END IF;
  END LOOP;

  UPDATE inventory_movements SET reversed_by_id = v_new_id WHERE id = v_m.id;

  PERFORM inventory__audit(v_company, v_m.lead_id, 'inventory_reversal', v_new_id,
    jsonb_build_object('movement_no', v_no, 'reverses', v_m.movement_no, 'reason', v_reason,
                       'removed_serials', to_jsonb(v_removed)));

  RETURN jsonb_build_object('id', v_new_id, 'movement_no', v_no);
END;
$$;
