import {
  normalizeSolarTemplate,
  type SolarProposalTemplate,
} from "@/lib/quotations/quotation-template";

const SNAPSHOT_KEYS = [
  "acCable",
  "dcCable",
  "cableBrand",
  "acdb",
  "dcdb",
  "netMeter",
  "earthPits",
  "lightningArrestor",
  "structureDesc",
  "bosWarranty",
  "panelWarranty",
  "panelPerfWarranty",
  "inverterWarranty",
  "termsText",
  "paymentDetailsIntro",
  "loanPaymentNote",
  "advancePct",
  "materialPct",
  "installPct",
  "meterPct",
  "ourScope",
  "customerScope",
  "offerLeadText",
  "requiredDocuments",
] as const satisfies ReadonlyArray<keyof SolarProposalTemplate>;

export type TemplateSnapshot = Partial<SolarProposalTemplate>;

export function pickTemplateSnapshot(template: SolarProposalTemplate): TemplateSnapshot {
  const out: TemplateSnapshot = {};
  for (const key of SNAPSHOT_KEYS) {
    (out as Record<string, unknown>)[key] = template[key];
  }
  return out;
}

/** Live company template, overlaying fields frozen on the quotation at save time. */
export function mergeTemplateWithSnapshot(
  live: SolarProposalTemplate,
  snapshot: unknown
): SolarProposalTemplate {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) return live;
  return normalizeSolarTemplate({ ...live, ...(snapshot as Record<string, unknown>) });
}
