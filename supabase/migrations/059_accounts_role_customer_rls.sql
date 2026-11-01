-- Accounts staff often have profiles.role = 'accounts' without explicit
-- user_authorities rows. has_authority('verify_payment') was false, so
-- leads_select / payments_select returned nothing (empty Customers, no alerts).

CREATE OR REPLACE FUNCTION auth_profile_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid() AND is_active = true
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_accounts_staff()
RETURNS BOOLEAN AS $$
  SELECT auth_profile_role() = 'accounts'
$$ LANGUAGE sql STABLE SECURITY DEFINER;

DROP POLICY IF EXISTS leads_select ON leads;
CREATE POLICY leads_select ON leads FOR SELECT
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      assigned_to = auth.uid()
      OR assigned_telecaller_id = auth.uid()
      OR assigned_surveyor_id = auth.uid()
      OR assigned_crew_id = auth.uid()
      OR created_by = auth.uid()
      OR has_authority('view_all_leads')
      OR has_authority('verify_payment')
      OR has_authority('view_payment_queues')
      OR has_authority('record_payment')
      OR has_authority('full_access')
      OR (
        is_accounts_staff()
        AND sales_stage IN (
          'quote_accepted',
          'token_pending_verification',
          'token_verified_and_feasibility_ok',
          'pre_dispatch_pending_verification',
          'pre_dispatch_verified',
          'installation_assigned',
          'installation_in_progress',
          'installation_completed',
          'final_pending_verification',
          'final_verified',
          'liaison_in_progress',
          'meter_installed',
          'subsidy_pending',
          'subsidy_received_pending_accounts',
          'completed'
        )
      )
      OR (
        sales_stage IN (
          'quote_accepted',
          'token_pending_verification',
          'token_verified_and_feasibility_ok',
          'pre_dispatch_pending_verification',
          'pre_dispatch_verified',
          'installation_assigned',
          'installation_in_progress',
          'installation_completed',
          'final_pending_verification',
          'final_verified',
          'liaison_in_progress',
          'meter_installed',
          'subsidy_pending',
          'subsidy_received_pending_accounts',
          'completed'
        )
        AND (
          has_authority('manage_liaison')
          OR has_authority('upload_feasibility_report')
          OR has_authority('mark_meter_installed')
          OR has_authority('mark_subsidy_received')
        )
      )
    )
  );

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
      OR is_accounts_staff()
      OR (
        sales_stage IN (
          'quote_accepted',
          'token_pending_verification',
          'token_verified_and_feasibility_ok',
          'pre_dispatch_pending_verification',
          'pre_dispatch_verified',
          'installation_assigned',
          'installation_in_progress',
          'installation_completed',
          'final_pending_verification',
          'final_verified',
          'liaison_in_progress',
          'meter_installed',
          'subsidy_pending',
          'subsidy_received_pending_accounts',
          'completed'
        )
        AND (
          has_authority('manage_liaison')
          OR has_authority('upload_feasibility_report')
          OR has_authority('mark_meter_installed')
          OR has_authority('mark_subsidy_received')
        )
      )
    )
  );

DROP POLICY IF EXISTS payments_select ON payments;
CREATE POLICY payments_select ON payments FOR SELECT
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      has_authority('view_payment_queues')
      OR has_authority('record_payment')
      OR has_authority('verify_payment')
      OR has_authority('view_all_leads')
      OR has_authority('full_access')
      OR is_accounts_staff()
    )
  );

DROP POLICY IF EXISTS payments_update ON payments;
CREATE POLICY payments_update ON payments FOR UPDATE
  USING (
    company_id = auth_company_id()
    AND (
      has_authority('record_payment')
      OR has_authority('verify_payment')
      OR has_authority('full_access')
      OR is_accounts_staff()
    )
  );
