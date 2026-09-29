#!/usr/bin/env bash
set -eu
sed -i 's/\r$//' /tmp/frequency-harden-vee-auth-trigger.sql
sudo docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 < /tmp/frequency-harden-vee-auth-trigger.sql
echo HARDEN_OK
