-- Quotation subsidy scheme: standard residential vs society common meter (GHS/RWA).
ALTER TABLE public.quotations
  ADD COLUMN IF NOT EXISTS subsidy_scheme TEXT NOT NULL DEFAULT 'residential';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotations_subsidy_scheme_check'
  ) THEN
    ALTER TABLE public.quotations
      ADD CONSTRAINT quotations_subsidy_scheme_check
      CHECK (subsidy_scheme IN ('residential', 'society_common_meter', 'none'));
  END IF;
END $$;

-- Align existing commercial quotes with no residential subsidy scheme.
UPDATE public.quotations
SET subsidy_scheme = 'none'
WHERE project_type = 'commercial'
  AND subsidy_scheme = 'residential'
  AND (subsidy IS NULL OR subsidy = 0);

COMMENT ON COLUMN public.quotations.subsidy_scheme IS
  'Subsidy rule set: residential (PM Surya Ghar slabs), society_common_meter (GHS/RWA ₹18k/kW), or none.';
