#!/usr/bin/env bash
set -eu
sudo docker exec -i supabase-db psql -U postgres -d postgres <<'SQL'
SELECT tgname, pg_get_triggerdef(oid) FROM pg_trigger WHERE tgname ILIKE '%user%' OR tgname ILIKE '%auth%';
SELECT n.nspname, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE p.proname = 'handle_new_user';
SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE p.proname = 'handle_new_user';
SQL
