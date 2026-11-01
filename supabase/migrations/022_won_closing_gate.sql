-- Phase 0: Won closing hard gate — system details, payment plan, mandatory docs
-- Apply after 021_quotation_builder_support.sql

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS won_panel_name TEXT,
  ADD COLUMN IF NOT EXISTS won_panel_quantity INT,
  ADD COLUMN IF NOT EXISTS won_inverter_company TEXT,
  ADD COLUMN IF NOT EXISTS won_system_size_kw NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS won_token_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS won_pre_dispatch_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS won_final_amount NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS won_closed_at TIMESTAMPTZ;

COMMENT ON COLUMN leads.won_panel_name IS 'Won gate: module brand/capacity label';
COMMENT ON COLUMN leads.won_panel_quantity IS 'Won gate: panel count';
COMMENT ON COLUMN leads.won_inverter_company IS 'Won gate: inverter brand';
COMMENT ON COLUMN leads.won_system_size_kw IS 'Won gate: system size kW';
COMMENT ON COLUMN leads.won_token_amount IS 'Won gate: planned token payment';
COMMENT ON COLUMN leads.won_pre_dispatch_amount IS 'Won gate: planned pre-dispatch payment';
COMMENT ON COLUMN leads.won_final_amount IS 'Won gate: planned final payment';
COMMENT ON COLUMN leads.won_closed_at IS 'When Move to Won hard gate completed';
