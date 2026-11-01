-- ============================================================
-- 023_quotation_meter_phase.sql — Selected meter phase + charge
-- ============================================================

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS meter_phase TEXT,
  ADD COLUMN IF NOT EXISTS meter_charge_amount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS meter_phase_label TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotations_meter_phase_check'
  ) THEN
    ALTER TABLE quotations
      ADD CONSTRAINT quotations_meter_phase_check
      CHECK (
        meter_phase IS NULL
        OR meter_phase IN ('single_phase_1_6', 'three_phase_1_6', 'three_phase_6_10')
      );
  END IF;
END $$;

COMMENT ON COLUMN public.quotations.meter_phase IS
  'Selected net-meter phase tier applied on the quotation.';
COMMENT ON COLUMN public.quotations.meter_charge_amount IS
  'Snapshot of meter / liaisoning charge for the selected phase.';
