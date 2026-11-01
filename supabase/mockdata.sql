-- ============================================================
-- RK Solar — demo dataset
-- File: supabase/mockdata.sql
--
-- Paste this whole file into Supabase → SQL Editor → Run
-- Requires: migrations 001–014 and at least one staff login (profiles row)
-- Safe to re-run: deletes previous mock rows first
-- Tag: leads.source_detail = '__MOCK_DATA__'
--
-- Fills Pipeline, Customers, Payments, Feasibility, Installation,
-- Liaison, Maintenance, Reminders, and Quotes so every stage has work.
-- ============================================================

DO $$
DECLARE
  cid UUID;
  actor UUID;
  tele UUID;
  surv UUID;
  crew UUID;
  sales UUID;
  accounts UUID;
  prefix TEXT;
BEGIN
  SELECT id INTO cid FROM companies ORDER BY created_at ASC LIMIT 1;
  IF cid IS NULL THEN
    RAISE EXCEPTION 'No company found. Apply migrations 001–014 first.';
  END IF;

  SELECT id INTO actor FROM profiles WHERE company_id = cid AND is_active = true ORDER BY created_at ASC LIMIT 1;
  IF actor IS NULL THEN
    RAISE EXCEPTION 'No staff profile found. Sign in once so Auth creates a profile, then re-run.';
  END IF;

  SELECT id INTO tele FROM profiles
    WHERE company_id = cid AND is_active AND role IN ('tele_caller', 'admin', 'sales_manager')
    ORDER BY created_at ASC LIMIT 1;
  SELECT id INTO surv FROM profiles
    WHERE company_id = cid AND is_active AND role IN ('surveyor', 'admin', 'sales_manager')
    ORDER BY created_at ASC LIMIT 1;
  SELECT id INTO crew FROM profiles
    WHERE company_id = cid AND is_active AND role IN ('installation_crew', 'ops_coordinator', 'admin')
    ORDER BY created_at ASC LIMIT 1;
  SELECT id INTO sales FROM profiles
    WHERE company_id = cid AND is_active AND role IN ('sales_executive', 'sales_manager', 'admin')
    ORDER BY created_at ASC LIMIT 1;
  SELECT id INTO accounts FROM profiles
    WHERE company_id = cid AND is_active AND role IN ('accounts', 'admin', 'sales_manager')
    ORDER BY created_at ASC LIMIT 1;

  tele := COALESCE(tele, actor);
  surv := COALESCE(surv, actor);
  crew := COALESCE(crew, actor);
  sales := COALESCE(sales, actor);
  accounts := COALESCE(accounts, actor);

  SELECT CASE
    WHEN slug ILIKE '%bright%' THEN 'BS'
    ELSE 'RK'
  END INTO prefix FROM companies WHERE id = cid;

  -- ── Clean previous mock (children first) ───────────────────
  UPDATE leads
  SET accepted_quotation_id = NULL
  WHERE company_id = cid
    AND source_detail IN ('__MOCK_DATA__', 'mock_seed_2026');

  DELETE FROM service_ticket_photos
  WHERE ticket_id IN (
    SELECT t.id FROM service_tickets t
    JOIN leads l ON l.id = t.lead_id
    WHERE l.company_id = cid AND l.source_detail IN ('__MOCK_DATA__', 'mock_seed_2026')
  );
  DELETE FROM service_ticket_offers
  WHERE ticket_id IN (
    SELECT t.id FROM service_tickets t
    JOIN leads l ON l.id = t.lead_id
    WHERE l.company_id = cid AND l.source_detail IN ('__MOCK_DATA__', 'mock_seed_2026')
  );
  DELETE FROM service_tickets
  WHERE lead_id IN (
    SELECT id FROM leads WHERE company_id = cid AND source_detail IN ('__MOCK_DATA__', 'mock_seed_2026')
  );
  DELETE FROM installation_photos
  WHERE lead_id IN (
    SELECT id FROM leads WHERE company_id = cid AND source_detail IN ('__MOCK_DATA__', 'mock_seed_2026')
  );
  DELETE FROM notification_outbox
  WHERE lead_id IN (
    SELECT id FROM leads WHERE company_id = cid AND source_detail IN ('__MOCK_DATA__', 'mock_seed_2026')
  );
  DELETE FROM portal_documents
  WHERE lead_id IN (
    SELECT id FROM leads WHERE company_id = cid AND source_detail IN ('__MOCK_DATA__', 'mock_seed_2026')
  );
  DELETE FROM payments
  WHERE lead_id IN (
    SELECT id FROM leads WHERE company_id = cid AND source_detail IN ('__MOCK_DATA__', 'mock_seed_2026')
  );
  DELETE FROM feasibility_reports
  WHERE lead_id IN (
    SELECT id FROM leads WHERE company_id = cid AND source_detail IN ('__MOCK_DATA__', 'mock_seed_2026')
  );
  DELETE FROM quotation_items
  WHERE quotation_id IN (
    SELECT id FROM quotations WHERE company_id = cid AND quotation_no LIKE prefix || '-MOCK-%'
  );
  DELETE FROM quotations WHERE company_id = cid AND quotation_no LIKE prefix || '-MOCK-%';
  DELETE FROM surveys
  WHERE lead_id IN (
    SELECT id FROM leads WHERE company_id = cid AND source_detail IN ('__MOCK_DATA__', 'mock_seed_2026')
  );
  DELETE FROM call_logs
  WHERE lead_id IN (
    SELECT id FROM leads WHERE company_id = cid AND source_detail IN ('__MOCK_DATA__', 'mock_seed_2026')
  );
  DELETE FROM reminders
  WHERE lead_id IN (
    SELECT id FROM leads WHERE company_id = cid AND source_detail IN ('__MOCK_DATA__', 'mock_seed_2026')
  );
  DELETE FROM audit_events
  WHERE lead_id IN (
    SELECT id FROM leads WHERE company_id = cid AND source_detail IN ('__MOCK_DATA__', 'mock_seed_2026')
  );
  DELETE FROM lead_import_rows
  WHERE company_id = cid AND lead_id IN (
    SELECT id FROM leads WHERE company_id = cid AND source_detail IN ('__MOCK_DATA__', 'mock_seed_2026')
  );
  DELETE FROM lead_import_batches
  WHERE company_id = cid AND file_name LIKE 'MOCK-%';
  DELETE FROM leads
  WHERE company_id = cid AND source_detail IN ('__MOCK_DATA__', 'mock_seed_2026');

  -- ── Leads — one (or more) at every sales_stage ─────────────
  INSERT INTO leads (
    company_id, name, phone, email, city, address, source, source_detail,
    temperature, requirement_notes, sales_stage,
    assigned_telecaller_id, assigned_surveyor_id, created_by,
    next_followup_at, next_followup_action, total_calls,
    last_call_at, last_call_notes,
    recommended_system_kw, roof_area_sqft, created_at
  ) VALUES
  -- Pipeline: New Lead
  (cid, 'Amit Sharma',     '9876510001', 'amit.mock@example.com',     'Jaipur',   '12 Civil Lines',              'walk_in',      '__MOCK_DATA__', 'hot',  '5 kW rooftop — walk-in enquiry',                         'new_lead',                     tele, NULL, actor, NOW() + INTERVAL '1 day',  'First call',          0, NULL, NULL, NULL, NULL, NOW() - INTERVAL '2 hours'),
  (cid, 'Bhavna Rathore',  '9876510002', 'bhavna.mock@example.com',   'Ajmer',    'Vaishali Nagar, Sector 8',    'facebook_ads', '__MOCK_DATA__', 'warm', 'Saw Facebook ad for 3 kW home system',                   'new_lead',                     tele, NULL, actor, NOW() + INTERVAL '2 days', 'First call',          0, NULL, NULL, NULL, NULL, NOW() - INTERVAL '1 day'),
  (cid, 'Chetan Soni',     '9876510003', 'chetan.mock@example.com',   'Kota',     'Station Road',                'website',      '__MOCK_DATA__', 'cold', 'Website form — comparing vendors',                       'new_lead',                     tele, NULL, actor, NOW() + INTERVAL '3 days', 'Qualify lead',        0, NULL, NULL, NULL, NULL, NOW() - INTERVAL '3 days'),
  -- Pipeline: Contacted
  (cid, 'Neha Gupta',      '9876510004', 'neha.mock@example.com',     'Ajmer',    'Mayo College Road',           'facebook_ads', '__MOCK_DATA__', 'warm', 'Interested after Facebook ad — wants site visit',        'contacted',                    tele, NULL, actor, NOW() - INTERVAL '1 day',  'Call Back',           3, NOW() - INTERVAL '2 days', 'Discussed 5 kW, asked to call after salary week', 5.00, 900, NOW() - INTERVAL '8 days'),
  (cid, 'Harish Verma',    '9876510005', 'harish.mock@example.com',   'Jaipur',   'Mansarovar Sector 6',         'call',         '__MOCK_DATA__', 'hot',  'Inbound call — 7 kW bungalow, budget ~4.5L',            'contacted',                    tele, NULL, actor, NOW() + INTERVAL '3 hours','Send Proposal',       2, NOW() - INTERVAL '4 hours', 'Hot — send brochure today', 7.50, 1400, NOW() - INTERVAL '2 days'),
  (cid, 'Isha Khandelwal', '9876510006', 'isha.mock@example.com',     'Udaipur',  'Hiran Magri Sector 4',        'referral',     '__MOCK_DATA__', 'warm', 'Referral from existing customer in Udaipur',             'contacted',                    tele, NULL, actor, NOW() + INTERVAL '4 days', 'Schedule Survey',     1, NOW() - INTERVAL '1 day', 'Connected 6 min, will confirm terrace access', 4.00, 700, NOW() - INTERVAL '5 days'),
  -- Pipeline: Visit Scheduled
  (cid, 'Ravi Patel',      '9876510007', 'ravi.mock@example.com',     'Udaipur',  'Fatehsagar Road',             'referral',     '__MOCK_DATA__', 'hot',  'Terrace survey booked',                                  'visit_scheduled',              tele, surv, actor, NOW() + INTERVAL '2 days', 'Site visit',          4, NOW() - INTERVAL '1 day', 'Visit confirmed with surveyor', 5.00, 1100, NOW() - INTERVAL '10 days'),
  (cid, 'Leela Sharma',    '9876510008', 'leela.mock@example.com',    'Bhilwara', 'Azad Nagar',                  'manual',       '__MOCK_DATA__', 'warm', 'Morning slot for shadow-free area check',                'visit_scheduled',              tele, surv, actor, NOW() + INTERVAL '1 day',  'Site visit',          3, NOW() - INTERVAL '6 hours', 'Surveyor assigned', 6.00, 1000, NOW() - INTERVAL '6 days'),
  -- Pipeline: Visit Scheduled column also folds survey_in_progress
  (cid, 'Sanjay Meena',    '9876510009', 'sanjay.mock@example.com',   'Kota',     'Dadabari',                    'manual',       '__MOCK_DATA__', 'warm', 'Surveyor on site — form not submitted yet',              'survey_in_progress',           tele, surv, actor, NULL, NULL, 4, NOW() - INTERVAL '3 hours', 'Reached site, capturing geo', 6.00, 1200, NOW() - INTERVAL '12 days'),
  -- Pipeline: Survey Done (Move to Won lives here)
  (cid, 'Pooja Singh',     '9876510010', 'pooja.mock@example.com',    'Jodhpur',  'Ratanada',                    'excel_import', '__MOCK_DATA__', 'hot',  'Survey done — ready to quote or mark Won',               'survey_completed',             tele, surv, actor, NOW() + INTERVAL '1 day',  'Send quotation',      5, NOW() - INTERVAL '1 day', 'Customer wants 7.5 kW this month', 7.50, 1600, NOW() - INTERVAL '14 days'),
  (cid, 'Naveen Gehlot',   '9876510011', 'naveen.mock@example.com',   'Pali',     'Sojat Road',                  'walk_in',      '__MOCK_DATA__', 'warm', 'Survey pass — 5 kW, waiting on family decision',         'survey_completed',             tele, surv, actor, NOW() + INTERVAL '2 days', 'Share Quote',         4, NOW() - INTERVAL '2 days', 'Warm after site visit', 5.00, 950, NOW() - INTERVAL '11 days'),
  (cid, 'Farah Qureshi',   '9876510012', 'farah.mock@example.com',    'Jaipur',   'C-Scheme, Ashok Marg',        'facebook_ads', '__MOCK_DATA__', 'hot',  'Survey done, hot — close this week',                     'survey_completed',             tele, surv, actor, NOW() + INTERVAL '8 hours','Collect Documents',   6, NOW() - INTERVAL '5 hours', 'Asked for payment terms', 8.00, 1800, NOW() - INTERVAL '9 days'),
  -- Lost
  (cid, 'Imran Khan',      '9876510013', 'imran.mock@example.com',    'Kota',     'Talwandi',                    'excel_import', '__MOCK_DATA__', 'cold', 'Budget mismatch',                                        'lost',                         tele, NULL, actor, NULL, NULL, 3, NOW() - INTERVAL '4 days', 'Last attempt — not proceeding', NULL, NULL, NOW() - INTERVAL '18 days'),
  (cid, 'Jyoti Pareek',    '9876510014', 'jyoti.mock@example.com',    'Sikar',    'Fatehpur Road',               'call',         '__MOCK_DATA__', 'warm', 'Went with local vendor',                                 'lost',                         tele, surv, actor, NULL, NULL, 5, NOW() - INTERVAL '7 days', 'Chose competitor after survey', 5.00, 800, NOW() - INTERVAL '20 days'),
  -- Customers: Quoted
  (cid, 'Vikas Jain',      '9876510015', 'vikas.mock@example.com',    'Bikaner',  'Public Park Road',            'manual',       '__MOCK_DATA__', 'warm', 'Quote sent, waiting on customer',                        'quoted',                       tele, surv, actor, NOW() + INTERVAL '3 days', 'Follow up quote',     6, NOW() - INTERVAL '2 days', 'Sent 5 kW quote on WhatsApp', 5.00, 1000, NOW() - INTERVAL '16 days'),
  (cid, 'Rekha Bansal',    '9876510016', 'rekha.mock@example.com',    'Jaipur',   'Vaishali Nagar',              'referral',     '__MOCK_DATA__', 'hot',  '6.6 kW quote — family reviewing',                       'quoted',                       tele, surv, actor, NOW() + INTERVAL '1 day',  'Share Quote',         5, NOW() - INTERVAL '1 day', 'Asked for subsidy breakup', 6.60, 1250, NOW() - INTERVAL '13 days'),
  -- Customers: Won / payments
  (cid, 'Kavita Joshi',    '9876510017', 'kavita.mock@example.com',   'Jaipur',   'Malviya Nagar',               'manual',       '__MOCK_DATA__', 'hot',  'Won — 5 kW rooftop, token not yet recorded',            'quote_accepted',               tele, surv, actor, NULL, NULL, 8, NOW() - INTERVAL '3 days', 'Accepted quote verbally + WhatsApp', 5.00, 1100, NOW() - INTERVAL '22 days'),
  (cid, 'Mohit Agarwal',   '9876510018', 'mohit.mock@example.com',    'Ajmer',    'Civil Lines',                 'walk_in',      '__MOCK_DATA__', 'hot',  'Won — 4 kW, waiting on token',                           'quote_accepted',               tele, surv, actor, NULL, NULL, 7, NOW() - INTERVAL '2 days', 'Deal closed in office', 4.00, 800, NOW() - INTERVAL '19 days'),
  (cid, 'Arjun Rathore',   '9876510019', 'arjun.mock@example.com',    'Alwar',    'Scheme 8',                    'referral',     '__MOCK_DATA__', 'hot',  'Token recorded — Accounts to verify',                    'token_pending_verification',   tele, surv, actor, NULL, NULL, 7, NOW() - INTERVAL '1 day', 'UPI token received', 6.60, 1300, NOW() - INTERVAL '21 days'),
  (cid, 'Seema Dudi',      '9876510020', 'seema.mock@example.com',    'Sikar',    'Palsana Road',                'manual',       '__MOCK_DATA__', 'warm', 'Token + feasibility both cleared',                       'token_verified_and_feasibility_ok', tele, surv, actor, NULL, NULL, 8, NOW() - INTERVAL '5 days', 'Ready for pre-dispatch invoice', 5.00, 1050, NOW() - INTERVAL '28 days'),
  (cid, 'Tarun Bhati',     '9876510021', 'tarun.mock@example.com',    'Jodhpur',  'Paota C Road',                'facebook_ads', '__MOCK_DATA__', 'hot',  'Pre-dispatch payment pending Accounts',                  'pre_dispatch_pending_verification', tele, surv, actor, NULL, NULL, 9, NOW() - INTERVAL '2 days', 'NEFT done yesterday', 8.00, 1700, NOW() - INTERVAL '32 days'),
  (cid, 'Anjali Shekhawat','9876510022', 'anjali.mock@example.com',   'Jaipur',   'Jagatpura',                   'referral',     '__MOCK_DATA__', 'hot',  'Pre-dispatch verified — assign crew',                    'pre_dispatch_verified',        tele, surv, actor, NULL, NULL, 9, NOW() - INTERVAL '4 days', 'Material can move', 6.00, 1200, NOW() - INTERVAL '35 days'),
  -- Customers: Installation
  (cid, 'Gaurav Singh',    '9876510023', 'gaurav.mock@example.com',   'Kota',     'Vigyan Nagar',                'manual',       '__MOCK_DATA__', 'warm', 'Crew assigned — not started on site',                    'installation_assigned',        tele, surv, actor, NULL, NULL, 10, NOW() - INTERVAL '6 days', 'Crew briefed', 5.00, 1000, NOW() - INTERVAL '40 days'),
  (cid, 'Meera Choudhary', '9876510024', 'meera.mock@example.com',    'Sikar',    'Fatehpur Road',               'manual',       '__MOCK_DATA__', 'warm', 'Installation in progress — photos uploading',            'installation_in_progress',     tele, surv, actor, NULL, NULL, 9, NOW() - INTERVAL '8 days', 'Structure up, panels remaining', 8.00, 1600, NOW() - INTERVAL '38 days'),
  (cid, 'Rohit Khatri',    '9876510025', 'rohit.mock@example.com',    'Pali',     'Station Road',                'excel_import', '__MOCK_DATA__', 'hot',  'Install complete — proofs on file',                      'installation_completed',       tele, surv, actor, NULL, NULL, 11, NOW() - INTERVAL '10 days', 'N+ barcodes captured', 5.00, 980, NOW() - INTERVAL '45 days'),
  -- Customers: Liaison / subsidy
  (cid, 'Deepak Yadav',    '9876510026', 'deepak.mock@example.com',   'Jaipur',   'Mansarovar',                  'facebook_ads', '__MOCK_DATA__', 'hot',  'Install done — Discom file submitted',                   'liaison_in_progress',          tele, surv, actor, NULL, NULL, 10, NOW() - INTERVAL '12 days', 'File at Discom counter', 5.00, 1000, NOW() - INTERVAL '50 days'),
  (cid, 'Priyanka Saini',  '9876510027', 'priyanka.mock@example.com', 'Ajmer',    'Nasirabad Road',              'referral',     '__MOCK_DATA__', 'warm', 'Meter installed — subsidy timer started',                'meter_installed',              tele, surv, actor, NULL, NULL, 11, NOW() - INTERVAL '14 days', 'Customer confirmed meter live', 6.60, 1280, NOW() - INTERVAL '55 days'),
  (cid, 'Kailash Jat',     '9876510028', 'kailash.mock@example.com',  'Bhilwara', 'Pur Road',                    'call',         '__MOCK_DATA__', 'warm', 'Subsidy follow-up overdue',                              'subsidy_pending',              tele, surv, actor, NULL, NULL, 12, NOW() - INTERVAL '20 days', 'Waiting on MNRE credit', 5.00, 1100, NOW() - INTERVAL '70 days'),
  (cid, 'Manisha Ojha',    '9876510029', 'manisha.mock@example.com',  'Udaipur',  'University Road',             'walk_in',      '__MOCK_DATA__', 'hot',  'Customer marked subsidy received — Accounts to verify',  'subsidy_received_pending_accounts', tele, surv, actor, NULL, NULL, 12, NOW() - INTERVAL '18 days', 'Bank SMS forwarded', 7.50, 1500, NOW() - INTERVAL '65 days'),
  -- Customers: Completed + service
  (cid, 'Sunita Agarwal',  '9876510030', 'sunita.mock@example.com',   'Ajmer',    'Mayo College Road',           'manual',       '__MOCK_DATA__', 'warm', 'Project completed — cleaning due',                       'completed',                    tele, surv, actor, NULL, NULL, 12, NOW() - INTERVAL '30 days', 'Certificate issued', 4.00, 750, NOW() - INTERVAL '90 days'),
  (cid, 'Yogesh Poonia',   '9876510031', 'yogesh.mock@example.com',   'Jaipur',   'Sitapura',                    'referral',     '__MOCK_DATA__', 'hot',  'Completed — open service ticket',                        'completed',                    tele, surv, actor, NULL, NULL, 13, NOW() - INTERVAL '25 days', 'Handover done', 5.00, 1000, NOW() - INTERVAL '80 days');

  -- Visits
  UPDATE leads SET
    visit_scheduled_at = NOW() + INTERVAL '2 days',
    visit_notes = 'Terrace survey 10:30 AM. Customer will be home.',
    survey_date = (CURRENT_DATE + 2)
  WHERE company_id = cid AND source_detail = '__MOCK_DATA__' AND name = 'Ravi Patel';

  UPDATE leads SET
    visit_scheduled_at = NOW() + INTERVAL '1 day',
    visit_notes = 'Morning slot. Take drone if available.',
    survey_date = (CURRENT_DATE + 1)
  WHERE company_id = cid AND source_detail = '__MOCK_DATA__' AND name = 'Leela Sharma';

  UPDATE leads SET
    visit_scheduled_at = NOW() - INTERVAL '2 hours',
    visit_notes = 'Surveyor on site now.',
    survey_date = CURRENT_DATE
  WHERE company_id = cid AND source_detail = '__MOCK_DATA__' AND name = 'Sanjay Meena';

  UPDATE leads SET
    visit_scheduled_at = NOW() - INTERVAL '3 days',
    visit_notes = 'Survey completed.',
    survey_date = (CURRENT_DATE - 3)
  WHERE company_id = cid AND source_detail = '__MOCK_DATA__'
    AND sales_stage IN (
      'survey_completed','quoted','quote_accepted','token_pending_verification',
      'token_verified_and_feasibility_ok','pre_dispatch_pending_verification',
      'pre_dispatch_verified','installation_assigned','installation_in_progress',
      'installation_completed','liaison_in_progress','meter_installed',
      'subsidy_pending','subsidy_received_pending_accounts','completed'
    );

  UPDATE leads SET
    visit_scheduled_at = NOW() - INTERVAL '15 days',
    visit_notes = 'Survey done before they chose competitor.',
    survey_date = (CURRENT_DATE - 15)
  WHERE company_id = cid AND source_detail = '__MOCK_DATA__' AND name = 'Jyoti Pareek';

  -- Lost reasons
  UPDATE leads SET loss_reason = 'Price / budget', loss_notes = 'Asked for a price we could not match'
  WHERE company_id = cid AND source_detail = '__MOCK_DATA__' AND name = 'Imran Khan';
  UPDATE leads SET loss_reason = 'Chose competitor', loss_notes = 'Local vendor quoted lower after survey'
  WHERE company_id = cid AND source_detail = '__MOCK_DATA__' AND name = 'Jyoti Pareek';

  -- Payment / install / liaison flags
  UPDATE leads SET token_verified = false, feasibility_approved = false
  WHERE company_id = cid AND source_detail = '__MOCK_DATA__';

  UPDATE leads SET token_verified = true, feasibility_approved = true
  WHERE company_id = cid AND source_detail = '__MOCK_DATA__'
    AND sales_stage IN (
      'token_verified_and_feasibility_ok','pre_dispatch_pending_verification',
      'pre_dispatch_verified','installation_assigned','installation_in_progress',
      'installation_completed','liaison_in_progress','meter_installed',
      'subsidy_pending','subsidy_received_pending_accounts','completed'
    );

  UPDATE leads SET
    portal_code = prefix || 'M' || lpad(row_n::text, 2, '0')
  FROM (
    SELECT id, row_number() OVER (ORDER BY name) AS row_n
    FROM leads
    WHERE company_id = cid AND source_detail = '__MOCK_DATA__'
      AND sales_stage IN (
        'quote_accepted','token_pending_verification','token_verified_and_feasibility_ok',
        'pre_dispatch_pending_verification','pre_dispatch_verified','installation_assigned',
        'installation_in_progress','installation_completed','liaison_in_progress',
        'meter_installed','subsidy_pending','subsidy_received_pending_accounts','completed'
      )
  ) numbered
  WHERE leads.id = numbered.id;

  UPDATE leads SET
    assigned_crew_id = crew,
    installation_assigned_at = NOW() - INTERVAL '2 days',
    expected_panel_count = 10
  WHERE company_id = cid AND source_detail = '__MOCK_DATA__' AND name = 'Gaurav Singh';

  UPDATE leads SET
    assigned_crew_id = crew,
    installation_assigned_at = NOW() - INTERVAL '4 days',
    installation_started_at = NOW() - INTERVAL '1 day',
    expected_panel_count = 16
  WHERE company_id = cid AND source_detail = '__MOCK_DATA__' AND name = 'Meera Choudhary';

  UPDATE leads SET
    assigned_crew_id = crew,
    installation_assigned_at = NOW() - INTERVAL '18 days',
    installation_started_at = NOW() - INTERVAL '16 days',
    installation_completed_at = NOW() - INTERVAL '10 days',
    expected_panel_count = 10
  WHERE company_id = cid AND source_detail = '__MOCK_DATA__'
    AND sales_stage IN (
      'installation_completed','liaison_in_progress','meter_installed',
      'subsidy_pending','subsidy_received_pending_accounts','completed'
    );

  UPDATE leads SET
    liaison_notes = 'File submitted at Discom. Waiting for meter slot.',
    installation_completed_at = COALESCE(installation_completed_at, NOW() - INTERVAL '10 days')
  WHERE company_id = cid AND source_detail = '__MOCK_DATA__' AND name = 'Deepak Yadav';

  UPDATE leads SET
    meter_installed_at = NOW() - INTERVAL '6 days',
    meter_marked_by = actor,
    subsidy_timer_started_at = NOW() - INTERVAL '6 days',
    subsidy_timer_due_at = NOW() + INTERVAL '9 days',
    liaison_notes = 'Net meter live. Subsidy timer running.'
  WHERE company_id = cid AND source_detail = '__MOCK_DATA__' AND name = 'Priyanka Saini';

  UPDATE leads SET
    meter_installed_at = NOW() - INTERVAL '22 days',
    meter_marked_by = actor,
    subsidy_timer_started_at = NOW() - INTERVAL '22 days',
    subsidy_timer_due_at = NOW() - INTERVAL '7 days',
    subsidy_followup_sent_at = NOW() - INTERVAL '2 days',
    liaison_notes = '15-day subsidy timer overdue — follow up with customer.'
  WHERE company_id = cid AND source_detail = '__MOCK_DATA__' AND name = 'Kailash Jat';

  UPDATE leads SET
    meter_installed_at = NOW() - INTERVAL '20 days',
    meter_marked_by = actor,
    subsidy_timer_started_at = NOW() - INTERVAL '20 days',
    subsidy_timer_due_at = NOW() - INTERVAL '5 days',
    subsidy_received_at = NOW() - INTERVAL '1 day',
    subsidy_bank_reference = 'UTR MOCKSUBSIDY9921',
    liaison_notes = 'Customer marked subsidy received. Accounts to verify credit.'
  WHERE company_id = cid AND source_detail = '__MOCK_DATA__' AND name = 'Manisha Ojha';

  UPDATE leads SET
    meter_installed_at = NOW() - INTERVAL '40 days',
    meter_marked_by = actor,
    subsidy_timer_started_at = NOW() - INTERVAL '40 days',
    subsidy_timer_due_at = NOW() - INTERVAL '25 days',
    subsidy_received_at = NOW() - INTERVAL '20 days',
    subsidy_verified_at = NOW() - INTERVAL '18 days',
    subsidy_verified_by = accounts,
    subsidy_bank_reference = 'UTR MOCKDONE4410',
    completion_certificate_url = 'https://placehold.co/800x1100?text=Completion+Certificate',
    cleaning_next_due_at = NOW() + INTERVAL '2 days',
    liaison_notes = 'Closed. Cleaning reminder due shortly.'
  WHERE company_id = cid AND source_detail = '__MOCK_DATA__' AND name = 'Sunita Agarwal';

  UPDATE leads SET
    meter_installed_at = NOW() - INTERVAL '35 days',
    meter_marked_by = actor,
    subsidy_timer_started_at = NOW() - INTERVAL '35 days',
    subsidy_timer_due_at = NOW() - INTERVAL '20 days',
    subsidy_received_at = NOW() - INTERVAL '16 days',
    subsidy_verified_at = NOW() - INTERVAL '14 days',
    subsidy_verified_by = accounts,
    subsidy_bank_reference = 'UTR MOCKDONE4411',
    completion_certificate_url = 'https://placehold.co/800x1100?text=Completion+Certificate',
    cleaning_next_due_at = NOW() - INTERVAL '1 day',
    liaison_notes = 'Closed. Open service ticket for inverter trip.'
  WHERE company_id = cid AND source_detail = '__MOCK_DATA__' AND name = 'Yogesh Poonia';

  -- ── Surveys ────────────────────────────────────────────────
  INSERT INTO surveys (
    company_id, lead_id, surveyed_by, latitude, longitude,
    total_terrace_sqft, shadow_free_sqft, capacity_kw, feasibility_pass, notes, completed_at
  )
  SELECT
    cid, id, surv, 26.9124000, 75.7873000,
    roof_area_sqft, ROUND(roof_area_sqft * 0.78, 2), recommended_system_kw,
    true, 'Mock digital survey', NULL
  FROM leads
  WHERE company_id = cid AND source_detail = '__MOCK_DATA__' AND name = 'Sanjay Meena';

  INSERT INTO surveys (
    company_id, lead_id, surveyed_by, latitude, longitude,
    total_terrace_sqft, shadow_free_sqft, capacity_kw, feasibility_pass, notes, completed_at
  )
  SELECT
    cid, id, surv,
    26.9124000, 75.7873000,
    COALESCE(roof_area_sqft, 1000),
    ROUND(COALESCE(roof_area_sqft, 1000) * 0.8, 2),
    recommended_system_kw,
    true,
    'Geo captured. Shadow-free area sufficient for requested kW.',
    NOW() - INTERVAL '2 days'
  FROM leads
  WHERE company_id = cid AND source_detail = '__MOCK_DATA__'
    AND sales_stage IN (
      'survey_completed','quoted','quote_accepted','token_pending_verification',
      'token_verified_and_feasibility_ok','pre_dispatch_pending_verification',
      'pre_dispatch_verified','installation_assigned','installation_in_progress',
      'installation_completed','liaison_in_progress','meter_installed',
      'subsidy_pending','subsidy_received_pending_accounts','completed'
    );

  INSERT INTO surveys (
    company_id, lead_id, surveyed_by, latitude, longitude,
    total_terrace_sqft, shadow_free_sqft, capacity_kw, feasibility_pass, notes, completed_at
  )
  SELECT cid, id, surv, 27.6094000, 75.1398000, 800, 520, 5.00, true,
    'Survey completed before the customer chose a competitor.', NOW() - INTERVAL '15 days'
  FROM leads
  WHERE company_id = cid AND source_detail = '__MOCK_DATA__' AND name = 'Jyoti Pareek';

  -- ── Quotations (Quoted = sent, Won+ = accepted) ────────────
  INSERT INTO quotations (
    company_id, quotation_no, lead_id, template_kind,
    customer_name, customer_phone, customer_city, customer_address,
    status, quote_date, valid_till, system_size_kw,
    meter_charges, subsidy, subtotal, taxable_total, gst_total, grand_total,
    notes, terms, created_by, updated_by
  )
  SELECT
    cid,
    prefix || '-MOCK-' || lpad(row_number() OVER (ORDER BY l.name)::text, 4, '0'),
    l.id,
    'solar',
    l.name, l.phone, l.city, l.address,
    CASE WHEN l.sales_stage = 'quoted' THEN 'sent' ELSE 'accepted' END,
    CURRENT_DATE - 8,
    CURRENT_DATE + 10,
    l.recommended_system_kw,
    15000,
    CASE WHEN l.recommended_system_kw >= 5 THEN 78000 ELSE 30000 END,
    ROUND((COALESCE(l.recommended_system_kw, 5) * 48000)::numeric, 2),
    ROUND((COALESCE(l.recommended_system_kw, 5) * 48000)::numeric, 2),
    ROUND((COALESCE(l.recommended_system_kw, 5) * 48000 * 0.18)::numeric, 2),
    ROUND((COALESCE(l.recommended_system_kw, 5) * 48000 * 1.18)::numeric, 2),
    NULL,
    'Prices inclusive of GST. Validity 15 days. Payment: token / pre-dispatch / final.',
    sales,
    sales
  FROM leads l
  WHERE l.company_id = cid AND l.source_detail = '__MOCK_DATA__'
    AND l.sales_stage IN (
      'quoted','quote_accepted','token_pending_verification','token_verified_and_feasibility_ok',
      'pre_dispatch_pending_verification','pre_dispatch_verified','installation_assigned',
      'installation_in_progress','installation_completed','liaison_in_progress',
      'meter_installed','subsidy_pending','subsidy_received_pending_accounts','completed'
    );

  INSERT INTO quotation_items (
    quotation_id, sort_order, item_name_snapshot, brand_snapshot, quantity, unit, rate, gst_percent, line_total
  )
  SELECT q.id, 10, '540W Mono PERC Module', 'Adani',
    GREATEST(8, ROUND(COALESCE(l.recommended_system_kw, 5) * 1000 / 540)),
    'pcs', 18500, 18,
    GREATEST(8, ROUND(COALESCE(l.recommended_system_kw, 5) * 1000 / 540.0)) * 18500
  FROM quotations q
  JOIN leads l ON l.id = q.lead_id
  WHERE q.company_id = cid AND q.quotation_no LIKE prefix || '-MOCK-%';

  INSERT INTO quotation_items (
    quotation_id, sort_order, item_name_snapshot, brand_snapshot, quantity, unit, rate, gst_percent, line_total
  )
  SELECT q.id, 20, 'On-grid Inverter', 'Polycab', 1, 'pcs', 65000, 18, 65000
  FROM quotations q
  WHERE q.company_id = cid AND q.quotation_no LIKE prefix || '-MOCK-%';

  UPDATE leads l
  SET accepted_quotation_id = q.id
  FROM quotations q
  WHERE q.lead_id = l.id
    AND q.company_id = cid
    AND q.status = 'accepted'
    AND q.quotation_no LIKE prefix || '-MOCK-%';

  -- ── Payments ───────────────────────────────────────────────
  -- Token pending
  INSERT INTO payments (
    company_id, lead_id, quotation_id, milestone, amount, method, transaction_id,
    paid_at, verification_status, recorded_by, notes
  )
  SELECT cid, l.id, l.accepted_quotation_id, 'token', 50000, 'upi', 'UPI-MOCK-TOKEN-19',
    CURRENT_DATE - 1, 'pending', sales, 'Awaiting Accounts verification'
  FROM leads l
  WHERE l.company_id = cid AND l.source_detail = '__MOCK_DATA__' AND l.name = 'Arjun Rathore';

  -- Token verified (and all later stages)
  INSERT INTO payments (
    company_id, lead_id, quotation_id, milestone, amount, method, transaction_id,
    paid_at, bank_reference, verification_status, recorded_by, verified_by, verified_at, notes
  )
  SELECT cid, l.id, l.accepted_quotation_id, 'token', 50000, 'upi', 'UPI-MOCK-TOKEN-' || right(l.phone, 2),
    CURRENT_DATE - 12, 'BANK-MOCK-TOK', 'verified', sales, accounts, NOW() - INTERVAL '10 days', 'Token verified'
  FROM leads l
  WHERE l.company_id = cid AND l.source_detail = '__MOCK_DATA__'
    AND l.sales_stage IN (
      'token_verified_and_feasibility_ok','pre_dispatch_pending_verification',
      'pre_dispatch_verified','installation_assigned','installation_in_progress',
      'installation_completed','liaison_in_progress','meter_installed',
      'subsidy_pending','subsidy_received_pending_accounts','completed'
    );

  -- Pre-dispatch pending
  INSERT INTO payments (
    company_id, lead_id, quotation_id, milestone, amount, method, transaction_id,
    paid_at, verification_status, recorded_by, notes
  )
  SELECT cid, l.id, l.accepted_quotation_id, 'pre_dispatch', 180000, 'bank_transfer', 'NEFT-MOCK-PD-21',
    CURRENT_DATE - 1, 'pending', sales, 'NEFT screenshot attached in chat'
  FROM leads l
  WHERE l.company_id = cid AND l.source_detail = '__MOCK_DATA__' AND l.name = 'Tarun Bhati';

  -- Pre-dispatch verified (later stages)
  INSERT INTO payments (
    company_id, lead_id, quotation_id, milestone, amount, method, transaction_id,
    paid_at, bank_reference, verification_status, recorded_by, verified_by, verified_at, notes
  )
  SELECT cid, l.id, l.accepted_quotation_id, 'pre_dispatch', 180000, 'bank_transfer', 'NEFT-MOCK-PD-' || right(l.phone, 2),
    CURRENT_DATE - 14, 'BANK-MOCK-PD', 'verified', sales, accounts, NOW() - INTERVAL '12 days', 'Pre-dispatch verified'
  FROM leads l
  WHERE l.company_id = cid AND l.source_detail = '__MOCK_DATA__'
    AND l.sales_stage IN (
      'pre_dispatch_verified','installation_assigned','installation_in_progress',
      'installation_completed','liaison_in_progress','meter_installed',
      'subsidy_pending','subsidy_received_pending_accounts','completed'
    );

  -- Final verified on completed jobs
  INSERT INTO payments (
    company_id, lead_id, quotation_id, milestone, amount, method, transaction_id,
    paid_at, bank_reference, verification_status, recorded_by, verified_by, verified_at, notes
  )
  SELECT cid, l.id, l.accepted_quotation_id, 'final', 70000, 'upi', 'UPI-MOCK-FIN-' || right(l.phone, 2),
    CURRENT_DATE - 20, 'BANK-MOCK-FIN', 'verified', sales, accounts, NOW() - INTERVAL '18 days', 'Final settlement'
  FROM leads l
  WHERE l.company_id = cid AND l.source_detail = '__MOCK_DATA__'
    AND l.sales_stage IN ('subsidy_received_pending_accounts', 'completed');

  -- ── Feasibility ────────────────────────────────────────────
  INSERT INTO feasibility_reports (
    company_id, lead_id, title, notes, file_url, status, uploaded_by
  )
  SELECT cid, id, 'Grid Feasibility Report',
    'Awaiting Feasibility team approval',
    'https://placehold.co/800x1100?text=Feasibility+Pending',
    'submitted', sales
  FROM leads
  WHERE company_id = cid AND source_detail = '__MOCK_DATA__' AND name = 'Arjun Rathore';

  INSERT INTO feasibility_reports (
    company_id, lead_id, title, notes, file_url, status,
    uploaded_by, approved_by, approved_at
  )
  SELECT cid, id, 'Grid Feasibility Report',
    'Load flow OK. Sanctioned capacity matches survey kW.',
    'https://placehold.co/800x1100?text=Feasibility+Approved',
    'approved', sales, actor, NOW() - INTERVAL '9 days'
  FROM leads
  WHERE company_id = cid AND source_detail = '__MOCK_DATA__'
    AND sales_stage IN (
      'token_verified_and_feasibility_ok','pre_dispatch_pending_verification',
      'pre_dispatch_verified','installation_assigned','installation_in_progress',
      'installation_completed','liaison_in_progress','meter_installed',
      'subsidy_pending','subsidy_received_pending_accounts','completed'
    );

  -- ── Installation photos ────────────────────────────────────
  INSERT INTO installation_photos (company_id, lead_id, photo_kind, file_url, caption, uploaded_by)
  SELECT cid, id, 'site', 'https://placehold.co/800x600?text=Site+Overview', 'Site overview', crew
  FROM leads
  WHERE company_id = cid AND source_detail = '__MOCK_DATA__' AND name = 'Meera Choudhary';

  INSERT INTO installation_photos (company_id, lead_id, photo_kind, file_url, caption, uploaded_by)
  SELECT cid, id, 'other', 'https://placehold.co/800x600?text=Structure', 'Module mounting in progress', crew
  FROM leads
  WHERE company_id = cid AND source_detail = '__MOCK_DATA__' AND name = 'Meera Choudhary';

  INSERT INTO installation_photos (
    company_id, lead_id, photo_kind, file_url, caption, panel_index, serial_hint, uploaded_by
  )
  SELECT cid, l.id, kind, url, caption, panel_index, serial_hint, crew
  FROM leads l
  CROSS JOIN (
    VALUES
      ('site'::text, 'https://placehold.co/800x600?text=Site', 'Completed site', NULL::int, NULL::text),
      ('panel_barcode', 'https://placehold.co/600x400?text=Barcode+1', 'Panel 1', 1, 'ADANI-MOCK-001'),
      ('panel_barcode', 'https://placehold.co/600x400?text=Barcode+2', 'Panel 2', 2, 'ADANI-MOCK-002'),
      ('other', 'https://placehold.co/800x600?text=Inverter', 'Inverter commissioned', NULL, NULL)
  ) AS p(kind, url, caption, panel_index, serial_hint)
  WHERE l.company_id = cid AND l.source_detail = '__MOCK_DATA__'
    AND l.sales_stage IN (
      'installation_completed','liaison_in_progress','meter_installed',
      'subsidy_pending','subsidy_received_pending_accounts','completed'
    );

  -- ── Portal documents ───────────────────────────────────────
  INSERT INTO portal_documents (company_id, lead_id, doc_type, title, file_url, uploaded_by, visible_to_customer)
  SELECT cid, id, 'quote_pdf', 'Accepted quotation', 'https://placehold.co/800x1100?text=Quotation+PDF', sales, true
  FROM leads
  WHERE company_id = cid AND source_detail = '__MOCK_DATA__' AND portal_code IS NOT NULL;

  INSERT INTO portal_documents (company_id, lead_id, doc_type, title, file_url, uploaded_by, visible_to_customer)
  SELECT cid, id, 'invoice', 'Tax invoice', 'https://placehold.co/800x1100?text=Tax+Invoice', accounts, true
  FROM leads
  WHERE company_id = cid AND source_detail = '__MOCK_DATA__'
    AND sales_stage IN ('completed', 'subsidy_received_pending_accounts');

  -- ── Call logs + reminders ──────────────────────────────────
  INSERT INTO call_logs (company_id, lead_id, user_id, outcome, notes, created_at)
  SELECT cid, id, tele, 'connected', 'Mock connected call', NOW() - INTERVAL '2 days'
  FROM leads
  WHERE company_id = cid AND source_detail = '__MOCK_DATA__'
    AND sales_stage NOT IN ('new_lead');

  INSERT INTO call_logs (company_id, lead_id, user_id, outcome, notes, created_at)
  SELECT cid, id, tele, 'not_pick', 'First attempt — not pick', NOW() - INTERVAL '6 days'
  FROM leads
  WHERE company_id = cid AND source_detail = '__MOCK_DATA__'
    AND name IN ('Neha Gupta', 'Harish Verma', 'Isha Khandelwal');

  INSERT INTO reminders (company_id, lead_id, reminder_type, message, due_at)
  SELECT cid, id, 'sales_followup', 'Overdue: call back after salary week', NOW() - INTERVAL '1 day'
  FROM leads WHERE company_id = cid AND source_detail = '__MOCK_DATA__' AND name = 'Neha Gupta';

  INSERT INTO reminders (company_id, lead_id, reminder_type, message, due_at)
  SELECT cid, id, 'sales_followup', 'Due today: send proposal', NOW() + INTERVAL '2 hours'
  FROM leads WHERE company_id = cid AND source_detail = '__MOCK_DATA__' AND name = 'Harish Verma';

  INSERT INTO reminders (company_id, lead_id, reminder_type, message, due_at)
  SELECT cid, id, 'sales_followup', 'Schedule terrace survey', NOW() + INTERVAL '4 days'
  FROM leads WHERE company_id = cid AND source_detail = '__MOCK_DATA__' AND name = 'Isha Khandelwal';

  INSERT INTO reminders (company_id, lead_id, reminder_type, message, due_at)
  SELECT cid, id, 'survey_scheduled', 'Site visit with surveyor', visit_scheduled_at
  FROM leads
  WHERE company_id = cid AND source_detail = '__MOCK_DATA__'
    AND name IN ('Ravi Patel', 'Leela Sharma');

  INSERT INTO reminders (company_id, lead_id, reminder_type, message, due_at)
  SELECT cid, id, 'post_survey_followup', 'Send quotation / Move to Won', NOW() + INTERVAL '1 day'
  FROM leads
  WHERE company_id = cid AND source_detail = '__MOCK_DATA__' AND name = 'Pooja Singh';

  -- ── Service tickets ────────────────────────────────────────
  INSERT INTO service_tickets (
    company_id, lead_id, status, description, assigned_to, raised_via,
    accepted_at, started_at, closed_at, resolution_notes
  )
  SELECT cid, id, 'closed', 'Inverter showing grid fault after storm.', crew, 'portal',
    NOW() - INTERVAL '10 days', NOW() - INTERVAL '9 days', NOW() - INTERVAL '8 days',
    'Reset inverter, tightened AC isolator. Restored.'
  FROM leads WHERE company_id = cid AND source_detail = '__MOCK_DATA__' AND name = 'Sunita Agarwal';

  INSERT INTO service_tickets (
    company_id, lead_id, status, description, assigned_to, raised_via, created_at
  )
  SELECT cid, id, 'raised', 'Inverter trips every evening around 7 PM. Please inspect.',
    NULL, 'portal', NOW() - INTERVAL '6 hours'
  FROM leads WHERE company_id = cid AND source_detail = '__MOCK_DATA__' AND name = 'Yogesh Poonia';

  INSERT INTO service_tickets (
    company_id, lead_id, status, description, assigned_to, raised_via,
    accepted_at, started_at
  )
  SELECT cid, id, 'in_progress', 'Two panels dusty / generation drop. Cleaning + check.',
    crew, 'staff', NOW() - INTERVAL '1 day', NOW() - INTERVAL '4 hours'
  FROM leads WHERE company_id = cid AND source_detail = '__MOCK_DATA__' AND name = 'Sunita Agarwal';

  INSERT INTO service_ticket_photos (company_id, ticket_id, file_url, caption, uploaded_by)
  SELECT cid, t.id, 'https://placehold.co/800x600?text=Ticket+Proof', 'Closed with photo', crew
  FROM service_tickets t
  JOIN leads l ON l.id = t.lead_id
  WHERE l.company_id = cid AND l.source_detail = '__MOCK_DATA__'
    AND t.status = 'closed';

  -- ── Import batch (Excel source) ────────────────────────────
  INSERT INTO lead_import_batches (company_id, file_name, imported_by, total_rows, success_rows, error_rows)
  VALUES (cid, 'MOCK-leads-aug-2026.xlsx', actor, 3, 3, 0);

  INSERT INTO lead_import_rows (batch_id, company_id, row_number, lead_id, raw_data)
  SELECT b.id, cid, row_number() OVER (ORDER BY l.name), l.id,
    jsonb_build_object('name', l.name, 'phone', l.phone, 'city', l.city)
  FROM lead_import_batches b
  JOIN leads l ON l.company_id = b.company_id
  WHERE b.company_id = cid AND b.file_name = 'MOCK-leads-aug-2026.xlsx'
    AND l.source_detail = '__MOCK_DATA__'
    AND l.source = 'excel_import';

  RAISE NOTICE 'Mock data loaded for company % (prefix %). Pipeline, Customers, Payments, Feasibility, Installation, Liaison, and Maintenance should all show work.', cid, prefix;
END $$;
