-- Inverter catalog (name + free-text size) for solar BOM / system package PDF.

CREATE TABLE IF NOT EXISTS rate_card_inverters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  inverter_name VARCHAR(200) NOT NULL,
  inverter_size VARCHAR(100) NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rate_card_inverters_company
  ON rate_card_inverters (company_id, sort_order, inverter_name);

ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS inverter_type_name VARCHAR(200),
  ADD COLUMN IF NOT EXISTS inverter_size_label VARCHAR(100);

COMMENT ON TABLE rate_card_inverters IS 'Solar inverter BOM options (brand/name + size label) for quotations';
COMMENT ON COLUMN quotations.inverter_type_name IS 'Snapshot: inverter brand/name from rate card';
COMMENT ON COLUMN quotations.inverter_size_label IS 'Snapshot: inverter size label from rate card (free text)';
