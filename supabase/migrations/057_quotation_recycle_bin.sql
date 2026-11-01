-- Quotation recycle bin. Delete now moves a quote to the bin (deleted_at);
-- RLS hides bin rows from every normal read (quotation_items follow through
-- their EXISTS policy). Bin list / soft delete / restore / purge go through
-- SECURITY DEFINER functions because a plain UPDATE that sets deleted_at
-- would fail the SELECT / UPDATE policies on the new row.

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS delete_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_quotations_deleted
  ON quotations(company_id, deleted_at DESC)
  WHERE deleted_at IS NOT NULL;

INSERT INTO authorities (key, label, authority_group)
VALUES ('restore_quotations', 'Restore Quotations', 'sales')
ON CONFLICT (key) DO UPDATE
SET label = EXCLUDED.label,
    authority_group = EXCLUDED.authority_group;

INSERT INTO role_authorities (role_id, authority_key, granted)
SELECT r.id, 'restore_quotations', true
FROM roles r
WHERE r.slug = 'admin'
ON CONFLICT (role_id, authority_key) DO UPDATE SET granted = true;

-- ------------------------------------------------------------
-- Policies: live rows only
-- ------------------------------------------------------------
DROP POLICY IF EXISTS quotations_select ON quotations;
CREATE POLICY quotations_select ON quotations FOR SELECT
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND deleted_at IS NULL
    AND (
      has_authority('view_quotations')
      OR has_authority('create_quotations')
      OR has_authority('manage_quotations')
      OR has_authority('full_access')
    )
  );

DROP POLICY IF EXISTS quotations_update ON quotations;
CREATE POLICY quotations_update ON quotations FOR UPDATE
  USING (
    company_id = auth_company_id()
    AND deleted_at IS NULL
    AND (
      has_authority('create_quotations')
      OR has_authority('manage_quotations')
      OR has_authority('accept_quotations')
      OR has_authority('full_access')
    )
  );

-- Hard delete only for rows already in the bin (purge goes through purge_quotation).
DROP POLICY IF EXISTS quotations_delete ON quotations;
CREATE POLICY quotations_delete ON quotations FOR DELETE
  USING (
    company_id = auth_company_id()
    AND deleted_at IS NOT NULL
    AND has_authority('full_access')
  );

-- ------------------------------------------------------------
-- Functions
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION soft_delete_quotation(p_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := auth_company_id();
  v_status TEXT;
BEGIN
  IF v_company IS NULL OR NOT is_active_user() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF NOT (has_authority('delete_quotations') OR has_authority('manage_quotations')) THEN
    RAISE EXCEPTION 'Missing authority: delete_quotations';
  END IF;

  SELECT status INTO v_status
  FROM quotations
  WHERE id = p_id AND company_id = v_company AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quotation not found';
  END IF;

  IF v_status = 'accepted' THEN
    RAISE EXCEPTION 'Accepted quotations cannot be deleted';
  END IF;
  IF EXISTS (SELECT 1 FROM leads WHERE accepted_quotation_id = p_id) THEN
    RAISE EXCEPTION 'Quotation is linked as a lead''s accepted quotation';
  END IF;
  IF EXISTS (SELECT 1 FROM payments WHERE quotation_id = p_id) THEN
    RAISE EXCEPTION 'Quotation has recorded payments';
  END IF;

  UPDATE quotations
  SET deleted_at = NOW(),
      deleted_by = auth.uid(),
      delete_reason = NULLIF(BTRIM(p_reason), '')
  WHERE id = p_id AND company_id = v_company;

  RETURN p_id;
END;
$$;

CREATE OR REPLACE FUNCTION list_deleted_quotations()
RETURNS TABLE (
  id UUID,
  quotation_no TEXT,
  status TEXT,
  customer_name TEXT,
  customer_phone TEXT,
  grand_total NUMERIC,
  lead_id UUID,
  lead_name TEXT,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,
  deleted_by_name TEXT,
  delete_reason TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth_company_id() IS NULL OR NOT is_active_user() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF NOT (
    has_authority('restore_quotations')
    OR has_authority('delete_quotations')
    OR has_authority('manage_quotations')
  ) THEN
    RAISE EXCEPTION 'Missing authority: restore_quotations';
  END IF;

  RETURN QUERY
  SELECT
    q.id,
    q.quotation_no::TEXT,
    q.status::TEXT,
    q.customer_name::TEXT,
    q.customer_phone::TEXT,
    q.grand_total::NUMERIC,
    q.lead_id,
    l.name::TEXT,
    q.deleted_at,
    q.deleted_by,
    p.name::TEXT,
    q.delete_reason
  FROM quotations q
  LEFT JOIN leads l ON l.id = q.lead_id
  LEFT JOIN profiles p ON p.id = q.deleted_by
  WHERE q.company_id = auth_company_id()
    AND q.deleted_at IS NOT NULL
  ORDER BY q.deleted_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION restore_quotation(p_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := auth_company_id();
BEGIN
  IF v_company IS NULL OR NOT is_active_user() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF NOT (has_authority('restore_quotations') OR has_authority('manage_quotations')) THEN
    RAISE EXCEPTION 'Missing authority: restore_quotations';
  END IF;

  UPDATE quotations
  SET deleted_at = NULL,
      deleted_by = NULL,
      delete_reason = NULL
  WHERE id = p_id AND company_id = v_company AND deleted_at IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quotation is not in the recycle bin';
  END IF;

  RETURN p_id;
END;
$$;

CREATE OR REPLACE FUNCTION purge_quotation(p_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := auth_company_id();
BEGIN
  IF v_company IS NULL OR NOT is_active_user() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF NOT has_authority('full_access') THEN
    RAISE EXCEPTION 'Only admins can delete quotations permanently';
  END IF;

  DELETE FROM quotations
  WHERE id = p_id AND company_id = v_company AND deleted_at IS NOT NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Quotation is not in the recycle bin';
  END IF;

  RETURN p_id;
END;
$$;

REVOKE ALL ON FUNCTION soft_delete_quotation(UUID, TEXT) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION list_deleted_quotations() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION restore_quotation(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION purge_quotation(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION soft_delete_quotation(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION list_deleted_quotations() TO authenticated;
GRANT EXECUTE ON FUNCTION restore_quotation(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION purge_quotation(UUID) TO authenticated;
