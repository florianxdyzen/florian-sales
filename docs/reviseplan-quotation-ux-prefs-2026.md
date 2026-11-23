# Florian Sales — Quotation UX: duplicate, WhatsApp, PDF name, micron & prefs

**App:** `Apps/Florian-Sales` only (not inventory `Apps/Florian`)  
**Date:** 2026-11-23  
**Status:** Implemented (2026-11-23) — decisions locked below  
**Trigger:** Staff asked for duplicate-for-new-customer, optional phone, WhatsApp + download on detail, PDF filename, remove Per kW Rate line, structure micron by system kW with override, and remember last inverter (same kW) / last subsidy (&lt; 3 kW).  
**Related:** Brand chips + Final Amount (`reviseplan-solar-quote-brand-final-amount-2026.md`, v19/v20); BOM sample (`plan-solar-bom-from-sample-2026.md`).

---

## 1. Goals (staff-facing)

| # | Ask | Outcome |
|---|-----|---------|
| A | Duplicate quotation for a **different customer / lead** (name + number) | From Quotation Details: duplicate system/pricing/BOM into a new **draft**, then set new name/phone (and optional lead link) |
| B | Contact number **optional** when creating a quotation | Name required; phone may be blank |
| C | **WhatsApp** button on Quotation Details | Opens WhatsApp with customer number + short quote message (when phone present) |
| D | **Download PDF** on Quotation Details (alongside WhatsApp) | One-click download; file named from **customer name + kW** |
| E | PDF **page 2** (offer / price table): remove **“Per kW Rate (GST included)”** row | Keep system package, meter, discount, subsidy, totals |
| F | Structure **micron** by system size + manual override | Auto: ≤2 kW → 40; &gt;2–≤50 → 60; &gt;50 → 80. System Details chips: 40 / 60 / 80 |
| G | Remember **last inverter** used for the **same system kW** | When system kW matches a previous quote’s kW, prefill inverter make + size |
| H | Remember **last subsidy** when system size **&lt; 3 kW** | Prefill subsidy amount (and keep scheme rules) from last &lt;3 kW quote |

---

## 2. What exists today (baseline)

| Area | Today |
|------|--------|
| Duplicate | Server `duplicateQuotation(id)` copies same customer/lead into a new draft (`…-R####`). **No UI** on detail page; no “new customer” step |
| Phone | Zod `customerPhone: z.string().min(10)`; builder blocks continue/save without 10+ digits (solar + B2B) |
| Detail actions | Edit, Print/PDF link, Mark sent, Accept — **no** WhatsApp, **no** direct download |
| Print/PDF | `/quotations/[id]/print` + `PrintToolbar` → browser Print → Save as PDF; filename is browser-default |
| Page 2 “Per kW Rate” | `solar-proposal-document.tsx` offer table row: `Per kW Rate (GST included)` |
| Structure micron | Hardcoded **80** in `FLORIAN_SAMPLE_BOM` structure row and `tier-quote-copy` (`80 Micron HDGI …`) |
| Last-used prefs | Company `quotation_company_settings.last_bom_items` only (BOM list). **No** inverter-by-kW or subsidy memory |
| Inverter / subsidy on new quote | Brand chips + size (v19); subsidy from meter type / auto matrix — not from prior quote prefs |

---

## 3. Target behavior (detailed)

### A — Duplicate for another customer

**Entry:** Quotation Details → **Duplicate for another customer**.

**Flow:**
1. Modal: **Customer name** (required), **Phone** (optional), optional **Link lead** (search existing lead; selecting a lead prefills name/phone).
2. Server creates a new **draft** quotation:
   - Copies system fields, items, BOM, tier, meter, subsidy **from source** (same as today’s `duplicateQuotation` payload).
   - Sets `customer_name` / `customer_phone` / `lead_id` from the modal (lead_id null if not linked).
   - New `quotation_no` (reuse existing numbering helper if available; otherwise keep `-R####` pattern until numbering is unified).
3. Redirect to **Edit** of the new draft so staff can tweak before send.

**Not in scope:** Cloning into Accepted status; overwriting the source quote.

### B — Optional phone

- Solar + B2B create/edit: phone optional.
- Validation: empty OK; if present, must be a sensible Indian mobile (recommend 10 digits after stripping spaces/`+91`).
- Customer step “Continue” / save: require **name only**.
- WhatsApp button: **hidden or disabled** with hint when phone is empty.

### C + D — WhatsApp + Download on Details

On `QuotationDetailActions` (and optionally list row later — out of scope unless asked):

1. **Download PDF**  
   - Opens print layout and triggers download/save with controlled filename:  
     `{CustomerName}_{systemSizeKw}kW.pdf`  
     Example: `Rajesh_Patel_6kW.pdf`  
   - Sanitize name (spaces → `_`, strip unsafe characters). If kW missing, use `0kW` or omit with fallback `Quote_{quotation_no}.pdf`.

