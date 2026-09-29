## QA report — Florian-Sales — Phase 2 profit and loss

- Result: BLOCKED for signed-in HTTP. Formula and access rules PASSED offline.
- Env: no `Apps/Florian-Sales/.env.local`. No URL host or schema to load.
- Auth: not run. No service role. No staff logins.

| # | Case | Expected | Actual | Verdict |
|---|------|----------|--------|---------|
| 1 | September IST month bounds | 2026-09-01 to 2026-09-30 | same | PASS |
| 2 | Month rolls at 01:30 IST | October when UTC is still 30 Sep 20:00 | October | PASS |
| 3 | Last month | August when now is mid-September | August | PASS |
| 4 | Custom dates reversed | Earlier date first | swapped | PASS |
| 5 | Invalid calendar date | Error, fall back to this month | same | PASS |
| 6 | Sales 10000, purchases 4000, one blank ₹, August line ignored | Gross 6000, margin 60%, missing 1 | same | PASS |
| 7 | Purchases only | Gross −500, margin blank | same | PASS |
| 8 | Two-month trend | Empty September plus October sales | same | PASS |
| 9 | Nav gate | `/profit` requires `view_profit`. Tele-caller block does not include it. Accounts block does. | source check | PASS |
| 10 | Admin and Accounts can open the page; a tele-caller is redirected | Signed-in session | No database | BLOCKED |
| 11 | Dashboard month gross profit matches `/profit` | Same loader and formula | Code uses both. Not exercised in a browser | BLOCKED |

**Blocked reason:** Florian Sales has no Supabase env yet. Do not use FRS or Florian inventory keys.

**Apply on the first Florian Sales project:** `061_view_profit.sql` (or `run_all_migrations.sql` on an empty project).
