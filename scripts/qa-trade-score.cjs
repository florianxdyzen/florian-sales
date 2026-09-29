#!/usr/bin/env node
const assert = require("assert");

function startOfIstDay(now) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return new Date(`${parts}T00:00:00+05:30`);
}
function classifyCallQueue(nextCallAt, now) {
  if (!nextCallAt) return "unscheduled";
  const due = new Date(nextCallAt);
  const start = startOfIstDay(now);
  const end = new Date(start.getTime() + 86400000);
  if (due < start) return "overdue";
  if (due < end) return "due_today";
  return "scheduled";
}
function scoreTradeActivity(input, now) {
  return {
    conversions: Number(input.conversions ?? 0) || 0,
    earningsInr: Number(input.earningsInr ?? 0) || 0,
    followUpDue: classifyCallQueue(input.nextFollowupAt, now) === "overdue",
  };
}
function compareCallingDesk(a, b) {
  const hotA = a.temperature === "hot" ? 0 : 1;
  const hotB = b.temperature === "hot" ? 0 : 1;
  return hotA - hotB;
}

const now = new Date("2026-09-25T12:00:00+05:30");
assert.strictEqual(scoreTradeActivity({ conversions: 2, earningsInr: 99 }, now).conversions, 2);
assert.strictEqual(scoreTradeActivity({ lastOutwardOn: "2026-08-10" }, now).followUpDue, false);
assert.strictEqual(
  scoreTradeActivity({ nextFollowupAt: "2026-09-20T10:00:00+05:30" }, now).followUpDue,
  true
);
assert.ok(compareCallingDesk({ temperature: "hot" }, { temperature: "cold" }) < 0);
assert.ok(compareCallingDesk({ temperature: "cold" }, { temperature: "hot" }) > 0);
assert.strictEqual(scoreTradeActivity({ earningsInr: 50 }, now).earningsInr, 50);
console.log("qa-trade-score: PASS (6 cases)");
