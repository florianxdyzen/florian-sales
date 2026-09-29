import { redirect } from "next/navigation";
import { listInstallationQueue } from "@/actions/installation";
import { requireAuth, hasAuthority } from "@/lib/auth";
import {
  InstallationQueueList,
  type InstallationQueueRow,
} from "@/components/leads/installation-queue-list";
import { PageHeader } from "@/components/layout/page-header";

export default async function InstallationPage() {
  const profile = await requireAuth();
  const canAssign =
    profile.role === "admin" ||
    profile.role === "ops_coordinator" ||
    (await hasAuthority(profile.id, "assign_installation_crew")) ||
    (await hasAuthority(profile.id, "full_access"));
  const can =
    canAssign ||
    profile.role === "installation_crew" ||
    profile.role === "sales_manager" ||
    (await hasAuthority(profile.id, "view_installation_queue")) ||
    (await hasAuthority(profile.id, "upload_installation_proofs"));
  if (!can) redirect("/pipeline");

  const data = await listInstallationQueue().catch(() => []);
  const rows: InstallationQueueRow[] = data.map((row) => {
    const crew = Array.isArray(row.crew) ? row.crew[0] : row.crew;
    return {
      id: row.id,
      name: row.name,
      phone: row.phone,
      city: row.city,
      sales_stage: row.sales_stage,
      expected_panel_count: row.expected_panel_count,
      installation_assigned_at: row.installation_assigned_at,
      assigned_crew_id: row.assigned_crew_id ?? null,
      crewName: (crew as { name?: string } | null)?.name ?? null,
    };
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Installation"
        subtitle="Owner assigns installation crew after Accounts verifies Token and Pre-dispatch. Crew see files only after they are assigned."
        className="mb-0"
      />
      <InstallationQueueList
        rows={rows}
        isCrew={profile.role === "installation_crew"}
        canAssign={canAssign}
      />
    </div>
  );
}
