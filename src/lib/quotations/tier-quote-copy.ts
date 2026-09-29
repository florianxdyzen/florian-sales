/** Tier-specific structure & warranty copy shown on solar proposals. */

export type QuoteTierCopy = {
  structureMounting: string;
  structureRafter: string;
  warrantyRows: Array<{ label: string; value: string }>;
};

export const PREMIUM_TIER_COPY: QuoteTierCopy = {
  structureMounting: "80 Micron HDGI 80×40 mm",
  structureRafter: "60×40 mm",
  warrantyRows: [
    { label: "Panel warranty", value: "30 years" },
    { label: "Inverter warranty", value: "10 years" },
    { label: "Structure warranty", value: "12 years" },
    { label: "Maintenance", value: "10 years free" },
  ],
};

export const REGULAR_TIER_COPY: QuoteTierCopy = {
  structureMounting: "80 Micron HDGI 60×40 mm",
  structureRafter: "40×40 mm",
  warrantyRows: [
    { label: "Panel performance warranty", value: "30 years" },
    { label: "Inverter warranty", value: "10 years" },
    { label: "Free maintenance service", value: "5 years" },
  ],
};

export function quoteTierCopy(tier: "premium" | "regular" | null | undefined): QuoteTierCopy {
  return tier === "regular" ? REGULAR_TIER_COPY : PREMIUM_TIER_COPY;
}
