#!/usr/bin/env bash
set -eu
sed -i 's/\r$//' /tmp/frs_060.sql
sudo docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < /tmp/frs_060.sql
echo APPLY_060_OK
