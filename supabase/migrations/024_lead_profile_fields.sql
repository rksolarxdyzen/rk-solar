-- Phase 5a: Lead / customer profile fields (nullable until Won gate)
-- Apply after 023_report_runs.sql

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS meter_type TEXT,
  ADD COLUMN IF NOT EXISTS meter_ownership TEXT,
  ADD COLUMN IF NOT EXISTS payment_plan TEXT;

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_meter_type_check;
ALTER TABLE leads ADD CONSTRAINT leads_meter_type_check
  CHECK (meter_type IS NULL OR meter_type IN ('residential', 'commercial', 'common'));

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_meter_ownership_check;
ALTER TABLE leads ADD CONSTRAINT leads_meter_ownership_check
  CHECK (
    meter_ownership IS NULL
    OR meter_ownership IN ('self', 'wife', 'husband', 'mother', 'father', 'son', 'daughter')
  );

ALTER TABLE leads DROP CONSTRAINT IF EXISTS leads_payment_plan_check;
ALTER TABLE leads ADD CONSTRAINT leads_payment_plan_check
  CHECK (payment_plan IS NULL OR payment_plan IN ('loan', 'cash'));

COMMENT ON COLUMN leads.meter_type IS 'Residential | Commercial | Common — drives quote subsidy defaults (Phase 4)';
COMMENT ON COLUMN leads.meter_ownership IS 'Meter name / ownership relation to customer';
COMMENT ON COLUMN leads.payment_plan IS 'Loan | Cash financing plan';
