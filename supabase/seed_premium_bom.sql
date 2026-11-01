-- RK Solar — Premium residential BOM catalog (from LIST OF MATERIALS PDF)
-- Re-runnable. Requires migration 015_catalog_item_images.sql (image_url column).
-- Images live under public/brand/bom-premium/ (served as /brand/bom-premium/…).

DO $$
DECLARE
  cid UUID := 'a0000000-0000-4000-8000-000000000001';
  c_modules UUID;
  c_inverters UUID;
  c_structure UUID;
  c_bos UUID;
  c_cabling UUID;
  c_protection UUID;
  c_cleaning UUID;
  b_adani UUID;
  b_waaree UUID;
  b_vsole UUID;
  b_pahal UUID;
  b_polycab UUID;
  b_kei UUID;
  b_schneider UUID;
  b_havells UUID;
  b_isi UUID;
BEGIN
  -- Categories
  INSERT INTO quote_item_categories (company_id, name, kind, sort_order)
  VALUES
    (cid, 'Premium — PV Modules', 'premium', 10),
    (cid, 'Premium — On-Grid Inverters', 'premium', 20),
    (cid, 'Premium — Mounting Structure', 'premium', 25),
    (cid, 'Premium — BOS Hardware', 'premium', 35),
    (cid, 'Premium — Cabling', 'premium', 40),
    (cid, 'Premium — Protection & Earthing', 'premium', 45),
    (cid, 'Premium — Cleaning System', 'premium', 50)
  ON CONFLICT (company_id, name) DO UPDATE SET kind = EXCLUDED.kind, sort_order = EXCLUDED.sort_order;

  SELECT id INTO c_modules FROM quote_item_categories WHERE company_id = cid AND name = 'Premium — PV Modules';
  SELECT id INTO c_inverters FROM quote_item_categories WHERE company_id = cid AND name = 'Premium — On-Grid Inverters';
  SELECT id INTO c_structure FROM quote_item_categories WHERE company_id = cid AND name = 'Premium — Mounting Structure';
  SELECT id INTO c_bos FROM quote_item_categories WHERE company_id = cid AND name = 'Premium — BOS Hardware';
  SELECT id INTO c_cabling FROM quote_item_categories WHERE company_id = cid AND name = 'Premium — Cabling';
  SELECT id INTO c_protection FROM quote_item_categories WHERE company_id = cid AND name = 'Premium — Protection & Earthing';
  SELECT id INTO c_cleaning FROM quote_item_categories WHERE company_id = cid AND name = 'Premium — Cleaning System';

  -- Brands
  INSERT INTO quote_brands (company_id, name, category) VALUES
    (cid, 'Adani', 'module'),
    (cid, 'Waaree', 'module'),
    (cid, 'Pahal', 'module'),
    (cid, 'VSOLE', 'inverter'),
    (cid, 'Polycab', 'cable'),
    (cid, 'KEI', 'cable'),
    (cid, 'Schneider', 'protection'),
    (cid, 'Havells', 'protection'),
    (cid, 'ISI / Standard', 'other')
  ON CONFLICT (company_id, name) DO NOTHING;

  SELECT id INTO b_adani FROM quote_brands WHERE company_id = cid AND name = 'Adani';
  SELECT id INTO b_waaree FROM quote_brands WHERE company_id = cid AND name = 'Waaree';
  SELECT id INTO b_pahal FROM quote_brands WHERE company_id = cid AND name = 'Pahal';
  SELECT id INTO b_vsole FROM quote_brands WHERE company_id = cid AND name = 'VSOLE';
  SELECT id INTO b_polycab FROM quote_brands WHERE company_id = cid AND name = 'Polycab';
  SELECT id INTO b_kei FROM quote_brands WHERE company_id = cid AND name = 'KEI';
  SELECT id INTO b_schneider FROM quote_brands WHERE company_id = cid AND name = 'Schneider';
  SELECT id INTO b_havells FROM quote_brands WHERE company_id = cid AND name = 'Havells';
  SELECT id INTO b_isi FROM quote_brands WHERE company_id = cid AND name = 'ISI / Standard';

  -- Remove previous premium BOM seed rows (by model prefix)
  DELETE FROM quote_items
  WHERE company_id = cid AND model LIKE 'PREMIUM-BOM-%';

  INSERT INTO quote_items (
    company_id, brand_id, category_id, item_name, model, capacity_label, unit,
    gst_percent, base_rate, template_kind, warranty_text, image_url, is_active
  ) VALUES
    (
      cid, b_adani, c_modules,
      'PV Solar Modules DCR (N-Type TOPCon Mono Bi-Facial)',
      'PREMIUM-BOM-01', 'DCR', 'pcs', 12, 0, 'premium',
      'Performance warranty: 30 years. Make: Adani, Waaree, Pahal.',
      '/brand/bom-premium/01-pv-solar-modules-dcr.png', true
    ),
    (
      cid, b_vsole, c_inverters,
      'Grid-Tie Solar Inverter (IP65, >98% efficiency)',
      'PREMIUM-BOM-02', 'Single/Three phase', 'pcs', 18, 0, 'premium',
      'Performance warranty: 10 years. Make: VSOLE, Waaree.',
      '/brand/bom-premium/02-grid-tie-solar-inverter.png', true
    ),
    (
      cid, b_isi, c_structure,
      'Module Mounting Structure (80 Micron HDGI)',
      'PREMIUM-BOM-03', '80×40 / 60×40', 'lot', 18, 0, 'premium',
      'Leg & rafter 80mm×40mm, purlin 60mm×40mm. ISI marked.',
      '/brand/bom-premium/03-module-mounting-structure.png', true
    ),
    (
      cid, b_isi, c_bos,
      'Nut-Bolt M6 with Washer (SS 304)',
      'PREMIUM-BOM-04', 'M6', 'pcs', 18, 0, 'premium',
      'SS Grade-304, ISI marked.',
      '/brand/bom-premium/04-nut-bolt.png', true
    ),
    (
      cid, b_isi, c_bos,
      'Double Hole End & Mid Clamp (Aluminium Anodized)',
      'PREMIUM-BOM-05', '35×75mm', 'pcs', 18, 0, 'premium',
      'Corrosion free, ISI marked.',
      '/brand/bom-premium/05-double-hole-end-mid-clamp.png', true
    ),
    (
      cid, b_isi, c_bos,
      'U Hook (SS 304)',
      'PREMIUM-BOM-06', '60×40×60mm', 'pcs', 18, 0, 'premium',
      'Threads / 16 BSW. SS Grade-304.',
      '/brand/bom-premium/06-u-hook.png', true
    ),
    (
      cid, b_isi, c_bos,
      'Base Plate (HDG)',
      'PREMIUM-BOM-07', '125×125×4mm', 'pcs', 18, 0, 'premium',
      'HDG, ISI marked.',
      '/brand/bom-premium/07-base-plate.png', true
    ),
    (
      cid, b_isi, c_structure,
      'Standard Structure Foundation',
      'PREMIUM-BOM-08', NULL, 'lot', 18, 0, 'premium',
      'Steady structure suitable for high wind velocity; rust-free.',
      '/brand/bom-premium/08-standard-structure-foundation.png', true
    ),
    (
      cid, b_isi, c_protection,
      'Maintenance Free Chemical Earthing System',
      'PREMIUM-BOM-09', '14mm × 1m', 'set', 18, 0, 'premium',
      '250 micron copper bonded rod, 1m × 14mm. ISI marked.',
      '/brand/bom-premium/09-maintenance-free-chemical-earthing-system.png', true
    ),
    (
      cid, b_isi, c_protection,
      'Lightning Protection (Multi Spike)',
      'PREMIUM-BOM-10', '14mm × 1m', 'set', 18, 0, 'premium',
      'Performance warranty: 25 years. As per government tender. ISI marked.',
      '/brand/bom-premium/10-lightning-protection.png', true
    ),
    (
      cid, b_isi, c_protection,
      'Earthing Bucket (PVC)',
      'PREMIUM-BOM-11', NULL, 'pcs', 18, 0, 'premium',
      'Round with detachable green cover. Waterproof & weather resistant.',
      '/brand/bom-premium/11-earththing-bucket.png', true
    ),
    (
      cid, b_polycab, c_cabling,
      'Solar DC Cables (2.5–4 Sq.mm)',
      'PREMIUM-BOM-12', '2.5–4 Sq.mm', 'mtr', 18, 0, 'premium',
      'Performance warranty: 25 years. Make: Polycab, KEI.',
      '/brand/bom-premium/12-solar-dc-cables.png', true
    ),
    (
      cid, b_polycab, c_cabling,
      'AC Cables Copper (2.5–4 Sq.mm, UV & Fire Resistant)',
      'PREMIUM-BOM-13', '2.5–4 Sq.mm', 'mtr', 18, 0, 'premium',
      'Performance warranty: 25 years. Make: Polycab, KEI.',
      '/brand/bom-premium/13-ac-cables.png', true
    ),
    (
      cid, b_isi, c_cabling,
      'Earthing Cables Aluminium (6 Sq.mm)',
      'PREMIUM-BOM-14', '6 Sq.mm', 'mtr', 18, 0, 'premium',
      'ISI marked.',
      '/brand/bom-premium/14-earthing-cables.png', true
    ),
    (
      cid, b_isi, c_cabling,
      'Lightning Arrester Cable Aluminium (16 Sq.mm)',
      'PREMIUM-BOM-15', '16 Sq.mm', 'mtr', 18, 0, 'premium',
      'ISI marked.',
      '/brand/bom-premium/15-lightning-arrester-cable.png', true
    ),
    (
      cid, b_schneider, c_protection,
      'AC/DC Protection (MCB & SPD)',
      'PREMIUM-BOM-16', 'DC/AC MCB, SPD', 'set', 18, 0, 'premium',
      'Performance warranty: 5 years. Make: Schneider, Havells, Finder.',
      '/brand/bom-premium/16-ac-dc-protection.png', true
    ),
    (
      cid, b_isi, c_cabling,
      'Cable Conduit Pipe (25mm White)',
      'PREMIUM-BOM-17', '25mm', 'mtr', 18, 0, 'premium',
      'Standard, MMS grade.',
      '/brand/bom-premium/17-cable-conduit-pipe.png', true
    ),
    (
      cid, b_isi, c_bos,
      'Cable Tie (Nylon 6/6 UV Stabilized)',
      'PREMIUM-BOM-18', '300×4.8mm', 'pcs', 18, 0, 'premium',
      'ISI & long-lasting. Operating temp -185°F to 85°F.',
      '/brand/bom-premium/18-cable-tie.png', true
    ),
    (
      cid, b_isi, c_cleaning,
      'Auto Cleaning System (Panel 35mm & 40mm)',
      'PREMIUM-BOM-19', '1 MTR spread', 'set', 18, 0, 'premium',
      '½" UPVC pipe fits directly. Fastest installation.',
      '/brand/bom-premium/19-auto-cleaning-system.png', true
    );
END $$;

-- Ensure legacy premium BOM rows are tagged for the premium quotation template.
UPDATE quote_items
SET template_kind = 'premium', updated_at = NOW()
WHERE model LIKE 'PREMIUM-BOM-%'
  AND template_kind <> 'premium';
