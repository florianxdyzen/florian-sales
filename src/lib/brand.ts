/** Florian brand constants (tenant). Platform credit: Dyzen. */
export const BRAND = {
  name: "Florian",
  shortName: "Florian",
  tagline: "Quality that you can trust",
  productLine: "Sales pipeline, quotations, and B2B trade",
  poweredBy: "Powered by Dyzen Solar Technologies",
  poweredByName: "Dyzen Solar Technologies",
  logoPath: "/brand/logo.jpeg",
  /** Cache-bust when the official mark is replaced. */
  logoCache: "florian-1",
} as const;

export const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  sales_manager: "Sales Manager",
  tele_caller: "Tele-caller",
  surveyor: "Field Surveyor",
  sales_executive: "Sales Executive",
  feasibility: "Feasibility",
  accounts: "Accounts",
  ops_coordinator: "Ops Coordinator",
  installation_crew: "Installation Crew",
  liaison: "Discom Liaison",
  service_engineer: "Service Engineer",
  service_supervisor: "Service Supervisor",
  dealer: "Dealer",
  customer: "Customer",
};
