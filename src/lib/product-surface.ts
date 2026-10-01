/** Florian Sales v1: consumer / warehouse / portal surfaces stay in the tree but are unsold. */

export const FRS_HIDDEN_NAV_HREFS = new Set([
  "/installation",
  "/liaison",
  "/documentation",
  "/feasibility",
  "/payments",
  "/maintenance",
  "/dealers",
  "/grievances",
  "/ingest",
]);

/** Also dead-routed (not only hidden from nav). */
export const FRS_DEAD_ROUTE_PREFIXES = [
  "/installation",
  "/liaison",
  "/documentation",
  "/feasibility",
  "/payments",
  "/maintenance",
  "/dealers",
  "/grievances",
  "/ingest",
  "/portal",
  "/gps",
] as const;

/** v1 identity is account code FLR## — do not mint customer portal codes. */
export const FRS_ISSUE_PORTAL_CODES = false;

/** Consumer Won / token / install / subsidy boards are not the sold path. */
export const FRS_ALLOW_CONSUMER_WON = false;

/** Discovery: show Create Quotation when the file is Survey Done. */
export const FRS_SHOW_QUOTE_ON_SURVEY_DONE = true;

export function isFrsHiddenHref(href: string): boolean {
  return FRS_HIDDEN_NAV_HREFS.has(href);
}

export function isFrsDeadRoute(pathname: string): boolean {
  const path = pathname.split("?")[0] || "/";
  return FRS_DEAD_ROUTE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  );
}

export function frsDefaultQuoteHref(leadId?: string | null): string {
  const base = "/quotations/new?kind=non_solar";
  return leadId ? `${base}&leadId=${leadId}` : base;
}

export function frsSolarQuoteHref(leadId?: string | null): string {
  const base = "/quotations/new?kind=solar";
  return leadId ? `${base}&leadId=${leadId}` : base;
}
