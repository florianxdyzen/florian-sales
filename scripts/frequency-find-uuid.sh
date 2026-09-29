#!/usr/bin/env bash
set -euo pipefail
sudo docker exec -i supabase-db psql -U postgres -d postgres -c "SELECT n.nspname, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE p.proname='uuid_generate_v4';"
