-- ============================================================
-- 049_inventory_rpcs.sql  (RK Solar inventory port from Sumeru)
-- Atomic stock RPCs. Each call validates, locks and writes in one
-- transaction; any error rolls the whole call back.
-- SECURITY DEFINER bypasses RLS, so every query filters company_id.
-- Requires 048_inventory_core.sql.
-- ============================================================

-- ------------------------------------------------------------
-- Internal helpers (not callable by clients)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION inventory__require(p_key TEXT)
RETURNS UUID
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
BEGIN
  IF auth.uid() IS NULL OR NOT is_active_user() THEN
    RAISE EXCEPTION 'Please sign in again.' USING ERRCODE = '42501';
  END IF;
  v_company := auth_company_id();
  IF v_company IS NULL THEN
    RAISE EXCEPTION 'Your account is not linked to a company.' USING ERRCODE = '42501';
  END IF;
  IF NOT has_authority(p_key) THEN
    RAISE EXCEPTION 'You do not have permission for this (%).', p_key USING ERRCODE = '42501';
  END IF;
  RETURN v_company;
END;
$$;

CREATE OR REPLACE FUNCTION inventory__serial_text(p_entry JSONB)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT normalize_serial(
    CASE jsonb_typeof(p_entry)
      WHEN 'string' THEN p_entry #>> '{}'
      WHEN 'object' THEN p_entry ->> 'serial_no'
      ELSE NULL
    END
  )
$$;

CREATE OR REPLACE FUNCTION inventory__serial_raw(p_entry JSONB)
RETURNS TEXT
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE WHEN jsonb_typeof(p_entry) = 'object' THEN NULLIF(p_entry ->> 'raw_scan', '') END
$$;

-- Normalized serials of one payload line, in order.
CREATE OR REPLACE FUNCTION inventory__line_serials(p_line JSONB)
RETURNS TEXT[]
LANGUAGE sql IMMUTABLE
AS $$
  SELECT COALESCE(array_agg(inventory__serial_text(e) ORDER BY ord), '{}')
  FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(p_line -> 'serials') = 'array' THEN p_line -> 'serials' ELSE '[]'::jsonb END
  ) WITH ORDINALITY AS t(e, ord)
$$;

CREATE OR REPLACE FUNCTION inventory__next_no(p_company UUID, p_type inventory_movement_type)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_year INT := EXTRACT(YEAR FROM (NOW() AT TIME ZONE 'Asia/Kolkata'))::INT;
  v_no INT;
  v_prefix TEXT;
BEGIN
  INSERT INTO inventory_movement_counters (company_id, movement_type, year, last_no)
  VALUES (p_company, p_type, v_year, 1)
  ON CONFLICT (company_id, movement_type, year)
  DO UPDATE SET last_no = inventory_movement_counters.last_no + 1
  RETURNING last_no INTO v_no;

  v_prefix := CASE p_type
    WHEN 'inward' THEN 'IN'
    WHEN 'dispatch' THEN 'DC'
    WHEN 'return' THEN 'RT'
    WHEN 'service_issue' THEN 'SV'
    WHEN 'adjustment' THEN 'ADJ'
    ELSE 'RV'
  END;
  RETURN v_prefix || '-' || v_year || '-' || lpad(v_no::TEXT, GREATEST(4, length(v_no::TEXT)), '0');
END;
$$;

CREATE OR REPLACE FUNCTION inventory__lines(p_payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  IF p_payload IS NULL
     OR jsonb_typeof(p_payload -> 'lines') IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_payload -> 'lines') = 0
  THEN
    RAISE EXCEPTION 'Add at least one item.';
  END IF;
  RETURN p_payload -> 'lines';
END;
$$;

CREATE OR REPLACE FUNCTION inventory__audit(
  p_company UUID, p_lead UUID, p_event TEXT, p_entity UUID, p_meta JSONB
)
RETURNS VOID
LANGUAGE sql SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO audit_events (company_id, lead_id, actor_id, event_type, entity_type, entity_id, metadata)
  VALUES (p_company, p_lead, auth.uid(), p_event, 'inventory_movement', p_entity, COALESCE(p_meta, '{}'::jsonb))
$$;

-- Lock the item rows referenced by a payload (id order avoids deadlocks).
CREATE OR REPLACE FUNCTION inventory__lock_items(p_company UUID, p_lines JSONB)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM 1
  FROM inventory_items
  WHERE company_id = p_company
    AND id IN (
      SELECT (l ->> 'item_id')::UUID FROM jsonb_array_elements(p_lines) l WHERE l ? 'item_id'
    )
  ORDER BY id
  FOR UPDATE;
END;
$$;

