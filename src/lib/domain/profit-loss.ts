/** Company profit and loss from trade line rupees. Blank amounts are excluded. */

export type ProfitDirection = "outward" | "inward";

export type ProfitLine = {
  direction: ProfitDirection;
  /** Calendar date YYYY-MM-DD */
  occurredOn: string;
  amountInr: number | null;
  leadId: string;
  accountLabel: string;
  skuKey: string;
  skuLabel: string;
};

export type ProfitRange = {
  from: string;
  to: string;
  label: string;
};

export type ProfitBucket = {
  key: string;
  label: string;
  sales: number;
  purchases: number;
  grossProfit: number;
  missingAmountCount: number;
};

export type ProfitReport = {
  sales: number;
  purchases: number;
  grossProfit: number;
  /** Null when sales are 0. */
  marginPercent: number | null;
  missingAmountCount: number;
  accounts: ProfitBucket[];
  accountTotal: number;
  skus: ProfitBucket[];
  skuTotal: number;
  trend: ProfitBucket[];
};

const TOP = 25;
const MAX_MONTHS = 36;

export function istToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function monthBounds(year: number, month: number): { from: string; to: string } {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    from: `${year}-${pad(month)}-01`,
    to: `${year}-${pad(month)}-${pad(last)}`,
  };
}

export function resolveProfitRange(input: {
  period?: string | null;
  from?: string | null;
  to?: string | null;
  now?: Date;
}): { range: ProfitRange; error: string | null } {
  const today = istToday(input.now ?? new Date());
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const current = monthBounds(year, month);

  if (input.period === "last") {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;
    return { range: { ...monthBounds(prevYear, prevMonth), label: "Last month" }, error: null };
  }

  if (input.period === "custom") {
    const from = (input.from ?? "").trim();
    const to = (input.to ?? "").trim();
    if (!isIsoDate(from) || !isIsoDate(to)) {
      return {
        range: { ...current, label: "This month" },
        error: "Choose a start and end date.",
      };
    }
    let start = from;
    let end = to;
    if (start > end) {
      start = to;
      end = from;
    }
    if (monthKeys(start, end).length > MAX_MONTHS) {
      return {
        range: { ...current, label: "This month" },
        error: "Custom range is limited to 36 months.",
      };
    }
    return { range: { from: start, to: end, label: `${start} to ${end}` }, error: null };
  }

  return { range: { ...current, label: "This month" }, error: null };
}

export function buildProfitLoss(
  lines: ProfitLine[],
  range: { from: string; to: string }
): ProfitReport {
  let sales = 0;
  let purchases = 0;
  let missingAmountCount = 0;
  const accounts = new Map<string, MutableBucket>();
  const skus = new Map<string, MutableBucket>();
  const months = new Map<string, MutableBucket>();
  for (const key of monthKeys(range.from, range.to)) {
    months.set(key, emptyBucket(key, monthLabel(key)));
  }

  for (const line of lines) {
    const day = line.occurredOn.slice(0, 10);
    if (!isIsoDate(day) || day < range.from || day > range.to) continue;
    if (line.direction !== "outward" && line.direction !== "inward") continue;

    const missing = !hasAmount(line.amountInr);
    const rupees = missing ? 0 : line.amountInr;
    if (missing) missingAmountCount += 1;
    if (line.direction === "outward") sales += rupees;
    else purchases += rupees;

    apply(bucket(accounts, line.leadId, line.accountLabel), line.direction, rupees, missing);
    apply(bucket(skus, line.skuKey, line.skuLabel), line.direction, rupees, missing);
    const month = months.get(day.slice(0, 7));
    if (month) apply(month, line.direction, rupees, missing);
  }

  sales = round2(sales);
  purchases = round2(purchases);
  const grossProfit = round2(sales - purchases);

  return {
    sales,
    purchases,
    grossProfit,
    marginPercent: sales > 0 ? Math.round((grossProfit / sales) * 1000) / 10 : null,
    missingAmountCount,
    accounts: rank(accounts),
    accountTotal: accounts.size,
    skus: rank(skus),
    skuTotal: skus.size,
    trend: [...months.values()].map(finish),
  };
}

type MutableBucket = ProfitBucket;

function hasAmount(amount: number | null): amount is number {
  return amount != null && Number.isFinite(amount);
}

function emptyBucket(key: string, label: string): MutableBucket {
  return { key, label, sales: 0, purchases: 0, grossProfit: 0, missingAmountCount: 0 };
}

function bucket(map: Map<string, MutableBucket>, key: string, label: string): MutableBucket {
  const existing = map.get(key);
  if (existing) return existing;
  const created = emptyBucket(key, label || "Untitled");
  map.set(key, created);
  return created;
}

function apply(
  row: MutableBucket,
  direction: ProfitDirection,
  rupees: number,
  missing: boolean
) {
  if (direction === "outward") row.sales += rupees;
  else row.purchases += rupees;
  if (missing) row.missingAmountCount += 1;
}

function finish(row: MutableBucket): ProfitBucket {
  return {
    ...row,
    sales: round2(row.sales),
    purchases: round2(row.purchases),
    grossProfit: round2(row.sales - row.purchases),
  };
}

function rank(map: Map<string, MutableBucket>): ProfitBucket[] {
  return [...map.values()]
    .map(finish)
    .sort((a, b) => b.grossProfit - a.grossProfit || b.sales - a.sales || a.label.localeCompare(b.label))
    .slice(0, TOP);
}

function monthKeys(from: string, to: string): string[] {
  const keys: string[] = [];
  let year = Number(from.slice(0, 4));
  let month = Number(from.slice(5, 7));
  const endYear = Number(to.slice(0, 4));
  const endMonth = Number(to.slice(5, 7));
  if (!year || !month || !endYear || !endMonth) return keys;
  while (year < endYear || (year === endYear && month <= endMonth)) {
    keys.push(`${year}-${pad(month)}`);
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
    if (keys.length > MAX_MONTHS) break;
  }
  return keys;
}

function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return new Intl.DateTimeFormat("en-IN", {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return month >= 1 && month <= 12 && day >= 1 && day <= last;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
