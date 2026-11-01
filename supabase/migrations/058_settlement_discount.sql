-- Accounts settlement discount: amount waived after the Won confirmation
-- (e.g. confirmed 1,85,000, customer paid 1,84,000 after a 1,000 discount).
-- Pending = planned − verified − discount (discount comes off Final, then
-- Pre-dispatch, then Token). leads_update already allows verify_payment.

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS settlement_discount_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS settlement_discount_reason TEXT,
  ADD COLUMN IF NOT EXISTS settlement_discount_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS settlement_discount_at TIMESTAMPTZ;

ALTER TABLE leads
  DROP CONSTRAINT IF EXISTS leads_settlement_discount_nonneg;
ALTER TABLE leads
  ADD CONSTRAINT leads_settlement_discount_nonneg CHECK (settlement_discount_amount >= 0);
