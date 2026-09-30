#!/usr/bin/env node
/**
 * Phase 3 acceptance checks.
 * Offline cases always run.
 * Signed-in cases use anon key + QA_OWNER password only.
 * Never reads SUPABASE_SERVICE_ROLE_KEY.
 */
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
const rows = [];

function rec(id, status, expected, actual) {
  rows.push({ id, status, expected, actual });
  console.log(`${status}\t${id}\t${actual}`);
}

function read(rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(root, rel));
}

const manifest = JSON.parse(read("public/manifest.webmanifest"));
rec(
  "pwa_theme",
  manifest.theme_color === "#1BA8E0" && manifest.name === "Florian" ? "PASS" : "FAIL",
  "Florian theme #1BA8E0",
  `${manifest.name} ${manifest.theme_color}`
);

const css = read("src/app/globals.css");
rec(
  "brand_primary",
  css.includes("--primary: #1BA8E0") && css.includes("--accent: #163A5C") ? "PASS" : "FAIL",
  "cyan primary, navy accent",
  css.includes("--primary: #1BA8E0") ? "tokens present" : "tokens missing"
);

rec(
  "logo",
  exists("public/brand/logo.png") && !exists("public/brand/logo.jpeg") ? "PASS" : "FAIL",
  "Florian png lockup",
  `png=${exists("public/brand/logo.png")} jpeg=${exists("public/brand/logo.jpeg")}`
);

const account = read("src/lib/domain/account-code.ts");
rec(
  "prefix_flr",
  account.includes('ACCOUNT_CODE_PREFIX = "FLR"') && read("supabase/migrations/007_quotations.sql").includes("DEFAULT 'FLR'")
    ? "PASS"
    : "FAIL",
  "Account and quote prefix FLR",
  account.includes('ACCOUNT_CODE_PREFIX = "FLR"') ? "FLR" : "missing"
);

const surface = read("src/lib/product-surface.ts");
const proxy = read("src/proxy.ts");
const dead = ["/installation", "/liaison", "/payments", "/portal", "/ingest"];
const deadOk = dead.every((href) => surface.includes(`"${href}"`)) && proxy.includes("isFrsDeadRoute");
rec("consumer_routes_blocked", deadOk ? "PASS" : "FAIL", "Portal, payments, install, liaison, ingest blocked", deadOk ? "listed and proxied" : "missing");

const authorities = read("src/lib/domain/authorities.ts");
const accountsBlock = authorities.slice(authorities.indexOf("accounts: ["), authorities.indexOf("tele_caller: ["));
const teleBlock = authorities.slice(authorities.indexOf("tele_caller: ["), authorities.indexOf("surveyor: ["));
const profitSql = read("supabase/migrations/061_view_profit.sql");
rec(
  "view_profit_roles",
  accountsBlock.includes('"view_profit"') &&
    !teleBlock.includes("view_profit") &&
    profitSql.includes("('admin', 'accounts')")
    ? "PASS"
    : "FAIL",
  "view_profit for admin and accounts only",
  "accounts and SQL grant checked"
);

rec(
  "profit_page",
  exists("src/app/(dashboard)/profit/page.tsx") && read("src/lib/nav-access.ts").includes('case "/profit"')
    ? "PASS"
    : "FAIL",
  "/profit gated by view_profit",
  "page and nav gate"
);

const srcFiles = [];
function walk(dir) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name === "node_modules" || ent.name === ".next") continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full);
    else if (/\.(ts|tsx)$/.test(ent.name)) srcFiles.push(full);
  }
}
walk(path.join(root, "src"));
const leaked = [];
for (const file of srcFiles) {
  const text = fs.readFileSync(file, "utf8");
  if (text.includes("FRS Solar") || text.includes("Miracle")) {
    leaked.push(path.relative(root, file));
  }
}
rec(
  "no_frs_miracle_copy",
  leaked.length === 0 ? "PASS" : "FAIL",
  "No FRS Solar or Miracle strings in src",
  leaked.length ? leaked.join(", ") : "clean"
);

const inventoryPkg = path.join(root, "..", "Florian", "package.json");
let inventoryName = "";
try {
  inventoryName = JSON.parse(fs.readFileSync(inventoryPkg, "utf8")).name;
} catch {
  inventoryName = "missing";
}
rec(
  "inventory_untouched_name",
  inventoryName === "florian" ? "PASS" : "FAIL",
  "Apps/Florian package name stays florian",
  inventoryName
);

