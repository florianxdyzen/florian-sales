-- FRS Phase 2 — alphanumeric account codes (FLR29) unique per company.

CREATE TABLE IF NOT EXISTS company_account_code_seq (
  company_id UUID PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
  next_n INTEGER NOT NULL DEFAULT 1 CHECK (next_n >= 1)
);

ALTER TABLE company_account_code_seq ENABLE ROW LEVEL SECURITY;

ALTER TABLE leads ADD COLUMN IF NOT EXISTS account_code TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS leads_company_account_code_uidx
  ON leads (company_id, lower(account_code))
  WHERE account_code IS NOT NULL AND btrim(account_code) <> '';

CREATE INDEX IF NOT EXISTS idx_leads_account_code
  ON leads (company_id, account_code);

CREATE OR REPLACE FUNCTION next_frs_account_code(p_company_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n INTEGER;
BEGIN
  INSERT INTO company_account_code_seq (company_id, next_n)
  VALUES (p_company_id, 1)
  ON CONFLICT (company_id) DO NOTHING;

  UPDATE company_account_code_seq
  SET next_n = next_n + 1
  WHERE company_id = p_company_id
  RETURNING next_n - 1 INTO n;

  RETURN 'FLR' || n::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION leads_assign_account_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  raw TEXT;
  n INTEGER;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.account_code IS NOT DISTINCT FROM OLD.account_code THEN
    RETURN NEW;
  END IF;

  raw := NULLIF(btrim(NEW.account_code), '');
  IF raw IS NULL THEN
    NEW.account_code := next_frs_account_code(NEW.company_id);
    RETURN NEW;
  END IF;

  raw := upper(regexp_replace(raw, '\s+', '', 'g'));
  IF raw ~ '^\d+$' THEN
    raw := 'FLR' || raw;
  END IF;
  IF raw !~ '^FLR[0-9]+$' THEN
    RAISE EXCEPTION 'Account code must look like FLR29';
  END IF;
  NEW.account_code := raw;

  n := substring(raw FROM 4)::INTEGER;
  INSERT INTO company_account_code_seq (company_id, next_n)
  VALUES (NEW.company_id, n + 1)
  ON CONFLICT (company_id) DO UPDATE
    SET next_n = GREATEST(company_account_code_seq.next_n, EXCLUDED.next_n);

  RETURN NEW;
END;
$$;

-- Backfill existing rows before the trigger is attached.
DO $$
DECLARE
  cid UUID;
  lid UUID;
  n INTEGER;
BEGIN
  FOR cid IN SELECT DISTINCT company_id FROM leads LOOP
    n := 0;
    FOR lid IN
      SELECT id FROM leads
      WHERE company_id = cid
        AND (account_code IS NULL OR btrim(account_code) = '')
      ORDER BY created_at, id
    LOOP
      n := n + 1;
      UPDATE leads SET account_code = 'FLR' || n::TEXT WHERE id = lid;
    END LOOP;

    SELECT COALESCE(MAX(substring(account_code FROM 4)::INTEGER), 0)
      INTO n
    FROM leads
    WHERE company_id = cid
      AND account_code ~ '^FLR[0-9]+$';

    INSERT INTO company_account_code_seq (company_id, next_n)
    VALUES (cid, n + 1)
    ON CONFLICT (company_id) DO UPDATE
      SET next_n = GREATEST(company_account_code_seq.next_n, EXCLUDED.next_n);
  END LOOP;
END $$;

DROP TRIGGER IF EXISTS tr_leads_account_code ON leads;
CREATE TRIGGER tr_leads_account_code
  BEFORE INSERT OR UPDATE OF account_code ON leads
  FOR EACH ROW
  EXECUTE FUNCTION leads_assign_account_code();

GRANT EXECUTE ON FUNCTION next_frs_account_code(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION leads_assign_account_code() TO authenticated, service_role;
