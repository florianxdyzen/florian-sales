-- Recare — digital survey grant, View All Leads defaults, lead RLS alignment.
-- Apply after 052_daily_report_alerts.sql.

UPDATE authorities
SET label = 'Complete digital survey'
WHERE key = 'conduct_survey';

INSERT INTO role_authorities (role_id, authority_key, granted)
SELECT r.id, 'conduct_survey', true
FROM roles r
WHERE r.slug IN ('sales_executive', 'surveyor', 'sales_manager', 'admin')
ON CONFLICT (role_id, authority_key) DO UPDATE SET granted = true;

-- Keep View All Leads as a Team checkbox; default on only for Owner / Sales Manager.
DELETE FROM role_authorities ra
USING roles r
WHERE ra.role_id = r.id
  AND ra.authority_key = 'view_all_leads'
  AND r.slug NOT IN ('admin', 'sales_manager');

-- Extra user_authorities grants are left in place (Owner may have given one person).

DROP POLICY IF EXISTS leads_select ON leads;
CREATE POLICY leads_select ON leads FOR SELECT
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      assigned_to = auth.uid()
      OR assigned_telecaller_id = auth.uid()
      OR assigned_surveyor_id = auth.uid()
      OR assigned_crew_id = auth.uid()
      OR created_by = auth.uid()
      OR dealer_id = auth.uid()
      OR has_authority('view_all_leads')
      OR has_authority('full_access')
    )
  );

DROP POLICY IF EXISTS leads_update ON leads;
CREATE POLICY leads_update ON leads FOR UPDATE
  USING (
    company_id = auth_company_id()
    AND is_active_user()
    AND (
      assigned_to = auth.uid()
      OR assigned_telecaller_id = auth.uid()
      OR assigned_surveyor_id = auth.uid()
      OR assigned_crew_id = auth.uid()
      OR created_by = auth.uid()
      OR dealer_id = auth.uid()
      OR has_authority('view_all_leads')
      OR has_authority('reassign_leads')
      OR has_authority('full_access')
    )
  );
