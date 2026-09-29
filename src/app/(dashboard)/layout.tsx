import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCurrentUser, getUserAuthorities } from "@/lib/auth";
import { AppShell } from "@/components/layout/app-shell";
import type { AuthorityKey } from "@/lib/domain/authorities";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const profile = await getCurrentUser();
  if (!profile) redirect("/login?error=profile_missing");

  const authSet = await getUserAuthorities(profile.id);
  const authorities = Array.from(authSet) as AuthorityKey[];

  return (
    <AppShell profile={profile} authorities={authorities}>
      {children}
    </AppShell>
  );
}
