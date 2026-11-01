-- Catch-up: quotation columns required by the solar builder (safe if earlier migrations were skipped).

-- Rate-card package snapshots (016)
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS rate_package_id UUID,
  ADD COLUMN IF NOT EXISTS module_type_name VARCHAR(120),
  ADD COLUMN IF NOT EXISTS module_company_name VARCHAR(120),
  ADD COLUMN IF NOT EXISTS module_capacity_label VARCHAR(60),
  ADD COLUMN IF NOT EXISTS system_size_kw NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS panel_count INT,
  ADD COLUMN IF NOT EXISTS system_cost NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS min_sale_price_snapshot NUMERIC(14,2);

-- Project type (017)
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS project_type TEXT NOT NULL DEFAULT 'residential';

-- Meter phase (018)
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS meter_phase TEXT,
  ADD COLUMN IF NOT EXISTS meter_charge_amount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS meter_phase_label TEXT;

-- Subsidy scheme (019)
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS subsidy_scheme TEXT NOT NULL DEFAULT 'residential';

-- Commercial fields (020)
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS price_per_kw_excl_gst NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS geda_charge_amount NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS panel_mount_type TEXT;

-- Site charges snapshot (021)
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS site_charges JSONB;

-- Commercial GST % (029)
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS commercial_gst_percent NUMERIC(5,2);

-- Per-kW tier snapshots (034)
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS tier_type VARCHAR(20) NOT NULL DEFAULT 'premium',
  ADD COLUMN IF NOT EXISTS rate_per_kw_snapshot NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS net_payable_amount NUMERIC(14,2);

-- Optional FK for rate_package_id (only if rate_card_packages exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'rate_card_packages'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotations_rate_package_id_fkey'
  ) THEN
    ALTER TABLE quotations
      ADD CONSTRAINT quotations_rate_package_id_fkey
      FOREIGN KEY (rate_package_id) REFERENCES rate_card_packages(id) ON DELETE SET NULL;
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotations_project_type_check') THEN
    ALTER TABLE quotations
      ADD CONSTRAINT quotations_project_type_check
      CHECK (project_type IN ('residential', 'commercial'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotations_meter_phase_check') THEN
    ALTER TABLE quotations
      ADD CONSTRAINT quotations_meter_phase_check
      CHECK (
        meter_phase IS NULL
        OR meter_phase IN ('single_phase_1_6', 'three_phase_1_6', 'three_phase_6_10')
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotations_subsidy_scheme_check') THEN
    ALTER TABLE quotations
      ADD CONSTRAINT quotations_subsidy_scheme_check
      CHECK (subsidy_scheme IN ('residential', 'society_common_meter', 'none'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'quotations_panel_mount_type_check') THEN
    ALTER TABLE quotations
      ADD CONSTRAINT quotations_panel_mount_type_check
      CHECK (
        panel_mount_type IS NULL
        OR panel_mount_type IN ('rcc_terrace', 'direct_shed', 'half_shed_half_terrace')
      );
  END IF;
END $$;

ALTER TABLE quotations DROP CONSTRAINT IF EXISTS quotations_tier_type_check;
ALTER TABLE quotations
  ADD CONSTRAINT quotations_tier_type_check CHECK (tier_type IN ('premium', 'regular'));

COMMENT ON COLUMN public.quotations.commercial_gst_percent IS
  'Commercial: GST percent applied to base system price (default 8.9).';