-- Shared inward writer (inward RPC + opening stock import).
-- Validates everything first, then writes set-based.
CREATE OR REPLACE FUNCTION inventory__post_inward(
  p_company UUID, p_header JSONB, p_lines JSONB, p_opening BOOLEAN
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_line JSONB;
  v_item inventory_items%ROWTYPE;
  v_serials TEXT[];
  v_all_serials TEXT[] := '{}';
  v_qty NUMERIC;
  v_cost NUMERIC;
  v_dup TEXT;
  v_movement_id UUID;
  v_no TEXT;
  v_line_id UUID;
  v_can_cost BOOLEAN := can_manage_purchase_cost();
  v_serial_count INT := 0;
BEGIN
  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    SELECT * INTO v_item FROM inventory_items
    WHERE id = NULLIF(v_line ->> 'item_id', '')::UUID AND company_id = p_company;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item not found.';
    END IF;
    IF NOT v_item.is_active THEN
      RAISE EXCEPTION '% is inactive.', v_item.name;
    END IF;

    v_serials := inventory__line_serials(v_line);
    IF v_item.track_serials THEN
      IF cardinality(v_serials) = 0 THEN
        RAISE EXCEPTION 'Serial numbers are required for % (one per unit).', v_item.name;
      END IF;
      IF array_position(v_serials, NULL) IS NOT NULL THEN
        RAISE EXCEPTION 'An empty serial number was entered for %.', v_item.name;
      END IF;
      IF NULLIF(v_line ->> 'quantity', '') IS NOT NULL
         AND (v_line ->> 'quantity')::NUMERIC <> cardinality(v_serials) THEN
        RAISE EXCEPTION '%: quantity % does not match % serial numbers.',
          v_item.name, v_line ->> 'quantity', cardinality(v_serials);
      END IF;
      v_all_serials := v_all_serials || v_serials;
    ELSE
      IF cardinality(v_serials) > 0 THEN
        RAISE EXCEPTION '% is not serial-tracked; enter a quantity instead.', v_item.name;
      END IF;
      v_qty := NULLIF(v_line ->> 'quantity', '')::NUMERIC;
      IF v_qty IS NULL OR v_qty <= 0 THEN
        RAISE EXCEPTION 'Enter a quantity above zero for %.', v_item.name;
      END IF;
      IF v_item.unit_type = 'nos' AND v_qty <> trunc(v_qty) THEN
        RAISE EXCEPTION '% is counted in Nos; use a whole number.', v_item.name;
      END IF;
    END IF;

    v_cost := NULLIF(v_line ->> 'unit_cost', '')::NUMERIC;
    IF v_cost IS NOT NULL AND v_cost < 0 THEN
      RAISE EXCEPTION 'Unit cost cannot be negative (%).', v_item.name;
    END IF;
  END LOOP;

  SELECT s INTO v_dup FROM unnest(v_all_serials) s GROUP BY s HAVING COUNT(*) > 1 LIMIT 1;
  IF v_dup IS NOT NULL THEN
    RAISE EXCEPTION 'Serial % is entered more than once.', v_dup;
  END IF;

  SELECT serial_no INTO v_dup FROM inventory_serials
  WHERE company_id = p_company AND serial_no = ANY (v_all_serials) LIMIT 1;
  IF v_dup IS NOT NULL THEN
    RAISE EXCEPTION 'Serial % is already in inventory.', v_dup;
  END IF;

  v_no := inventory__next_no(p_company, 'inward');
  INSERT INTO inventory_movements (
    company_id, movement_type, movement_no, is_opening_stock,
    supplier_name, supplier_invoice_no, supplier_invoice_date,
    movement_date, notes, created_by
  ) VALUES (
    p_company, 'inward', v_no, COALESCE(p_opening, false),
    NULLIF(btrim(p_header ->> 'supplier_name'), ''),
    NULLIF(btrim(p_header ->> 'supplier_invoice_no'), ''),
    NULLIF(p_header ->> 'supplier_invoice_date', '')::DATE,
    COALESCE(NULLIF(p_header ->> 'movement_date', '')::DATE, CURRENT_DATE),
    NULLIF(btrim(p_header ->> 'notes'), ''),
    auth.uid()
  ) RETURNING id INTO v_movement_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    SELECT * INTO v_item FROM inventory_items WHERE id = (v_line ->> 'item_id')::UUID;
    v_serials := inventory__line_serials(v_line);
    v_qty := CASE WHEN v_item.track_serials THEN cardinality(v_serials) ELSE (v_line ->> 'quantity')::NUMERIC END;

    INSERT INTO inventory_movement_lines (company_id, movement_id, item_id, quantity_delta, notes)
    VALUES (p_company, v_movement_id, v_item.id, v_qty, NULLIF(btrim(v_line ->> 'notes'), ''))
    RETURNING id INTO v_line_id;

    IF v_item.track_serials THEN
      INSERT INTO inventory_serials (company_id, item_id, serial_no, status, inward_line_id, raw_scan)
      SELECT p_company, v_item.id, inventory__serial_text(e), 'in_stock', v_line_id, inventory__serial_raw(e)
      FROM jsonb_array_elements(v_line -> 'serials') e;

      INSERT INTO inventory_movement_line_serials (company_id, line_id, serial_id)
      SELECT p_company, v_line_id, id FROM inventory_serials WHERE inward_line_id = v_line_id;

      v_serial_count := v_serial_count + cardinality(v_serials);
    END IF;

    v_cost := NULLIF(v_line ->> 'unit_cost', '')::NUMERIC;
    IF v_can_cost AND v_cost IS NOT NULL THEN
      INSERT INTO inventory_inward_costs (line_id, company_id, unit_cost, gst_percent, created_by)
      VALUES (v_line_id, p_company, v_cost, NULLIF(v_line ->> 'gst_percent', '')::NUMERIC, auth.uid());
    END IF;
  END LOOP;

  PERFORM inventory__audit(p_company, NULL,
    CASE WHEN p_opening THEN 'inventory_opening_stock' ELSE 'inventory_inward' END,
    v_movement_id,
    jsonb_build_object('movement_no', v_no, 'lines', jsonb_array_length(p_lines), 'serials', v_serial_count));

  RETURN jsonb_build_object('id', v_movement_id, 'movement_no', v_no, 'serials', v_serial_count);
END;
$$;

-- ------------------------------------------------------------
-- Public RPCs
-- ------------------------------------------------------------

-- payload: { movement_date?, supplier_name?, supplier_invoice_no?, supplier_invoice_date?, notes?,
--            is_opening_stock?, lines: [{ item_id, quantity?, serials?: [text | {serial_no, raw_scan}],
--            unit_cost?, gst_percent?, notes? }] }
CREATE OR REPLACE FUNCTION inventory_post_inward(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := inventory__require('inventory_inward');
  v_lines JSONB := inventory__lines(payload);
BEGIN
  RETURN inventory__post_inward(
    v_company, payload, v_lines, COALESCE((payload ->> 'is_opening_stock')::BOOLEAN, false)
  );
END;
$$;

-- payload: { lead_id, movement_date?, vehicle_no?, delivered_by?, notes?,
--            lines: [{ item_id, quantity?, serials?: [...] }] }
CREATE OR REPLACE FUNCTION inventory_post_dispatch(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := inventory__require('inventory_dispatch');
  v_lines JSONB := inventory__lines(payload);
  v_lead leads%ROWTYPE;
  v_line JSONB;
  v_item inventory_items%ROWTYPE;
  v_serials TEXT[];
  v_all_serials TEXT[] := '{}';
  v_qty NUMERIC;
  v_totals JSONB := '{}'::jsonb;
  v_total RECORD;
  v_on_hand NUMERIC;
  v_bad RECORD;
  v_dup TEXT;
  v_movement_id UUID;
  v_no TEXT;
  v_line_id UUID;
  v_serial_count INT := 0;
BEGIN
  SELECT * INTO v_lead FROM leads
  WHERE id = NULLIF(payload ->> 'lead_id', '')::UUID AND company_id = v_company;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found.';
  END IF;
  IF v_lead.sales_stage::TEXT NOT IN ('quote_accepted','token_pending_verification','token_verified_and_feasibility_ok','pre_dispatch_pending_verification','pre_dispatch_verified','installation_assigned','installation_in_progress','installation_completed','final_pending_verification','final_verified','liaison_in_progress','meter_installed','subsidy_pending','subsidy_received_pending_accounts','completed') THEN
    RAISE EXCEPTION 'Material can only be dispatched to a customer (Won or Project Completed).';
  END IF;

  PERFORM inventory__lock_items(v_company, v_lines);

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
    SELECT * INTO v_item FROM inventory_items
    WHERE id = NULLIF(v_line ->> 'item_id', '')::UUID AND company_id = v_company;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item not found.';
    END IF;
    IF NOT v_item.is_active THEN
      RAISE EXCEPTION '% is inactive.', v_item.name;
    END IF;

    v_serials := inventory__line_serials(v_line);
    IF v_item.track_serials THEN
      IF cardinality(v_serials) = 0 THEN
        RAISE EXCEPTION 'Scan the serial number of every % unit. Serial numbers are required for dispatch.', v_item.name;
      END IF;
      IF array_position(v_serials, NULL) IS NOT NULL THEN
        RAISE EXCEPTION 'An empty serial number was entered for %.', v_item.name;
      END IF;
      IF NULLIF(v_line ->> 'quantity', '') IS NOT NULL
         AND (v_line ->> 'quantity')::NUMERIC <> cardinality(v_serials) THEN
        RAISE EXCEPTION '%: quantity % does not match % serial numbers.',
          v_item.name, v_line ->> 'quantity', cardinality(v_serials);
      END IF;

      PERFORM 1 FROM inventory_serials
      WHERE company_id = v_company AND serial_no = ANY (v_serials)
      ORDER BY id FOR UPDATE;

      SELECT x AS serial_no INTO v_bad FROM unnest(v_serials) x
      WHERE NOT EXISTS (SELECT 1 FROM inventory_serials s WHERE s.company_id = v_company AND s.serial_no = x)
      LIMIT 1;
      IF FOUND THEN
        RAISE EXCEPTION 'Serial % is not in inventory. Record it on an inward first.', v_bad.serial_no;
      END IF;

      SELECT s.serial_no, i.name AS item_name INTO v_bad
      FROM inventory_serials s JOIN inventory_items i ON i.id = s.item_id
      WHERE s.company_id = v_company AND s.serial_no = ANY (v_serials) AND s.item_id <> v_item.id
      LIMIT 1;
      IF FOUND THEN
        RAISE EXCEPTION 'Serial % belongs to %, not %.', v_bad.serial_no, v_bad.item_name, v_item.name;
      END IF;

      SELECT s.serial_no, s.status, l.name AS lead_name INTO v_bad
      FROM inventory_serials s LEFT JOIN leads l ON l.id = s.current_lead_id
      WHERE s.company_id = v_company AND s.serial_no = ANY (v_serials) AND s.status <> 'in_stock'
      LIMIT 1;
      IF FOUND THEN
        IF v_bad.status = 'dispatched' THEN
          RAISE EXCEPTION 'Serial % is already dispatched to %.', v_bad.serial_no, v_bad.lead_name;
        END IF;
        RAISE EXCEPTION 'Serial % is marked %, so it cannot be dispatched.', v_bad.serial_no, v_bad.status;
      END IF;

      v_all_serials := v_all_serials || v_serials;
    ELSE
      IF cardinality(v_serials) > 0 THEN
        RAISE EXCEPTION '% is not serial-tracked; enter a quantity instead.', v_item.name;
      END IF;
      v_qty := NULLIF(v_line ->> 'quantity', '')::NUMERIC;
      IF v_qty IS NULL OR v_qty <= 0 THEN
        RAISE EXCEPTION 'Enter a quantity above zero for %.', v_item.name;
      END IF;
      IF v_item.unit_type = 'nos' AND v_qty <> trunc(v_qty) THEN
        RAISE EXCEPTION '% is counted in Nos; use a whole number.', v_item.name;
      END IF;
      v_totals := jsonb_set(v_totals, ARRAY[v_item.id::TEXT],
        to_jsonb(COALESCE((v_totals ->> v_item.id::TEXT)::NUMERIC, 0) + v_qty));
    END IF;
  END LOOP;

  SELECT s INTO v_dup FROM unnest(v_all_serials) s GROUP BY s HAVING COUNT(*) > 1 LIMIT 1;
  IF v_dup IS NOT NULL THEN
    RAISE EXCEPTION 'Serial % is entered more than once.', v_dup;
  END IF;

  FOR v_total IN SELECT key::UUID AS item_id, value::NUMERIC AS qty FROM jsonb_each_text(v_totals) LOOP
    v_on_hand := inventory_bulk_on_hand(v_total.item_id);
    IF v_on_hand < v_total.qty THEN
      SELECT * INTO v_item FROM inventory_items WHERE id = v_total.item_id;
      RAISE EXCEPTION 'Only % % of % in stock (asked for %).',
        trim_scale(v_on_hand), v_item.unit_type, v_item.name, trim_scale(v_total.qty);
    END IF;
  END LOOP;

  v_no := inventory__next_no(v_company, 'dispatch');
  INSERT INTO inventory_movements (
    company_id, movement_type, movement_no, lead_id, vehicle_no, delivered_by, movement_date, notes, created_by
  ) VALUES (
    v_company, 'dispatch', v_no, v_lead.id,
    NULLIF(btrim(payload ->> 'vehicle_no'), ''),
    NULLIF(btrim(payload ->> 'delivered_by'), ''),
    COALESCE(NULLIF(payload ->> 'movement_date', '')::DATE, CURRENT_DATE),
    NULLIF(btrim(payload ->> 'notes'), ''),
    auth.uid()
  ) RETURNING id INTO v_movement_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
    SELECT * INTO v_item FROM inventory_items WHERE id = (v_line ->> 'item_id')::UUID;
    v_serials := inventory__line_serials(v_line);
    v_qty := CASE WHEN v_item.track_serials THEN cardinality(v_serials) ELSE (v_line ->> 'quantity')::NUMERIC END;

    INSERT INTO inventory_movement_lines (company_id, movement_id, item_id, quantity_delta, notes)
    VALUES (v_company, v_movement_id, v_item.id, -v_qty, NULLIF(btrim(v_line ->> 'notes'), ''))
    RETURNING id INTO v_line_id;

    IF v_item.track_serials THEN
      INSERT INTO inventory_movement_line_serials (company_id, line_id, serial_id)
      SELECT v_company, v_line_id, id FROM inventory_serials
      WHERE company_id = v_company AND serial_no = ANY (v_serials);

      UPDATE inventory_serials
      SET status = 'dispatched', current_lead_id = v_lead.id
      WHERE company_id = v_company AND serial_no = ANY (v_serials);

      v_serial_count := v_serial_count + cardinality(v_serials);
    END IF;
  END LOOP;

  PERFORM inventory__audit(v_company, v_lead.id, 'inventory_dispatch', v_movement_id,
    jsonb_build_object('movement_no', v_no, 'lines', jsonb_array_length(v_lines), 'serials', v_serial_count));

  RETURN jsonb_build_object('id', v_movement_id, 'movement_no', v_no, 'serials', v_serial_count);
END;
$$;

-- payload: { lead_id, movement_date?, notes?,
--            lines: [{ item_id, quantity?, condition?: 'good'|'defective', serials?: [...] }] }
CREATE OR REPLACE FUNCTION inventory_post_return(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := inventory__require('inventory_return');
  v_lines JSONB := inventory__lines(payload);
  v_lead leads%ROWTYPE;
  v_line JSONB;
  v_item inventory_items%ROWTYPE;
  v_serials TEXT[];
  v_all_serials TEXT[] := '{}';
  v_qty NUMERIC;
  v_condition inventory_return_condition;
  v_totals JSONB := '{}'::jsonb;
  v_total RECORD;
  v_used NUMERIC;
  v_bad RECORD;
  v_dup TEXT;
  v_movement_id UUID;
  v_no TEXT;
  v_line_id UUID;
  v_serial_count INT := 0;
BEGIN
  SELECT * INTO v_lead FROM leads
  WHERE id = NULLIF(payload ->> 'lead_id', '')::UUID AND company_id = v_company;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Customer not found.';
  END IF;

  PERFORM inventory__lock_items(v_company, v_lines);

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
    SELECT * INTO v_item FROM inventory_items
    WHERE id = NULLIF(v_line ->> 'item_id', '')::UUID AND company_id = v_company;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item not found.';
    END IF;

    IF COALESCE(v_line ->> 'condition', 'good') NOT IN ('good', 'defective') THEN
      RAISE EXCEPTION 'Return condition must be good or defective.';
    END IF;

    v_serials := inventory__line_serials(v_line);
    IF v_item.track_serials THEN
      IF cardinality(v_serials) = 0 THEN
        RAISE EXCEPTION 'Scan the serial number of every % unit being returned.', v_item.name;
      END IF;
      IF array_position(v_serials, NULL) IS NOT NULL THEN
        RAISE EXCEPTION 'An empty serial number was entered for %.', v_item.name;
      END IF;

      PERFORM 1 FROM inventory_serials
      WHERE company_id = v_company AND serial_no = ANY (v_serials)
      ORDER BY id FOR UPDATE;

      SELECT x AS serial_no INTO v_bad FROM unnest(v_serials) x
      WHERE NOT EXISTS (
        SELECT 1 FROM inventory_serials s
        WHERE s.company_id = v_company AND s.serial_no = x AND s.item_id = v_item.id
          AND s.status = 'dispatched' AND s.current_lead_id = v_lead.id
      )
      LIMIT 1;
      IF FOUND THEN
        RAISE EXCEPTION 'Serial % (%) is not at this customer.', v_bad.serial_no, v_item.name;
      END IF;

      v_all_serials := v_all_serials || v_serials;
    ELSE
      IF cardinality(v_serials) > 0 THEN
        RAISE EXCEPTION '% is not serial-tracked; enter a quantity instead.', v_item.name;
      END IF;
      v_qty := NULLIF(v_line ->> 'quantity', '')::NUMERIC;
      IF v_qty IS NULL OR v_qty <= 0 THEN
        RAISE EXCEPTION 'Enter a quantity above zero for %.', v_item.name;
      END IF;
      IF v_item.unit_type = 'nos' AND v_qty <> trunc(v_qty) THEN
        RAISE EXCEPTION '% is counted in Nos; use a whole number.', v_item.name;
      END IF;
      v_totals := jsonb_set(v_totals, ARRAY[v_item.id::TEXT],
        to_jsonb(COALESCE((v_totals ->> v_item.id::TEXT)::NUMERIC, 0) + v_qty));
    END IF;
  END LOOP;

  SELECT s INTO v_dup FROM unnest(v_all_serials) s GROUP BY s HAVING COUNT(*) > 1 LIMIT 1;
  IF v_dup IS NOT NULL THEN
    RAISE EXCEPTION 'Serial % is entered more than once.', v_dup;
  END IF;

  FOR v_total IN SELECT key::UUID AS item_id, value::NUMERIC AS qty FROM jsonb_each_text(v_totals) LOOP
    v_used := inventory_customer_used(v_lead.id, v_total.item_id);
    IF v_used < v_total.qty THEN
      SELECT * INTO v_item FROM inventory_items WHERE id = v_total.item_id;
      RAISE EXCEPTION 'This customer has only % % of % (asked to return %).',
        trim_scale(v_used), v_item.unit_type, v_item.name, trim_scale(v_total.qty);
    END IF;
  END LOOP;

  v_no := inventory__next_no(v_company, 'return');
  INSERT INTO inventory_movements (company_id, movement_type, movement_no, lead_id, movement_date, notes, created_by)
  VALUES (
    v_company, 'return', v_no, v_lead.id,
    COALESCE(NULLIF(payload ->> 'movement_date', '')::DATE, CURRENT_DATE),
    NULLIF(btrim(payload ->> 'notes'), ''),
    auth.uid()
  ) RETURNING id INTO v_movement_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
    SELECT * INTO v_item FROM inventory_items WHERE id = (v_line ->> 'item_id')::UUID;
    v_serials := inventory__line_serials(v_line);
    v_condition := COALESCE(v_line ->> 'condition', 'good')::inventory_return_condition;
    v_qty := CASE WHEN v_item.track_serials THEN cardinality(v_serials) ELSE (v_line ->> 'quantity')::NUMERIC END;

    INSERT INTO inventory_movement_lines (company_id, movement_id, item_id, quantity_delta, return_condition, notes)
    VALUES (v_company, v_movement_id, v_item.id, v_qty, v_condition, NULLIF(btrim(v_line ->> 'notes'), ''))
    RETURNING id INTO v_line_id;

    IF v_item.track_serials THEN
      INSERT INTO inventory_movement_line_serials (company_id, line_id, serial_id)
      SELECT v_company, v_line_id, id FROM inventory_serials
      WHERE company_id = v_company AND serial_no = ANY (v_serials);

      UPDATE inventory_serials
      SET status = CASE WHEN v_condition = 'good' THEN 'in_stock'::serial_status ELSE 'defective'::serial_status END,
          current_lead_id = NULL
      WHERE company_id = v_company AND serial_no = ANY (v_serials);

      v_serial_count := v_serial_count + cardinality(v_serials);
    END IF;
  END LOOP;

  PERFORM inventory__audit(v_company, v_lead.id, 'inventory_return', v_movement_id,
    jsonb_build_object('movement_no', v_no, 'lines', jsonb_array_length(v_lines), 'serials', v_serial_count));

  RETURN jsonb_build_object('id', v_movement_id, 'movement_no', v_no, 'serials', v_serial_count);
END;
$$;

-- payload: { reason, movement_date?, notes?,
--            lines: [{ item_id, quantity_delta? (bulk, signed),
--                      serial_action?: 'scrap'|'defective'|'restore', serials?: [...] }] }
CREATE OR REPLACE FUNCTION inventory_post_adjustment(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := inventory__require('inventory_adjust');
  v_lines JSONB := inventory__lines(payload);
  v_reason TEXT := NULLIF(btrim(payload ->> 'reason'), '');
  v_line JSONB;
  v_item inventory_items%ROWTYPE;
  v_serials TEXT[];
  v_all_serials TEXT[] := '{}';
  v_action TEXT;
  v_allowed serial_status[];
  v_delta NUMERIC;
  v_totals JSONB := '{}'::jsonb;
  v_total RECORD;
  v_on_hand NUMERIC;
  v_bad RECORD;
  v_dup TEXT;
  v_movement_id UUID;
  v_no TEXT;
  v_line_id UUID;
BEGIN
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'A reason is required for stock adjustments.';
  END IF;

  PERFORM inventory__lock_items(v_company, v_lines);

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
    SELECT * INTO v_item FROM inventory_items
    WHERE id = NULLIF(v_line ->> 'item_id', '')::UUID AND company_id = v_company;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item not found.';
    END IF;

    v_serials := inventory__line_serials(v_line);
    IF v_item.track_serials THEN
      v_action := v_line ->> 'serial_action';
      v_allowed := CASE v_action
        WHEN 'scrap' THEN ARRAY['in_stock', 'defective']::serial_status[]
        WHEN 'defective' THEN ARRAY['in_stock']::serial_status[]
        WHEN 'restore' THEN ARRAY['defective', 'scrapped']::serial_status[]
        ELSE NULL
      END;
      IF v_allowed IS NULL THEN
        RAISE EXCEPTION 'Choose scrap, defective or restore for %.', v_item.name;
      END IF;
      IF cardinality(v_serials) = 0 OR array_position(v_serials, NULL) IS NOT NULL THEN
        RAISE EXCEPTION 'Scan the serial numbers to adjust for %.', v_item.name;
      END IF;

      PERFORM 1 FROM inventory_serials
      WHERE company_id = v_company AND serial_no = ANY (v_serials)
      ORDER BY id FOR UPDATE;

      SELECT x AS serial_no INTO v_bad FROM unnest(v_serials) x
      WHERE NOT EXISTS (
        SELECT 1 FROM inventory_serials s
        WHERE s.company_id = v_company AND s.serial_no = x AND s.item_id = v_item.id AND s.status = ANY (v_allowed)
      )
      LIMIT 1;
      IF FOUND THEN
        RAISE EXCEPTION 'Serial % (%) cannot be marked % from its current status.', v_bad.serial_no, v_item.name, v_action;
      END IF;
      v_all_serials := v_all_serials || v_serials;
    ELSE
      IF cardinality(v_serials) > 0 THEN
        RAISE EXCEPTION '% is not serial-tracked; enter a quantity instead.', v_item.name;
      END IF;
      v_delta := NULLIF(v_line ->> 'quantity_delta', '')::NUMERIC;
      IF v_delta IS NULL OR v_delta = 0 THEN
        RAISE EXCEPTION 'Enter a quantity to add or remove for %.', v_item.name;
      END IF;
      IF v_item.unit_type = 'nos' AND v_delta <> trunc(v_delta) THEN
        RAISE EXCEPTION '% is counted in Nos; use a whole number.', v_item.name;
      END IF;
      v_totals := jsonb_set(v_totals, ARRAY[v_item.id::TEXT],
        to_jsonb(COALESCE((v_totals ->> v_item.id::TEXT)::NUMERIC, 0) + v_delta));
    END IF;
  END LOOP;

  SELECT s INTO v_dup FROM unnest(v_all_serials) s GROUP BY s HAVING COUNT(*) > 1 LIMIT 1;
  IF v_dup IS NOT NULL THEN
    RAISE EXCEPTION 'Serial % is entered more than once.', v_dup;
  END IF;

  FOR v_total IN SELECT key::UUID AS item_id, value::NUMERIC AS qty FROM jsonb_each_text(v_totals) LOOP
    v_on_hand := inventory_bulk_on_hand(v_total.item_id);
    IF v_on_hand + v_total.qty < 0 THEN
      SELECT * INTO v_item FROM inventory_items WHERE id = v_total.item_id;
      RAISE EXCEPTION 'Stock of % cannot go below zero (on hand %).', v_item.name, trim_scale(v_on_hand);
    END IF;
  END LOOP;

  v_no := inventory__next_no(v_company, 'adjustment');
  INSERT INTO inventory_movements (company_id, movement_type, movement_no, movement_date, reason, notes, created_by)
  VALUES (
    v_company, 'adjustment', v_no,
    COALESCE(NULLIF(payload ->> 'movement_date', '')::DATE, CURRENT_DATE),
    v_reason, NULLIF(btrim(payload ->> 'notes'), ''), auth.uid()
  ) RETURNING id INTO v_movement_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(v_lines) LOOP
    SELECT * INTO v_item FROM inventory_items WHERE id = (v_line ->> 'item_id')::UUID;
    v_serials := inventory__line_serials(v_line);

    IF v_item.track_serials THEN
      v_action := v_line ->> 'serial_action';
      INSERT INTO inventory_movement_lines (company_id, movement_id, item_id, quantity_delta, serial_action, notes)
      VALUES (
        v_company, v_movement_id, v_item.id,
        CASE WHEN v_action = 'restore' THEN cardinality(v_serials) ELSE -cardinality(v_serials) END,
        v_action, NULLIF(btrim(v_line ->> 'notes'), '')
      ) RETURNING id INTO v_line_id;

      INSERT INTO inventory_movement_line_serials (company_id, line_id, serial_id)
      SELECT v_company, v_line_id, id FROM inventory_serials
      WHERE company_id = v_company AND serial_no = ANY (v_serials);

      UPDATE inventory_serials
      SET status = CASE v_action
            WHEN 'scrap' THEN 'scrapped'::serial_status
            WHEN 'defective' THEN 'defective'::serial_status
            ELSE 'in_stock'::serial_status
          END
      WHERE company_id = v_company AND serial_no = ANY (v_serials);
    ELSE
      INSERT INTO inventory_movement_lines (company_id, movement_id, item_id, quantity_delta, notes)
      VALUES (
        v_company, v_movement_id, v_item.id,
        (v_line ->> 'quantity_delta')::NUMERIC, NULLIF(btrim(v_line ->> 'notes'), '')
      );
    END IF;
  END LOOP;

  PERFORM inventory__audit(v_company, NULL, 'inventory_adjustment', v_movement_id,
    jsonb_build_object('movement_no', v_no, 'reason', v_reason, 'lines', jsonb_array_length(v_lines)));

  RETURN jsonb_build_object('id', v_movement_id, 'movement_no', v_no);
END;
$$;

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

-- Opening stock from Excel. One transaction for the whole batch.
-- payload: { file_name?, movement_date?,
--            new_items?: [{ key, name, category_id?, brand_id?, sku?, unit_type?, low_stock_threshold?, specifications? }],
--            lines: [{ item_id? | item_key?, quantity?, serials?: [...], unit_cost? }] }
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
        company_id, name, sku, category_id, brand_id, unit_type, low_stock_threshold, specifications, created_by
      ) VALUES (
        v_company,
        btrim(v_new ->> 'name'),
        NULLIF(btrim(v_new ->> 'sku'), ''),
        NULLIF(v_new ->> 'category_id', '')::UUID,
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

-- Live scan validation for the serial input (read only).
-- p_mode: 'inward' | 'dispatch' | 'return' (return needs p_lead_id).
CREATE OR REPLACE FUNCTION inventory_check_serials(
  p_item_id UUID, p_serials TEXT[], p_mode TEXT, p_lead_id UUID DEFAULT NULL
)
RETURNS TABLE (input TEXT, serial_no TEXT, ok BOOLEAN, message TEXT)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := inventory__require('view_inventory');
BEGIN
  IF p_mode NOT IN ('inward', 'dispatch', 'return') THEN
    RAISE EXCEPTION 'Unknown check mode.';
  END IF;

  RETURN QUERY
  SELECT
    t.raw,
    normalize_serial(t.raw),
    CASE
      WHEN normalize_serial(t.raw) IS NULL THEN false
      WHEN p_mode = 'inward' THEN s.id IS NULL
      WHEN s.id IS NULL THEN false
      WHEN s.item_id <> p_item_id THEN false
      WHEN p_mode = 'dispatch' THEN s.status = 'in_stock'
      ELSE s.status = 'dispatched' AND s.current_lead_id = p_lead_id
    END,
    CASE
      WHEN normalize_serial(t.raw) IS NULL THEN 'Empty scan'
      WHEN p_mode = 'inward' AND s.id IS NOT NULL THEN
        'Already in inventory (' || i.name || ', ' || replace(s.status::TEXT, '_', ' ') || ')'
      WHEN p_mode = 'inward' THEN NULL
      WHEN s.id IS NULL THEN 'Not in inventory'
      WHEN s.item_id <> p_item_id THEN 'Belongs to ' || i.name
      WHEN p_mode = 'dispatch' AND s.status = 'dispatched' THEN 'Already dispatched to ' || COALESCE(l.name, 'a customer')
      WHEN p_mode = 'dispatch' AND s.status <> 'in_stock' THEN 'Marked ' || s.status::TEXT
      WHEN p_mode = 'return' AND (s.status <> 'dispatched' OR s.current_lead_id IS DISTINCT FROM p_lead_id) THEN
        'Not at this customer'
      ELSE NULL
    END
  FROM unnest(p_serials) WITH ORDINALITY AS t(raw, ord)
  LEFT JOIN inventory_serials s ON s.company_id = v_company AND s.serial_no = normalize_serial(t.raw)
  LEFT JOIN inventory_items i ON i.id = s.item_id
  LEFT JOIN leads l ON l.id = s.current_lead_id
  ORDER BY t.ord;
END;
$$;

-- ------------------------------------------------------------
-- Grants: public RPCs for signed-in users only; helpers private.
-- ------------------------------------------------------------
REVOKE ALL ON FUNCTION inventory__require(TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION inventory__next_no(UUID, inventory_movement_type) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION inventory__audit(UUID, UUID, TEXT, UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION inventory__lock_items(UUID, JSONB) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION inventory__post_inward(UUID, JSONB, JSONB, BOOLEAN) FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION inventory_post_inward(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION inventory_post_dispatch(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION inventory_post_return(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION inventory_post_adjustment(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION inventory_reverse_movement(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION inventory_import_opening_stock(JSONB) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION inventory_check_serials(UUID, TEXT[], TEXT, UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION inventory_post_inward(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION inventory_post_dispatch(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION inventory_post_return(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION inventory_post_adjustment(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION inventory_reverse_movement(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION inventory_import_opening_stock(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION inventory_check_serials(UUID, TEXT[], TEXT, UUID) TO authenticated;
