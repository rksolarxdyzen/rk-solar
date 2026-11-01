-- Sales must only see assigned / own leads & customers.
-- Root causes:
--   1) leads_select granted company-wide SELECT via record_payment (Sales has it).
--   2) App canSeeAllCustomers treated upload_feasibility_report as company-wide
--      (Sales Manager is seeded with that key for historical reasons).
-- Fix: assignee-only for sales; Accounts/liaison/verify/docs lanes keep customer-wide.

-- 1) Role defaults: only admin keeps view_all_leads
DELETE FROM role_authorities ra
USING roles r
WHERE ra.role_id = r.id
  AND ra.authority_key = 'view_all_leads'
  AND COALESCE(r.slug, '') <> 'admin';

-- 2) Sales roles must not carry docs-lane keys that unlock every customer file
DELETE FROM role_authorities ra
USING roles r
WHERE ra.role_id = r.id
  AND ra.authority_key = 'upload_feasibility_report'
  AND COALESCE(r.slug, '') IN ('sales_manager', 'sales_executive', 'tele_caller', 'surveyor');

-- 3) leads_select: assignees + admin/full/view_all + accounts/liaison roles
--    + payment verify / liaison / docs authorities on customer stages only.
--    record_payment / view_payment_queues alone do NOT unlock all leads.

CREATE OR REPLACE FUNCTION auth_profile_role()
RETURNS TEXT AS $$
  SELECT role FROM profiles WHERE id = auth.uid() AND is_active = true
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_accounts_staff()
RETURNS BOOLEAN AS $$
  SELECT auth_profile_role() = 'accounts'
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION is_liaison_staff()
RETURNS BOOLEAN AS $$
  SELECT auth_profile_role() = 'liaison'
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
          is_accounts_staff()
          OR is_liaison_staff()
          OR has_authority('verify_payment')
          OR has_authority('verify_subsidy')
          OR has_authority('manage_liaison')
          OR has_authority('mark_meter_installed')
          OR has_authority('mark_subsidy_received')
          OR has_authority('upload_feasibility_report')
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
      OR assigned_crew_id = auth.uid()
      OR created_by = auth.uid()
      OR has_authority('view_all_leads')
      OR has_authority('reassign_leads')
      OR has_authority('full_access')
      OR is_accounts_staff()
      OR has_authority('verify_payment')
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
          is_liaison_staff()
          OR has_authority('manage_liaison')
          OR has_authority('upload_feasibility_report')
          OR has_authority('mark_meter_installed')
          OR has_authority('mark_subsidy_received')
        )
      )
    )
  );
