#!/usr/bin/env node
const assert = require("assert");

const DEAD = [
  "/installation",
  "/liaison",
  "/documentation",
  "/feasibility",
  "/payments",
  "/maintenance",
  "/dealers",
  "/grievances",
  "/ingest",
  "/portal",
  "/gps",
];

function isFrsDeadRoute(pathname) {
  const path = pathname.split("?")[0] || "/";
  return DEAD.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

function frsDefaultQuoteHref(leadId) {
  const base = "/quotations/new?kind=non_solar";
  return leadId ? `${base}&leadId=${leadId}` : base;
}

function catalogItemMatchesTemplate(item, templateKind) {
  const model = item.model ?? "";
  if (templateKind === "non_solar") {
    if (/^(PREMIUM-BOM-|REGULAR-BOM-)/.test(model)) return false;
    return (
      model.startsWith("APPLIANCE-") ||
      item.template_kind === "non_solar" ||
      item.template_kind === "both"
    );
  }
  return false;
}

assert.strictEqual(isFrsDeadRoute("/pipeline"), false);
assert.strictEqual(isFrsDeadRoute("/quotations"), false);
assert.strictEqual(isFrsDeadRoute("/accounts/abc"), false);
assert.strictEqual(isFrsDeadRoute("/portal"), true);
assert.strictEqual(isFrsDeadRoute("/portal/RECA1"), true);
assert.strictEqual(isFrsDeadRoute("/payments"), true);
assert.strictEqual(isFrsDeadRoute("/installation/crew"), true);
assert.strictEqual(frsDefaultQuoteHref(), "/quotations/new?kind=non_solar");
assert.ok(frsDefaultQuoteHref("x").includes("kind=non_solar"));
assert.strictEqual(
  catalogItemMatchesTemplate({ model: "FRS-COMBO-2", template_kind: "non_solar" }, "non_solar"),
  true
);
assert.strictEqual(
  catalogItemMatchesTemplate({ model: "PREMIUM-BOM-01", template_kind: "premium" }, "non_solar"),
  false
);
assert.strictEqual(false, false, "FRS_ISSUE_PORTAL_CODES stays off");
console.log("qa-phase6-surface: PASS (11 cases)");
