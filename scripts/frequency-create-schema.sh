#!/usr/bin/env bash
# Create a Postgres schema on Frequency Supabase + expose it on PostgREST.
set -euo pipefail
SCHEMA="${1:-florian_sales}"
LABEL="${2:-Florian}"
COMPOSE="/home/admino/docker/supabase-project"
ENVF="$COMPOSE/.env"

if ! [[ "$SCHEMA" =~ ^[a-z][a-z0-9_]{0,62}$ ]]; then
  echo "Invalid schema id: $SCHEMA" >&2
  exit 1
fi

sudo docker exec -i supabase-db psql -U postgres -d postgres <<SQL
CREATE SCHEMA IF NOT EXISTS ${SCHEMA};
COMMENT ON SCHEMA ${SCHEMA} IS '${LABEL}';

GRANT USAGE ON SCHEMA ${SCHEMA} TO postgres, anon, authenticated, service_role, authenticator;
GRANT CREATE ON SCHEMA ${SCHEMA} TO postgres, service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA ${SCHEMA}
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA ${SCHEMA}
  GRANT USAGE, SELECT ON SEQUENCES TO anon, authenticated, service_role;

CREATE TABLE IF NOT EXISTS ${SCHEMA}.ping (
  id bigserial PRIMARY KEY,
  note text DEFAULT 'ok',
  created_at timestamptz DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ${SCHEMA}.ping TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON SEQUENCE ${SCHEMA}.ping_id_seq TO anon, authenticated, service_role;
ALTER TABLE ${SCHEMA}.ping ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS anon_read_ping ON ${SCHEMA}.ping;
CREATE POLICY anon_read_ping ON ${SCHEMA}.ping FOR SELECT TO anon USING (true);
DROP POLICY IF EXISTS service_all_ping ON ${SCHEMA}.ping;
CREATE POLICY service_all_ping ON ${SCHEMA}.ping FOR ALL TO service_role USING (true) WITH CHECK (true);
INSERT INTO ${SCHEMA}.ping (note) SELECT 'ready'
WHERE NOT EXISTS (SELECT 1 FROM ${SCHEMA}.ping LIMIT 1);
SQL

cd "$COMPOSE"
CURRENT=$(grep -E '^PGRST_DB_SCHEMAS=' "$ENVF" | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
if echo ",$CURRENT," | grep -q ",${SCHEMA},"; then
  echo "PGRST_DB_SCHEMAS already includes ${SCHEMA}"
  RECREATE=0
else
  sudo cp -a "$ENVF" "${ENVF}.bak.frs.$(date +%Y%m%d%H%M%S)"
  NEW="${CURRENT},${SCHEMA}"
  sudo sed -i "s/^PGRST_DB_SCHEMAS=.*/PGRST_DB_SCHEMAS=${NEW}/" "$ENVF"
  echo "Appended ${SCHEMA} to PGRST_DB_SCHEMAS"
  RECREATE=1
fi

if [ "$RECREATE" = "1" ]; then
  sudo docker compose up -d --force-recreate --no-deps rest
  sleep 3
fi

sudo docker exec -i supabase-db psql -U postgres -d postgres -c "NOTIFY pgrst, 'reload schema';"

ANON=$(grep -E '^ANON_KEY=' "$ENVF" | head -1 | cut -d= -f2-)
SERVICE=$(grep -E '^SERVICE_ROLE_KEY=' "$ENVF" | head -1 | cut -d= -f2-)
URL=$(grep -E '^API_EXTERNAL_URL=' "$ENVF" | head -1 | cut -d= -f2-)
if [ -z "$URL" ]; then
  URL=$(grep -E '^SUPABASE_PUBLIC_URL=' "$ENVF" | head -1 | cut -d= -f2-)
fi
if [ -z "$URL" ]; then
  URL="http://192.168.1.69:8000"
fi

echo "URL=${URL}"
echo "ANON_KEY=${ANON}"
echo "SERVICE_ROLE_KEY=${SERVICE}"
echo "SCHEMA=${SCHEMA}"

CODE=$(curl -sS -o /tmp/frs-ping.json -w '%{http_code}' \
  -H "apikey: ${ANON}" \
  -H "Authorization: Bearer ${ANON}" \
  -H "Accept-Profile: ${SCHEMA}" \
  "${URL}/rest/v1/ping?select=*")
echo "PING_HTTP=${CODE}"
cat /tmp/frs-ping.json; echo
if [ "$CODE" != "200" ]; then
  echo "Ping failed" >&2
  exit 2
fi
