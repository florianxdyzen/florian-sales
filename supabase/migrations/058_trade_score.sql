-- FRS Phase 5 — denormalized last trade dates + 30-day outward qty for list pins.

ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_outward_on DATE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_inward_on DATE;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS outward_qty_30d NUMERIC(14, 3) NOT NULL DEFAULT 0;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS trade_inactive_alerted_on DATE;

CREATE INDEX IF NOT EXISTS idx_leads_trade_score
  ON leads (company_id, last_outward_on, outward_qty_30d)
  WHERE sales_stage <> 'lost';

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
    outward_qty_30d = COALESCE(s.outward_qty_30d, 0)
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
      ) AS outward_qty_30d
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
    outward_qty_30d = 0
  WHERE id = p_lead_id
    AND NOT EXISTS (SELECT 1 FROM trade_entries e WHERE e.lead_id = p_lead_id);
END;
$$;

CREATE OR REPLACE FUNCTION trg_refresh_lead_trade_score()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM refresh_lead_trade_score(OLD.lead_id);
    RETURN OLD;
  END IF;
  PERFORM refresh_lead_trade_score(NEW.lead_id);
  IF TG_OP = 'UPDATE' AND NEW.lead_id IS DISTINCT FROM OLD.lead_id THEN
    PERFORM refresh_lead_trade_score(OLD.lead_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tr_trade_entries_score ON trade_entries;
CREATE TRIGGER tr_trade_entries_score
  AFTER INSERT OR UPDATE OR DELETE ON trade_entries
  FOR EACH ROW
  EXECUTE FUNCTION trg_refresh_lead_trade_score();

DO $$
DECLARE
  lid UUID;
BEGIN
  FOR lid IN SELECT DISTINCT lead_id FROM trade_entries LOOP
    PERFORM refresh_lead_trade_score(lid);
  END LOOP;
END $$;

GRANT EXECUTE ON FUNCTION refresh_lead_trade_score(UUID) TO service_role;
