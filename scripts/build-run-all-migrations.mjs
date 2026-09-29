import fs from "node:fs";
import path from "node:path";

const appRoot = path.resolve(import.meta.dirname, "..");
const destRoot = path.resolve(appRoot, "..", "..", "Deliverables", "florian-sales");
const dir = path.join(appRoot, "supabase", "migrations");
const files = fs
  .readdirSync(dir)
  .filter((name) => /^\d+_.*\.sql$/.test(name))
  .sort();

if (!files.length) {
  throw new Error(`No numbered SQL files in ${dir}`);
}

const parts = [
  "-- ============================================================",
  "-- Florian Sales — combined migrations",
  "-- ============================================================",
  "-- Paste this entire file into Supabase SQL Editor and run it.",
  "-- Intended for a dedicated Cloud project (schema public).",
  "-- Do not apply this file to the FRS or Florian inventory database.",
  "--",
  `-- Generated from ${files.length} files in supabase/migrations/`,
  "-- Includes:",
  ...files.map((name) => `--   - ${name}`),
  "-- ============================================================",
  "",
];

for (const name of files) {
  const sql = fs.readFileSync(path.join(dir, name), "utf8").trimEnd();
  parts.push("");
  parts.push("-- ############################################################");
  parts.push(`-- >>> ${name}`);
  parts.push("-- ############################################################");
  parts.push("");
  parts.push(sql);
  parts.push("");
}

const out = parts.join("\n");
const appDest = path.join(appRoot, "supabase", "run_all_migrations.sql");
fs.writeFileSync(appDest, out, "utf8");
const deliverableDir = path.join(destRoot, "supabase");
if (fs.existsSync(deliverableDir)) {
  fs.writeFileSync(path.join(deliverableDir, "run_all_migrations.sql"), out, "utf8");
}
console.log(`Wrote ${files.length} migrations → run_all_migrations.sql (${out.length} bytes)`);
