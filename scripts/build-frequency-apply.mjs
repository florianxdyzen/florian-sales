import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const dir = path.join(root, "supabase", "migrations");
const out = path.join(root, "supabase", ".tmp_florian_sales_apply.sql");

const skip = new Set(["006_fix_auth_trigger.sql"]);

function stripAuthTrigger(sql) {
  return sql.replace(
    /DROP TRIGGER IF EXISTS on_auth_user_created ON auth\.users;[\s\S]*?FOR EACH ROW EXECUTE FUNCTION handle_new_user\(\);/g,
    "-- skipped: shared Frequency auth.users trigger\n",
  );
}

function stripSharedStoragePolicies(sql) {
  return sql
    .replace(/DROP POLICY IF EXISTS \w+ ON storage\.objects;/g, "-- skipped shared storage.objects DROP")
    .replace(
      /CREATE POLICY \w+ ON storage\.objects[\s\S]*?;/g,
      "-- skipped shared storage.objects CREATE POLICY",
    );
}

function rewrite(sql) {
  let next = sql;
  next = next.replace(/SET search_path\s*=\s*public\b/gi, "SET search_path TO florian_sales, public");
  next = next.replace(/\bpublic\.(quotations|leads|feasibility_reports|profiles|companies|roles|role_authorities)\b/g, "florian_sales.$1");
  return next;
}

const files = fs
  .readdirSync(dir)
  .filter((name) => /^\d+_.*\.sql$/.test(name) && !skip.has(name))
  .sort();

const parts = [
  "-- Florian Frequency apply — schema florian_sales only",
  "-- Do not run against public. Skips 006 and auth.users trigger.",
  "CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\" WITH SCHEMA extensions;",
  "SET search_path TO florian_sales, extensions, public;",
  "",
];

for (const name of files) {
  let sql = fs.readFileSync(path.join(dir, name), "utf8");
  sql = stripAuthTrigger(sql);
  if (name === "012_proofs_storage.sql" || name === "031_team_profile_pictures.sql") {
    sql = stripSharedStoragePolicies(sql);
  }
  sql = rewrite(sql);
  parts.push(`-- ========== ${name} ==========`);
  parts.push(sql.trimEnd());
  parts.push("");
}

parts.push(`
GRANT USAGE ON SCHEMA florian_sales TO postgres, anon, authenticated, service_role, authenticator;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA florian_sales TO anon, authenticated, service_role;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA florian_sales TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA florian_sales TO anon, authenticated, service_role;
NOTIFY pgrst, 'reload schema';
`);

fs.writeFileSync(out, parts.join("\n"), "utf8");
console.log(`Wrote ${out} from ${files.length} files`);
