import { classifyCallQueue } from "@/lib/domain/calling-cycle";

export type DeskSort = "queue" | "conversions" | "earnings" | "last_outward";

export const DESK_SORT_OPTIONS: { value: DeskSort; label: string }[] = [
  { value: "queue", label: "Call queue" },
  { value: "conversions", label: "Conversions" },
  { value: "earnings", label: "Earnings ₹" },
  { value: "last_outward", label: "Last outward" },
];

export type TradeScore = {
  lastOutwardOn: string | null;
  lastInwardOn: string | null;
  conversions: number;
  earningsInr: number;
  followUpDue: boolean;
};

export function scoreTradeActivity(
  input: {
    lastOutwardOn?: string | null;
    lastInwardOn?: string | null;
    conversions?: number | null;
    earningsInr?: number | null;
    nextFollowupAt?: string | null;
  },
  now = new Date()
): TradeScore {
  const callOverdue = classifyCallQueue(input.nextFollowupAt, now) === "overdue";
  return {
    lastOutwardOn: input.lastOutwardOn ?? null,
    lastInwardOn: input.lastInwardOn ?? null,
    conversions: Number(input.conversions ?? 0) || 0,
    earningsInr: Number(input.earningsInr ?? 0) || 0,
    followUpDue: callOverdue,
  };
}

function num(n: number | null | undefined): number {
  return Number(n) || 0;
}

/** Optional list sorts — no hard 50-unit or 30-day pin. */
export function compareDeskSort(
  a: {
    conversions?: number | null;
    earningsInr?: number | null;
    lastOutwardOn?: string | null;
  },
  b: {
    conversions?: number | null;
    earningsInr?: number | null;
    lastOutwardOn?: string | null;
  },
  sort: DeskSort
): number {
  if (sort === "conversions") return num(b.conversions) - num(a.conversions);
  if (sort === "earnings") return num(b.earningsInr) - num(a.earningsInr);
  if (sort === "last_outward") {
    const ta = a.lastOutwardOn ? new Date(`${a.lastOutwardOn}T00:00:00`).getTime() : 0;
    const tb = b.lastOutwardOn ? new Date(`${b.lastOutwardOn}T00:00:00`).getTime() : 0;
    return tb - ta;
  }
  return 0;
}
