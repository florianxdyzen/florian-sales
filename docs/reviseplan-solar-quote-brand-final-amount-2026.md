# Florian Sales — Solar quote: brand selectors + Final Amount

**App:** `Apps/Florian-Sales` only (not inventory `Apps/Florian`)  
**Date:** 2026-11-21  
**Status:** Deployed **v19** (2026-11-21)  
**Trigger:** Staff want fixed panel/inverter brand chips on System Details, plus a single **Final Amount** field that drives quote pricing instead of catalog rate-card / ₹/kW entry.  
**Related:** Catalog inverter picker fix (v18); solar BOM sample plan `plan-solar-bom-from-sample-2026.md`.

---

## 1. Goal (staff-facing)

On **New / Edit solar quotation → System Details**, staff should:

1. **Select panel company** from a fixed list:  
   **Waaree · Adani · APS · Redren**
2. Enter **watt peak** (W per panel).
3. Enter **Final Amount** (₹) — one money field; the form calculates the rest of the commercial figures from that.
4. **Select inverter make** from a fixed list:  
   **Polycab · PV Blink · Waaree · KSolar**
5. (Keep) enter **inverter size** as free text for the PDF (e.g. `50KW`), same as today.

No catalog search for panel/inverter brands on this screen. Brand lists are product constants in code (editable later if the client adds a name).

---

## 2. What exists today (baseline)

| Piece | Today |
|-------|--------|
| Panel | Search Catalog → Rate card panels (`PanelSearchPicker`) |
| Pricing | Watt peak + panel count → system kW; ₹/kW (rate card or edit) → **system cost** |
| Inverter | Search Catalog → Inverters (`InverterSearchPicker`) after v18 |
| Derived | Discount ₹/%, subsidy (from kW), net payable = system − discount − subsidy; meter/GEDA; PDF/BOM snapshots |
| Hardcoded leftovers | Old `INVERTER_BRANDS` = Adani/Waaree/Xwatt/VSole/APS — **not** the lists below; unused by System Details after v18 |

Catalog → Panels / Inverters admin tabs remain for BOM/history unless this plan explicitly retires them (see open questions).

---

## 3. Target System Details UX

```
Panel company     [ Waaree ] [ Adani ] [ APS ] [ Redren ]     ← required chip
Watt peak (W)     [ 540 ]
Number of panels  [ 10 ]                                      ← keep (needed for kW)
System capacity   5.40 kW                                     ← calculated, read-only

Final Amount (₹)  [ 262500 ]                                  ← required; staff entry
  → ₹/kW (display)     calculated = Final Amount ÷ system kW
  → System package     = Final Amount
  → Subsidy (auto)     from system kW + meter type (unchanged rules)
  → Discount           optional % / ₹ off Final Amount (unchanged UI)
  → Net payable        Final − discount − subsidy (+ existing meter/GEDA rules)

Inverter make     [ Polycab ] [ PV Blink ] [ Waaree ] [ KSolar ]  ← required chip
Inverter size     [ 50KW ]                                        ← free text, required
```

**Regular / Premium** toggle: keep for template/BOM tier labeling; it no longer drives ₹/kW from the rate card when Final Amount is set.

---

## 4. Calculation rules (“calculate everything”)

Definitions for this revision:

| Term | Meaning |
|------|---------|
| **Final Amount** | Turnkey **system package** price staff type in (GST-inclusive, same meaning as today’s `systemCost` before discount). |
| **System kW** | `round2(wattPeak × panelCount / 1000)` — same formula as `calcSystemKw` today. |
| **Implied ₹/kW** | If system kW > 0: `round2(Final Amount / system kW)`; else 0. Stored as `ratePerKwSnapshot` for PDF/audit. |
| **Discount** | Still % or ₹ of Final Amount; net system = Final − discount. |
| **Subsidy** | Existing `calcQuotationSubsidy(systemSizeKw, …)` + meter-type rules (residential auto / commercial ₹0 / common manual). |
| **Net payable** | `max(0, Final − discount − subsidy)` then existing meter / GEDA / commercial GST handling unchanged unless noted below. |

### What Final Amount does **not** invent

- It does not invent panel count or watt peak (staff still enter those).
- It does not replace meter phase / GEDA line items.
- It does not auto-pick inverter size.

### Save / snapshot fields (map to existing columns)

| UI | Payload / DB |
|----|----------------|
| Panel company chip | `moduleTypeName` / `moduleCompanyName` (brand string, e.g. `Adani`) |
| Watt peak | module capacity label `540W` + existing watt snapshot path |
| Panel count | `panelCount` |
| System kW | `systemSizeKw` |
| Final Amount | `systemCost` |
| Implied ₹/kW | `ratePerKwSnapshot` |
| Inverter chip | `inverterTypeName` (e.g. `Polycab`) |
| Inverter size | `inverterSizeLabel` |

BOM row fill (sample list): module make ← panel company; inverter make/size ← inverter chip + size — same as today’s “fill from System Details” behavior.

---

## 5. Code / product changes (when approved)

### 5.1 Constants

New module e.g. `src/lib/quotations/florian-brands.ts`:

```ts
export const FLORIAN_PANEL_COMPANIES = ["Waaree", "Adani", "APS", "Redren"] as const;
export const FLORIAN_INVERTER_MAKES = ["Polycab", "PV Blink", "Waaree", "KSolar"] as const;
```

