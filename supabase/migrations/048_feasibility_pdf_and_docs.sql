-- Recare Phase B — feasibility PDF path + Documentation (liaison) may upload from Won.

ALTER TABLE feasibility_reports
  ADD COLUMN IF NOT EXISTS storage_path TEXT;

COMMENT ON COLUMN public.feasibility_reports.storage_path IS
  'Object key in the proofs bucket for the uploaded grid feasibility PDF.';

INSERT INTO role_authorities (role_id, authority_key, granted)
SELECT r.id, 'upload_feasibility_report', true
FROM roles r
WHERE r.slug IN ('liaison', 'feasibility', 'admin', 'sales_manager')
ON CONFLICT DO NOTHING;

UPDATE roles
SET description = 'Discom liaison, customer documents, and pre-install feasibility PDF'
WHERE slug = 'liaison';
