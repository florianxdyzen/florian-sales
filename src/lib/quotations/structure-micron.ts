/** Structure galvanizing micron for solar quotes (HDGI). */

export const STRUCTURE_MICRONS = [40, 60, 80] as const;
export type StructureMicron = (typeof STRUCTURE_MICRONS)[number];

export type MicronBand = "le2" | "gt2_le50" | "gt50" | "none";

/** ≤2 → 40; >2–≤50 → 60; >50 → 80. No capacity → 60 (mid default). */
export function defaultStructureMicron(systemKw: number): StructureMicron {
  if (!(systemKw > 0)) return 60;
  if (systemKw <= 2) return 40;
  if (systemKw <= 50) return 60;
  return 80;
}

export function micronBand(systemKw: number): MicronBand {
  if (!(systemKw > 0)) return "none";
  if (systemKw <= 2) return "le2";
  if (systemKw <= 50) return "gt2_le50";
  return "gt50";
}

export function parseStructureMicron(value: unknown): StructureMicron | null {
  const n = Number(value);
  if (n === 40 || n === 60 || n === 80) return n;
  return null;
}

/** Replace leading "NN Micron" (or "NN micron") in structure copy / BOM specs. */
export function applyMicronToSpec(spec: string, micron: StructureMicron): string {
  const trimmed = spec.trim();
  if (!trimmed) return `${micron} micron`;
  if (/\d+\s*micron/i.test(trimmed)) {
    return trimmed.replace(/\d+\s*micron/i, `${micron} micron`);
  }
  if (/\d+\s*Micron/i.test(trimmed)) {
    return trimmed.replace(/\d+\s*Micron/i, `${micron} Micron`);
  }
  return trimmed;
}
