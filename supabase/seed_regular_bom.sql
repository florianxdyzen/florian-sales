-- Recare — Regular residential BOM catalog (from LIST OF MATERIALS REGULAR PDF)
-- Re-runnable. Shares images with premium BOM where components match.
-- General quotations (template_kind = non_solar) use these line items.

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
  b_waaree UUID;
  b_pahal UUID;
  b_vsole UUID;
  b_polycab UUID;
  b_kei UUID;
  b_ijmax UUID;
  b_itek UUID;
  b_schutz UUID;
  b_isi UUID;
BEGIN
  INSERT INTO quote_item_categories (company_id, name, kind, sort_order)
  VALUES
    (cid, 'Regular — PV Modules', 'non_solar', 10),
    (cid, 'Regular — On-Grid Inverters', 'non_solar', 20),
    (cid, 'Regular — Mounting Structure', 'non_solar', 25),
    (cid, 'Regular — BOS Hardware', 'non_solar', 35),
    (cid, 'Regular — Cabling', 'non_solar', 40),
    (cid, 'Regular — Protection & Earthing', 'non_solar', 45)
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
    (cid, 'VSOLE', 'inverter'),
    (cid, 'Polycab', 'cable'),
    (cid, 'KEI', 'cable'),
    (cid, 'IJMAX', 'protection'),
    (cid, 'ITEK', 'protection'),
    (cid, 'SCHUTZ', 'protection'),
    (cid, 'ISI / Standard', 'other')
  ON CONFLICT (company_id, name) DO NOTHING;

  SELECT id INTO b_adani FROM quote_brands WHERE company_id = cid AND name = 'Adani';
  SELECT id INTO b_waaree FROM quote_brands WHERE company_id = cid AND name = 'Waaree';
  SELECT id INTO b_pahal FROM quote_brands WHERE company_id = cid AND name = 'Pahal';
  SELECT id INTO b_vsole FROM quote_brands WHERE company_id = cid AND name = 'VSOLE';
  SELECT id INTO b_polycab FROM quote_brands WHERE company_id = cid AND name = 'Polycab';
  SELECT id INTO b_kei FROM quote_brands WHERE company_id = cid AND name = 'KEI';
  SELECT id INTO b_ijmax FROM quote_brands WHERE company_id = cid AND name = 'IJMAX';
  SELECT id INTO b_itek FROM quote_brands WHERE company_id = cid AND name = 'ITEK';
  SELECT id INTO b_schutz FROM quote_brands WHERE company_id = cid AND name = 'SCHUTZ';
  SELECT id INTO b_isi FROM quote_brands WHERE company_id = cid AND name = 'ISI / Standard';

  DELETE FROM quote_items
  WHERE company_id = cid AND model LIKE 'REGULAR-BOM-%';

  UPDATE quote_items
  SET is_active = false
  WHERE company_id = cid
    AND template_kind = 'non_solar'
    AND model NOT LIKE 'REGULAR-BOM-%';

  INSERT INTO quote_items (
    company_id, brand_id, category_id, item_name, model, capacity_label, unit,
    gst_percent, base_rate, template_kind, warranty_text, image_url, is_active
  ) VALUES
    (
      cid, b_adani, c_modules,
      'PV Solar Modules DCR (N-Type TOPCon Mono Bi-Facial)',
      'REGULAR-BOM-01', 'DCR', 'pcs', 12, 0, 'non_solar',
      'Performance warranty: 30 years. Make: Adani, Waaree, Pahal.',
      '/brand/bom-regular/01-pv-solar-modules-dcr.png', true
    ),
    (
      cid, b_vsole, c_inverters,
      'Grid-Tie Solar Inverter (IP65, >98% efficiency)',
      'REGULAR-BOM-02', 'Single/Three phase', 'pcs', 18, 0, 'non_solar',
      'Performance warranty: 10 years. Make: VSOLE, Waaree.',
      '/brand/bom-regular/02-grid-tie-solar-inverter.png', true
    ),
    (
      cid, b_isi, c_structure,
      'Module Mounting Structure (80 Micron HDGI)',
      'REGULAR-BOM-03', '60×40 / 40×40', 'lot', 18, 0, 'non_solar',
      'Leg & rafter 60mm×40mm, purlin 40mm×40mm. ISI marked.',
      '/brand/bom-regular/03-module-mounting-structure.png', true
    ),
    (
      cid, b_isi, c_bos,
      'Nut-Bolt M6 with Washer (SS 304)',
      'REGULAR-BOM-04', 'M6', 'pcs', 18, 0, 'non_solar',
      'SS Grade-304, ISI marked.',
      '/brand/bom-regular/04-nut-bolt.png', true
    ),
    (
      cid, b_isi, c_bos,
      'End & Mid Clamp (Aluminium Anodized)',
      'REGULAR-BOM-05', '35×50mm', 'pcs', 18, 0, 'non_solar',
      'Corrosion free, ISI marked.',
      '/brand/bom-regular/05-end-mid-clamp.png', true
    ),
    (
      cid, b_isi, c_protection,
      'Maintenance Free Chemical Earthing System',
      'REGULAR-BOM-06', '14mm × 1m', 'set', 18, 0, 'non_solar',
      '250 micron copper bonded rod, 1m × 14mm. ISI marked.',
      '/brand/bom-regular/06-maintenance-free-chemical-earthing-system.png', true
    ),
    (
      cid, b_isi, c_protection,
      'Lightning Protection (Multi Spike)',
      'REGULAR-BOM-07', '14mm × 1m', 'set', 18, 0, 'non_solar',
      'Performance warranty: 25 years. As per government tender. ISI marked.',
      '/brand/bom-regular/07-lightning-protection.png', true
    ),
    (
      cid, b_polycab, c_cabling,
      'Solar DC Cables (2.5–4 Sq.mm)',
      'REGULAR-BOM-08', '2.5–4 Sq.mm', 'mtr', 18, 0, 'non_solar',
      'Performance warranty: 25 years. Make: Polycab, KEI.',
      '/brand/bom-regular/08-solar-dc-cables.png', true
    ),
    (
      cid, b_polycab, c_cabling,
      'AC Cables Copper (2.5–4 Sq.mm, UV & Fire Resistant)',
      'REGULAR-BOM-09', '2.5–4 Sq.mm', 'mtr', 18, 0, 'non_solar',
      'Performance warranty: 25 years. Make: Polycab, KEI.',
      '/brand/bom-regular/09-ac-cables.png', true
    ),
    (
      cid, b_isi, c_cabling,
      'Earthing Cables Aluminium (6 Sq.mm)',
      'REGULAR-BOM-10', '6 Sq.mm', 'mtr', 18, 0, 'non_solar',
      'ISI marked.',
      '/brand/bom-premium/14-earthing-cables.png', true
    ),
    (
      cid, b_isi, c_cabling,
      'Lightning Arrester Cable Aluminium (16 Sq.mm)',
      'REGULAR-BOM-11', '16 Sq.mm', 'mtr', 18, 0, 'non_solar',
      'ISI marked.',
      '/brand/bom-regular/11-lightning-arrester-cable.png', true
    ),
    (
      cid, b_ijmax, c_protection,
      'AC/DC Protection (MCB & SPD)',
      'REGULAR-BOM-12', 'DC/AC MCB, SPD', 'set', 18, 0, 'non_solar',
      'Performance warranty: 5 years. Make: IJMAX, ITEK, Schutz.',
      '/brand/bom-regular/12-ac-dc-protection.png', true
    ),
    (
      cid, b_isi, c_cabling,
      'Cable Conduit Pipe (25mm White)',
      'REGULAR-BOM-13', '25mm', 'mtr', 18, 0, 'non_solar',
      'Standard, MMS grade.',
      '/brand/bom-regular/13-cable-conduit-pipe.png', true
    );
END $$;

UPDATE quote_items
SET template_kind = 'non_solar', updated_at = NOW()
WHERE model LIKE 'REGULAR-BOM-%'
  AND template_kind <> 'non_solar';
