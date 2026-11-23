import {
  isFlorianInverterMake,
  type FlorianInverterMake,
} from "@/lib/quotations/florian-brands";

/** Round system kW to 1 decimal for preference lookup (6 and 6.0 share a key). */
export function kwPrefKey(systemKw: number): string | null {
  if (!(systemKw > 0) || !Number.isFinite(systemKw)) return null;
  const rounded = Math.round(systemKw * 10) / 10;
  return String(rounded);
}

export type LastInverterPref = {
  make: string;
  sizeLabel: string;
  updatedAt?: string;
};

export type LastSubsidyUnder3Pref = {
  amount: number;
  scheme?: string;
  updatedAt?: string;
};

export function parseLastInverterByKw(raw: unknown): Record<string, LastInverterPref> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, LastInverterPref> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const row = value as Record<string, unknown>;
    const make = typeof row.make === "string" ? row.make.trim() : "";
    const sizeLabel = typeof row.sizeLabel === "string" ? row.sizeLabel.trim() : "";
    if (!make || !sizeLabel) continue;
    out[key] = {
      make,
      sizeLabel,
      updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : undefined,
    };
  }
  return out;
}

export function lookupLastInverter(
  map: Record<string, LastInverterPref>,
  systemKw: number
): { make: FlorianInverterMake; sizeLabel: string } | null {
  const key = kwPrefKey(systemKw);
  if (!key) return null;
  const hit = map[key];
  if (!hit) return null;
  if (!isFlorianInverterMake(hit.make)) return null;
  return { make: hit.make, sizeLabel: hit.sizeLabel };
}

export function mergeLastInverterByKw(
  existing: Record<string, LastInverterPref>,
  systemKw: number,
  make: string,
  sizeLabel: string
): Record<string, LastInverterPref> {
  const key = kwPrefKey(systemKw);
  if (!key || !make.trim() || !sizeLabel.trim()) return existing;
  return {
    ...existing,
    [key]: {
      make: make.trim(),
      sizeLabel: sizeLabel.trim(),
      updatedAt: new Date().toISOString(),
    },
  };
}

export function parseLastSubsidyUnder3(raw: unknown): LastSubsidyUnder3Pref | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const amount = Number(row.amount);
  if (!(amount >= 0) || !Number.isFinite(amount)) return null;
  return {
    amount,
    scheme: typeof row.scheme === "string" ? row.scheme : undefined,
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : undefined,
  };
}
