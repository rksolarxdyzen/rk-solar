-- ============================================================
-- 060_inventory_parties.sql  (RK Solar inventory port from Sumeru)
-- B2B party directory + dispatch/return to party XOR lead.
-- Requires 048–051 (013–016), On-Floor 054+ optional.
-- ============================================================

-- ------------------------------------------------------------
-- Parties
-- ------------------------------------------------------------
DO $$ BEGIN
  CREATE TYPE inventory_party_kind AS ENUM ('company', 'dealer', 'vendor');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS inventory_parties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kind inventory_party_kind NOT NULL DEFAULT 'dealer',
  name VARCHAR(200) NOT NULL,
  phone VARCHAR(40),
  city VARCHAR(120),
  address TEXT,
  gstin VARCHAR(20),
  notes TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT inventory_parties_name_not_blank CHECK (btrim(name) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS inventory_parties_company_name_uq
  ON inventory_parties (company_id, lower(btrim(name)));

CREATE INDEX IF NOT EXISTS idx_inventory_parties_company
  ON inventory_parties (company_id, kind, name);

ALTER TABLE inventory_parties ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS inventory_parties_select ON inventory_parties;
CREATE POLICY inventory_parties_select ON inventory_parties FOR SELECT
  USING (
    company_id = auth_company_id() AND is_active_user()
    AND (
      has_authority('view_inventory')
      OR has_authority('manage_inventory_items')
      OR has_authority('inventory_dispatch')
      OR has_authority('inventory_return')
    )
  );

DROP POLICY IF EXISTS inventory_parties_manage ON inventory_parties;
CREATE POLICY inventory_parties_manage ON inventory_parties FOR ALL
  USING (
    company_id = auth_company_id() AND is_active_user()
    AND (has_authority('manage_inventory_items') OR has_authority('inventory_dispatch'))
  )
  WITH CHECK (
    company_id = auth_company_id() AND is_active_user()
    AND (has_authority('manage_inventory_items') OR has_authority('inventory_dispatch'))
  );

GRANT SELECT, INSERT, UPDATE ON inventory_parties TO authenticated;

-- ------------------------------------------------------------
-- Movements + serials
-- ------------------------------------------------------------
ALTER TABLE inventory_movements
  ADD COLUMN IF NOT EXISTS party_id UUID REFERENCES inventory_parties(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS inventory_movements_party_idx
  ON inventory_movements (company_id, party_id) WHERE party_id IS NOT NULL;

ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_lead_required;
ALTER TABLE inventory_movements DROP CONSTRAINT IF EXISTS inventory_movements_counterparty;
ALTER TABLE inventory_movements
  ADD CONSTRAINT inventory_movements_counterparty CHECK (
    CASE movement_type::text
      WHEN 'dispatch' THEN ((lead_id IS NOT NULL) <> (party_id IS NOT NULL))
      WHEN 'return' THEN ((lead_id IS NOT NULL) <> (party_id IS NOT NULL))
      WHEN 'service_issue' THEN (lead_id IS NOT NULL AND party_id IS NULL)
      ELSE party_id IS NULL
    END
  );

ALTER TABLE inventory_serials
  ADD COLUMN IF NOT EXISTS current_party_id UUID REFERENCES inventory_parties(id) ON DELETE RESTRICT;

CREATE INDEX IF NOT EXISTS inventory_serials_party_idx
  ON inventory_serials (current_party_id) WHERE current_party_id IS NOT NULL;

ALTER TABLE inventory_serials DROP CONSTRAINT IF EXISTS inventory_serials_lead_when_dispatched;
ALTER TABLE inventory_serials DROP CONSTRAINT IF EXISTS inventory_serials_counterparty;
ALTER TABLE inventory_serials
  ADD CONSTRAINT inventory_serials_counterparty CHECK (
    CASE
      WHEN status = 'dispatched' THEN
        (current_lead_id IS NOT NULL AND current_party_id IS NULL)
        OR (current_lead_id IS NULL AND current_party_id IS NOT NULL)
      ELSE current_lead_id IS NULL AND current_party_id IS NULL
    END
  );

-- ------------------------------------------------------------
-- Party material helpers / view
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION inventory_party_used(p_party_id UUID, p_item_id UUID)
RETURNS NUMERIC
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(-SUM(ml.quantity_delta), 0)
  FROM inventory_movements m
  JOIN inventory_movement_lines ml ON ml.movement_id = m.id
  WHERE m.party_id = p_party_id
    AND ml.item_id = p_item_id
    AND m.movement_type IN ('dispatch', 'return')
    AND m.reversed_by_id IS NULL
$$;

CREATE OR REPLACE VIEW inventory_party_material
WITH (security_invoker = true) AS
SELECT
  m.company_id,
  m.party_id,
  ml.item_id,
  SUM(CASE WHEN m.movement_type = 'dispatch' THEN -ml.quantity_delta ELSE 0 END)::NUMERIC(14,3) AS dispatched,
  SUM(CASE WHEN m.movement_type = 'return' THEN ml.quantity_delta ELSE 0 END)::NUMERIC(14,3) AS returned,
  (-SUM(ml.quantity_delta))::NUMERIC(14,3) AS used,
  MAX(m.movement_date) AS last_movement_date
FROM inventory_movements m
JOIN inventory_movement_lines ml ON ml.movement_id = m.id
WHERE m.party_id IS NOT NULL
  AND m.movement_type IN ('dispatch', 'return')
  AND m.reversed_by_id IS NULL
GROUP BY m.company_id, m.party_id, ml.item_id;

GRANT SELECT ON inventory_party_material TO authenticated;

-- ------------------------------------------------------------
-- Create / lookup parties
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION inventory_can_manage_parties()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT is_active_user() AND (
    has_authority('manage_inventory_items') OR has_authority('inventory_dispatch')
  );
$$;

CREATE OR REPLACE FUNCTION inventory_create_party(
  p_name TEXT,
  p_kind TEXT DEFAULT 'dealer',
  p_phone TEXT DEFAULT NULL,
  p_city TEXT DEFAULT NULL,
  p_address TEXT DEFAULT NULL,
  p_gstin TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID;
  v_name TEXT;
  v_kind inventory_party_kind;
  v_row inventory_parties%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL OR NOT inventory_can_manage_parties() THEN
    RAISE EXCEPTION 'You do not have permission to manage inventory parties.' USING ERRCODE = '42501';
  END IF;
  v_company := auth_company_id();
  v_name := NULLIF(btrim(COALESCE(p_name, '')), '');
  IF v_name IS NULL THEN
    RAISE EXCEPTION 'Party name is required.';
  END IF;
  IF length(v_name) > 200 THEN
    RAISE EXCEPTION 'Party name is too long.';
  END IF;
  BEGIN
    v_kind := COALESCE(NULLIF(btrim(p_kind), ''), 'dealer')::inventory_party_kind;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'Kind must be company, dealer or vendor.';
  END;

  SELECT * INTO v_row FROM inventory_parties
  WHERE company_id = v_company AND lower(btrim(name)) = lower(v_name)
  LIMIT 1;
  IF FOUND THEN
    IF NOT v_row.is_active THEN
      UPDATE inventory_parties SET is_active = true, kind = v_kind, updated_at = NOW()
      WHERE id = v_row.id RETURNING * INTO v_row;
    END IF;
    RETURN jsonb_build_object(
      'id', v_row.id, 'name', v_row.name, 'kind', v_row.kind::text,
      'phone', v_row.phone, 'city', v_row.city, 'idempotent', true
    );
  END IF;

  INSERT INTO inventory_parties (company_id, kind, name, phone, city, address, gstin)
  VALUES (
    v_company, v_kind, v_name,
    NULLIF(btrim(COALESCE(p_phone, '')), ''),
    NULLIF(btrim(COALESCE(p_city, '')), ''),
    NULLIF(btrim(COALESCE(p_address, '')), ''),
    NULLIF(btrim(COALESCE(p_gstin, '')), '')
  )
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id', v_row.id, 'name', v_row.name, 'kind', v_row.kind::text,
    'phone', v_row.phone, 'city', v_row.city, 'idempotent', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION inventory_party_lookup(p_query TEXT DEFAULT NULL, p_limit INT DEFAULT 50)
RETURNS TABLE (
  id UUID,
  name TEXT,
  kind TEXT,
  phone TEXT,
  city TEXT,
  address TEXT,
  gstin TEXT,
  is_active BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := inventory__require('view_inventory');
  v_q TEXT := NULLIF(btrim(COALESCE(p_query, '')), '');
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
BEGIN
  RETURN QUERY
  SELECT
    p.id, p.name::TEXT, p.kind::TEXT, p.phone::TEXT, p.city::TEXT,
    p.address::TEXT, p.gstin::TEXT, p.is_active
  FROM inventory_parties p
  WHERE p.company_id = v_company
    AND p.is_active
    AND (
      v_q IS NULL
      OR p.name ILIKE '%' || v_q || '%'
      OR COALESCE(p.phone, '') ILIKE '%' || v_q || '%'
      OR COALESCE(p.city, '') ILIKE '%' || v_q || '%'
    )
  ORDER BY p.name
  LIMIT v_limit;
END;
$$;

-- ------------------------------------------------------------
-- Dispatch: lead XOR party
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION inventory_post_dispatch(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := inventory__require('inventory_dispatch');
  v_lines JSONB := inventory__lines(payload);
  v_lead leads%ROWTYPE;
  v_party inventory_parties%ROWTYPE;
  v_lead_id UUID := NULLIF(payload ->> 'lead_id', '')::UUID;
  v_party_id UUID := NULLIF(payload ->> 'party_id', '')::UUID;
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
  v_where_name TEXT;
BEGIN
  IF (v_lead_id IS NULL) = (v_party_id IS NULL) THEN
    RAISE EXCEPTION 'Choose a customer or a company / dealer / vendor (not both).';
  END IF;

  IF v_lead_id IS NOT NULL THEN
    SELECT * INTO v_lead FROM leads WHERE id = v_lead_id AND company_id = v_company;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Customer not found.';
    END IF;
    IF v_lead.sales_stage::TEXT NOT IN ('quote_accepted','token_pending_verification','token_verified_and_feasibility_ok','pre_dispatch_pending_verification','pre_dispatch_verified','installation_assigned','installation_in_progress','installation_completed','final_pending_verification','final_verified','liaison_in_progress','meter_installed','subsidy_pending','subsidy_received_pending_accounts','completed') THEN
      RAISE EXCEPTION 'Material can only be dispatched to a customer (Won or Project Completed).';
    END IF;
    v_where_name := v_lead.name;
  ELSE
    SELECT * INTO v_party FROM inventory_parties WHERE id = v_party_id AND company_id = v_company;
    IF NOT FOUND OR NOT v_party.is_active THEN
      RAISE EXCEPTION 'Company / dealer / vendor not found.';
    END IF;
    v_where_name := v_party.name;
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

      SELECT s.serial_no, s.status,
             COALESCE(l.name, p.name) AS dest_name INTO v_bad
      FROM inventory_serials s
      LEFT JOIN leads l ON l.id = s.current_lead_id
      LEFT JOIN inventory_parties p ON p.id = s.current_party_id
      WHERE s.company_id = v_company AND s.serial_no = ANY (v_serials) AND s.status <> 'in_stock'
      LIMIT 1;
      IF FOUND THEN
        IF v_bad.status = 'dispatched' THEN
          RAISE EXCEPTION 'Serial % is already dispatched to %.', v_bad.serial_no, v_bad.dest_name;
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
    company_id, movement_type, movement_no, lead_id, party_id, vehicle_no, delivered_by, movement_date, notes, created_by
  ) VALUES (
    v_company, 'dispatch', v_no, v_lead_id, v_party_id,
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
      SET status = 'dispatched',
          current_lead_id = v_lead_id,
          current_party_id = v_party_id
      WHERE company_id = v_company AND serial_no = ANY (v_serials);

      v_serial_count := v_serial_count + cardinality(v_serials);
    END IF;
  END LOOP;

  PERFORM inventory__audit(v_company, v_lead_id, 'inventory_dispatch', v_movement_id,
    jsonb_build_object(
      'movement_no', v_no, 'lines', jsonb_array_length(v_lines), 'serials', v_serial_count,
      'party_id', v_party_id, 'to', v_where_name
    ));

  RETURN jsonb_build_object('id', v_movement_id, 'movement_no', v_no, 'serials', v_serial_count);
END;
$$;

-- ------------------------------------------------------------
-- Return: lead XOR party
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION inventory_post_return(payload JSONB)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := inventory__require('inventory_return');
  v_lines JSONB := inventory__lines(payload);
  v_lead leads%ROWTYPE;
  v_party inventory_parties%ROWTYPE;
  v_lead_id UUID := NULLIF(payload ->> 'lead_id', '')::UUID;
  v_party_id UUID := NULLIF(payload ->> 'party_id', '')::UUID;
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
  IF (v_lead_id IS NULL) = (v_party_id IS NULL) THEN
    RAISE EXCEPTION 'Choose a customer or a company / dealer / vendor (not both).';
  END IF;

  IF v_lead_id IS NOT NULL THEN
    SELECT * INTO v_lead FROM leads WHERE id = v_lead_id AND company_id = v_company;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Customer not found.';
    END IF;
  ELSE
    SELECT * INTO v_party FROM inventory_parties WHERE id = v_party_id AND company_id = v_company;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Company / dealer / vendor not found.';
    END IF;
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
          AND s.status = 'dispatched'
          AND (
            (v_lead_id IS NOT NULL AND s.current_lead_id = v_lead_id)
            OR (v_party_id IS NOT NULL AND s.current_party_id = v_party_id)
          )
      )
      LIMIT 1;
      IF FOUND THEN
        RAISE EXCEPTION 'Serial % (%) is not at this %.',
          v_bad.serial_no, v_item.name,
          CASE WHEN v_party_id IS NOT NULL THEN 'company / dealer / vendor' ELSE 'customer' END;
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
    v_used := CASE
      WHEN v_party_id IS NOT NULL THEN inventory_party_used(v_party_id, v_total.item_id)
      ELSE inventory_customer_used(v_lead_id, v_total.item_id)
    END;
    IF v_used < v_total.qty THEN
      SELECT * INTO v_item FROM inventory_items WHERE id = v_total.item_id;
      RAISE EXCEPTION 'This % has only % % of % (asked to return %).',
        CASE WHEN v_party_id IS NOT NULL THEN 'party' ELSE 'customer' END,
        trim_scale(v_used), v_item.unit_type, v_item.name, trim_scale(v_total.qty);
    END IF;
  END LOOP;

  v_no := inventory__next_no(v_company, 'return');
  INSERT INTO inventory_movements (company_id, movement_type, movement_no, lead_id, party_id, movement_date, notes, created_by)
  VALUES (
    v_company, 'return', v_no, v_lead_id, v_party_id,
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
          current_lead_id = NULL,
          current_party_id = NULL
      WHERE company_id = v_company AND serial_no = ANY (v_serials);

      v_serial_count := v_serial_count + cardinality(v_serials);
    END IF;
  END LOOP;

  PERFORM inventory__audit(v_company, v_lead_id, 'inventory_return', v_movement_id,
    jsonb_build_object('movement_no', v_no, 'lines', jsonb_array_length(v_lines), 'serials', v_serial_count, 'party_id', v_party_id));

  RETURN jsonb_build_object('id', v_movement_id, 'movement_no', v_no, 'serials', v_serial_count);
END;
$$;

-- ------------------------------------------------------------
-- Reverse: restore party serials correctly
-- ------------------------------------------------------------
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
  v_used NUMERIC;
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
    IF v_m.movement_type = 'dispatch' THEN
      v_used := CASE
        WHEN v_m.party_id IS NOT NULL THEN inventory_party_used(v_m.party_id, v_line.item_id)
        ELSE inventory_customer_used(v_m.lead_id, v_line.item_id)
      END;
      IF v_used + v_line.delta < 0 THEN
        RAISE EXCEPTION 'Some % from % was already returned. Reverse the return first.', v_item.name, v_m.movement_no;
      END IF;
    END IF;
  END LOOP;

  v_no := inventory__next_no(v_company, 'reversal');
  INSERT INTO inventory_movements (
    company_id, movement_type, movement_no, lead_id, party_id, movement_date, reason, notes, reverses_id, created_by
  ) VALUES (
    v_company, 'reversal', v_no, v_m.lead_id, v_m.party_id, CURRENT_DATE, v_reason,
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
      SELECT v_removed || COALESCE(array_agg(s.serial_no::TEXT), '{}'::TEXT[]) INTO v_removed
      FROM inventory_movement_line_serials ls JOIN inventory_serials s ON s.id = ls.serial_id
      WHERE ls.line_id = v_line.id;

      DELETE FROM inventory_movement_line_serials
      WHERE serial_id IN (SELECT id FROM inventory_serials WHERE inward_line_id = v_line.id);
      DELETE FROM inventory_serials WHERE inward_line_id = v_line.id;
    ELSE
      INSERT INTO inventory_movement_line_serials (company_id, line_id, serial_id)
      SELECT v_company, v_new_line_id, ls.serial_id
      FROM inventory_movement_line_serials ls WHERE ls.line_id = v_line.id;

      IF v_m.movement_type = 'dispatch' THEN
        UPDATE inventory_serials
        SET status = 'in_stock', current_lead_id = NULL, current_party_id = NULL
        WHERE id IN (SELECT serial_id FROM inventory_movement_line_serials WHERE line_id = v_line.id);
      ELSE
        UPDATE inventory_serials
        SET status = 'dispatched',
            current_lead_id = v_m.lead_id,
            current_party_id = v_m.party_id
        WHERE id IN (SELECT serial_id FROM inventory_movement_line_serials WHERE line_id = v_line.id);
      END IF;
    END IF;
  END LOOP;

  UPDATE inventory_movements SET reversed_by_id = v_new_id WHERE id = v_m.id;

  PERFORM inventory__audit(v_company, v_m.lead_id, 'inventory_reversal', v_new_id,
    jsonb_build_object('movement_no', v_no, 'reverses', v_m.movement_no, 'reason', v_reason,
                       'removed_serials', to_jsonb(v_removed), 'party_id', v_m.party_id));

  RETURN jsonb_build_object('id', v_new_id, 'movement_no', v_no);
END;
$$;

-- ------------------------------------------------------------
-- Serial check: optional party for return mode
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS inventory_check_serials(UUID, TEXT[], TEXT, UUID);

CREATE OR REPLACE FUNCTION inventory_check_serials(
  p_item_id UUID,
  p_serials TEXT[],
  p_mode TEXT,
  p_lead_id UUID DEFAULT NULL,
  p_party_id UUID DEFAULT NULL
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
  IF p_mode = 'return' AND p_lead_id IS NULL AND p_party_id IS NULL THEN
    RAISE EXCEPTION 'Return check needs a customer or party.';
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
      WHEN p_party_id IS NOT NULL THEN
        s.status = 'dispatched' AND s.current_party_id = p_party_id
      ELSE s.status = 'dispatched' AND s.current_lead_id = p_lead_id
    END,
    CASE
      WHEN normalize_serial(t.raw) IS NULL THEN 'Empty scan'
      WHEN p_mode = 'inward' AND s.id IS NOT NULL THEN
        'Already in inventory (' || i.name || ', ' || replace(s.status::TEXT, '_', ' ') || ')'
      WHEN p_mode = 'inward' THEN NULL
      WHEN s.id IS NULL THEN 'Not in inventory'
      WHEN s.item_id <> p_item_id THEN 'Belongs to ' || i.name
      WHEN p_mode = 'dispatch' AND s.status = 'dispatched' THEN
        'Already dispatched to ' || COALESCE(l.name, p.name, 'a destination')
      WHEN p_mode = 'dispatch' AND s.status <> 'in_stock' THEN 'Marked ' || s.status::TEXT
      WHEN p_mode = 'return' AND p_party_id IS NOT NULL
           AND (s.status <> 'dispatched' OR s.current_party_id IS DISTINCT FROM p_party_id) THEN
        'Not at this company / dealer / vendor'
      WHEN p_mode = 'return' AND p_lead_id IS NOT NULL
           AND (s.status <> 'dispatched' OR s.current_lead_id IS DISTINCT FROM p_lead_id) THEN
        'Not at this customer'
      ELSE NULL
    END
  FROM unnest(p_serials) WITH ORDINALITY AS t(raw, ord)
  LEFT JOIN inventory_serials s ON s.company_id = v_company AND s.serial_no = normalize_serial(t.raw)
  LEFT JOIN inventory_items i ON i.id = s.item_id
  LEFT JOIN leads l ON l.id = s.current_lead_id
  LEFT JOIN inventory_parties p ON p.id = s.current_party_id
  ORDER BY t.ord;
END;
$$;

-- On-Floor after dispatch already skips when lead_id IS NULL (023). Keep explicit.
CREATE OR REPLACE FUNCTION on_floor_ensure_row_after_dispatch()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_handoff BOOLEAN;
BEGIN
  IF NEW.movement_type::text <> 'dispatch' OR NEW.lead_id IS NULL THEN
    RETURN NEW;
  END IF;
  SELECT sales_handoff_complete INTO v_handoff
  FROM leads
  WHERE id = NEW.lead_id AND company_id = NEW.company_id;
  IF COALESCE(v_handoff, false) THEN
    INSERT INTO on_floor_milestones (company_id, lead_id)
    VALUES (NEW.company_id, NEW.lead_id)
    ON CONFLICT (lead_id) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION inventory_can_manage_parties() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION inventory_create_party(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION inventory_party_lookup(TEXT, INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION inventory_check_serials(UUID, TEXT[], TEXT, UUID, UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION inventory_party_used(UUID, UUID) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION inventory_create_party(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION inventory_party_lookup(TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION inventory_check_serials(UUID, TEXT[], TEXT, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION inventory_post_dispatch(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION inventory_post_return(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION inventory_reverse_movement(UUID, TEXT) TO authenticated;

-- ------------------------------------------------------------
-- Movement search: party_id / party_name (extends 057 / 022)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS inventory_search_movements(TEXT, TEXT, INT, INT);

CREATE OR REPLACE FUNCTION inventory_search_movements(
  p_query TEXT,
  p_type TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0
)
RETURNS TABLE (
  id UUID,
  movement_no TEXT,
  movement_type TEXT,
  movement_date DATE,
  created_at TIMESTAMPTZ,
  is_opening_stock BOOLEAN,
  lead_id UUID,
  party_id UUID,
  customer_name TEXT,
  party_name TEXT,
  supplier_name TEXT,
  reversed BOOLEAN,
  line_count BIGINT,
  serial_count BIGINT,
  match_reason TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := auth_company_id();
  v_q TEXT := NULLIF(btrim(COALESCE(p_query, '')), '');
  v_serial TEXT;
  v_type TEXT := NULLIF(btrim(COALESCE(p_type, '')), '');
  v_limit INT := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v_offset INT := GREATEST(COALESCE(p_offset, 0), 0);
BEGIN
  IF v_company IS NULL OR NOT (
    auth.uid() IS NOT NULL
    AND is_active_user()
    AND (
      has_authority('view_inventory')
      OR has_authority('manage_inventory_items')
      OR has_authority('inventory_dispatch')
      OR has_authority('inventory_return')
    )
  ) THEN
    RAISE EXCEPTION 'You do not have permission for this (view_inventory).' USING ERRCODE = '42501';
  END IF;

  IF v_q IS NULL THEN
    RETURN;
  END IF;

  IF length(v_q) > 80 THEN
    v_q := left(v_q, 80);
  END IF;

  v_serial := normalize_serial(v_q);

  RETURN QUERY
  WITH matched AS (
    SELECT
      m.id AS mid,
      CASE
        WHEN m.movement_no ILIKE '%' || v_q || '%' THEN 'movement_no'
        WHEN EXISTS (
          SELECT 1
          FROM inventory_movement_lines ml
          JOIN inventory_movement_line_serials mls ON mls.line_id = ml.id
          JOIN inventory_serials s ON s.id = mls.serial_id
          WHERE ml.movement_id = m.id
            AND (
              (v_serial IS NOT NULL AND s.serial_no LIKE '%' || v_serial || '%')
              OR s.serial_no ILIKE '%' || v_q || '%'
              OR COALESCE(s.raw_scan, '') ILIKE '%' || v_q || '%'
            )
        ) THEN 'serial'
        WHEN EXISTS (
          SELECT 1 FROM inventory_parties p
          WHERE p.id = m.party_id AND p.name ILIKE '%' || v_q || '%'
        ) THEN 'party'
        ELSE 'item_spec'
      END AS reason
    FROM inventory_movements m
    WHERE m.company_id = v_company
      AND (v_type IS NULL OR m.movement_type::TEXT = v_type)
      AND (
        m.movement_no ILIKE '%' || v_q || '%'
        OR EXISTS (
          SELECT 1
          FROM inventory_movement_lines ml
          JOIN inventory_movement_line_serials mls ON mls.line_id = ml.id
          JOIN inventory_serials s ON s.id = mls.serial_id
          WHERE ml.movement_id = m.id
            AND (
              (v_serial IS NOT NULL AND s.serial_no LIKE '%' || v_serial || '%')
              OR s.serial_no ILIKE '%' || v_q || '%'
              OR COALESCE(s.raw_scan, '') ILIKE '%' || v_q || '%'
            )
        )
        OR EXISTS (
          SELECT 1
          FROM inventory_movement_lines ml
          JOIN inventory_items i ON i.id = ml.item_id
          WHERE ml.movement_id = m.id
            AND (
              i.name ILIKE '%' || v_q || '%'
              OR COALESCE(i.sku, '') ILIKE '%' || v_q || '%'
              OR i.specifications::TEXT ILIKE '%' || v_q || '%'
            )
        )
        OR EXISTS (
          SELECT 1 FROM inventory_parties p
          WHERE p.id = m.party_id AND p.name ILIKE '%' || v_q || '%'
        )
      )
  )
  SELECT
    m.id,
    m.movement_no::TEXT,
    m.movement_type::TEXT,
    m.movement_date,
    m.created_at,
    m.is_opening_stock,
    m.lead_id,
    m.party_id,
    l.name::TEXT AS customer_name,
    p.name::TEXT AS party_name,
    m.supplier_name::TEXT,
    (m.reversed_by_id IS NOT NULL) AS reversed,
    (SELECT count(*)::BIGINT FROM inventory_movement_lines ml WHERE ml.movement_id = m.id) AS line_count,
    (
      SELECT count(*)::BIGINT
      FROM inventory_movement_lines ml
      JOIN inventory_movement_line_serials mls ON mls.line_id = ml.id
      WHERE ml.movement_id = m.id
    ) AS serial_count,
    matched.reason::TEXT AS match_reason
  FROM matched
  JOIN inventory_movements m ON m.id = matched.mid
  LEFT JOIN leads l ON l.id = m.lead_id
  LEFT JOIN inventory_parties p ON p.id = m.party_id
  ORDER BY m.movement_date DESC, m.created_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

REVOKE ALL ON FUNCTION inventory_search_movements(TEXT, TEXT, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION inventory_search_movements(TEXT, TEXT, INT, INT) TO authenticated;