Replace / stop using obsolete `INVERTER_BRANDS` (Xwatt/VSole) for new quotes. Keep `normalize*` helpers that map legacy spellings onto the new lists where possible (e.g. old Waaree inverter still matches).

### 5.2 UI

- `SystemDetailsPanel`: remove `PanelSearchPicker` + catalog `InverterSearchPicker` for solar System Details.
- Add chip selectors (same interaction pattern as current meter / mount buttons).
- Replace “Price per kW” **input** with **Final Amount** input; show implied ₹/kW as read-only text.
- Keep watt peak + panel count inputs.
- Validation: panel company, watt peak > 0, panel count > 0, Final Amount > 0, inverter make, inverter size.

### 5.3 Builder form math

- Stop calling `applyPerKwPricing` from rate-card panels when Final Amount mode is on.
- On Final Amount / watt / count change: recompute system kW, implied ₹/kW, discount absolute from %, subsidy, net payable.
- `buildRateCardSystemLines`: pass panel company + inverter make/size strings (already supports free-text brand).

### 5.4 Catalog admin

| Option | Recommendation (default in this plan) |
|--------|----------------------------------------|
| **A. Keep Catalog tabs** for historical rate cards / extra SKUs, but solar System Details ignores them | **Default** — least disruption |
| B. Hide Panels/Inverters catalog tabs | Only if client confirms they will never manage catalogs again |
| C. Seed catalog rows from the fixed lists | Unnecessary if UI uses constants |

v18 catalog inverter wiring stays in repo for Option A; System Details simply stops consuming that list.

### 5.5 PDF / proposal

- System page already prints `inverterTypeName` + `inverterSizeLabel` and module name — ensure panel company string prints as module make.
- Brand logos: extend `inverter-brand-logos` (and panel logos if any) for Polycab / PV Blink / KSolar / Redren when assets exist; otherwise text-only (no broken image).

### 5.6 Edit old quotes

- If saved brand is in the new lists → select that chip.
- If saved brand is outside the list (e.g. old catalog “POLYCAB 100KW” name, or Xwatt) → show amber note “Current: … — pick a brand chip to update” and require a chip before save (same pattern as v18 legacy inverter note).

### 5.7 Migrations

- **None required** if we only reuse existing quotation columns.
- Optional later: seed `rate_card_inverters` / panels for reporting — out of scope for this revise.

### 5.8 QA (after build)

Scoped HTTP/session cases against Florian `.env` (anon + user login, no service_role):

1. New solar quote: Adani + 540W + 10 panels + Final Amount 2,62,500 → system kW 5.4, implied ₹/kW matches, subsidy/net update.
2. Inverter chip Polycab + size `50KW` → saved on quote + visible on print payload.
3. Missing Final Amount → cannot save; clear staff message.
4. Edit legacy quote with old catalog inverter name → must re-pick chip; save succeeds.
5. B2B / non-solar quotation path unchanged.

---

## 6. Out of scope

- Changing B2B line-item quotations.
- Changing trade / P&L / pipeline.
- Redesigning BOM photo editor (already separate plan).
- Adding new Supabase tables for brands.
- Auto-deriving panel count from Final Amount alone.

---

## 7. Open questions (confirm before implementation)

1. **Panel count** — Keep as a required field (recommended)? Or should Final Amount + watt peak alone drive something else?
2. **Final Amount** — Confirm it means **gross system package before subsidy** (today’s `systemCost`), not “customer net payable after subsidy.”
3. **Discount** — Keep discount %/₹ under Final Amount, or hide discount and treat Final Amount as already-net-of-discount?
4. **Regular / Premium** — Keep toggle for PDF/BOM only, or remove from solar form?
5. **Inverter size** — Still free text after make chip (recommended), or fixed size chips per make?
6. **Catalog pages** — Keep (Option A) or hide Panels/Inverters admin tabs?
7. **Spelling** — Confirm **KSolar** (not “K Solar”) and **PV Blink** (two words) for PDF print.

---

## 8. Implementation order (after approval)

| Step | Work |
|------|------|
| 0 | Lock answers to §7 |
| 1 | Add `florian-brands.ts` + chip UI on `SystemDetailsPanel` |
| 2 | Wire Final Amount → systemCost / implied ₹/kW / subsidy / net in `quotation-builder-form` |
| 3 | Drop validation + legacy edit path |
| 4 | PDF/BOM snapshot check (module + inverter make) |
| 5 | Scoped QA report; sync Deliverables; deploy only when asked |

---

## 9. Done when

- Staff can create a solar quote by: panel company chip → watt peak → panel count → Final Amount → inverter chip → size, without opening Catalog search.
- Changing Final Amount updates displayed ₹/kW, subsidy (when applicable), and net payable.
- Saved quote and print show the selected panel company and inverter make from the new lists.
- Plan §7 answers are written into this file under **Decisions** before merge.

---

## Decisions

Confirmed 2026-11-21:

| # | Decision |
|---|----------|
| 1 | Keep **panel count** required |
| 2 | **Final Amount** = gross system package before subsidy (`systemCost`) |
| 3 | Keep **discount** %/₹ under Final Amount |
| 4 | Keep **Regular / Premium** toggle (PDF/BOM/tier label; not rate-card ₹/kW) |
| 5 | Inverter **size** stays free text after make chip |
| 6 | Keep Catalog → Panels / Inverters admin tabs (System Details ignores them) |
| 7 | Spellings locked: **KSolar**, **PV Blink** |
