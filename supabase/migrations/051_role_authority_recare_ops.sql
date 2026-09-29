-- Recare Phase E — Owner-only delete, liaison feasibility, Team group labels.

UPDATE authorities SET authority_group = 'accounts'
WHERE key IN (
  'record_payment',
  'verify_payment',
  'view_payment_queues',
  'verify_subsidy',
  'submit_dealer_commission',
  'approve_dealer_commission'
);

UPDATE authorities SET authority_group = 'documentation'
WHERE key IN (
  'upload_feasibility_report',
  'approve_feasibility_report',
  'manage_liaison',
  'mark_meter_installed',
  'mark_subsidy_received',
  'manage_portal_documents',
  'view_customer_portal_admin'
);

UPDATE authorities SET authority_group = 'installation'
WHERE key IN (
  'assign_installation_crew',
  'upload_installation_proofs',
  'upload_panel_barcodes',
  'complete_installation',
  'view_installation_queue'
);

UPDATE authorities
SET label = 'Delete Leads (Owner)'
WHERE key = 'delete_leads';

-- delete_leads: keep only admin roles
DELETE FROM role_authorities ra
USING roles r
WHERE ra.role_id = r.id
  AND ra.authority_key = 'delete_leads'
  AND r.slug <> 'admin';

DELETE FROM user_authorities ua
USING profiles p
WHERE ua.user_id = p.id
  AND ua.authority_key = 'delete_leads'
  AND p.role <> 'admin';

INSERT INTO role_authorities (role_id, authority_key, granted)
SELECT r.id, 'delete_leads', true
FROM roles r
WHERE r.slug = 'admin'
ON CONFLICT DO NOTHING;

-- liaison may upload feasibility (idempotent; also in 048)
INSERT INTO role_authorities (role_id, authority_key, granted)
SELECT r.id, 'upload_feasibility_report', true
FROM roles r
WHERE r.slug IN ('liaison', 'feasibility', 'admin', 'sales_manager')
ON CONFLICT DO NOTHING;

-- approve_feasibility unused on happy path — revoke from non-admin
DELETE FROM role_authorities ra
USING roles r
WHERE ra.role_id = r.id
  AND ra.authority_key = 'approve_feasibility_report'
  AND r.slug <> 'admin';

-- install assign: not sales_manager by default
DELETE FROM role_authorities ra
USING roles r
WHERE ra.role_id = r.id
  AND ra.authority_key = 'assign_installation_crew'
  AND r.slug = 'sales_manager';

INSERT INTO role_authorities (role_id, authority_key, granted)
SELECT r.id, 'assign_installation_crew', true
FROM roles r
WHERE r.slug IN ('admin', 'ops_coordinator')
ON CONFLICT DO NOTHING;
