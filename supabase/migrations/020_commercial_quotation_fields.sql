-- Commercial quotation: per-kW excl. GST pricing, GEDA charges, panel mount type
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS price_per_kw_excl_gst NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS geda_charge_amount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS panel_mount_type TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotations_panel_mount_type_check'
  ) THEN
    ALTER TABLE quotations
      ADD CONSTRAINT quotations_panel_mount_type_check
      CHECK (
        panel_mount_type IS NULL
        OR panel_mount_type IN (
          'rcc_terrace',
          'direct_shed',
          'half_shed_half_terrace'
        )
      );
  END IF;
END $$;

COMMENT ON COLUMN public.quotations.price_per_kw_excl_gst IS
  'Commercial: system price per kW exclusive of GST.';
COMMENT ON COLUMN public.quotations.geda_charge_amount IS
  'Commercial: GEDA / liaison charges amount.';
COMMENT ON COLUMN public.quotations.panel_mount_type IS
  'Commercial: panel mounting option (RCC terrace / shed / half-half).';
