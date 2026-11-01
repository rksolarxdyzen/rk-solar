-- Multi-bank IFSC / account strings used in RK brand defaults exceed old limits.

ALTER TABLE quotation_company_settings
  ALTER COLUMN ifsc_code TYPE VARCHAR(80),
  ALTER COLUMN account_number TYPE VARCHAR(160),
  ALTER COLUMN bank_name TYPE VARCHAR(200),
  ALTER COLUMN branch TYPE VARCHAR(200);
