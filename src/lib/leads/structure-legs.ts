/** Structure legs captured at Won — two rows of heights (mm). */

export const MIN_STRUCTURE_LEGS = 2;
export const MAX_STRUCTURE_LEGS = 24;
export const DEFAULT_STRUCTURE_LEGS = 6;
export const STRUCTURE_ROW_LABELS = ["Row A", "Row B"] as const;

export type StructureLegHeights = {
  rows: number[][];
};

export function cellsPerRow(totalLegs: number): [number, number] {
  const n = clampLegCount(totalLegs);
  const first = Math.ceil(n / 2);
  return [first, n - first];
}

export function clampLegCount(totalLegs: number): number {
  const n = Math.floor(Number(totalLegs) || 0);
  return Math.min(MAX_STRUCTURE_LEGS, Math.max(MIN_STRUCTURE_LEGS, n));
}

export function emptyLegHeights(totalLegs: number): number[][] {
  const [a, b] = cellsPerRow(totalLegs);
  return [Array.from({ length: a }, () => 0), Array.from({ length: b }, () => 0)];
}

export function resizeLegHeights(totalLegs: number, current?: number[][] | null): number[][] {
  const next = emptyLegHeights(totalLegs);
  if (!current) return next;
  for (let r = 0; r < next.length; r++) {
    const src = current[r] ?? [];
    for (let i = 0; i < next[r].length; i++) {
      next[r][i] = Number(src[i]) > 0 ? Number(src[i]) : 0;
    }
  }
  return next;
}

/** Copy row cell 1 into later cells that are empty or still match the previous first value. */
export function applyRowFirstCopy(
  row: number[],
  nextFirst: number,
  previousFirst: number
): number[] {
  return row.map((value, index) => {
    if (index === 0) return nextFirst;
    if (!(Number(value) > 0) || value === previousFirst) return nextFirst;
    return value;
  });
}

export function parseStructureLegHeights(raw: unknown): StructureLegHeights | null {
  if (!raw || typeof raw !== "object") return null;
  const rows = (raw as { rows?: unknown }).rows;
  if (!Array.isArray(rows) || rows.length !== 2) return null;
  const parsed = rows.map((row) =>
    Array.isArray(row) ? row.map((h) => (Number(h) > 0 ? Number(h) : 0)) : []
  );
  if (parsed.length !== 2) return null;
  return { rows: parsed };
}

export function validateStructureLegs(
  totalLegs: number,
  heights: StructureLegHeights | null | undefined
): string[] {
  const errors: string[] = [];
  const n = Math.floor(Number(totalLegs) || 0);
  if (n < MIN_STRUCTURE_LEGS || n > MAX_STRUCTURE_LEGS) {
    errors.push(`Enter total legs between ${MIN_STRUCTURE_LEGS} and ${MAX_STRUCTURE_LEGS}`);
    return errors;
  }
  const expected = cellsPerRow(n);
  const rows = heights?.rows;
  if (!rows || rows.length !== 2) {
    errors.push("Enter heights for both structure rows");
    return errors;
  }
  for (let r = 0; r < 2; r++) {
    const row = rows[r] ?? [];
    if (row.length !== expected[r]) {
      errors.push("Structure leg heights do not match the total legs count");
      break;
    }
    if (row.some((h) => !(Number(h) > 0))) {
      errors.push("Enter a height (mm) greater than 0 for every leg");
      break;
    }
  }
  return errors;
}
