#!/usr/bin/env bash
set -eu
MODE="${1:-enable}"
if [ "$MODE" = "disable" ]; then
  sudo docker exec -i supabase-db psql -U postgres -d postgres -c \
    "ALTER TABLE auth.users DISABLE TRIGGER on_auth_user_created_vee_secure;"
else
  sudo docker exec -i supabase-db psql -U postgres -d postgres -c \
    "ALTER TABLE auth.users ENABLE TRIGGER on_auth_user_created_vee_secure;"
fi
