-- RK Solar — Allied products (water heater, heat pump, pump, street light)
-- Re-runnable. Requires migration 015_catalog_item_images.sql (image_url column).
-- Images: public/brand/catalog-extras/

DO $$
DECLARE
  cid UUID := 'a0000000-0000-4000-8000-000000000001';
  c_appliances UUID;
  c_pumps UUID;
  c_lighting UUID;
  b_rkre UUID;
BEGIN
  INSERT INTO quote_item_categories (company_id, name, kind, sort_order)
  VALUES
    (cid, 'Allied Products', 'non_solar', 40),
    (cid, 'Solar Pumps', 'solar', 55),
    (cid, 'Outdoor Lighting', 'solar', 60)
  ON CONFLICT (company_id, name) DO UPDATE
    SET kind = EXCLUDED.kind, sort_order = EXCLUDED.sort_order;

  SELECT id INTO c_appliances FROM quote_item_categories
  WHERE company_id = cid AND name IN ('Allied Products', 'Home Appliances')
  ORDER BY CASE WHEN name = 'Allied Products' THEN 0 ELSE 1 END
  LIMIT 1;
  SELECT id INTO c_pumps FROM quote_item_categories WHERE company_id = cid AND name = 'Solar Pumps';
  SELECT id INTO c_lighting FROM quote_item_categories WHERE company_id = cid AND name = 'Outdoor Lighting';

  INSERT INTO quote_brands (company_id, name, category) VALUES
    (cid, 'RKSO', 'allied')
  ON CONFLICT (company_id, name) DO NOTHING;

  SELECT id INTO b_rkre FROM quote_brands WHERE company_id = cid AND name = 'RKSO';

  DELETE FROM quote_items
  WHERE company_id = cid AND model LIKE 'RKSO-EXTRA-%';

  INSERT INTO quote_items (
    company_id, brand_id, category_id, item_name, model, capacity_label, unit,
    gst_percent, base_rate, template_kind, warranty_text, image_url, is_active
  ) VALUES
    (
      cid, b_rkre, c_appliances,
      'Solar Water Heater',
      'RKSO-EXTRA-01', NULL, 'pcs', 18, 0, 'both',
      'Efficient solar water heating systems that provide hot water using clean and renewable solar energy.',
      '/brand/catalog-extras/01-solar-water-heater.png', true
    ),
    (
      cid, b_rkre, c_appliances,
      'Heat Pump',
      'RKSO-EXTRA-02', NULL, 'pcs', 18, 0, 'both',
      'Advanced heat pump solutions for water heating with high efficiency, low energy consumption, and all-weather performance.',
      '/brand/catalog-extras/02-heat-pump.png', true
    ),
    (
      cid, b_rkre, c_pumps,
      'Solar Pump',
      'RKSO-EXTRA-03', NULL, 'pcs', 18, 0, 'solar',
      'Powerful and durable solar pumps for agriculture, homes, and industries with zero electricity cost.',
      '/brand/catalog-extras/03-solar-pump.png', true
    ),
    (
      cid, b_rkre, c_lighting,
      'Solar Street Light',
      'RKSO-EXTRA-04', NULL, 'pcs', 18, 0, 'solar',
      'Smart solar street lights for bright, safe, and sustainable outdoor lighting.',
      '/brand/catalog-extras/04-solar-street-light.png', true
    );
END $$;
