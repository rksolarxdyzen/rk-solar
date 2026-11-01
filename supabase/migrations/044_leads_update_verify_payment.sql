-- Allow Accounts (verify_payment) to update leads so payment verification can advance sales_stage.
-- Without this, payments can be marked verified while the lead stays on *_pending_verification.

DROP POLICY IF EXISTS leads_update ON leads;
CREATE POLICY leads_update ON leads FOR UPDATE
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      assigned_to = auth.uid()
      OR assigned_telecaller_id = auth.uid()
      OR assigned_surveyor_id = auth.uid()
      OR created_by = auth.uid()
      OR has_authority('view_all_leads')
      OR has_authority('reassign_leads')
      OR has_authority('verify_payment')
      OR has_authority('full_access')
    )
  );
