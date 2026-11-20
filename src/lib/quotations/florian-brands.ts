/** Fixed solar System Details brand chips for Florian Sales. */

export const FLORIAN_PANEL_COMPANIES = ["Waaree", "Adani", "APS", "Redren"] as const;
export type FlorianPanelCompany = (typeof FLORIAN_PANEL_COMPANIES)[number];

export const FLORIAN_INVERTER_MAKES = ["Polycab", "PV Blink", "Waaree", "KSolar"] as const;
export type FlorianInverterMake = (typeof FLORIAN_INVERTER_MAKES)[number];

export function normalizeFlorianPanelCompany(
  value: string | null | undefined
): FlorianPanelCompany | "" {
  const n = (value ?? "").trim().toLowerCase();
  if (!n) return "";
  if (n === "waaree" || n === "waree") return "Waaree";
  if (n === "adani") return "Adani";
  if (n === "aps") return "APS";
  if (n === "redren") return "Redren";
  for (const brand of FLORIAN_PANEL_COMPANIES) {
    if (n === brand.toLowerCase() || n.startsWith(`${brand.toLowerCase()} `)) return brand;
  }
  return "";
}

export function isFlorianPanelCompany(
  value: string | null | undefined
): value is FlorianPanelCompany {
  return normalizeFlorianPanelCompany(value) !== "";
}

export function normalizeFlorianInverterMake(
  value: string | null | undefined
): FlorianInverterMake | "" {
  const n = (value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
  if (!n) return "";
  if (n === "polycab") return "Polycab";
  if (n === "pv blink" || n === "pvblink" || n === "pv-blink") return "PV Blink";
  if (n === "waaree" || n === "waree") return "Waaree";
  if (n === "ksolar" || n === "k solar" || n === "k-solar") return "KSolar";
  for (const brand of FLORIAN_INVERTER_MAKES) {
    if (n === brand.toLowerCase() || n.startsWith(`${brand.toLowerCase()} `)) return brand;
  }
  return "";
}

export function isFlorianInverterMake(
  value: string | null | undefined
): value is FlorianInverterMake {
  return normalizeFlorianInverterMake(value) !== "";
}
