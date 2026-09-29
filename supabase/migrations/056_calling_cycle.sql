-- FRS Phase 3 — circular calling cycle.
-- next_followup_at = next call; last_call_at = last outreach; temperature = Hot/Warm/Cold.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS cycle_bucket SMALLINT
  CHECK (cycle_bucket IS NULL OR cycle_bucket BETWEEN 1 AND 4);

CREATE INDEX IF NOT EXISTS idx_leads_calling_queue
  ON leads (company_id, temperature, next_followup_at)
  WHERE sales_stage <> 'lost';

CREATE INDEX IF NOT EXISTS idx_leads_last_call
  ON leads (company_id, last_call_at)
  WHERE sales_stage <> 'lost';

CREATE OR REPLACE FUNCTION recycle_frs_calling_cycle(p_company_id UUID DEFAULT NULL)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n INTEGER := 0;
BEGIN
  UPDATE leads
  SET
    next_followup_at = NOW(),
    next_followup_action = COALESCE(NULLIF(btrim(next_followup_action), ''), 'Calling cycle'),
    cycle_bucket = 1 + (ABS(HASHTEXT(id::TEXT)) % 4)
  WHERE sales_stage <> 'lost'
    AND temperature IN ('cold', 'warm')
    AND (p_company_id IS NULL OR company_id = p_company_id)
    AND COALESCE(last_call_at, created_at) <= NOW() - INTERVAL '30 days';

  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

GRANT EXECUTE ON FUNCTION recycle_frs_calling_cycle(UUID) TO service_role;
