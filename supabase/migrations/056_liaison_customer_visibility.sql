-- Documentation / Discom liaison lost all lead rows after 052 removed
-- view_all_leads from non-admin roles: leads_select / leads_update had no
-- liaison clause, so Dashboard and Documentation queues came back empty.
-- Liaison authorities now see and update Won-or-later customer files only
-- (not the sales pipeline).

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
