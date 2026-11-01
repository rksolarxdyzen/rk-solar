-- ============================================================
-- Seed on-grid inverters for solar quotations (RK)
-- Re-runnable / idempotent. Paste in Supabase SQL editor.
--
-- Shows up in: New Quotation → Solar builder → Inverter dropdown
-- Requires: quote_items, quote_brands, quote_item_categories
--
-- Tenant company id (demo / RK):
--   a0000000-0000-4000-8000-000000000001
-- Change cid below if your companies.id differs.
-- ============================================================

DO $$
DECLARE
  cid UUID := 'a0000000-0000-4000-8000-000000000001';
  c_inverters UUID;
  b_polycab UUID;
  b_sungrow UUID;
  b_growatt UUID;
  b_vsole UUID;
  b_waaree UUID;
  b_luminous UUID;
  b_havells UUID;
  b_solis UUID;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM companies WHERE id = cid) THEN
    RAISE EXCEPTION 'Company % not found. Update cid to your companies.id', cid;
  END IF;

  INSERT INTO quote_item_categories (company_id, name, kind, sort_order)
  VALUES (cid, 'On-Grid Inverters', 'solar', 20)
  ON CONFLICT (company_id, name) DO UPDATE
    SET kind = EXCLUDED.kind, sort_order = EXCLUDED.sort_order;

  SELECT id INTO c_inverters
  FROM quote_item_categories
  WHERE company_id = cid AND name = 'On-Grid Inverters';

  INSERT INTO quote_brands (company_id, name, category) VALUES
    (cid, 'Polycab', 'inverter'),
    (cid, 'Sungrow', 'inverter'),
    (cid, 'Growatt', 'inverter'),
    (cid, 'VSOLE', 'inverter'),
    (cid, 'Waaree', 'inverter'),
    (cid, 'Luminous', 'inverter'),
    (cid, 'Havells', 'inverter'),
    (cid, 'Solis', 'inverter')
  ON CONFLICT (company_id, name) DO NOTHING;

  SELECT id INTO b_polycab FROM quote_brands WHERE company_id = cid AND name = 'Polycab';
  SELECT id INTO b_sungrow FROM quote_brands WHERE company_id = cid AND name = 'Sungrow';
  SELECT id INTO b_growatt FROM quote_brands WHERE company_id = cid AND name = 'Growatt';
  SELECT id INTO b_vsole FROM quote_brands WHERE company_id = cid AND name = 'VSOLE';
  SELECT id INTO b_waaree FROM quote_brands WHERE company_id = cid AND name = 'Waaree';
  SELECT id INTO b_luminous FROM quote_brands WHERE company_id = cid AND name = 'Luminous';
  SELECT id INTO b_havells FROM quote_brands WHERE company_id = cid AND name = 'Havells';
  SELECT id INTO b_solis FROM quote_brands WHERE company_id = cid AND name = 'Solis';

  -- capacity_label MUST include "kW" (parser reads it for the quotation UI)
  INSERT INTO quote_items (
    company_id, brand_id, category_id, item_name, model, capacity_label,
    unit, gst_percent, base_rate, template_kind, is_active
  )
  SELECT v.*
  FROM (VALUES
    -- Polycab
    (cid, b_polycab, c_inverters, 'Polycab On-Grid Inverter', 'PC-2K', '2 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_polycab, c_inverters, 'Polycab On-Grid Inverter', 'PC-3K', '3 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_polycab, c_inverters, 'Polycab On-Grid Inverter', 'PC-4K', '4 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_polycab, c_inverters, 'Polycab On-Grid Inverter', 'PC-5K', '5 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_polycab, c_inverters, 'Polycab On-Grid Inverter', 'PC-6K', '6 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_polycab, c_inverters, 'Polycab On-Grid Inverter', 'PC-8K', '8 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_polycab, c_inverters, 'Polycab On-Grid Inverter', 'PC-10K', '10 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),

    -- Sungrow
    (cid, b_sungrow, c_inverters, 'Sungrow On-Grid Inverter', 'SG2.0RS', '2 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_sungrow, c_inverters, 'Sungrow On-Grid Inverter', 'SG3.0RS', '3 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_sungrow, c_inverters, 'Sungrow On-Grid Inverter', 'SG5.0RT', '5 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_sungrow, c_inverters, 'Sungrow On-Grid Inverter', 'SG6.0RT', '6 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_sungrow, c_inverters, 'Sungrow On-Grid Inverter', 'SG8.0RT', '8 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_sungrow, c_inverters, 'Sungrow On-Grid Inverter', 'SG10RT', '10 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),

    -- Growatt
    (cid, b_growatt, c_inverters, 'Growatt On-Grid Inverter', 'MIN 2000TL-X', '2 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_growatt, c_inverters, 'Growatt On-Grid Inverter', 'MIN 3000TL-X', '3 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_growatt, c_inverters, 'Growatt On-Grid Inverter', 'MIN 4200TL-X', '4.2 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_growatt, c_inverters, 'Growatt On-Grid Inverter', 'MIN 5000TL-X', '5 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_growatt, c_inverters, 'Growatt On-Grid Inverter', 'MIN 6000TL-X', '6 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_growatt, c_inverters, 'Growatt On-Grid Inverter', 'MOD 8000TL3-X', '8 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_growatt, c_inverters, 'Growatt On-Grid Inverter', 'MOD 10000TL3-X', '10 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),

    -- VSOLE
    (cid, b_vsole, c_inverters, 'VSOLE On-Grid Inverter', 'VS-3K', '3 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_vsole, c_inverters, 'VSOLE On-Grid Inverter', 'VS-5K', '5 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_vsole, c_inverters, 'VSOLE On-Grid Inverter', 'VS-6K', '6 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_vsole, c_inverters, 'VSOLE On-Grid Inverter', 'VS-8K', '8 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_vsole, c_inverters, 'VSOLE On-Grid Inverter', 'VS-10K', '10 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),

    -- Waaree
    (cid, b_waaree, c_inverters, 'Waaree On-Grid Inverter', 'WRI-3K', '3 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_waaree, c_inverters, 'Waaree On-Grid Inverter', 'WRI-5K', '5 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_waaree, c_inverters, 'Waaree On-Grid Inverter', 'WRI-6K', '6 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_waaree, c_inverters, 'Waaree On-Grid Inverter', 'WRI-8K', '8 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_waaree, c_inverters, 'Waaree On-Grid Inverter', 'WRI-10K', '10 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),

    -- Luminous
    (cid, b_luminous, c_inverters, 'Luminous On-Grid Inverter', 'NXT 3kW', '3 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_luminous, c_inverters, 'Luminous On-Grid Inverter', 'NXT 5kW', '5 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_luminous, c_inverters, 'Luminous On-Grid Inverter', 'NXT 6kW', '6 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_luminous, c_inverters, 'Luminous On-Grid Inverter', 'NXT 10kW', '10 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),

    -- Havells
    (cid, b_havells, c_inverters, 'Havells On-Grid Inverter', 'Enviro GTI 3kW', '3 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_havells, c_inverters, 'Havells On-Grid Inverter', 'Enviro GTI 5kW', '5 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_havells, c_inverters, 'Havells On-Grid Inverter', 'Enviro GTI 6kW', '6 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_havells, c_inverters, 'Havells On-Grid Inverter', 'Enviro GTI 10kW', '10 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),

    -- Solis
    (cid, b_solis, c_inverters, 'Solis On-Grid Inverter', 'S5-GR1P3K', '3 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_solis, c_inverters, 'Solis On-Grid Inverter', 'S5-GR1P5K', '5 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_solis, c_inverters, 'Solis On-Grid Inverter', 'S5-GR1P6K', '6 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_solis, c_inverters, 'Solis On-Grid Inverter', 'S5-GR3P8K', '8 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true),
    (cid, b_solis, c_inverters, 'Solis On-Grid Inverter', 'S5-GR3P10K', '10 kW', 'pcs', 18::numeric, 0::numeric, 'solar', true)
  ) AS v(company_id, brand_id, category_id, item_name, model, capacity_label, unit, gst_percent, base_rate, template_kind, is_active)
  WHERE NOT EXISTS (
    SELECT 1 FROM quote_items qi
    WHERE qi.company_id = v.company_id
      AND qi.item_name = v.item_name
      AND qi.model = v.model
  );

  RAISE NOTICE 'On-grid inverters seeded for company %', cid;
END $$;

-- Verify:
-- SELECT b.name AS brand, qi.item_name, qi.model, qi.capacity_label
-- FROM quote_items qi
-- LEFT JOIN quote_brands b ON b.id = qi.brand_id
-- WHERE qi.company_id = 'a0000000-0000-4000-8000-000000000001'
--   AND qi.is_active
--   AND (qi.item_name ILIKE '%inverter%' OR b.category = 'inverter')
-- ORDER BY b.name, qi.capacity_label;
