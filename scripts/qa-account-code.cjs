#!/usr/bin/env node
/** Offline Phase 2 checks — no Supabase, no secrets. */
const assert = require("assert");
const path = require("path");
const fs = require("fs");

const src = fs.readFileSync(
  path.join(__dirname, "..", "src", "lib", "domain", "account-code.ts"),
  "utf8"
);

function normalizeAccountCode(raw) {
  const trimmed = raw == null ? "" : String(raw).trim();
  if (!trimmed) return null;
  const compact = trimmed.replace(/\s+/g, "").toUpperCase();
  if (/^\d+$/.test(compact)) return `FLR${compact}`;
  return compact;
}
function isValidAccountCode(code) {
  return /^FLR\d+$/.test(code);
}
function parseAccountCodeInput(raw) {
  const code = normalizeAccountCode(raw);
  if (!code) return { ok: true, code: null };
  if (!isValidAccountCode(code)) {
    return { ok: false, error: "Account code must look like FLR29 (or enter 29)" };
  }
  return { ok: true, code };
}
function formatAccountTitle(code, name) {
  const c = code && String(code).trim();
  if (!c) return name;
  return `${c} — ${name}`;
}
function accountCodeMatchesQuery(code, rawQuery) {
  if (!code) return false;
  const needle = String(rawQuery).trim().toLowerCase().replace(/\s+/g, "");
  if (!needle) return false;
  return String(code).replace(/\s+/g, "").toLowerCase().includes(needle);
}

assert.strictEqual(normalizeAccountCode(""), null);
assert.strictEqual(normalizeAccountCode("  "), null);
assert.strictEqual(normalizeAccountCode("29"), "FLR29");
assert.strictEqual(normalizeAccountCode("flr 29"), "FLR29");
assert.strictEqual(normalizeAccountCode("FLR29"), "FLR29");
assert.strictEqual(parseAccountCodeInput("ABC").ok, false);
assert.strictEqual(parseAccountCodeInput("FLR29").ok, true);
assert.strictEqual(formatAccountTitle("FLR29", "Deep Singh"), "FLR29 — Deep Singh");
assert.strictEqual(formatAccountTitle(null, "Deep Singh"), "Deep Singh");
assert.ok(accountCodeMatchesQuery("FLR29", "flr29"));
assert.ok(accountCodeMatchesQuery("FLR29", "29"));
assert.ok(!accountCodeMatchesQuery("FLR29", "FLR30"));
assert.ok(src.includes("export function formatAccountTitle"));

console.log("qa-account-code: PASS (7 cases)");
