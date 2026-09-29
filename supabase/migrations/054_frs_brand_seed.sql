-- Florian — tenant name, slug, and quotation prefix (fresh or leftover Recare seed).
UPDATE companies
SET
  name = 'Florian',
  slug = 'florian-sales',
  email = 'admin@florian-sales.local'
WHERE id = 'a0000000-0000-4000-8000-000000000001';

UPDATE quotation_company_settings
SET
  quotation_prefix = 'FLR',
  from_name = 'Florian'
WHERE company_id = 'a0000000-0000-4000-8000-000000000001';
