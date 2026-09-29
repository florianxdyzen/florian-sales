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
function endOfIstDay(now) {
  return new Date(startOfIstDay(now).getTime() + 24 * 60 * 60 * 1000);
}
function classifyCallQueue(nextCallAt, now) {
  if (!nextCallAt) return "unscheduled";
  const due = new Date(nextCallAt);
  const start = startOfIstDay(now);
  const end = endOfIstDay(now);
  if (due < start) return "overdue";
  if (due < end) return "due_today";
  return "scheduled";
}
function isRecycleEligible(input, now, cycleDays) {
  const temp = input.temperature ?? "warm";
  if (temp === "hot") return false;
  if (input.sales_stage === "lost") return false;
  const raw = input.last_call_at || input.created_at;
  if (!raw) return true;
  return now.getTime() - new Date(raw).getTime() >= cycleDays * 86400000;
}

const now = new Date("2026-09-25T12:00:00+05:30");
assert.strictEqual(classifyCallQueue(null, now), "unscheduled");
assert.strictEqual(classifyCallQueue("2026-09-24T10:00:00+05:30", now), "overdue");
assert.strictEqual(classifyCallQueue("2026-09-25T15:00:00+05:30", now), "due_today");
assert.strictEqual(classifyCallQueue("2026-09-26T09:00:00+05:30", now), "scheduled");
assert.strictEqual(
  isRecycleEligible({ temperature: "hot", last_call_at: "2026-01-01T00:00:00Z" }, now, 30),
  false
);
assert.strictEqual(
  isRecycleEligible(
    { temperature: "cold", last_call_at: "2026-08-01T00:00:00Z", sales_stage: "new_lead" },
    now,
    30
  ),
  true
);
assert.strictEqual(
  isRecycleEligible(
    { temperature: "warm", last_call_at: "2026-09-20T00:00:00Z", sales_stage: "new_lead" },
    now,
    30
  ),
  false
);
console.log("qa-calling-cycle: PASS (7 cases)");
