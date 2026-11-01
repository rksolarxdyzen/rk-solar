-- ============================================================
-- 063_inventory_party_create_return_address.sql
-- handover: 028_inventory_party_create_return_address.sql
-- Return address + gstin from inventory_create_party JSON.
-- Requires 060 / 025.
-- ============================================================

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
    -- Fill blank address/GSTIN if provided on re-add of an inactive/idempotent name
    IF (
      (v_row.address IS NULL AND NULLIF(btrim(COALESCE(p_address, '')), '') IS NOT NULL)
      OR (v_row.gstin IS NULL AND NULLIF(btrim(COALESCE(p_gstin, '')), '') IS NOT NULL)
      OR (v_row.city IS NULL AND NULLIF(btrim(COALESCE(p_city, '')), '') IS NOT NULL)
      OR (v_row.phone IS NULL AND NULLIF(btrim(COALESCE(p_phone, '')), '') IS NOT NULL)
    ) THEN
      UPDATE inventory_parties SET
        phone = COALESCE(phone, NULLIF(btrim(COALESCE(p_phone, '')), '')),
        city = COALESCE(city, NULLIF(btrim(COALESCE(p_city, '')), '')),
        address = COALESCE(address, NULLIF(btrim(COALESCE(p_address, '')), '')),
        gstin = COALESCE(gstin, NULLIF(btrim(COALESCE(p_gstin, '')), '')),
        updated_at = NOW()
      WHERE id = v_row.id
      RETURNING * INTO v_row;
    END IF;
    RETURN jsonb_build_object(
      'id', v_row.id, 'name', v_row.name, 'kind', v_row.kind::text,
      'phone', v_row.phone, 'city', v_row.city,
      'address', v_row.address, 'gstin', v_row.gstin,
      'idempotent', true
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
    'phone', v_row.phone, 'city', v_row.city,
    'address', v_row.address, 'gstin', v_row.gstin,
    'idempotent', false
  );
END;
$$;

GRANT EXECUTE ON FUNCTION inventory_create_party(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
