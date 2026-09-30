# Florian Sales — Product plan

**Client / UI brand:** Florian — *Quality that you can trust*  
**Short name:** Florian  
**App folder:** `Apps/Florian-Sales`  
**Deliverables slug:** `florian-sales`  
**Document version:** 1.0.0  
**Date:** 2026-09-28  
**Status:** Phase 3 recorded 2026-09-28. Offline checks passed. Signed-in QA is blocked until `.env.local` points at a new Supabase project with migrations through `061`.  
**Sources:** Solar Ops Knowledge (`INDEX.md`, `templates/fork-matrix.md`, `apps/frs-solar.md`, `apps/quotation-generator.md`, `apps/florian.md`); existing inventory brand in `Apps/Florian/docs/design.md`.

The inventory app at `Apps/Florian` stays as it is. This is a second product for the same company, with its own folder, Deliverables slug, and Supabase project.

---

## 1. Goal

Staff app for Florian to:

1. Run a **sales pipeline**
2. Issue **quotations**
3. Record **B2B trade** (sales out and purchases in against the same partner)
4. See **profit and loss** for a period

**PWA + phone layouts.** Client GitHub → their Vercel (`bom1`) → their Supabase. No Blob / Global Config / Upstash. New Supabase. No chat/RAG UI. Do not reuse Florian inventory keys or FRS keys.

---

## 2. Closest build

Fork rule: copy the smallest base that already has the modules. Do not start from the inventory family to “get a ledger,” and do not merge two full trees.

| Need | Where it already exists | Fit |
|------|-------------------------|-----|
| Sales pipeline (calling desk + sales board, Hot / Warm / Cold) | `Apps/FRS-Solar` | Already the primary UX |
| Quotations (create, PDF, attach to an account) | `Apps/FRS-Solar` (KT/Recare quote spine, retargeted to B2B lines) | On |
| B2B trading (one account, outward sale + inward purchase, ₹, PDF bills) | `Apps/FRS-Solar` (`trade_skus`, `trade_entries`, account Summary / Outward / Inward) | On |
| Profit and loss | **Missing as a company report.** FRS stores `amount_inr` per line and shows outward “earnings” per account. It does not subtract purchases. | Add on the FRS ledger |
| Quote margin page | `Apps/Quotation-Generator` `/profit` | Different product: cost vs sale price on quotations, plus payment collection. No pipeline desk, no inward/outward trade. |

### Score

| Base | Fit | Why |
|------|-----|-----|
| **`Apps/FRS-Solar`** | **Copy this** | Three of the four asks are already shipped: pipeline, quotations, B2B trade. P&L is a report on `trade_entries.amount_inr`. |
| `Apps/Quotation-Generator` | Partial | Strong quote + margin math. No B2B trade desk and no tele-call pipeline. Building those on top is a new CRM. |
| `Apps/Florian` (inventory) | Wrong product | Stock, challans, service, warranty. Knowledge card: **not** a lead CRM. |
| `Apps/Recare` / KT | Ancestor of FRS | Use only if the FRS tree is unhealthy. FRS already stripped portal, subsidy, install, and 3-stage payments. |
| Jay / VEE / Swastik / Jaleshwar | Wrong | Department ops, install, or dealer Cash/Loan. |
| Panchamrut | Too small | Quotes only. |

**Copy from:** `Apps/FRS-Solar`  
**Lineage:** KT / Recare hybrid, same written strip as FRS (`blueprints/crm-kt-family.md` + `apps/frs-solar.md`).  
**Cherry-pick:** the *idea* of a period profit page from Quotation Generator. Do **not** copy that app’s payment-collection profit engine. Florian v1 P&L is realized trade: sales minus purchases.

---

## 3. What changes vs FRS

| FRS default | Florian Sales v1 |
|-------------|------------------|
| Brand navy `#0B2E6B` / orange `#F39C12`, FRS wordmark | Florian logo + cyan `#1BA8E0` / navy `#163A5C` / soft `#E4F5FC` |
| Account code `FRS` + n, quote prefix `FRS` | Account code `FLR` + n, quote prefix `FLR` |
| Seed SKUs: combo boxes out, PV panels in | Empty trade catalogue. Staff name their own outward and inward items. |
| Copy that talks about Miracle invoices | Keep PDF attach for tax invoice / purchase bill. Say “invoice PDF”, not Miracle, unless Florian uses Miracle. |
| Per-account qty and ₹, no company P&L | Add **Profit & loss** from outward ₹ minus inward ₹ |
| Consumer portal, subsidy, install, 3-stage payments | Stay **off** (already hidden in FRS) |
| Warehouse stock | Stay **off**. Inventory remains `Apps/Florian`. |

