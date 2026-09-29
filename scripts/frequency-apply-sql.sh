#!/usr/bin/env bash
set -eu
sed -i 's/\r$//' /tmp/florian_sales_apply.sql
sudo docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < /tmp/florian_sales_apply.sql
echo APPLY_OK
