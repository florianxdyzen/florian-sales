import {
  grievanceCapabilities,
  listGrievanceAssignees,
  listGrievances,
} from "@/actions/grievances";
import {
  GrievancesWorkspace,
  type GrievanceRow,
} from "@/components/grievances/grievances-workspace";
import { requireAuth } from "@/lib/auth";

export default async function GrievancesPage() {
  const profile = await requireAuth();
  const caps = await grievanceCapabilities(profile);

  if (!caps.canView) {
    return (
      <p className="rounded-xl border border-[var(--border)] bg-white p-6 text-sm text-[var(--text-muted)]">
        You do not have access to grievances.
      </p>
    );
  }

  let grievances: GrievanceRow[] = [];
  let staff: { id: string; name: string; role?: string | null }[] = [];
  let schemaMissing = false;

  try {
    grievances = (await listGrievances()) as GrievanceRow[];
    staff = await listGrievanceAssignees();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("grievances") ||
      message.includes("schema cache") ||
      message.includes("does not exist")
    ) {
      schemaMissing = true;
    } else {
      throw error;
    }
  }

  if (schemaMissing) {
    return (
      <div className="rounded-xl border border-[var(--error)]/30 bg-[var(--error-light)] p-6 text-sm text-[var(--text-dark)]">
        <p className="font-semibold">Grievances schema not applied</p>
        <p className="mt-2 text-[var(--text-body)]">
          Run Supabase migration{" "}
          <code className="rounded bg-white px-1.5 py-0.5 text-xs">
            026_grievances.sql
          </code>{" "}
          in the SQL editor, then refresh this page.
        </p>
      </div>
    );
  }

  return (
    <GrievancesWorkspace
      grievances={grievances}
      staff={staff}
      profileId={profile.id}
      canRaise={caps.canRaise}
      canManage={caps.canManage}
    />
  );
}
