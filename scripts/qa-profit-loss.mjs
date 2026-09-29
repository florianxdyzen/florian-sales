import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildProfitLoss, resolveProfitRange } from "../src/lib/domain/profit-loss.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function line(partial) {
  return {
    direction: "outward",
    occurredOn: "2026-09-15",
    amountInr: 1000,
    leadId: "a",
    accountLabel: "FLR1 — A",
    skuKey: "sku-1",
    skuLabel: "Panel",
    ...partial,
  };
}

const september = resolveProfitRange({
  period: "this",
  now: new Date("2026-09-30T18:00:00Z"),
});
assert.equal(september.range.from, "2026-09-01");
assert.equal(september.range.to, "2026-09-30");
assert.equal(september.error, null);

const october = resolveProfitRange({
  period: "this",
  now: new Date("2026-09-30T20:00:00Z"),
});
assert.equal(october.range.from, "2026-10-01");
assert.equal(october.range.label, "This month");

const last = resolveProfitRange({
  period: "last",
  now: new Date("2026-09-15T06:00:00Z"),
});
assert.equal(last.range.from, "2026-08-01");
assert.equal(last.range.to, "2026-08-31");

const swapped = resolveProfitRange({
  period: "custom",
  from: "2026-09-20",
  to: "2026-09-01",
});
assert.equal(swapped.range.from, "2026-09-01");
assert.equal(swapped.range.to, "2026-09-20");

const badDay = resolveProfitRange({
  period: "custom",
  from: "2026-02-31",
  to: "2026-03-01",
  now: new Date("2026-09-15T06:00:00Z"),
});
assert.equal(badDay.error, "Choose a start and end date.");
assert.equal(badDay.range.from, "2026-09-01");

const report = buildProfitLoss(
  [
    line({ amountInr: 10000 }),
    line({ direction: "inward", amountInr: 4000, skuKey: "sku-2", skuLabel: "Bolt", leadId: "b", accountLabel: "FLR2 — B" }),
    line({ amountInr: null, leadId: "a" }),
    line({ amountInr: 0, occurredOn: "2026-08-02" }),
  ],
  { from: "2026-09-01", to: "2026-09-30" }
);

assert.equal(report.sales, 10000);
assert.equal(report.purchases, 4000);
assert.equal(report.grossProfit, 6000);
assert.equal(report.marginPercent, 60);
assert.equal(report.missingAmountCount, 1);
assert.equal(report.accounts[0].key, "a");
assert.equal(report.accounts[0].grossProfit, 10000);
assert.equal(report.accounts[1].grossProfit, -4000);
assert.equal(report.skus.find((row) => row.key === "sku-2").purchases, 4000);
assert.equal(report.trend.length, 1);
assert.equal(report.trend[0].missingAmountCount, 1);

const loss = buildProfitLoss(
  [line({ direction: "inward", amountInr: 500, occurredOn: "2026-09-02" })],
  { from: "2026-09-01", to: "2026-09-30" }
);
assert.equal(loss.sales, 0);
assert.equal(loss.grossProfit, -500);
assert.equal(loss.marginPercent, null);

const span = buildProfitLoss(
  [line({ occurredOn: "2026-10-02", amountInr: 200 })],
  { from: "2026-09-15", to: "2026-10-10" }
);
assert.deepEqual(
  span.trend.map((row) => row.key),
  ["2026-09", "2026-10"]
);
assert.equal(span.trend[0].sales, 0);
assert.equal(span.trend[1].sales, 200);

const nav = fs.readFileSync(path.join(root, "src/lib/nav-access.ts"), "utf8");
assert.match(nav, /case "\/profit":\s*return has\("view_profit"\);/);

const authorities = fs.readFileSync(path.join(root, "src/lib/domain/authorities.ts"), "utf8");
const accountsBlock = authorities.slice(
  authorities.indexOf("accounts: ["),
  authorities.indexOf("tele_caller: [")
);
assert.match(accountsBlock, /"view_profit"/);
const teleBlock = authorities.slice(
  authorities.indexOf("tele_caller: ["),
  authorities.indexOf("surveyor: [")
);
assert.doesNotMatch(teleBlock, /view_profit/);

console.log("qa-profit-loss: PASS");
