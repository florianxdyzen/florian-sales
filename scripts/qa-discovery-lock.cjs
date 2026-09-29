/**
 * Discovery-lock QA — anon + owner password only.
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
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const rows = [];
function rec(id, status, detail) {
  rows.push({ id, status, detail });
  console.log(`${status}\t${id}\t${detail}`);
}

async function rest(pathname, token, extra = {}) {
  const res = await fetch(`${url}${pathname}`, {
    headers: {
      apikey: anon,
      Authorization: `Bearer ${token || anon}`,
      "Accept-Profile": schema,
      ...extra,
    },
  });
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
    rec("user_login", "FAIL", tokenJson.error_description || `HTTP ${tokenRes.status}`);
  } else {
    rec("user_login", "PASS", "password grant");
    const tok = tokenJson.access_token;
    const rpc = await fetch(`${url}/rest/v1/rpc/get_frs_account_code_seq`, {
      method: "POST",
      headers: {
        apikey: anon,
        Authorization: `Bearer ${tok}`,
        "Content-Profile": schema,
        "Accept-Profile": schema,
        "Content-Type": "application/json",
      },
      body: "{}",
    });
    const rpcText = await rpc.text();
    rec("rpc_code_seq", rpc.ok ? "PASS" : "FAIL", `HTTP ${rpc.status} ${rpcText.slice(0, 80)}`);

    const leads = await rest(
      "/rest/v1/leads?select=id,account_code,outward_conversions,outward_earnings_inr&limit=1",
      tok
    );
    rec("leads_money_cols", leads.status === 200 ? "PASS" : "FAIL", `HTTP ${leads.status}`);

    const trade = await rest(
      "/rest/v1/trade_entries?select=id,vehicle_no,transporter_name,amount_inr&limit=1",
      tok
    );
    rec("trade_transport_cols", trade.status === 200 ? "PASS" : "FAIL", `HTTP ${trade.status}`);
  }

  for (const pathName of ["/login", "/settings"]) {
    try {
      const page = await fetch(`${appUrl}${pathName}`, { redirect: "manual" });
      const ok = page.status === 200 || page.status === 307 || page.status === 302;
      rec(`app_${pathName.slice(1) || "root"}`, ok ? "PASS" : "FAIL", `HTTP ${page.status}`);
    } catch (err) {
      rec(`app_${pathName.slice(1)}`, "FAIL", err.message);
    }
  }

  const failed = rows.filter((r) => r.status === "FAIL").length;
  console.log(`RESULT\t${failed ? "FAILED" : "PASSED"}\t${rows.length - failed}/${rows.length}`);
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(2);
});
