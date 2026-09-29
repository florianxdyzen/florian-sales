# Florian Sales — Client deliverable

Working source is `Apps/Florian-Sales`. Refresh this package with `sync-from-app.ps1` / `sync-from-app.sh`.

## Included

- Next.js app (`src`, `public`, config)
- Florian logo and theme (`public/brand/logo.jpeg`)
- Supabase migrations and `supabase/run_all_migrations.sql`
- `.env.example`

## Excluded

- `node_modules`, `.next`
- `.env.local` and other secrets
- Maintainer sync scripts

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and add this tenant’s Supabase keys
3. On a **new** Supabase project, run `supabase/run_all_migrations.sql` once
4. Create the first Admin in Supabase Auth
5. `npm run dev`

Account codes and quotation numbers use prefix `FLR`. Do not share a database with Florian inventory or FRS Solar.
