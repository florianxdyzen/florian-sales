# Florian Sales — Solar quotation bill of materials

**App:** `Apps/Florian-Sales` only  
**Date:** 2026-11-02  
**Status:** Built in the app. Not deployed. Apply migration `063` in Supabase before saving a list. Do not deploy until asked.  
**Sample:** `LALJI_SHIVJI_BHAI.pdf` (Florian Venture, 19 Aug 2026, Lalji Shivjibhai, 7.5 kW industrial). Material list is pages 3–4.  
**Pattern:** Sumeru Solutions quotation BOM (`Apps/SUMERU-SOLUTIONS/src/components/quotations/bom-items-panel.tsx`), not the Sumeru ops CRM.

## What is wrong today

The solar PDF already has a materials table. Those rows come from catalogue items named `REGULAR-BOM-*` / `PREMIUM-BOM-*`, with photos from `image_url` or from files under `public/brand/bom-regular` and `bom-premium`. Those static files are not in this app. The printed list is not the eight lines in the Florian sample.

`standardBomItems` on the company template is a second, unused-looking list (premium HDGI, Polycab, Schneider). The solar builder does not let staff change a row photo, and it does not remember a last-used list the way Sumeru does.

## What this revision does

On a **solar** quotation only:

1. Show the eight materials from the sample, each with its photo.
2. Let staff replace a photo (upload or URL), and edit make, specification, and quantity.
3. **Change only for this quotation** is on by default. Edits stay on that quote.
4. If that box is turned off, the same edits become the **last-used** list. The next solar quote opens with that list.
5. **Reset to sample** puts the eight PDF lines and their photos back on this quote. It does not change last-used unless the box is off and the user then saves.

B2B quotations stay as they are. Regular / Premium still chooses the ₹/kW rate. It does not swap this material list. The sample is one Florian list, not a second premium kit.

Customer figures on the sample (10 panels, 7 kW inverter, 7.5 kW, ₹2,62,500, GEDA, PGVCL) are an example. A new quote still takes panel count, watt peak, and inverter size from System Details. Those three values fill the module and inverter rows. The other six rows keep the sample quantities (“As per design”, “At actual”, “1”, “4 per panel”).

Bank details, payment terms, and warranty text in the sample are out of this revision.

## The eight lines

Photos below are the pictures that appear only on pages 3 and 4 of the sample. The header logos that repeat on every page are not material photos. Copy the eight files into `public/brand/bom-florian/` when this is built. Do not draw new product art.

| # | Equipment | Specification | Unit / qty | Make | Photo from the sample |
|---|-----------|---------------|------------|------|------------------------|
| 1 | Solar PV modules | 615 Wp TOPCon bi-facial. Watt peak on the quote replaces 615 when the user has set one. Quantity is the panel count. | Nos | Waaree | Rooftop array photo (the sample’s module picture, not a Waaree close-up) |
| 2 | Solar PV inverter | On-grid, IS & IEC. Size comes from the quote inverter. | Nos, 1 | PV Blink | White PV Blink inverter |
| 3 | Mounting structure | Hot-dip galvanized iron, 80 micron. Pipe 60×40 mm and 40×40 mm. | Lot, as per design | Hot dip galvanized iron | Square GI tubes |
| 4 | AC / DC cable | UV resistant, halogen free. DC 4.0 sq mm. AC aluminium, ISI. | Mtr, at actual | DC: Polycab. AC: ISI aluminium | Red and black cable coils |
| 5 | ACDB / DCDB | MCB. SPD. ACDB 1, DCDB 1. | Nos | Polycab / Schneider, SES. SPD: L&T / Finder | Open distribution box |
| 6 | Earthing cable / LA cable | UV resistant. 16 sq mm and 25 sq mm. | Mtr | Earthing: Kingber | Green cable coil |
| 7 | Lightning arrestor | Copper coated, 4 spike. 1 LA and 3 earthing. | Nos, 4 nos set | As per design | Spike on a pole |
| 8 | J hook | Stainless steel M8-304. 4 pieces per panel. | Lot, as per panel count | Stainless steel | J-shaped hook |

Printed photos stay in the existing 44px frame so the name, make, and quantity stay on the page.

## How saving works

Same rule as Sumeru. Do not copy Sumeru’s stock search, rates, or GST onto these rows. This list is materials and photos. System price stays on the offer page.

| Control | Default | What is stored |
|---------|---------|----------------|
| Change only for this quotation | On | `quotations.bom_items` for this quote. Company template and last-used list are left alone. |
| That box off | — | This quote’s `bom_items`, and `quotation_company_settings.last_bom_items`, so the next solar quote starts there. The company logo is not changed. |
| Reset to sample | Button | This quote’s rows return to the eight lines above. |

A new solar quote with no last-used list starts from the sample. A new solar quote with a last-used list starts from that list. Opening an existing quote shows its own `bom_items`. An accepted quote is not rewritten.

Each row stores: component, specification, unit, quantity text, make, image URL. Upload uses the catalogue image path already limited to 8 MB.

## Data

Next migration is **`063`**. Do not rebuild `run_all_migrations.sql` onto the live database. Add only:

- `quotations.bom_items jsonb`
- `quotation_company_settings.last_bom_items jsonb`

Both nullable. Empty means “use the sample list”. No new money table. No service-role key in the app.

## Where it shows

- Solar quote builder, after System Details: the eight rows, thumbnail, image URL, upload, the checkbox, and Reset to sample.
- Solar PDF materials page: these rows and their photos, instead of the `REGULAR-BOM-*` / `PREMIUM-BOM-*` catalogue dump.
- Template editor is not a second editor for this list. Last-used is the saved configuration. The sample is the one-time starting point.

## Out of scope

- B2B / appliance quotations
- Replacing Regular / Premium pricing
- Copying the sample’s bank, GST split, GEDA fees, or warranty paragraphs
- New images that are not the eight sample photos or a file the user uploads
- Deploy

## Done when

- A new solar quote shows the eight lines and the eight sample photos.
- Changing a photo with the checkbox on changes that quote’s PDF only.
- Turning the checkbox off and editing makes the next new solar quote open with that photo and text.
- Reset to sample restores the table above on the current quote.
- Name, make, and quantity remain on the printed page beside the photo.
