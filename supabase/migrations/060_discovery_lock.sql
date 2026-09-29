-- FRS discovery lock (2026-09-25): account-code start, named items,
-- rupee + conversion rollups, optional vehicle/transporter.

ALTER TABLE trade_entries
  ADD COLUMN IF NOT EXISTS vehicle_no VARCHAR(80),
  ADD COLUMN IF NOT EXISTS transporter_name VARCHAR(160);

ALTER TABLE leads
  ADD COLUMN IF NOT EXISTS outward_conversions INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS outward_earnings_inr NUMERIC(14, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inward_purchases INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS inward_spend_inr NUMERIC(14, 2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_leads_trade_money
  ON leads (company_id, outward_conversions, outward_earnings_inr)
  WHERE sales_stage <> 'lost';

CREATE OR REPLACE FUNCTION next_frs_account_code(p_company_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n INTEGER;
  code TEXT;
BEGIN
  INSERT INTO company_account_code_seq (company_id, next_n)
  VALUES (p_company_id, 1)
  ON CONFLICT (company_id) DO NOTHING;

  LOOP
    UPDATE company_account_code_seq
    SET next_n = next_n + 1
    WHERE company_id = p_company_id
    RETURNING next_n - 1 INTO n;

    code := 'FLR' || n::TEXT;
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM leads
      WHERE company_id = p_company_id
        AND upper(btrim(account_code)) = code
    );
  END LOOP;

  RETURN code;
END;
$$;

CREATE OR REPLACE FUNCTION get_frs_account_code_seq()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid UUID := auth_company_id();
  n INTEGER;
BEGIN
  IF cid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  INSERT INTO company_account_code_seq (company_id, next_n)
  VALUES (cid, 1)
  ON CONFLICT (company_id) DO NOTHING;
  SELECT next_n INTO n FROM company_account_code_seq WHERE company_id = cid;
  RETURN COALESCE(n, 1);
END;
$$;

CREATE OR REPLACE FUNCTION set_frs_account_code_start(p_next INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cid UUID := auth_company_id();
  applied INTEGER;
BEGIN
  IF cid IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF p_next IS NULL OR p_next < 1 THEN
    RAISE EXCEPTION 'Start number must be at least 1';
  END IF;
  IF NOT (
    is_admin_user()
    OR has_authority('manage_settings')
    OR has_authority('full_access')
  ) THEN
    RAISE EXCEPTION 'Only Admin can change the account code start';
  END IF;

  INSERT INTO company_account_code_seq (company_id, next_n)
  VALUES (cid, p_next)
  ON CONFLICT (company_id) DO UPDATE
    SET next_n = EXCLUDED.next_n
  RETURNING next_n INTO applied;
  RETURN applied;
END;
$$;

CREATE OR REPLACE FUNCTION refresh_lead_trade_score(p_lead_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ist_today DATE := (timezone('Asia/Kolkata', now()))::date;
BEGIN
  UPDATE leads l
  SET
    last_outward_on = s.last_outward_on,
    last_inward_on = s.last_inward_on,
    outward_qty_30d = COALESCE(s.outward_qty_30d, 0),
    outward_conversions = COALESCE(s.outward_conversions, 0),
    outward_earnings_inr = COALESCE(s.outward_earnings_inr, 0),
    inward_purchases = COALESCE(s.inward_purchases, 0),
    inward_spend_inr = COALESCE(s.inward_spend_inr, 0)
  FROM (
    SELECT
      e.lead_id,
      MAX(e.occurred_on) FILTER (WHERE e.direction = 'outward') AS last_outward_on,
      MAX(e.occurred_on) FILTER (WHERE e.direction = 'inward') AS last_inward_on,
      COALESCE(
        SUM(e.qty) FILTER (
          WHERE e.direction = 'outward'
            AND e.occurred_on >= ist_today - 30
        ),
        0
      ) AS outward_qty_30d,
      COUNT(*) FILTER (WHERE e.direction = 'outward') AS outward_conversions,
      COALESCE(SUM(e.amount_inr) FILTER (WHERE e.direction = 'outward'), 0) AS outward_earnings_inr,
      COUNT(*) FILTER (WHERE e.direction = 'inward') AS inward_purchases,
      COALESCE(SUM(e.amount_inr) FILTER (WHERE e.direction = 'inward'), 0) AS inward_spend_inr
    FROM trade_entries e
    WHERE e.lead_id = p_lead_id
    GROUP BY e.lead_id
  ) s
  WHERE l.id = p_lead_id
    AND l.id = s.lead_id;

  UPDATE leads
  SET
    last_outward_on = NULL,
    last_inward_on = NULL,
    outward_qty_30d = 0,
    outward_conversions = 0,
    outward_earnings_inr = 0,
    inward_purchases = 0,
    inward_spend_inr = 0
  WHERE id = p_lead_id
    AND NOT EXISTS (SELECT 1 FROM trade_entries e WHERE e.lead_id = p_lead_id);
END;
$$;

GRANT EXECUTE ON FUNCTION next_frs_account_code(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION get_frs_account_code_seq() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION set_frs_account_code_start(INTEGER) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION refresh_lead_trade_score(UUID) TO service_role;

DO $$
DECLARE
  lid UUID;
BEGIN
  FOR lid IN SELECT DISTINCT lead_id FROM trade_entries LOOP
    PERFORM refresh_lead_trade_score(lid);
  END LOOP;
END $$;
