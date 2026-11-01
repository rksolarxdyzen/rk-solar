-- Phase 2: daily / employee email report idempotency + optional company recipients
-- Apply after 022_won_closing_gate.sql

ALTER TABLE companies
  ADD COLUMN IF NOT EXISTS daily_report_emails TEXT;

COMMENT ON COLUMN companies.daily_report_emails IS
  'Comma-separated evening report recipients (overrides / merges with DAILY_REPORT_TO env).';

CREATE TABLE IF NOT EXISTS report_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  report_type VARCHAR(64) NOT NULL DEFAULT 'daily_evening',
  report_date DATE NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  recipients TEXT,
  metrics JSONB NOT NULL DEFAULT '{}',
  error_message TEXT,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, report_type, report_date)
);

CREATE INDEX IF NOT EXISTS idx_report_runs_company_date
  ON report_runs (company_id, report_date DESC);

ALTER TABLE report_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY report_runs_select ON report_runs FOR SELECT
  USING (company_id = auth_company_id() AND is_active_user() AND (
    has_authority('view_reports') OR has_authority('full_access')
  ));

-- Inserts/updates go through service role (cron), not end users.
