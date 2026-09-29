import { scoreTradeActivity } from "@/lib/domain/trade-score";

/** Plan §7.3 — dated trade lines. Summary is conversions + ₹, not qty offset. */

export const TRADE_DIRECTIONS = ["outward", "inward"] as const;
export type TradeDirection = (typeof TRADE_DIRECTIONS)[number];

export const TRADE_SKU_DIRECTIONS = ["outward", "inward", "both"] as const;
export type TradeSkuDirection = (typeof TRADE_SKU_DIRECTIONS)[number];

export const TRADE_FAMILIES = ["combo", "bos", "panel", "hardware", "other"] as const;
export type TradeFamily = (typeof TRADE_FAMILIES)[number];

export const TRADE_STATUSES = ["logged", "dispatched", "received"] as const;
export type TradeStatus = (typeof TRADE_STATUSES)[number];

export const TRADE_ATTACHMENT_KINDS = ["invoice", "gr", "purchase_bill", "other"] as const;
export type TradeAttachmentKind = (typeof TRADE_ATTACHMENT_KINDS)[number];

export const TRADE_FAMILY_LABELS: Record<TradeFamily, string> = {
  combo: "Combo boxes",
  bos: "BoS / electrical",
  panel: "PV panels",
  hardware: "Hardware / fasteners",
  other: "Other",
};

export const TRADE_DIRECTION_LABELS: Record<TradeDirection, string> = {
  outward: "Outward (we supplied)",
  inward: "Inward (we received)",
};

export const TRADE_STATUS_LABELS: Record<TradeStatus, string> = {
  logged: "Logged",
  dispatched: "Dispatched",
  received: "Received",
};

export const TRADE_ATTACHMENT_LABELS: Record<TradeAttachmentKind, string> = {
  invoice: "Sales invoice",
  gr: "GR / lorry",
  purchase_bill: "Purchase bill",
  other: "Other",
};

export type TradeLineInput = {
  direction: TradeDirection;
  family?: string | null;
  qty?: number;
  amount_inr?: number | null;
  occurred_on: string;
};

export type TradeFamilyQty = {
  family: TradeFamily;
  outwardQty: number;
  inwardQty: number;
};

export type TradeSummary = {
  conversions: number;
  purchases: number;
  outwardAmount: number;
  inwardAmount: number;
  lastOutwardOn: string | null;
  lastInwardOn: string | null;
  byFamily: TradeFamilyQty[];
  followUpDue: boolean;
};

function asFamily(raw: string | null | undefined): TradeFamily {
  return (TRADE_FAMILIES as readonly string[]).includes(raw ?? "")
    ? (raw as TradeFamily)
    : "other";
}

function num(n: number | string | null | undefined): number {
  const v = typeof n === "string" ? Number(n) : n;
  return Number.isFinite(v) ? Number(v) : 0;
}

export function daysBetween(fromIso: string, to = new Date()): number {
  const from = new Date(fromIso);
  if (Number.isNaN(from.getTime())) return 0;
  return (to.getTime() - from.getTime()) / 86400000;
}

export function summarizeTradeEntries(
  lines: TradeLineInput[],
  now = new Date(),
  extras?: { nextFollowupAt?: string | null }
): TradeSummary {
  const familyMap = new Map<TradeFamily, TradeFamilyQty>();
  for (const f of TRADE_FAMILIES) {
    familyMap.set(f, { family: f, outwardQty: 0, inwardQty: 0 });
  }

  let conversions = 0;
  let purchases = 0;
  let outwardAmount = 0;
  let inwardAmount = 0;
  let lastOutwardOn: string | null = null;
  let lastInwardOn: string | null = null;

  for (const line of lines) {
    const amt = num(line.amount_inr);
    const family = asFamily(line.family);
    const row = familyMap.get(family)!;
    if (line.direction === "outward") {
      conversions += 1;
      outwardAmount += amt;
      row.outwardQty += 1;
      if (!lastOutwardOn || line.occurred_on > lastOutwardOn) lastOutwardOn = line.occurred_on;
    } else {
      purchases += 1;
      inwardAmount += amt;
      row.inwardQty += 1;
      if (!lastInwardOn || line.occurred_on > lastInwardOn) lastInwardOn = line.occurred_on;
    }
  }

  const score = scoreTradeActivity(
    {
      lastOutwardOn,
      lastInwardOn,
      conversions,
      earningsInr: outwardAmount,
      nextFollowupAt: extras?.nextFollowupAt,
    },
    now
  );

  return {
    conversions,
    purchases,
    outwardAmount,
    inwardAmount,
    lastOutwardOn,
    lastInwardOn,
    byFamily: TRADE_FAMILIES.map((f) => familyMap.get(f)!).filter(
      (r) => r.outwardQty > 0 || r.inwardQty > 0
    ),
    followUpDue: score.followUpDue,
  };
}

export function defaultStatusForDirection(direction: TradeDirection): TradeStatus {
  return direction === "outward" ? "logged" : "logged";
}

export function tradeMissingTableError(message: string): string | null {
  if (/trade_entries|trade_skus|trade_entry_attachments/i.test(message) && /does not exist|schema cache/i.test(message)) {
    return "Apply supabase/migrations/057_trade_ledger.sql and 060_discovery_lock.sql on this database.";
  }
  return null;
}
