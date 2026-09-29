import { redirect } from "next/navigation";
import { listTeamAccess } from "@/actions/team";
import { TeamAccessManager } from "@/components/admin/team-access-manager";
import { hasAuthority, requireAuth } from "@/lib/auth";

export default async function TeamPage() {
  const profile = await requireAuth();
  const [manageUsers, manageRoles, fullAccess] = await Promise.all([
    hasAuthority(profile.id, "manage_users"),
    hasAuthority(profile.id, "manage_roles"),
    hasAuthority(profile.id, "full_access"),
  ]);
  if (!manageUsers && !manageRoles && !fullAccess && profile.role !== "admin") {
    redirect("/");
  }

  const data = await listTeamAccess();
  return <TeamAccessManager data={data} />;
}
