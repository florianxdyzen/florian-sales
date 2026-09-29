export type DiscountCaps = {
  maxDiscountPercent: number;
  maxDiscountPerKw: number;
};

export const DEFAULT_DISCOUNT_CAPS: DiscountCaps = {
  maxDiscountPercent: 0,
  maxDiscountPerKw: 0,
};

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

export function parseDiscountCaps(row: {
  max_discount_percent?: unknown;
  max_discount_per_kw?: unknown;
} | null | undefined): DiscountCaps {
  if (!row) return { ...DEFAULT_DISCOUNT_CAPS };
  return {
    maxDiscountPercent: num(row.max_discount_percent),
    maxDiscountPerKw: num(row.max_discount_per_kw),
  };
}

/** Owner discount limits are not enforced on Recare quotations. */
export function discountCapError(
  _input: {
    discountPercent?: number | null;
    discountAmount?: number | null;
    systemSizeKw?: number | null;
  },
  _caps?: DiscountCaps
): string | null {
  return null;
}

export function assertDiscountWithinCaps(
  _input: {
    discountPercent?: number | null;
    discountAmount?: number | null;
    systemSizeKw?: number | null;
  },
  _caps?: DiscountCaps
): void {
  // Recare: no Owner discount cap.
}
