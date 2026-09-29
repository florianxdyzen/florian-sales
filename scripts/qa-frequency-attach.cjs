/**
 * Frequency attach QA — anon key + user password only.
 */
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..");
for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL.replace(/\/$/, "");
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const schema = process.env.NEXT_PUBLIC_SUPABASE_DB_SCHEMA || "florian_sales";
const email = process.env.QA_OWNER_EMAIL;
const password = process.env.QA_OWNER_PASSWORD;
const appUrl = (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");

if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
}

const rows = [];
function rec(id, status, detail) {
  rows.push({ id, status, detail });
  console.log(`${status}\t${id}\t${detail}`);
}

async function rest(pathname, token, extra = {}) {
  const headers = {
    apikey: anon,
    Authorization: `Bearer ${token || anon}`,
    "Accept-Profile": schema,
    ...extra,
  };
  const res = await fetch(`${url}${pathname}`, { headers });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, json };
}

(async () => {
  const ping = await rest("/rest/v1/ping?select=*&limit=1");
  rec("anon_ping", ping.status === 200 ? "PASS" : "FAIL", `HTTP ${ping.status}`);

  const companiesAnon = await rest("/rest/v1/companies?select=id,name&limit=5");
  const anonRows = Array.isArray(companiesAnon.json) ? companiesAnon.json : [];
  rec(
    "anon_companies_rls",
    companiesAnon.status === 200 && anonRows.length === 0 ? "PASS" : "FAIL",
    `HTTP ${companiesAnon.status} rows=${anonRows.length}`,
  );

  const tokenRes = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anon,
      Authorization: `Bearer ${anon}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const tokenJson = await tokenRes.json();
  if (!tokenRes.ok || !tokenJson.access_token) {
    rec("user_login", "FAIL", tokenJson.error_description || tokenJson.msg || `HTTP ${tokenRes.status}`);
  } else {
    rec("user_login", "PASS", "password grant");
    const companies = await rest("/rest/v1/companies?select=id,slug,name&limit=5", tokenJson.access_token);
    const ok =
      companies.status === 200 &&
      Array.isArray(companies.json) &&
      companies.json.some((c) => c.slug === "florian-sales");
    rec("user_companies", ok ? "PASS" : "FAIL", `HTTP ${companies.status} ${JSON.stringify(companies.json)}`);

    const profiles = await rest("/rest/v1/profiles?select=email,role,role_id&limit=5", tokenJson.access_token);
    const meOk =
      profiles.status === 200 &&
      Array.isArray(profiles.json) &&
      profiles.json.some((p) => p.email === email && p.role === "admin");
    rec("user_profile", meOk ? "PASS" : "FAIL", `HTTP ${profiles.status}`);

    const trade = await rest("/rest/v1/trade_skus?select=id&limit=1", tokenJson.access_token);
    rec("user_trade_skus", trade.status === 200 ? "PASS" : "FAIL", `HTTP ${trade.status}`);
  }

  try {
    const loginPage = await fetch(`${appUrl}/login`, { redirect: "manual" });
    rec("app_login_http", loginPage.status === 200 ? "PASS" : "FAIL", `HTTP ${loginPage.status}`);
  } catch (err) {
    rec("app_login_http", "FAIL", err.message);
  }

  const failed = rows.filter((r) => r.status === "FAIL").length;
  console.log(`RESULT\t${failed ? "FAILED" : "PASSED"}\t${rows.length - failed}/${rows.length}`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(2);
});
