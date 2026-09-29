#!/usr/bin/env bash
set -eu
cd /home/admino/docker/supabase-project
sudo docker compose up -d auth
sleep 4
sudo docker ps --filter name=supabase-auth --format '{{.Names}} {{.Status}}'
sudo docker logs --tail 30 supabase-auth || true
