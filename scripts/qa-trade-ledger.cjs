#!/usr/bin/env node
const assert = require("assert");

function summarizeTradeEntries(lines) {
  let conversions = 0;
  let purchases = 0;
  let outwardAmount = 0;
  let inwardAmount = 0;
  let lastOutwardOn = null;
  let lastInwardOn = null;
  for (const line of lines) {
    const amt = Number(line.amount_inr) || 0;
    if (line.direction === "outward") {
      conversions += 1;
      outwardAmount += amt;
      if (!lastOutwardOn || line.occurred_on > lastOutwardOn) lastOutwardOn = line.occurred_on;
    } else {
      purchases += 1;
      inwardAmount += amt;
      if (!lastInwardOn || line.occurred_on > lastInwardOn) lastInwardOn = line.occurred_on;
    }
  }
  return { conversions, purchases, outwardAmount, inwardAmount, lastOutwardOn, lastInwardOn };
}

const empty = summarizeTradeEntries([]);
assert.strictEqual(empty.conversions, 0);
assert.strictEqual(empty.outwardAmount, 0);

const mixed = summarizeTradeEntries([
  { direction: "outward", amount_inr: 100000, occurred_on: "2026-09-20" },
  { direction: "inward", amount_inr: 80000, occurred_on: "2026-09-22" },
  { direction: "outward", amount_inr: 20000, occurred_on: "2026-08-01" },
]);
assert.strictEqual(mixed.conversions, 2);
assert.strictEqual(mixed.purchases, 1);
assert.strictEqual(mixed.outwardAmount, 120000);
assert.strictEqual(mixed.inwardAmount, 80000);
assert.strictEqual(mixed.lastOutwardOn, "2026-09-20");
assert.notStrictEqual(mixed.conversions, mixed.purchases);

function compareDeskSort(a, b, sort) {
  if (sort === "conversions") return (b.conversions || 0) - (a.conversions || 0);
  if (sort === "earnings") return (b.earningsInr || 0) - (a.earningsInr || 0);
  return 0;
}
assert.ok(
  compareDeskSort({ conversions: 3 }, { conversions: 1 }, "conversions") < 0
);
assert.ok(compareDeskSort({ earningsInr: 10 }, { earningsInr: 50 }, "earnings") > 0);

console.log("qa-trade-ledger: PASS (8 cases)");
