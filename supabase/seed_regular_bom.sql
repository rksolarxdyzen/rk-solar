-- RK Solar — Regular residential BOM (LIST OF MATERIALS REGULAR PDF)
-- Used by solar quotations with tier_type = regular (general / Regular package).
-- Re-runnable. Images: public/brand/bom-regular/

DO $$
DECLARE
  cid UUID := 'a0000000-0000-4000-8000-000000000001';
  c_modules UUID;
  c_inverters UUID;
  c_structure UUID;
  c_bos UUID;
  c_cabling UUID;
  c_protection UUID;
  b_adani UUID;
  b_aps UUID;
  b_polycab UUID;
  b_ijmax UUID;
  b_isi UUID;
BEGIN
  INSERT INTO quote_item_categories (company_id, name, kind, sort_order)
  VALUES
    (cid, 'Regular — PV Modules', 'solar', 10),
    (cid, 'Regular — On-Grid Inverters', 'solar', 20),
    (cid, 'Regular — Mounting Structure', 'solar', 25),
    (cid, 'Regular — BOS Hardware', 'solar', 35),
    (cid, 'Regular — Cabling', 'solar', 40),
    (cid, 'Regular — Protection & Earthing', 'solar', 45)
  ON CONFLICT (company_id, name) DO UPDATE SET kind = EXCLUDED.kind, sort_order = EXCLUDED.sort_order;

  SELECT id INTO c_modules FROM quote_item_categories WHERE company_id = cid AND name = 'Regular — PV Modules';
  SELECT id INTO c_inverters FROM quote_item_categories WHERE company_id = cid AND name = 'Regular — On-Grid Inverters';
  SELECT id INTO c_structure FROM quote_item_categories WHERE company_id = cid AND name = 'Regular — Mounting Structure';
  SELECT id INTO c_bos FROM quote_item_categories WHERE company_id = cid AND name = 'Regular — BOS Hardware';
  SELECT id INTO c_cabling FROM quote_item_categories WHERE company_id = cid AND name = 'Regular — Cabling';
  SELECT id INTO c_protection FROM quote_item_categories WHERE company_id = cid AND name = 'Regular — Protection & Earthing';

  INSERT INTO quote_brands (company_id, name, category) VALUES
    (cid, 'Adani', 'module'),
    (cid, 'Waaree', 'module'),
    (cid, 'Pahal', 'module'),
    (cid, 'APS', 'inverter'),
    (cid, 'XWATT', 'inverter'),
    (cid, 'Polycab', 'cable'),
    (cid, 'KEI', 'cable'),
    (cid, 'IJMAX', 'protection'),
    (cid, 'ITEK', 'protection'),
    (cid, 'SCHUTZ', 'protection'),
    (cid, 'ISI / Standard', 'other')
  ON CONFLICT (company_id, name) DO NOTHING;

  SELECT id INTO b_adani FROM quote_brands WHERE company_id = cid AND name = 'Adani';
  SELECT id INTO b_aps FROM quote_brands WHERE company_id = cid AND name = 'APS';
  SELECT id INTO b_polycab FROM quote_brands WHERE company_id = cid AND name = 'Polycab';
  SELECT id INTO b_ijmax FROM quote_brands WHERE company_id = cid AND name = 'IJMAX';
  SELECT id INTO b_isi FROM quote_brands WHERE company_id = cid AND name = 'ISI / Standard';

  DELETE FROM quote_items
  WHERE company_id = cid AND model LIKE 'REGULAR-BOM-%';

  INSERT INTO quote_items (
    company_id, brand_id, category_id, item_name, model, capacity_label, unit,
    gst_percent, base_rate, template_kind, warranty_text, image_url, is_active
  ) VALUES
    (
      cid, b_adani, c_modules,
      'PV Solar Modules DCR (N-Type TOPCon Mono Bi-Facial)',
      'REGULAR-BOM-01', 'DCR', 'pcs', 12, 0, 'solar',
      'Performance warranty: 30 years. Make: Adani, Waaree, Pahal.',
      '/brand/bom-regular/01-pv-solar-modules-dcr.png', true
    ),
    (
      cid, b_aps, c_inverters,
      'Grid-Tie Solar Inverter (IP65, >98% efficiency)',
      'REGULAR-BOM-02', 'Single/Three phase', 'pcs', 18, 0, 'solar',
      'Performance warranty: 10 years. Make: APS, XWATT.',
      '/brand/bom-regular/02-grid-tie-solar-inverter.png', true
    ),
    (
      cid, b_isi, c_structure,
      'Module Mounting Structure (80 Micron HDGI)',
      'REGULAR-BOM-03', '60×40 / 40×40', 'lot', 18, 0, 'solar',
      'Leg & rafter 60mm×40mm, purlin 40mm×40mm. Structure height 8×5. ISI marked.',
      '/brand/bom-regular/03-module-mounting-structure.png', true
    ),
    (
      cid, b_isi, c_bos,
      'Nut-Bolt M6 with Washer (SS 304)',
      'REGULAR-BOM-04', 'M6', 'pcs', 18, 0, 'solar',
      'SS Grade-304, ISI marked.',
      '/brand/bom-regular/04-nut-bolt.png', true
    ),
    (
      cid, b_isi, c_bos,
      'End & Mid Clamp (Aluminium Anodized)',
      'REGULAR-BOM-05', '35×50mm', 'pcs', 18, 0, 'solar',
      '35×50mm aluminium anodized, corrosion free, ISI marked.',
      '/brand/bom-regular/05-end-mid-clamp.png', true
    ),
    (
      cid, b_isi, c_protection,
      'Maintenance Free Chemical Earthing System',
      'REGULAR-BOM-06', '14mm × 1m', 'set', 18, 0, 'solar',
      '250 micron copper bonded rod, 1m × 14mm. As per government tender. ISI marked.',
      '/brand/bom-regular/06-maintenance-free-chemical-earthing-system.png', true
    ),
    (
      cid, b_isi, c_protection,
      'Lightning Protection (Multi Spike)',
      'REGULAR-BOM-07', '14mm × 1m', 'set', 18, 0, 'solar',
      'Performance warranty: 25 years. Multi spike as per government tender. ISI marked.',
      '/brand/bom-regular/07-lightning-protection.png', true
    ),
    (
      cid, b_polycab, c_cabling,
      'Solar DC Cables (2.5–4 Sq.mm)',
      'REGULAR-BOM-08', '2.5–4 Sq.mm', 'mtr', 18, 0, 'solar',
      'Performance warranty: 25 years. Make: Polycab, KEI.',
      '/brand/bom-regular/08-solar-dc-cables.png', true
    ),
    (
      cid, b_polycab, c_cabling,
      'AC Cables Copper (2.5–4 Sq.mm, UV & Fire Resistant)',
      'REGULAR-BOM-09', '2.5–4 Sq.mm', 'mtr', 18, 0, 'solar',
      'Performance warranty: 25 years. Make: Polycab, KEI.',
      '/brand/bom-regular/09-ac-cables.png', true
    ),
    (
      cid, b_isi, c_cabling,
      'Earthing Cables Aluminium (6 Sq.mm)',
      'REGULAR-BOM-10', '6 Sq.mm', 'mtr', 18, 0, 'solar',
      'ISI marked.',
      '/brand/bom-regular/10-earthing-cables.png', true
    ),
    (
      cid, b_isi, c_cabling,
      'Lightning Arrester Cable Aluminium (16 Sq.mm)',
      'REGULAR-BOM-11', '16 Sq.mm', 'mtr', 18, 0, 'solar',
      'ISI marked.',
      '/brand/bom-regular/11-lightning-arrester-cable.png', true
    ),
    (
      cid, b_ijmax, c_protection,
      'AC/DC Protection (MCB & SPD)',
      'REGULAR-BOM-12', 'DC/AC MCB, SPD', 'set', 18, 0, 'solar',
      'Performance warranty: 5 years. Make: IJMAX, ITEK, SCHUTZ.',
      '/brand/bom-regular/12-ac-dc-protection.png', true
    ),
    (
      cid, b_isi, c_cabling,
      'Cable Conduit Pipe (25mm White)',
      'REGULAR-BOM-13', '25mm', 'mtr', 18, 0, 'solar',
      '25mm white, standard MMS grade.',
      '/brand/bom-regular/13-cable-conduit-pipe.png', true
    );

  -- Migrate any leftover Regular BOM rows from older seeds (other companies / prior kinds)
  UPDATE quote_items
  SET template_kind = 'solar', updated_at = NOW()
  WHERE model LIKE 'REGULAR-BOM-%'
    AND template_kind <> 'solar';
END $$;