2. **WhatsApp**  
   - `https://wa.me/91{10digit}?text={encoded message}`  
   - Message sketch: `Florian quotation {quotation_no} · {kW} kW · {customer_name} · Total {amount}.`  
   - **Note:** `wa.me` cannot attach the PDF. Staff: Download PDF → attach manually in WhatsApp, or share the print URL if the team prefers a link later (link-sharing is optional / Phase 2).

**Implementation approach for filename (recommended):**
- Prefer a client download that renders the print route (or already-rendered HTML) via **print CSS + `html2canvas`/`jspdf`**, **or** set `document.title` to the desired basename and call `window.print()` (Chrome often uses title for Save as PDF — document as best-effort if full binary download is deferred).
- Plan default: **Phase 1** = dedicated Download that opens print view with `?download=1`, sets `document.title` to the target filename, then `window.print()`. **Phase 1.1** if title trick is unreliable: generate blob PDF client-side.

### E — Remove Per kW Rate on PDF page 2

In `solar-proposal-document.tsx` price table, **delete** the row:

```text
Per kW Rate (GST included) | ₹…
```

Keep: Roof ON-Grid system amount, net-metering, additional, discount, grand total, subsidy, final after subsidy.

Also remove matching “Implied ₹/kW” **display** on System Details summary?  
→ **Default: keep UI implied ₹/kW for staff math; only strip from PDF page 2** (ask in §7).

### F — Structure micron by system kW + override

**Auto rule** (system size = `systemSizeKw` after watt peak × panel count):

| System kW | Default micron |
|-----------|----------------|
| ≤ 2 | **40** |
| &gt; 2 and ≤ 50 | **60** |
| &gt; 50 | **80** |

**Boundary:** Exactly **2.0 kW** → 40. Exactly **50.0 kW** → 60.

**System Details UI:** chips **40 · 60 · 80 Micron** under structure (near inverter).  
- Changing system kW **resets micron to the auto default** unless staff already overrode (track `micronTouched` like prior watt/rate patterns).  
- Or: always suggest auto, but if user picks a chip, keep it until they click “Use auto” — **default: auto-reset on kW band change; chip marks override until kW band changes again.**

**Persist:** new optional field on quotation, e.g. `structure_micron` (`40 | 60 | 80`), plus payload in Zod.

**Propagate to print/BOM:**
1. `presentFlorianBom` / structure row specification: replace `80 micron` with selected micron in the HDGI sentence.  
2. `quoteTierCopy` / `structureMounting` string: use selected micron instead of hardcoded `80 Micron` (pipe sizes can stay tier-based Regular vs Premium).

Sample BOM default template can stay 80 in the static sample; runtime presentation always applies selected micron.

### G — Last inverter for same system kW

**Store** on `quotation_company_settings` JSONB, e.g. `last_inverter_by_kw`:

```json
{
  "6": { "make": "Polycab", "sizeLabel": "2kW", "updatedAt": "…" },
  "5.4": { "make": "Waaree", "sizeLabel": "5 kW", "updatedAt": "…" }
}
```

**Key:** round system kW for lookup — recommend **1 decimal** (`6` and `6.0` same; `5.4` distinct). Document in code.

**On save (solar):** upsert map entry for that kW with current inverter make + size.

**On new / when system kW changes:** if map has that key, prefill inverter chips + size (only if inverter not already overridden by user on this form).

**Scope:** company-wide (all staff share prefs), same as `last_bom_items`.

### H — Last subsidy when system &lt; 3 kW

**Store** on settings, e.g. `last_subsidy_under_3kw`: `{ "amount": 78000, "scheme": "residential", "updatedAt": "…" }`.

**On save:** if `systemSizeKw < 3` and subsidy was entered/saved, update this blob.

**On load / when kW becomes &lt; 3:** prefill subsidy amount from last (and show it in the subsidy input). Still respect meter-type matrix (commercial → ₹0; residential auto may overwrite unless “manual” / common meter — **default: prefill only when subsidy is staff-editable path**, i.e. common meter or when residential auto is off; if residential auto is on, show last amount as hint or only apply when user turns auto off — see §7).

---

## 4. Code / product touchpoints

| Change | Primary files |
|--------|----------------|
| Optional phone | `validations.ts`, `quotation-builder-form.tsx`, `quotation-builder-form-appliance.tsx`, upsert guards |
| Duplicate UX | `quotation-detail-actions.tsx`, new modal component, extend `duplicateQuotation(id, { name, phone, leadId })` |
| WhatsApp + Download | `quotation-detail-actions.tsx`, print page `?download=1`, small `quote-pdf-filename.ts` helper |
| Remove Per kW PDF row | `solar-proposal-document.tsx` |
| Micron field + UI | `system-details-panel.tsx`, builder form, `validations.ts`, migration `064_structure_micron.sql`, `sample-bom.ts` present helper, `tier-quote-copy` usage in document |
| Prefs JSON | migration on `quotation_company_settings`, load on new quote page / builder effects, write on `upsertQuotation` |

