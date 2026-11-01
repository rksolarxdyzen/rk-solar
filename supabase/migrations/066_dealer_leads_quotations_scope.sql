-- Dealers: leads via dealer_id / created_by; quotations ownership-scoped.
-- Fixes quotations_select granting every company quote to view_quotations
-- (dealers are seeded with that key) and leads_select omitting dealer_id.

-- Strip company-wide keys from Dealer role if ever granted
DELETE FROM role_authorities ra
USING roles r
WHERE ra.role_id = r.id
  AND COALESCE(r.slug, '') = 'dealer'
  AND ra.authority_key IN (
    'view_all_leads',
    'view_all_quotations',
    'full_access',
    'manage_quotations'
  );

-- ------------------------------------------------------------
-- Leads: include dealer_id ownership
-- ------------------------------------------------------------
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
      OR dealer_id = auth.uid()
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
      OR dealer_id = auth.uid()
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

-- ------------------------------------------------------------
-- Quotations: company-wide only with view_all_quotations / full_access.
-- Otherwise: created_by me OR lead I own (incl. dealer_id).
-- ------------------------------------------------------------
DROP POLICY IF EXISTS quotations_select ON quotations;
CREATE POLICY quotations_select ON quotations FOR SELECT
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND deleted_at IS NULL
    AND (
      has_authority('full_access')
      OR has_authority('view_all_quotations')
      OR created_by = auth.uid()
      OR EXISTS (
        SELECT 1
        FROM leads l
        WHERE l.id = quotations.lead_id
          AND l.company_id = quotations.company_id
          AND (
            l.assigned_to = auth.uid()
            OR l.assigned_telecaller_id = auth.uid()
            OR l.assigned_surveyor_id = auth.uid()
            OR l.assigned_crew_id = auth.uid()
            OR l.created_by = auth.uid()
            OR l.dealer_id = auth.uid()
          )
      )
    )
  );
