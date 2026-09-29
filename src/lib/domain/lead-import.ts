export type ImportRowError = {
  rowNumber: number;
  message: string;
  name?: string;
  phone?: string;
};

/** Canonical import fields → spreadsheet header labels. */
export type LeadImportColumnMapping = {
  name?: string;
  phone?: string;
  address?: string;
  city?: string;
  requirement?: string;
  account_code?: string;
};

export const IMPORT_FIELD_LABELS: Record<keyof LeadImportColumnMapping, string> = {
  name: "Name",
  phone: "Phone",
  address: "Address",
  city: "City",
  requirement: "Requirement / notes",
  account_code: "Account code",
};

export const IMPORT_FIELD_ALIASES: Record<keyof LeadImportColumnMapping, string[]> = {
  name: ["name", "customer_name", "lead_name"],
  phone: ["phone", "mobile", "contact", "phone_number"],
  address: ["address", "location"],
  city: ["city"],
  requirement: ["requirement", "requirements", "notes"],
  account_code: ["account_code", "account", "code", "frs_code", "party_code"],
};

export const IMPORT_CHUNK_SIZE = 150;