---

## 5. Migrations

**`064_quotation_structure_micron_and_prefs.sql`** (name TBD):

```sql
ALTER TABLE quotations
  ADD COLUMN IF NOT EXISTS structure_micron SMALLINT
  CHECK (structure_micron IS NULL OR structure_micron IN (40, 60, 80));

ALTER TABLE quotation_company_settings
  ADD COLUMN IF NOT EXISTS last_inverter_by_kw JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_subsidy_under_3kw JSONB;
```

Apply on Florian Cloud before relying on prefs in production.

---

## 6. QA (after build)

| # | Case | Expected |
|---|------|----------|
| 1 | Create solar quote with name only (no phone) | Saves |
| 2 | Phone `9876543210` | Saves; WhatsApp enabled on detail |
| 3 | Duplicate → new name/phone | New draft; source unchanged; edit opens |
| 4 | Download | Filename contains customer + kW |
| 5 | PDF page 2 | No “Per kW Rate” row |
| 6 | 2 kW system | Micron defaults 40; BOM/PDF show 40 |
| 7 | 2.1–50 kW | Defaults 60 |
| 8 | 50.1+ kW | Defaults 80; chip can force 40 |
| 9 | Save 6 kW + Polycab 2kW; new quote at 6 kW | Inverter prefilled |
| 10 | Save &lt;3 kW with subsidy S; new &lt;3 kW quote | Subsidy prefilled per §7 decision |
| 11 | B2B quote phone optional | Unchanged line items; phone optional |

Use Florian `.env` / anon + user session per `feature-qa-gate.md` (no service_role in harness).

---

## 7. Open questions (confirm before implementation)

1. **Phone optional** on **B2B** quotes as well, or **solar only**?  
2. **PDF “Per kW Rate”:** remove from PDF only, or also hide Implied ₹/kW on System Details UI?  
3. **Exactly 2 kW** → 40 and **exactly 50 kW** → 60 — confirm.  
4. **Micron override:** keep override when kW stays in same band; reset when band changes — confirm.  
5. **Subsidy prefilling (&lt; 3 kW):** apply only when subsidy is manual (common / auto-off), or always overwrite residential auto amount?  
6. **kW key for inverter memory:** 1 decimal round — confirm (6 vs 6.0 same).  
7. **WhatsApp:** India `91` prefix always, or detect existing country code?  
8. **Download Phase 1:** `document.title` + print OK for v1, or require true blob PDF download before ship?

---

## 8. Implementation order (after approval)

| Step | Work |
|------|------|
| 0 | Lock §7 answers into **Decisions** |
| 1 | Optional phone (validation + UI) |
| 2 | Remove PDF Per kW Rate row |
| 3 | Micron auto + chips + BOM/PDF wiring + migration column |
| 4 | Company prefs: last inverter by kW + last subsidy &lt;3 kW |
| 5 | Detail: Duplicate modal + extended `duplicateQuotation` |
| 6 | Detail: WhatsApp + Download (filename) |
| 7 | Scoped QA → sync Deliverables → deploy when asked |

---

## 9. Out of scope

- Changing Final Amount / brand-chip System Details (already shipped).  
- Attaching PDF automatically inside WhatsApp.  
- Inventory app (`Apps/Florian`).  
- Reworking quote numbering scheme beyond duplicate suffix.  
- Multi-company / per-user prefs (company-level only).

---

## 10. Done when

- Staff can duplicate a quote onto a new name/phone (optional lead).  
- Quotes save without phone; WhatsApp appears when phone exists.  
- Detail page has WhatsApp + Download; downloaded/saved PDF name reflects customer + kW.  
- PDF page 2 has no Per kW Rate line.  
- Micron follows the kW table with 40/60/80 override; BOM/PDF show the selected micron.  
- Same-kW inverter and &lt;3 kW subsidy prefs behave per Decisions.  
- QA report pasted in agent reply; Cloud migration applied if prefs are used in prod.

---

## Decisions

Locked at implement start (user: “Start Implement Now”).

| # | Decision |
|---|----------|
| 1 | Phone optional on **solar and B2B** |
| 2 | Remove **Per kW Rate** from PDF only; keep Implied ₹/kW in System Details UI |
| 3 | Exactly **2 kW → 40**; exactly **50 kW → 60** |
| 4 | Micron **resets to auto when kW band changes**; chip override until next band change |
| 5 | Subsidy prefills for **common** and **residential (auto on)** when system enters &lt; 3 kW |
| 6 | Inverter memory key = **1 decimal** round |
| 7 | WhatsApp uses **91** + last 10 digits |
| 8 | Download v1 = print route `?download=1` + **document.title** basename (customer_kW) |
