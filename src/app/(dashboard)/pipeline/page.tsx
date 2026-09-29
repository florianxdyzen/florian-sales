import Link from "next/link";
import { Suspense } from "react";
import { listLeads } from "@/actions/leads";
import { PipelineBoard, type PipelineLead } from "@/components/leads/pipeline-board";
import { CallingDeskBoard } from "@/components/leads/calling-desk-board";
import { NewLeadButton } from "@/components/leads/new-lead-button";
import { PageHeader } from "@/components/layout/page-header";
import { requireAuth, hasAuthority } from "@/lib/auth";
import { defaultPipelineQueue, type PipelineQueue } from "@/lib/leads/visibility";
import {
  isPipelineSalesStage,
  type SalesStage,
  type LeadTemperature,
} from "@/lib/domain/workflow";
import { cn } from "@/lib/utils";
import { FRS_ALLOW_CONSUMER_WON } from "@/lib/product-surface";

function parseQueue(
  raw: string | undefined,
  fallback: PipelineQueue
): PipelineQueue {
  if (raw === "tele_call" || raw === "site_visits" || raw === "all") return raw;
  return fallback;
}

export default async function PipelinePage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; queue?: string; view?: string }>;
}) {
  const sp = await searchParams;
  const leadStatus = sp.status === "lost" ? "lost" : "active";
  const view = sp.view === "board" ? "board" : "desk";
  const profile = await requireAuth();
  const isManagerRole = profile.role === "admin" || profile.role === "sales_manager";
  const canReassign = await hasAuthority(profile.id, "reassign_leads");
  const canMoveBackward = isManagerRole || canReassign;
  const canScheduleVisit =
    isManagerRole || (await hasAuthority(profile.id, "schedule_site_visit"));
  const canConductSurvey =
    isManagerRole || (await hasAuthority(profile.id, "conduct_survey"));
  const canMarkWon =
    FRS_ALLOW_CONSUMER_WON &&
    (isManagerRole || (await hasAuthority(profile.id, "move_lead_stage")));
  const canRunCycle =
    isManagerRole || (await hasAuthority(profile.id, "manage_settings"));

  const queue = parseQueue(sp.queue, defaultPipelineQueue(profile));

  const [activeLeads, lostLeads] = await Promise.all([
    listLeads({ status: "active", queue }),
    listLeads({ status: "lost", queue: queue === "all" ? "all" : queue }),
  ]);

  function mapLead(l: (typeof activeLeads)[number]): PipelineLead {
    const tele = l.telecaller_profile;
    const surv = l.surveyor_profile;
    const assigned = l.assigned_profile;
    return {
      id: l.id,
      name: l.name,
      account_code: l.account_code ?? null,
      phone: l.phone,
      sales_stage: l.sales_stage as SalesStage,
      temperature: (l.temperature as LeadTemperature | undefined) ?? "warm",
      city: l.city,
      address: l.address,
      requirement_notes: l.requirement_notes,
      loss_reason: l.loss_reason ?? null,
      created_at: l.created_at ?? null,
      source: l.source ?? null,
      last_call_at: l.last_call_at ?? null,
      next_followup_at: l.next_followup_at ?? null,
      last_outward_on: l.last_outward_on ?? null,
      last_inward_on: l.last_inward_on ?? null,
      outward_conversions: l.outward_conversions ?? null,
      outward_earnings_inr: l.outward_earnings_inr ?? null,
      assigned_surveyor_id: l.assigned_surveyor_id ?? null,
      survey_date: l.survey_date ?? null,
      visit_scheduled_at: l.visit_scheduled_at ?? null,
      visit_notes: l.visit_notes ?? null,
      telecaller_name: tele?.name ?? assigned?.name ?? null,
      surveyor_name: surv?.name ?? null,
      assigned_profile: assigned ?? null,
    };
  }

  const deskLeads = activeLeads.map(mapLead);
  const activeMapped = activeLeads
    .filter((lead) => isPipelineSalesStage(lead.sales_stage))
    .map(mapLead);
  const lostMapped = lostLeads.map(mapLead);
  const pipelineLeads = leadStatus === "lost" ? lostMapped : activeMapped;

  const queueLabel =
    queue === "tele_call"
      ? "My tele-call queue"
      : queue === "site_visits"
        ? "My site visits"
        : "All visible accounts";

  const deskHref = queue === "all" ? "/pipeline" : `/pipeline?queue=${queue}`;
  const boardHref =
    queue === "all" ? "/pipeline?view=board" : `/pipeline?view=board&queue=${queue}`;

  return (
    <div>
      <PageHeader
        eyebrow="Leads"
        title={view === "desk" ? "Calling desk" : "Sales board"}
        subtitle={
          view === "desk"
            ? `${queueLabel} — Hot / Warm / Cold with a 30-day recycle`
            : leadStatus === "lost"
              ? "Lost leads — reopen from lead details"
              : `${queueLabel} — through Quoted; Won moves to Customers`
        }
        actions={<NewLeadButton />}
        className="mb-4"
      />

      <div className="mb-4 flex rounded-lg border border-[var(--border)] bg-white p-0.5 w-fit">
        <Link
          href={deskHref}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-semibold",
            view === "desk"
              ? "bg-[var(--primary)] text-white"
              : "text-[var(--text-muted)] hover:text-[var(--text-dark)]"
          )}
        >
          Calling desk
        </Link>
        <Link
          href={boardHref}
          className={cn(
            "rounded-md px-3 py-1.5 text-xs font-semibold",
            view === "board"
              ? "bg-[var(--primary)] text-white"
              : "text-[var(--text-muted)] hover:text-[var(--text-dark)]"
          )}
        >
          Sales board
        </Link>
      </div>

      <Suspense fallback={null}>
        {view === "desk" ? (
          <CallingDeskBoard leads={deskLeads} canRunCycle={canRunCycle} />
        ) : (
          <PipelineBoard
            leads={pipelineLeads}
            canMoveBackward={canMoveBackward}
            canScheduleVisit={canScheduleVisit}
            canConductSurvey={canConductSurvey}
            canMarkWon={canMarkWon}
            leadStatus={leadStatus}
            queue={queue}
            activeCount={activeMapped.length}
            lostCount={lostMapped.length}
          />
        )}
      </Suspense>
    </div>
  );
}
