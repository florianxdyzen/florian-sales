import type { ProposalLineItem } from "@/lib/quotations/solar-proposal-calculations";

export type FlorianBomItem = {
  id: string;
  component: string;
  specification: string;
  unit: string;
  quantity: string;
  make: string;
  imageUrl: string;
};

export const FLORIAN_SAMPLE_BOM: FlorianBomItem[] = [
  {
    id: "modules",
    component: "Solar PV modules",
    specification: "615 Wp TOPCon bi-facial",
    unit: "Nos",
    quantity: "panel count",
    make: "Waaree",
    imageUrl: "/brand/bom-florian/01-modules.jpg",
  },
  {
    id: "inverter",
    component: "Solar PV inverter",
    specification: "On-grid, IS & IEC",
    unit: "Nos",
    quantity: "1",
    make: "PV Blink",
    imageUrl: "/brand/bom-florian/02-inverter.jpg",
  },
  {
    id: "structure",
    component: "Mounting structure",
    specification: "Hot-dip galvanized iron, 80 micron. Pipe 60×40 mm and 40×40 mm.",
    unit: "Lot",
    quantity: "As per design",
    make: "Hot dip galvanized iron",
    imageUrl: "/brand/bom-florian/03-structure.jpg",
  },
  {
    id: "cable",
    component: "AC / DC cable",
    specification: "UV resistant, halogen free. DC 4.0 sq mm. AC aluminium, ISI.",
    unit: "Mtr",
    quantity: "At actual",
    make: "DC: Polycab. AC: ISI aluminium",
    imageUrl: "/brand/bom-florian/04-cable.jpg",
  },
  {
    id: "acdb",
    component: "ACDB / DCDB",
    specification: "MCB. SPD. ACDB 1, DCDB 1.",
    unit: "Nos",
    quantity: "1 + 1",
    make: "Polycab / Schneider, SES. SPD: L&T / Finder",
    imageUrl: "/brand/bom-florian/05-acdb.jpg",
  },
  {
    id: "earthing",
    component: "Earthing cable / LA cable",
    specification: "UV resistant. 16 sq mm and 25 sq mm.",
    unit: "Mtr",
    quantity: "At actual",
    make: "Earthing: Kingber",
    imageUrl: "/brand/bom-florian/06-earthing.jpg",
  },
  {
    id: "arrestor",
    component: "Lightning arrestor",
    specification: "Copper coated, 4 spike. 1 LA and 3 earthing.",
    unit: "Nos",
    quantity: "4 nos set",
    make: "As per design",
    imageUrl: "/brand/bom-florian/07-arrestor.jpg",
  },
  {
    id: "jhook",
    component: "J hook",
    specification: "Stainless steel M8-304. 4 pieces per panel.",
    unit: "Lot",
    quantity: "4 per panel",
    make: "Stainless steel",
    imageUrl: "/brand/bom-florian/08-jhook.jpg",
  },
];

export function cloneFlorianSampleBom(): FlorianBomItem[] {
  return FLORIAN_SAMPLE_BOM.map((row) => ({ ...row }));
}

export function parseFlorianBom(value: unknown): FlorianBomItem[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const rows: FlorianBomItem[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const row = raw as Record<string, unknown>;
    const component = typeof row.component === "string" ? row.component.trim() : "";
    if (!component) continue;
    const id = typeof row.id === "string" && row.id.trim() ? row.id.trim() : `row-${rows.length + 1}`;
    rows.push({
      id,
      component,
      specification: typeof row.specification === "string" ? row.specification : "",
      unit: typeof row.unit === "string" ? row.unit : "",
      quantity: typeof row.quantity === "string" ? row.quantity : "",
      make: typeof row.make === "string" ? row.make : "",
      imageUrl: typeof row.imageUrl === "string" ? row.imageUrl : "",
    });
  }
  return rows.length ? rows : null;
}

export type FlorianBomSystem = {
  panelCount?: number | null;
  wattPeakLabel?: string | null;
  inverterSize?: string | null;
};

/** Fill module quantity, watt peak, and inverter size from the quote when the row is still the sample wording. */
export function presentFlorianBom(rows: FlorianBomItem[], system: FlorianBomSystem): FlorianBomItem[] {
  const sampleById = new Map(FLORIAN_SAMPLE_BOM.map((row) => [row.id, row]));
  const panels = Number(system.panelCount) > 0 ? Math.round(Number(system.panelCount)) : 0;
  const watts = (system.wattPeakLabel ?? "").match(/(\d{2,4})/)?.[1];
  const inverterSize = (system.inverterSize ?? "").trim();

  return rows.map((row) => {
    const sample = sampleById.get(row.id);
    if (row.id === "modules") {
      const specification =
        sample && row.specification === sample.specification && watts
          ? row.specification.replace(/\d+\s*Wp/i, `${watts} Wp`)
          : row.specification;
      const quantity =
        sample && row.quantity === sample.quantity && panels > 0 ? String(panels) : row.quantity;
      return { ...row, specification, quantity };
    }
    if (row.id === "inverter") {
      const specification =
        sample && row.specification === sample.specification && inverterSize
          ? `${row.specification}. ${inverterSize}`
          : row.specification;
      return { ...row, specification };
    }
    if (row.id === "jhook" && sample && row.quantity === sample.quantity && panels > 0) {
      return { ...row, quantity: `${panels * 4} pcs` };
    }
    return row;
  });
}

export function florianBomPrintLines(rows: FlorianBomItem[]): ProposalLineItem[] {
  return rows.map((row) => ({
    item_name_snapshot: row.component,
    brand_snapshot: row.make || null,
    model_snapshot: row.specification || null,
    quantity: 0,
    unit: [row.quantity, row.unit].filter(Boolean).join(" "),
    rate: 0,
    gst_percent: 0,
    line_total: 0,
    image_url_snapshot: row.imageUrl.trim() || null,
    qty_label: [row.quantity, row.unit].filter(Boolean).join(" "),
  }));
}
