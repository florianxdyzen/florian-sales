import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const root = path.resolve(import.meta.dirname, "..");
const envPath = path.join(root, ".env.local");
for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (!m || process.env[m[1]]) continue;
  process.env[m[1]] = m[2];
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
const schema = process.env.NEXT_PUBLIC_SUPABASE_DB_SCHEMA || "public";
const email = process.env.QA_OWNER_EMAIL;
const password = process.env.QA_OWNER_PASSWORD;
const companyId = "a0000000-0000-4000-8000-000000000001";
const adminRoleId = "566f698a-1950-4b47-bf69-e2cb498cbb3e";

const admin = createClient(url, service, {
  db: { schema },
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: existing } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
const found = existing?.users?.find((u) => u.email?.toLowerCase() === email.toLowerCase());

let userId = found?.id;
if (!userId) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      tenant: "florian-sales",
      schema,
      company_id: companyId,
      name: "Florian Admin",
      phone: "",
      role: "admin",
      role_id: adminRoleId,
    },
  });
  if (error || !data.user) throw new Error(error?.message ?? "createUser failed");
  userId = data.user.id;
  console.log("created_auth_user", userId);
} else {
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password,
    email_confirm: true,
    user_metadata: {
      tenant: "florian-sales",
      schema,
      company_id: companyId,
      name: "Florian Admin",
      role: "admin",
      role_id: adminRoleId,
    },
  });
  if (error) throw new Error(error.message);
  console.log("updated_auth_user", userId);
}

const { error: profileError } = await admin.from("profiles").upsert({
  id: userId,
  company_id: companyId,
  name: "Florian Admin",
  email: email.toLowerCase(),
  phone: "",
  role: "admin",
  role_id: adminRoleId,
  is_active: true,
  updated_at: new Date().toISOString(),
});
if (profileError) throw new Error(`profile: ${profileError.message}`);
console.log("profile_ok", email);