Keep from FRS, because the four features sit on this spine:

- Pipeline calling desk + sales board
- Hot / Warm / Cold and the 30-day calling cycle
- Quotations on the account
- One counterparty for sales and purchases
- Trade lines with date, qty, SKU, `amount_inr`, and PDF proof
- Team & Access, PWA, lead import

---

## 4. Brand

Official lockup is `public/brand/logo.png`. Theme tokens stay cyan `#1BA8E0` / navy `#163A5C` / soft `#E4F5FC`. Tagline: *Quality that you can trust*.

| Token | Value |
|-------|--------|
| Legal / trading | Florian |
| Primary (buttons, active nav, PWA theme) | `#1BA8E0` |
| Primary hover | `#1489C4` |
| Navy (headings, sidebar) | `#163A5C` |
| Soft tint | `#E4F5FC` |
| Page background | `#FAFAFA` |
| Surface | `#FFFFFF` |
| Logo | `public/brand/logo.png` (official lockup) |
| Quote prefix | `FLR` |
| Account code | `FLR` + integer, unique, searchable. Start number in Settings. |
| Portal prefix | None |
| GSTIN / address / bank | Blank until letterhead (same as inventory) |

After copy, purge FRS / Recare / RK / KT / RECA strings and the FRS navy/orange theme.

Print and PDF: logo in the header; body text in navy, not a full cyan fill.

---

## 5. Modules

| Module | v1 | Notes |
|--------|----|-------|
| Sales pipeline | On | Calling desk default; sales board as a tab |
| Quotations | On | B2B line items. Solar kW builder stays behind `?kind=solar` only, as in FRS. |
| B2B trade ledger | On | Outward sale and inward purchase on one account |
| Profit and loss | On | New page. See §6. |
| Account codes + search | On | `FLR29 — Name` |
| Lead import | On | Kept from the base |
| Team & Access | On | Admin, tele-caller, sales, accounts |
| PWA + responsive | On | Required |
| Warehouse / challans | **Off** | That is `Apps/Florian` |
| Customer portal | **Off** | |
| Subsidy / Discom / install crew | **Off** | |
| Token / pre-dispatch / final payments | **Off** | Money in v1 is the trade ₹ on each line |
| Dealers Type A/B, Cash/Loan | **Off** | |

---

## 6. Profit and loss (the only new feature)

FRS already saves `amount_inr` on each `trade_entries` row (`outward` or `inward`). v1 adds a report. It does not add a second ledger.

**Gross profit** for a period = sum of outward `amount_inr` − sum of inward `amount_inr`.

Lines with a blank amount count in quantity and are excluded from rupees, with a visible “₹ missing” count so the total is not silently wrong.

### Page `/profit`

| Block | Content |
|-------|---------|
| Period | This month, last month, or custom dates |
| Sales | Outward ₹ |
| Purchases | Inward ₹ |
| Gross profit | Sales − purchases |
| Margin | Gross profit ÷ sales, when sales &gt; 0 |
| By account | Top accounts: sales, purchases, profit |
| By SKU | Same split on `trade_skus` |
| Trend | One row per month in the selected range |

Who can open it: Admin and Accounts (`view_profit`). Tele-callers do not see company P&L by default.

This is **realized trade**, not quotation margin. Quotation Generator’s `/profit` also tracks estimated profit on unapproved quotes and payments collected. Those stay out of v1 unless Florian asks (see Q4).

Dashboard may show one gross-profit figure for the current month for users who can open `/profit`. It must use the same formula as the page.

---

## 7. Happy path

```
Create or import an account (code FLR29)
  → Work the pipeline (Cold / Warm / Hot)
  → Create a quotation
  → Log an outward sale (qty, SKU, ₹, invoice PDF)
  → On the same account, log an inward purchase (qty, SKU, ₹, bill PDF)
  → Account summary shows sales vs purchases
  → Profit & loss shows the company (and that account) for the month
```

Do not present survey → subsidy → token → installation as the main path.

