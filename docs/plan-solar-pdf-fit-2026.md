# Florian Sales — Fit the solar quotation PDF

**App:** `Apps/Florian-Sales` only  
**Date:** 2026-11-02  
**Status:** Built in the app. Not deployed.  
**Pages:** the printed solar proposal (`solar-proposal-document.tsx`, `solar-proposal-css.ts`, `solar-bom-material-pages.tsx`).

## What is wrong

Every sheet is a fixed A4 page (`height: 297mm`, `overflow: hidden`). Anything past the bottom is cut off. It is not pushed to the next page.

**System package.** One sheet holds Panel, Inverter, Cables, Structure, Balance of system, and Warranty & service. Warranty & service is last, so the bottom of that block is clipped.

**Bill of materials.** Photos are 44×44px inside a 52px column. That size was set so a wide photo could not push the name and quantity off the right edge. The photos are smaller than they need to be. The same sheet also tries to hold the previous-work gallery under the table.

## What this revision does

Keep one A4 sheet per page. When a block does not fit, start another sheet. Do not shrink type until it is hard to read, and do not hide the overflow.

### System package — two sheets

| Sheet | Title | Contents |
|-------|--------|----------|
| 1 | System package | Page heading, project line, Panel, Inverter, Cables, Structure |
| 2 | System package | Same heading with “continued”. Balance of system. Warranty & service, in full |

Warranty rows stay as they are today (including structure warranty on a regular residential quote). Nothing in that block is dropped to make sheet 1 shorter.

Previous work stays off these two sheets. It already follows the materials list.

### Bill of materials — larger photos, own sheet

- Photo frame goes from **44px to 72px**. The image column widens to match. `table-layout: fixed` stays, so the component name, specification, make, and quantity remain on the page.
- The eight sample rows and the short note sit on the materials sheet. They are not drawn under the system sections.
- Previous work moves to the **next** sheet, with the same heading and photos as today. It is no longer packed under the larger rows.
- If a future list is longer than one sheet, continue on another materials sheet. A row is never split, and a photo is never clipped by the page edge. With 72px photos, plan on about **8 rows** on a sheet that has only the table and the note.

## What does not change

- Cover, price, scope, savings, and thank-you pages.
- The eight materials, their text, and the this-quote / last-used save.
- Regular / Premium pricing.
- B2B quotations.
- No new database table. No migration.

## Done when

- On a solar PDF, Warranty & service is fully visible, including its last row.
- System package uses a second sheet rather than cutting the bottom.
- Each materials photo is 72px and the quantity column is still on the page.
- Previous work is on the sheet after the materials table, not underneath a clipped table.
