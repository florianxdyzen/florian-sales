import {
  listServiceEngineers,
  listServiceTickets,
} from "@/actions/tickets";
import { getCustomers } from "@/actions/leads";
import { MaintenanceWorkspace } from "@/components/maintenance/maintenance-workspace";
import { requireAuth, hasAuthority } from "@/lib/auth";

export default async function MaintenancePage() {
  const profile = await requireAuth();
  const canView =
    profile.role === "admin" ||
    profile.role === "service_engineer" ||
    profile.role === "service_supervisor" ||
    profile.role === "sales_manager" ||
    (await hasAuthority(profile.id, "view_service_tickets")) ||
    (await hasAuthority(profile.id, "full_access"));

  if (!canView) {
    return (
      <p className="rounded-xl border border-[var(--border)] bg-white p-6 text-sm text-[var(--text-muted)]">
        You do not have access to maintenance tickets.
      </p>
    );
  }

  const canAccept =
    profile.role === "admin" ||
    profile.role === "service_engineer" ||
    profile.role === "service_supervisor" ||
    (await hasAuthority(profile.id, "accept_service_ticket"));
  const canResolve =
    profile.role === "admin" ||
    profile.role === "service_engineer" ||
    profile.role === "service_supervisor" ||
    (await hasAuthority(profile.id, "resolve_service_ticket"));
  const canForceAssign =
    profile.role === "admin" ||
    profile.role === "service_supervisor" ||
    (await hasAuthority(profile.id, "force_assign_service_ticket"));
  const canEnqueueCleaning =
    profile.role === "admin" ||
    profile.role === "service_supervisor" ||
    (await hasAuthority(profile.id, "enqueue_cleaning_reminders"));

  let tickets: Awaited<ReturnType<typeof listServiceTickets>> = [];
  let engineers: Awaited<ReturnType<typeof listServiceEngineers>> = [];
  let customers: { id: string; name: string; phone: string }[] = [];
  let schemaMissing = false;

  try {
    tickets = await listServiceTickets();
    engineers = canForceAssign ? await listServiceEngineers() : [];
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("service_tickets") ||
      message.includes("schema cache") ||
      message.includes("does not exist")
    ) {
      schemaMissing = true;
    } else {
      throw error;
    }
  }

  if (!schemaMissing) {
    try {
      customers = (await getCustomers()).map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
      }));
    } catch {
      customers = [];
    }
  }

  if (schemaMissing) {
    return (
      <div className="rounded-xl border border-[var(--error)]/30 bg-[var(--error-light)] p-6 text-sm text-[var(--text-dark)]">
        <p className="font-semibold">Maintenance schema not applied</p>
        <p className="mt-2 text-[var(--text-body)]">
          Run Supabase migrations{" "}
          <code className="rounded bg-white px-1.5 py-0.5 text-xs">011_maintenance.sql</code>{" "}
          and{" "}
          <code className="rounded bg-white px-1.5 py-0.5 text-xs">012_proofs_storage.sql</code>{" "}
          in the SQL editor, then refresh this page.
        </p>
      </div>
    );
  }

  return (
    <MaintenanceWorkspace
      tickets={tickets as Parameters<typeof MaintenanceWorkspace>[0]["tickets"]}
      engineers={engineers}
      customers={customers}
      companyId={profile.company_id}
      profileId={profile.id}
      canAccept={canAccept}
      canResolve={canResolve}
      canForceAssign={canForceAssign}
      canEnqueueCleaning={canEnqueueCleaning}
      canRaiseTicket={canView}
    />
  );
}
