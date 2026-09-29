const vercelHint =
  "Add it in Vercel → Project → Settings → Environment Variables, or in .env.local for local dev.";

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name}. ${vercelHint}`);
  }
  return value;
}

function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

/** Public Supabase config — required at build and runtime. */
export function getSupabaseEnv() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url) throw new Error(`Missing NEXT_PUBLIC_SUPABASE_URL. ${vercelHint}`);
  if (!anonKey) throw new Error(`Missing NEXT_PUBLIC_SUPABASE_ANON_KEY. ${vercelHint}`);
  return { url, anonKey };
}

/** Frequency LAN schema (or `public` on a dedicated Cloud project). */
export function getSupabaseDbSchema(): string {
  return process.env.NEXT_PUBLIC_SUPABASE_DB_SCHEMA?.trim() || "public";
}

export function getSupabaseClientOptions() {
  return { db: { schema: getSupabaseDbSchema() } } as const;
}

/** Frequency uses a named schema; default `SupabaseClient` is locked to `"public"`. */
export type AppSupabaseClient = import("@supabase/supabase-js").SupabaseClient<
  any,
  string,
  string
>;

/** Server-only — required for admin user provisioning and lead ingest. */
export function getSupabaseServiceRoleKey(): string {
  return requireEnv("SUPABASE_SERVICE_ROLE_KEY");
}

export function hasSupabaseServiceRoleKey(): boolean {
  return Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

export function getAppUrl(): string | undefined {
  if (process.env.NEXT_PUBLIC_APP_URL?.trim()) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}`;
  }
  return undefined;
}

/** Facebook Lead Ads webhook verify token (Meta app settings). */
export function getFacebookVerifyToken(): string | undefined {
  return optionalEnv("FACEBOOK_VERIFY_TOKEN");
}

/** Page access token used to fetch leadgen field data from Graph API. */
export function getFacebookPageAccessToken(): string | undefined {
  return optionalEnv("FACEBOOK_PAGE_ACCESS_TOKEN");
}

/** Default company id for Facebook webhook when page mapping is not set. */
export function getFacebookDefaultCompanyId(): string | undefined {
  return optionalEnv("FACEBOOK_DEFAULT_COMPANY_ID");
}
