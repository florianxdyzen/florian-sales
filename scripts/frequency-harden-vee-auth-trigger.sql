-- Shared Auth: VEE trigger must not abort sign-up for other Frequency CRMs.
CREATE OR REPLACE FUNCTION vee_secure.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO vee_secure
AS $function$
DECLARE
  default_company_id UUID := 'a0000000-0000-4000-8000-000000000001';
  resolved_company_id UUID;
  resolved_role user_role;
  resolved_role_id UUID;
  tenant TEXT;
BEGIN
  tenant := COALESCE(NEW.raw_user_meta_data->>'tenant', NEW.raw_user_meta_data->>'schema', '');
  IF tenant <> '' AND tenant <> 'vee_secure' THEN
    RETURN NEW;
  END IF;

  resolved_company_id := COALESCE(
    NULLIF(NEW.raw_user_meta_data->>'company_id', '')::UUID,
    (SELECT id FROM companies ORDER BY created_at LIMIT 1),
    default_company_id
  );
  BEGIN
    resolved_role := COALESCE(NULLIF(NEW.raw_user_meta_data->>'role', '')::user_role, 'employee'::user_role);
  EXCEPTION WHEN invalid_text_representation THEN
    resolved_role := 'employee'::user_role;
  END;
  resolved_role_id := NULLIF(NEW.raw_user_meta_data->>'role_id', '')::UUID;

  INSERT INTO vee_secure.profiles (id, company_id, name, email, phone, role, role_id)
  VALUES (
    NEW.id, resolved_company_id,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'name', ''), NEW.email, 'User'),
    NEW.email,
    COALESCE(NULLIF(NEW.raw_user_meta_data->>'phone', ''), '0000000000'),
    resolved_role,
    resolved_role_id
  ) ON CONFLICT (id) DO UPDATE SET
    role_id = COALESCE(EXCLUDED.role_id, profiles.role_id);

  IF resolved_role_id IS NOT NULL THEN
    INSERT INTO user_authorities (user_id, authority_key, granted)
    SELECT NEW.id, ra.authority_key, ra.granted
    FROM role_authorities ra WHERE ra.role_id = resolved_role_id AND ra.granted = true
    ON CONFLICT (user_id, authority_key) DO NOTHING;
  ELSIF resolved_role = 'owner' THEN
    INSERT INTO user_authorities (user_id, authority_key, granted)
    SELECT NEW.id, key, true FROM authorities
    ON CONFLICT (user_id, authority_key) DO NOTHING;
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'vee_secure.handle_new_user skipped: %', SQLERRM;
  RETURN NEW;
END;
$function$;
