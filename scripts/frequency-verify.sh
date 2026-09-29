#!/usr/bin/env bash
set -eu
sudo docker exec -i supabase-db psql -U postgres -d postgres <<SQL
SET search_path TO florian_sales, public;
SELECT id, name, slug FROM companies;
SELECT id, name, slug FROM roles ORDER BY slug;
SELECT count(*) AS lead_cols FROM information_schema.columns WHERE table_schema='florian_sales' AND table_name='leads';
SELECT count(*) AS tables FROM information_schema.tables WHERE table_schema='florian_sales';
SQL
