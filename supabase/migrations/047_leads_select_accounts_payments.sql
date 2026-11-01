-- Accounts can see payment rows but not the linked customer (leads_select
-- required view_all_leads / assignee). The embed then returns null ("—") and
-- verifyPayment's lead .single() fails — production shows a generic RSC error.
-- Mirror 044 (verify_payment on UPDATE) for SELECT.

DROP POLICY IF EXISTS leads_select ON leads;
CREATE POLICY leads_select ON leads FOR SELECT
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      assigned_to = auth.uid()
      OR assigned_telecaller_id = auth.uid()
      OR assigned_surveyor_id = auth.uid()
      OR created_by = auth.uid()
      OR has_authority('view_all_leads')
      OR has_authority('verify_payment')
      OR has_authority('view_payment_queues')
      OR has_authority('record_payment')
      OR has_authority('full_access')
    )
  );
