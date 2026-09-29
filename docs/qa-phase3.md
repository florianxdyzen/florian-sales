## QA report — Florian-Sales — Phase 3 check

- Result: **BLOCKED** for signed-in cases. Offline acceptance **PASSED** (no failures).
- Env: no `Apps/Florian-Sales/.env.local`. No URL host or schema.
- Auth: not run. Harness deletes `SUPABASE_SERVICE_ROLE_KEY` before any request. No staff login was available.
- Cases: 9 passed / 0 failed / 4 blocked / 0 skipped (phase 3 script), plus earlier offline suites below.

| # | Case | Expected | Actual | Verdict |
|---|------|----------|--------|---------|
| 1 | PWA name and theme | Florian, `#1BA8E0` | Florian `#1BA8E0` | PASS |
| 2 | Button and accent tokens | Cyan `#1BA8E0`, navy `#163A5C` | present in `globals.css` | PASS |
| 3 | Logo | `logo.jpeg` present, FRS `logo.png` absent | jpeg only | PASS |
| 4 | Prefix | Account and quotation default `FLR` | `FLR` | PASS |
| 5 | Consumer routes | Install, liaison, payments, portal, ingest blocked | listed and redirected in `proxy.ts` | PASS |
| 6 | `view_profit` | Admin and Accounts only | accounts block + `061`; tele-caller block has no key | PASS |
| 7 | Profit page | `/profit` exists and nav requires `view_profit` | present | PASS |
| 8 | Leftover brand copy | No “FRS Solar” or “Miracle” in `src` | clean | PASS |
| 9 | Inventory app | `Apps/Florian` package name stays `florian` | `florian` | PASS |
| 10 | Anon cannot read trade rows | 401/403 or empty | no `.env.local` | BLOCKED |
| 11 | Owner password login | Password grant | no `.env.local` | BLOCKED |
| 12 | Owner reads `trade_entries` | HTTP 200 | no `.env.local` | BLOCKED |
| 13 | `amount_inr` readable by that user | Column in the response | no `.env.local` | BLOCKED |

### Also run (offline, from earlier phases)

| Suite | Result |
|-------|--------|
| `scripts/qa-account-code.cjs` | PASS (7) |
| `scripts/qa-phase6-surface.cjs` | PASS (11) |
| `scripts/qa-profit-loss.mjs` | PASS |

**Blocked reason:** Florian Sales has no Supabase env. FRS and Florian inventory keys were not loaded.

**When `.env.local` exists:** add `QA_OWNER_EMAIL` and `QA_OWNER_PASSWORD`, apply migrations through `061`, then run `node scripts/qa-phase3-check.cjs`. The script uses the anon key and that password only.
