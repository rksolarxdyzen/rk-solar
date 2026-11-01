-- Complete lead wipe for Admin / delete_leads (demo + test files through
-- survey / install). Cascades children; hard-deletes related quotations.

ALTER TYPE lead_source ADD VALUE IF NOT EXISTS 'demo';

CREATE OR REPLACE FUNCTION purge_lead_completely(p_lead_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company UUID := auth_company_id();
  v_name TEXT;
  v_stage TEXT;
BEGIN
  IF v_company IS NULL OR NOT is_active_user() THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;
  IF NOT has_authority('delete_leads') THEN
    RAISE EXCEPTION 'Missing authority: delete_leads';
  END IF;

  SELECT name, sales_stage::text
    INTO v_name, v_stage
  FROM leads
  WHERE id = p_lead_id
    AND company_id = v_company;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;

  -- Break quote ↔ lead links first
  UPDATE leads
  SET accepted_quotation_id = NULL
  WHERE id = p_lead_id
    AND company_id = v_company;

  UPDATE payments
  SET quotation_id = NULL
  WHERE lead_id = p_lead_id
    AND company_id = v_company;

  -- Remove quotations for this lead (incl. soft-deleted bin rows)
  DELETE FROM quotations
  WHERE company_id = v_company
    AND lead_id = p_lead_id;

  INSERT INTO audit_events (
    company_id, lead_id, actor_id, event_type, entity_type, entity_id, metadata
  ) VALUES (
    v_company,
    p_lead_id,
    auth.uid(),
    'lead_purged',
    'lead',
    p_lead_id,
    jsonb_build_object('name', v_name, 'sales_stage', v_stage)
  );

  DELETE FROM leads
  WHERE id = p_lead_id
    AND company_id = v_company;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lead not found';
  END IF;

  RETURN p_lead_id;
END;
$$;

REVOKE ALL ON FUNCTION purge_lead_completely(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION purge_lead_completely(UUID) TO authenticated;

-- Keep DELETE policy aligned (admin already passes has_authority)
DROP POLICY IF EXISTS leads_delete ON leads;
CREATE POLICY leads_delete ON leads FOR DELETE
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('delete_leads')
      OR has_authority('full_access')
    )
  );
