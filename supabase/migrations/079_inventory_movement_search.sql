-- ============================================================
-- 057_inventory_movement_search.sql  (RK Solar inventory port from Sumeru)
-- Search stock movements by movement number, serial (partial),
-- or item name / SKU / specifications (e.g. 540W).
-- Requires 048–050 (and 052 for inventory__can_view if present).
-- ============================================================

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
  customer_name TEXT,
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
    l.name::TEXT AS customer_name,
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
  ORDER BY m.movement_date DESC, m.created_at DESC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

CREATE INDEX IF NOT EXISTS inventory_serials_company_serial_idx
  ON inventory_serials (company_id, serial_no);

REVOKE ALL ON FUNCTION inventory_search_movements(TEXT, TEXT, INT, INT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION inventory_search_movements(TEXT, TEXT, INT, INT) TO authenticated;
