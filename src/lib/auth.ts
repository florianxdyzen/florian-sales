import { createClient } from "@/lib/supabase/server";
import type { Profile } from "@/lib/domain/types";
import type { AuthorityKey } from "@/lib/domain/authorities";
import { DEFAULT_ROLE_AUTHORITIES } from "@/lib/domain/authorities";

export async function getCurrentUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return profile as Profile | null;
}

export async function getUserAuthorities(userId: string): Promise<Set<AuthorityKey>> {
  const supabase = await createClient();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, role_id")
    .eq("id", userId)
    .single();

  const granted = new Set<AuthorityKey>();

  // Admin role always has full access
  if (profile?.role === "admin") {
    granted.add("full_access");
    for (const k of DEFAULT_ROLE_AUTHORITIES.admin ?? []) {
      granted.add(k);
    }
  }

  // 1. Explicit user-level permissions (overrides / additions)
  const { data: userAuths } = await supabase
    .from("user_authorities")
    .select("authority_key, granted")
    .eq("user_id", userId);

  if (userAuths && userAuths.length > 0) {
    for (const a of userAuths) {
      if (a.granted) granted.add(a.authority_key as AuthorityKey);
    }
  }

  // 2. Role-based permissions via role_id
  if (profile?.role_id) {
    const { data: roleAuths } = await supabase
      .from("role_authorities")
      .select("authority_key, granted")
      .eq("role_id", profile.role_id);

    for (const a of roleAuths ?? []) {
      if (a.granted) granted.add(a.authority_key as AuthorityKey);
    }
  }

  // 3. Enum fallback when nothing resolved yet
  if (granted.size === 0 && profile?.role) {
    const defaults = DEFAULT_ROLE_AUTHORITIES[profile.role] ?? [];
    defaults.forEach((k) => granted.add(k));
  }

  return granted;
}

export async function hasAuthority(userId: string, key: string): Promise<boolean> {
  const authorities = await getUserAuthorities(userId);
  if (authorities.has("full_access")) return true;
  return authorities.has(key as AuthorityKey);
}

export async function requireAuth() {
  const profile = await getCurrentUser();
  if (!profile || !profile.is_active) {
    throw new Error("Unauthorized");
  }
  return profile;
}

export async function requireAuthority(key: string) {
  const profile = await requireAuth();
  const allowed = await hasAuthority(profile.id, key);
  if (!allowed) throw new Error(`Missing authority: ${key}`);
  return profile;
}
