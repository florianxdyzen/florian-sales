"use client";

import { HardHat } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useLeadModal } from "@/components/leads/lead-modal-context";
import { SALES_STAGE_LABELS, type SalesStage } from "@/lib/domain/workflow";
import { formatDateTime, formatPhone } from "@/lib/utils";

export type InstallationQueueRow = {
  id: string;
  name: string;
  phone: string;
  city: string | null;
  sales_stage: string;
  expected_panel_count: number | null;
  installation_assigned_at: string | null;
  assigned_crew_id: string | null;
  crewName: string | null;
};

function JobCard({
  row,
  onOpen,
}: {
  row: InstallationQueueRow;
  onOpen: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(row.id)}
      className="rounded-2xl border border-[var(--border)] bg-white p-4 text-left shadow-[var(--shadow)] transition hover:-translate-y-0.5 hover:border-[var(--info)]/40 hover:shadow-[var(--shadow-lg)]"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-[var(--text-dark)]">{row.name}</p>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {formatPhone(row.phone)}
            {row.city ? ` · ${row.city}` : ""}
          </p>
        </div>
        <Badge variant={row.sales_stage}>
          {SALES_STAGE_LABELS[row.sales_stage as SalesStage] ?? row.sales_stage}
        </Badge>
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
        <span>Crew: {row.crewName ?? "Unassigned"}</span>
        <span>Panels: {row.expected_panel_count ?? "—"}</span>
        <span>{formatDateTime(row.installation_assigned_at)}</span>
      </div>
      <p className="mt-3 text-xs font-semibold text-[var(--info)]">Open installation →</p>
    </button>
  );
}

export function InstallationQueueList({
  rows,
  isCrew = false,
  canAssign = false,
}: {
  rows: InstallationQueueRow[];
  isCrew?: boolean;
  canAssign?: boolean;
}) {
  const { openInstallation } = useLeadModal();
  const unassigned = rows.filter((r) => !r.assigned_crew_id);
  const assigned = rows.filter((r) => r.assigned_crew_id);

  if (rows.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-[var(--border)] bg-white px-6 py-16 text-center">
        <HardHat className="mx-auto h-8 w-8 text-[var(--text-light)]" />
        <p className="mt-3 text-sm text-[var(--text-muted)]">
          {isCrew
            ? "Waiting for Owner to assign"
            : "No installation jobs yet. Complete pre-dispatch verification first."}
        </p>
      </div>
    );
  }

  if (isCrew) {
    return (
      <div className="grid gap-3 sm:grid-cols-2">
        {rows.map((row) => (
          <JobCard key={row.id} row={row} onOpen={openInstallation} />
        ))}
      </div>
    );
  }

  if (canAssign) {
    return (
      <div className="space-y-6">
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--text-dark)]">
            Unassigned ({unassigned.length})
          </h2>
          {unassigned.length === 0 ? (
            <p className="rounded-xl border border-dashed border-[var(--border)] bg-white px-4 py-6 text-sm text-[var(--text-muted)]">
              No files waiting for Owner to assign.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {unassigned.map((row) => (
                <JobCard key={row.id} row={row} onOpen={openInstallation} />
              ))}
            </div>
          )}
        </section>
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--text-dark)]">
            Assigned ({assigned.length})
          </h2>
          {assigned.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">No assigned jobs.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {assigned.map((row) => (
                <JobCard key={row.id} row={row} onOpen={openInstallation} />
              ))}
            </div>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {rows.map((row) => (
        <JobCard key={row.id} row={row} onOpen={openInstallation} />
      ))}
    </div>
  );
}