function loadEnv() {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) return false;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] = value;
  }
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  return true;
}

async function live() {
  if (!loadEnv()) {
    for (const id of ["anon_trade_denied", "owner_login", "owner_reads_trade", "owner_profit_rows"]) {
      rec(id, "BLOCKED", "Anon key + staff login against this app's Supabase", "no .env.local");
    }
    return;
  }

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  const schema = process.env.NEXT_PUBLIC_SUPABASE_DB_SCHEMA || "public";
  const host = (() => {
    try {
      return new URL(url).host;
    } catch {
      return "";
    }
  })();
  if (!url || !anon || url.includes("your-project")) {
    rec("anon_trade_denied", "BLOCKED", "Real anon URL", `host ${host || "missing"}`);
    rec("owner_login", "BLOCKED", "QA_OWNER login", "URL or anon key missing");
    rec("owner_reads_trade", "BLOCKED", "Owner can read trade_entries", "URL or anon key missing");
    rec("owner_profit_rows", "BLOCKED", "Owner select returns amount_inr", "URL or anon key missing");
    return;
  }

  const anonRes = await fetch(`${url}/rest/v1/trade_entries?select=id&limit=1`, {
    headers: {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
      "Accept-Profile": schema,
    },
  });
  const anonText = await anonRes.text();
  let anonJson = null;
  try {
    anonJson = JSON.parse(anonText);
  } catch {
    anonJson = null;
  }
  const anonDenied = anonRes.status === 401 || anonRes.status === 403 || (anonRes.status === 200 && Array.isArray(anonJson) && anonJson.length === 0);
  rec(
    "anon_trade_denied",
    anonDenied ? "PASS" : "FAIL",
    "Anon cannot read trade rows",
    `HTTP ${anonRes.status} host ${host}`
  );

  const email = process.env.QA_OWNER_EMAIL;
  const password = process.env.QA_OWNER_PASSWORD;
  if (!email || !password) {
    rec("owner_login", "SKIP", "QA_OWNER_EMAIL and QA_OWNER_PASSWORD", "not in .env.local");
    rec("owner_reads_trade", "SKIP", "Owner select trade_entries", "no owner login");
    rec("owner_profit_rows", "SKIP", "amount_inr column readable", "no owner login");
    return;
  }

  const tokenRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const tokenJson = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokenJson.access_token) {
    rec("owner_login", "FAIL", "Password grant", tokenJson.error_description || tokenJson.msg || `HTTP ${tokenRes.status}`);
    rec("owner_reads_trade", "BLOCKED", "Owner select", "login failed");
    rec("owner_profit_rows", "BLOCKED", "amount_inr readable", "login failed");
    return;
  }
  rec("owner_login", "PASS", "Password grant", `host ${host}`);

  const trade = await fetch(
    `${url}/rest/v1/trade_entries?select=id,direction,amount_inr,occurred_on&limit=1`,
    {
      headers: {
        apikey: anon,
        Authorization: `Bearer ${tokenJson.access_token}`,
        "Accept-Profile": schema,
      },
    }
  );
  rec(
    "owner_reads_trade",
    trade.status === 200 ? "PASS" : "FAIL",
    "HTTP 200",
    `HTTP ${trade.status}`
  );
  const tradeText = await trade.text();
  rec(
    "owner_profit_rows",
    trade.status === 200 && tradeText.includes("amount_inr") ? "PASS" : "FAIL",
    "Response includes amount_inr",
    trade.status === 200 ? "column present" : `HTTP ${trade.status}`
  );
}

live()
  .catch((err) => {
    rec("live_harness", "FAIL", "Harness runs", err.message);
  })
  .finally(() => {
    const failed = rows.filter((row) => row.status === "FAIL").length;
    const blocked = rows.filter((row) => row.status === "BLOCKED").length;
    const passed = rows.filter((row) => row.status === "PASS").length;
    const skipped = rows.filter((row) => row.status === "SKIP").length;
    const result = failed ? "FAILED" : blocked ? "BLOCKED" : "PASSED";
    console.log(`RESULT\t${result}\tpass ${passed} fail ${failed} blocked ${blocked} skip ${skipped}`);
    process.exit(failed ? 1 : 0);
  });
