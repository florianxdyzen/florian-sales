# Florian Sales

Sales pipeline, quotations, and B2B trade for Florian. Forked from FRS Solar. Plan: `docs/florian-sales-plan.md`.

Inventory stays in `Apps/Florian`. This app does not share that database.

**Brand:** cyan `#1BA8E0` / navy `#163A5C` / soft `#E4F5FC`. Logo: `public/brand/logo.png`. Account and quote prefix `FLR`.

## Setup

```bash
cd "Apps/Florian-Sales"
npm install
cp .env.example .env.local
```

Fill `.env.local` with a **new** Supabase project. Apply `supabase/migrations` in order, or `supabase/run_all_migrations.sql` on an empty project.

Consumer portal, subsidy, installation, and 3-stage payments stay blocked.

Client package: `Deliverables/florian-sales` via `sync-from-app.ps1`.
