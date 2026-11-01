-- RK Solar — Non-solar product catalogue (Phase 4)
-- Heat pumps, solar water heaters, commercial RO — unit pricing, no PV BOM.

DO $$
DECLARE
  cid UUID := 'a0000000-0000-4000-8000-000000000001';
  c_heat UUID;
  c_swh UUID;
  c_ro UUID;
  b_generic UUID;
BEGIN
  INSERT INTO quote_item_categories (company_id, name, kind, sort_order)
  VALUES
    (cid, 'Heat Pumps', 'non_solar', 60),
    (cid, 'Solar Water Heaters', 'non_solar', 61),
    (cid, 'Commercial RO', 'non_solar', 62)
  ON CONFLICT (company_id, name) DO UPDATE SET kind = EXCLUDED.kind, sort_order = EXCLUDED.sort_order;

  SELECT id INTO c_heat FROM quote_item_categories
  WHERE company_id = cid AND name IN ('Heat Pumps', 'Appliances — Heat Pumps')
  ORDER BY CASE WHEN name = 'Heat Pumps' THEN 0 ELSE 1 END
  LIMIT 1;

  SELECT id INTO c_swh FROM quote_item_categories
  WHERE company_id = cid AND name IN ('Solar Water Heaters', 'Appliances — Solar Water Heaters')
  ORDER BY CASE WHEN name = 'Solar Water Heaters' THEN 0 ELSE 1 END
  LIMIT 1;

  SELECT id INTO c_ro FROM quote_item_categories
  WHERE company_id = cid AND name IN ('Commercial RO', 'Appliances — Commercial RO')
  ORDER BY CASE WHEN name = 'Commercial RO' THEN 0 ELSE 1 END
  LIMIT 1;

  INSERT INTO quote_brands (company_id, name, category) VALUES
    (cid, 'Racold / OEM', 'non_solar'),
    (cid, 'V-Guard / OEM', 'non_solar'),
    (cid, 'Kent / OEM', 'non_solar')
  ON CONFLICT (company_id, name) DO NOTHING;

  SELECT id INTO b_generic FROM quote_brands WHERE company_id = cid AND name = 'Racold / OEM';

  DELETE FROM quote_items
  WHERE company_id = cid AND model LIKE 'APPLIANCE-%';

  INSERT INTO quote_items (
    company_id, brand_id, category_id, item_name, model, capacity_label, unit,
    gst_percent, base_rate, template_kind, warranty_text, is_active
  ) VALUES
    (
      cid, b_generic, c_heat,
      'Heat Pump Water Heater 200 L',
      'APPLIANCE-01', '200 L', 'nos', 18, 85000, 'non_solar',
      'Installation & commissioning included. Warranty as per OEM.', true
    ),
    (
      cid, b_generic, c_heat,
      'Heat Pump Water Heater 300 L',
      'APPLIANCE-02', '300 L', 'nos', 18, 115000, 'non_solar',
      'Installation & commissioning included. Warranty as per OEM.', true
    ),
    (
      cid, b_generic, c_swh,
      'Solar Water Heater ETC 200 L',
      'APPLIANCE-03', '200 L ETC', 'nos', 18, 42000, 'non_solar',
      'Includes tank, stand & basic plumbing. Warranty as per OEM.', true
    ),
    (
      cid, b_generic, c_swh,
      'Solar Water Heater FPC 300 L',
      'APPLIANCE-04', '300 L FPC', 'nos', 18, 58000, 'non_solar',
      'Flat plate collector system. Warranty as per OEM.', true
    ),
    (
      cid, b_generic, c_ro,
      'Commercial RO Plant 50 LPH',
      'APPLIANCE-05', '50 LPH', 'nos', 18, 95000, 'non_solar',
      'Skid mounted RO with pre-treatment. AMC optional.', true
    ),
    (
      cid, b_generic, c_ro,
      'Commercial RO Plant 100 LPH',
      'APPLIANCE-06', '100 LPH', 'nos', 18, 165000, 'non_solar',
      'Skid mounted RO with pre-treatment. AMC optional.', true
    );
END $$;
