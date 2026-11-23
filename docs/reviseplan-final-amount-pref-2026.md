# Florian Sales — Prefill Final Amount from last quote (same watt peak × panels)

**App:** `Apps/Florian-Sales`  
**Date:** 2026-11-23  
**Status:** Implemented (2026-11-23)  
**Related:** Last inverter by kW + subsidy &lt;3 kW (`reviseplan-quotation-ux-prefs-2026.md`, v21 / migration `064`)

---

## 1. Goal

When **watt peak** and **number of panels** match a previously saved solar quotation, **auto-fill Final Amount** from that last save — same idea as last inverter for the same system kW.

Staff can still **edit** Final Amount freely.

---

## 2. Behavior

| Event | Behavior |
|-------|----------|
| Save solar quote with watt peak &gt; 0, panels &gt; 0, Final Amount &gt; 0 | Store that Final Amount under key `{wattPeak}x{panelCount}` on company settings |
| New quote / edit: watt peak + panel count become a known key | Prefill Final Amount from map (Implied ₹/kW recalculates as today) |
| Staff changes Final Amount | Value sticks until watt×panels key changes again |
| Edit existing quote (first paint) | **Do not** overwrite the saved Final Amount (same skip-once pattern as inverter) |
| No match in map | Leave Final Amount as-is (empty or current) |

**Match rule (requested):** watt peak **and** panel count only — not system kW alone, not inverter.

**Example:** Last quote was 540 W × 10 panels, Final Amount ₹2,62,500 → next time staff enters 540 and 10, Final Amount becomes 262500 (editable).

---

## 3. Storage (mirror inverter prefs)

**Column** on `quotation_company_settings` (new migration **`065`**):

```sql
ALTER TABLE quotation_company_settings
  ADD COLUMN IF NOT EXISTS last_final_amount_by_panels JSONB NOT NULL DEFAULT '{}'::jsonb;
```

**Shape:**

```json
{
  "540x10": { "amount": 262500, "updatedAt": "…" },
  "550x12": { "amount": 315000, "updatedAt": "…" }
}
```

**Key helper:** `panelsPrefKey(wattPeak, panelCount)` → `"540x10"`  
- Watt peak: integer watts (`Math.round`)  
- Panel count: integer panels  
- Invalid if either ≤ 0

Company-wide (all staff share), same as `last_inverter_by_kw`.

---

## 4. Code touchpoints

| Area | Change |
|------|--------|
| `quote-prefs.ts` | Parse / lookup / merge for `last_final_amount_by_panels` |
| `upsertQuotation` | On save, merge amount into map (graceful if column missing) |
| `quotations/new` + `edit` pages | Select + pass pref into builder |
| `new-quotation-workspace` / `QuotationBuilderForm` | Effect: when watt×panels key changes → set `systemCost` from pref (skip once on edit) |
| Migration `065_…sql` + `run_all_migrations.sql` | Add column |

No change to PDF, WhatsApp, micron, or inverter prefs.

---

## 5. Open questions

1. **Scope of key:** watt×panels only (as asked), or also include **panel company** and/or **Premium/Regular** so residential Waaree 540×10 does not overwrite commercial / Regular pricing?  
   → **Default if no answer: watt×panels only** (simplest; matches your wording).
2. **Zero amount:** never store / never apply if Final Amount is 0.
3. **When key changes and no pref:** clear Final Amount, or keep previous typed amount?  
   → **Default: keep previous** (only fill when a hit exists).

---

## 6. QA (after build)

| # | Case | Expected |
|---|------|----------|
| 1 | Save 540×10 @ ₹2.5L; new quote 540×10 | Final Amount = 250000 |
| 2 | Change Final Amount on new quote; save | Map updates for that key |
| 3 | Change to 550×10 with no history | Amount unchanged (or empty if never set) |
| 4 | Open edit of old quote | Saved Final Amount not replaced on load |
| 5 | Prefill then edit amount | Editable; save persists typed value |

---

## 7. Done when

- Saving a solar quote remembers Final Amount by watt×panels.
- Matching watt + panels prefills Final Amount; field stays editable.
- Edit-load does not clobber saved amount.
- Migration `065` applied on Florian Cloud; scoped QA reported.

---

## Decisions

| # | Decision |
|---|----------|
| 1 | Key = **watt×panels only** (not brand/tier) |
| 2 | No hit → **keep** current Final Amount |
