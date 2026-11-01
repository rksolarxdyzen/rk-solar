-- Ensure quotation builder settings columns exist (safe if 021 was skipped).

ALTER TABLE quotation_company_settings
  ADD COLUMN IF NOT EXISTS quotation_numbering_format VARCHAR(40) NOT NULL DEFAULT 'prefix_year_seq',
  ADD COLUMN IF NOT EXISTS quotation_numbering_period VARCHAR(20),
  ADD COLUMN IF NOT EXISTS quotation_notes_footer TEXT,
  ADD COLUMN IF NOT EXISTS quotation_template JSONB,
  ADD COLUMN IF NOT EXISTS bank_account_name VARCHAR(160),
  ADD COLUMN IF NOT EXISTS bank_name VARCHAR(160),
  ADD COLUMN IF NOT EXISTS account_number VARCHAR(60),
  ADD COLUMN IF NOT EXISTS ifsc_code VARCHAR(20),
  ADD COLUMN IF NOT EXISTS branch VARCHAR(120);