---

## 8. Implementation phases (after you say copy)

### Phase 1 — Copy and brand

- [x] Copy `Apps/FRS-Solar` → `Apps/Florian-Sales` (exclude `node_modules`, `.next`, `.env.local`, `.git`)
- [x] Install Florian logo and tokens from §4
- [x] Replace `FRS` account/quote prefix with `FLR` in UI, seeds, and settings defaults
- [x] Remove FRS combo-box / panel seed SKUs. Trade catalogue and B2B quote seeds start empty. Inherited residential kit rows in `007_quotations.sql` remain for `?kind=solar` only.
- [x] Replace Miracle wording with generic invoice / bill labels
- [x] Confirm consumer routes stay blocked (portal, payments, install, liaison, ingest) via `src/proxy.ts`
- [x] `sync-from-app.ps1` / `.sh` → `Deliverables/florian-sales`
- [x] New Supabase project documented in `.env.example` only (project not created)

### Phase 2 — Profit and loss

- [x] `/profit` as in §6, read-only over `trade_entries`
- [x] Authority `view_profit` for Admin and Accounts (`061_view_profit.sql`)
- [x] Nav item **Profit & loss**
- [x] Dashboard month gross profit for users with that authority
- [x] No new money tables if the existing `amount_inr` column is enough

### Phase 3 — Check and record

- [x] Scoped QA (`playbooks/feature-qa-gate.md`). Offline PASS (`scripts/qa-phase3-check.cjs` plus account-code, surface, and profit suites). Signed-in rows BLOCKED: no `.env.local`. Harness uses anon key + `QA_OWNER` password only and drops the service role key.
- [x] Report: `docs/qa-phase3.md` and the implementing chat
- [x] `apps/florian-sales.md`, `memory/app-deltas.md`, and `Global Instructions/memory.md` updated

---

## 9. Acceptance (v1)

- Login shows the Florian drop logo and cyan/navy chrome; PWA theme `#1BA8E0`
- Pipeline: mark Hot / Warm / Cold and open an account from the desk
- Create a quotation with prefix `FLR`
- Same account: log an outward sale and an inward purchase with ₹ and a PDF
- Account summary shows both streams
- Profit & loss for a month equals outward ₹ minus inward ₹ for that month
- A line with no ₹ is listed as missing, not treated as zero inside a silent total
- No warehouse screen, no customer portal, no FRS branding
- `Apps/Florian` inventory is unchanged
- Own Supabase

---

## 10. Open questions (defaults apply if you stay silent)

| ID | Question | Default if silent |
|----|----------|-------------------|
| Q1 | Folder name | `Apps/Florian-Sales` (inventory stays `Apps/Florian`) |
| Q2 | Account / quote prefix | `FLR` |
| Q3 | Keep the FRS calling cycle (Hot/Warm/Cold, 30-day recycle, import)? | Yes. It is the pipeline on the base we copy. |
| Q4 | Estimated profit on quotations (cost vs sell), as in Quotation Generator? | No in v1. P&L is realized sales minus purchases. |
| Q5 | GSTIN, address, bank on quotations | Blank until letterhead |
| Q6 | Link this app to inventory stock? | No. Two products, two databases. |

---

## 11. Infrastructure

- [ ] New Supabase (required). Not the inventory project. Not `frs_solar`.
- [ ] `.env.example` only in git
- [ ] Vercel region `bom1` when they deploy
- [ ] PDF proofs in their Supabase Storage (same pattern as FRS `proofs`)

---

## 12. Risks

| Risk | Mitigation |
|------|------------|
| Copying inventory because the folder is already named Florian | This plan names `Apps/Florian-Sales` and forbids that copy |
| Copying Quotation Generator to “get profit” | Profit is a query on FRS trade amounts |
| FRS consumer or FRS-brand screens leak into the demo | Phase 1 brand pass + route block check before P&L work |
| Blank ₹ lines make profit look complete | Show a missing-amount count |
| Two Florians share one Supabase | Separate project; never copy `.env.local` |

---

## 13. Scaffold trigger

Phase 3 offline checks are recorded. Add `.env.local` for a new Supabase project (migrations through `061`, plus `QA_OWNER_EMAIL` and `QA_OWNER_PASSWORD`) and re-run `node scripts/qa-phase3-check.cjs` for the signed-in rows.
