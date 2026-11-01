-- Won closing: consumer number + company-borne subsidy flag for Accounts receivables.
ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS consumer_number TEXT,
  ADD COLUMN IF NOT EXISTS company_bears_subsidy BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS subsidy_amount_at_won NUMERIC(14, 2);

COMMENT ON COLUMN public.leads.consumer_number IS
  'Electricity consumer / GEB number — captured when moving to Won';
COMMENT ON COLUMN public.leads.company_bears_subsidy IS
  'When true, company bears/recovers subsidy — Accounts treats subsidy_amount_at_won as pending until subsidy_verified_at';
COMMENT ON COLUMN public.leads.subsidy_amount_at_won IS
  'Snapshot of quotation subsidy at Won when company_bears_subsidy is true';

CREATE INDEX IF NOT EXISTS idx_leads_consumer_number
  ON leads (company_id, consumer_number)
  WHERE consumer_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_leads_company_bears_subsidy
  ON leads (company_id)
  WHERE company_bears_subsidy = true;
