-- ============================================================
-- 052_inventory_customer_lookup.sql  (RK Solar inventory port from Sumeru)
-- Read-only helpers for the dispatch / challan screens.
-- Inventory staff often lack view_all_leads, so leads RLS hides
-- customers from them. These SECURITY DEFINER functions expose only
-- delivery details (name, phone, address, meter name) of customers,
-- and a price-free material suggestion from their quotation.
-- Requires 048–050.
-- ============================================================

CREATE OR REPLACE FUNCTION inventory__can_view()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT auth.uid() IS NOT NULL
    AND is_active_user()
    AND (
      has_authority('view_inventory')
      OR has_authority('manage_inventory_items')
      OR has_authority('inventory_dispatch')
      OR has_authority('inventory_return')
    )
$$;

-- Search customers (Won / Project Completed) by name, phone or city,
-- or fetch specific leads by id (only customers or leads that already
-- have stock movements, e.g. for challans).
CREATE OR REPLACE FUNCTION inventory_customer_lookup(
  p_query TEXT DEFAULT NULL,
  p_lead_ids UUID[] DEFAULT NULL,
  p_limit INT DEFAULT 20
)
RETURNS TABLE (
  id UUID,
  name TEXT,
  phone TEXT,
  city TEXT,
  address TEXT,
  meter_name TEXT,
  sales_stage TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := auth_company_id();
  v_q TEXT := NULLIF(btrim(COALESCE(p_query, '')), '');
BEGIN
  IF v_company IS NULL OR NOT inventory__can_view() THEN
    RAISE EXCEPTION 'You do not have permission for this (view_inventory).' USING ERRCODE = '42501';
  END IF;

  IF p_lead_ids IS NOT NULL THEN
    RETURN QUERY
    SELECT l.id, l.name::TEXT, l.phone::TEXT, l.city::TEXT, l.address::TEXT, NULL::TEXT, l.sales_stage::TEXT
    FROM leads l
    WHERE l.company_id = v_company
      AND l.id = ANY (p_lead_ids)
      AND (
        l.sales_stage::TEXT IN ('quote_accepted','token_pending_verification','token_verified_and_feasibility_ok','pre_dispatch_pending_verification','pre_dispatch_verified','installation_assigned','installation_in_progress','installation_completed','final_pending_verification','final_verified','liaison_in_progress','meter_installed','subsidy_pending','subsidy_received_pending_accounts','completed')
        OR EXISTS (SELECT 1 FROM inventory_movements m WHERE m.company_id = v_company AND m.lead_id = l.id)
      )
    LIMIT 500;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT l.id, l.name::TEXT, l.phone::TEXT, l.city::TEXT, l.address::TEXT, NULL::TEXT, l.sales_stage::TEXT
  FROM leads l
  WHERE l.company_id = v_company
    AND l.sales_stage::TEXT IN ('quote_accepted','token_pending_verification','token_verified_and_feasibility_ok','pre_dispatch_pending_verification','pre_dispatch_verified','installation_assigned','installation_in_progress','installation_completed','final_pending_verification','final_verified','liaison_in_progress','meter_installed','subsidy_pending','subsidy_received_pending_accounts','completed')
    AND (
      v_q IS NULL
      OR l.name ILIKE '%' || v_q || '%'
      OR l.phone ILIKE '%' || v_q || '%'
      OR COALESCE(l.alternate_phone, '') ILIKE '%' || v_q || '%'
      OR COALESCE(l.city, '') ILIKE '%' || v_q || '%'
    )
  ORDER BY COALESCE(l.won_closed_at, l.updated_at) DESC NULLS LAST, l.name
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 50);
END;
$$;

-- Suggested dispatch lines from the customer's accepted quotation
-- (else the latest one). Maps quotation rows to inventory items by the
-- catalog link, then by exact name. Quantities only; no prices.
CREATE OR REPLACE FUNCTION inventory_quotation_suggestion(p_lead_id UUID)
RETURNS TABLE (
  quotation_no TEXT,
  item_id UUID,
  quantity NUMERIC,
  source_name TEXT
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := auth_company_id();
  v_quote RECORD;
BEGIN
  IF v_company IS NULL OR NOT inventory__can_view() THEN
    RAISE EXCEPTION 'You do not have permission for this (view_inventory).' USING ERRCODE = '42501';
  END IF;

  SELECT q.id, q.quotation_no INTO v_quote
  FROM quotations q
  WHERE q.company_id = v_company AND q.lead_id = p_lead_id AND q.status <> 'rejected'
  ORDER BY (q.status = 'accepted') DESC, q.quote_date DESC, q.created_at DESC
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    v_quote.quotation_no::TEXT,
    COALESCE(by_link.id, by_name.id),
    qi.quantity,
    qi.item_name_snapshot::TEXT
  FROM quotation_items qi
  LEFT JOIN LATERAL (
    SELECT i.id FROM inventory_items i
    WHERE i.company_id = v_company AND i.is_active AND qi.item_id IS NOT NULL AND i.quote_item_id = qi.item_id
    ORDER BY i.name LIMIT 1
  ) by_link ON true
  LEFT JOIN LATERAL (
    SELECT i.id FROM inventory_items i
    WHERE i.company_id = v_company AND i.is_active AND lower(i.name) = lower(qi.item_name_snapshot)
    LIMIT 1
  ) by_name ON true
  WHERE qi.quotation_id = v_quote.id
  ORDER BY qi.created_at;
END;
$$;

REVOKE ALL ON FUNCTION inventory__can_view() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION inventory_customer_lookup(TEXT, UUID[], INT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION inventory_quotation_suggestion(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION inventory_customer_lookup(TEXT, UUID[], INT) TO authenticated;
GRANT EXECUTE ON FUNCTION inventory_quotation_suggestion(UUID) TO authenticated;
