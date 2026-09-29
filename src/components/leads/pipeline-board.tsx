"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Input, Select } from "@/components/ui/input";
import { LeadCard } from "@/components/leads/lead-card";
import { useLeadModal } from "@/components/leads/lead-modal-context";
import { BookSurveyModal, type BookSurveyLead } from "@/components/leads/book-survey-panel";
import { moveSalesStage } from "@/actions/leads";
import {
  SALES_STAGE_LABELS,
  PIPELINE_SALES_STAGES,
  PIPELINE_STAGE_GROUPS,
  TEMPERATURE_LABELS,
  TEMPERATURES,
  STAGE_COLORS,
} from "@/lib/domain/workflow";
import type { LeadTemperature, SalesStage } from "@/lib/domain/workflow";
import { canMoveSalesStage } from "@/lib/workflow-rules";
import { accountCodeMatchesQuery } from "@/lib/domain/account-code";
import { compareCallingDesk } from "@/lib/domain/calling-cycle";
import { cn } from "@/lib/utils";

type PipelineLead = {
  id: string;
  name: string;
  account_code?: string | null;
  phone: string;
  sales_stage: SalesStage;
  temperature?: LeadTemperature;
  city?: string | null;
  address?: string | null;
  requirement_notes?: string | null;
  loss_reason?: string | null;
  created_at?: string | null;
  source?: string | null;
  next_followup_at?: string | null;
  last_call_at?: string | null;
  last_outward_on?: string | null;
  last_inward_on?: string | null;
  outward_conversions?: number | null;
  outward_earnings_inr?: number | null;
  telecaller_name?: string | null;
  surveyor_name?: string | null;
  assigned_surveyor_id?: string | null;
  survey_date?: string | null;
  visit_scheduled_at?: string | null;
  visit_notes?: string | null;
  assigned_profile?: { name: string } | null;
};

export type { PipelineLead };

interface PipelineProps {
  leads: PipelineLead[];
  canMoveBackward: boolean;
  canScheduleVisit?: boolean;
  canConductSurvey?: boolean;
  canMarkWon?: boolean;
  leadStatus?: "active" | "lost";
  queue?: "all" | "tele_call" | "site_visits";
  activeCount?: number;
  lostCount?: number;
}

type StageGroup = (typeof PIPELINE_STAGE_GROUPS)[number];

export function PipelineBoard({
  leads,
  canMoveBackward,
  canScheduleVisit = true,
  canConductSurvey = true,
  canMarkWon = false,
  leadStatus = "active",
  queue = "all",
  activeCount,
  lostCount,
}: PipelineProps) {
  const { openLead } = useLeadModal();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [localLeads, setLocalLeads] = useState(leads);
  const [pending, startTransition] = useTransition();
  const [temperatureFilter, setTemperatureFilter] = useState<LeadTemperature | "all">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<SalesStage | null>(null);
  const [bookingLead, setBookingLead] = useState<BookSurveyLead | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: "error" | "success";
    text: string;
  } | null>(null);

  const stages = PIPELINE_SALES_STAGES;
  const stageGroups = PIPELINE_STAGE_GROUPS;
  const showingLost = leadStatus === "lost";

  /** Leads of every stage in a group, ordered by the group's stage sequence. */
  function leadsForGroup(group: StageGroup) {
    return filteredLeads
      .filter((lead) => group.stages.includes(lead.sales_stage))
      .sort((a, b) => {
        const pin = compareCallingDesk(a, b);
        if (pin !== 0) return pin;
        return group.stages.indexOf(a.sales_stage) - group.stages.indexOf(b.sales_stage);
      });
  }

  useEffect(() => {
    setLocalLeads(leads);
  }, [leads]);

  const filteredLeads = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const phoneDigits = searchQuery.replace(/\D/g, "");

    return localLeads.filter((lead) => {
      if (temperatureFilter !== "all" && (lead.temperature ?? "warm") !== temperatureFilter) {
        return false;
      }
      if (!q) return true;

      const phoneMatch =
        lead.phone.includes(q) ||
        (phoneDigits.length >= 2 && lead.phone.replace(/\D/g, "").includes(phoneDigits));

      return (
        lead.name.toLowerCase().includes(q) ||
        accountCodeMatchesQuery(lead.account_code, searchQuery) ||
        phoneMatch ||
        (lead.city?.toLowerCase().includes(q) ?? false) ||
        (lead.address?.toLowerCase().includes(q) ?? false) ||
        (lead.requirement_notes?.toLowerCase().includes(q) ?? false) ||
        (lead.loss_reason?.toLowerCase().includes(q) ?? false) ||
        (lead.assigned_profile?.name.toLowerCase().includes(q) ?? false) ||
        (lead.telecaller_name?.toLowerCase().includes(q) ?? false) ||
        (lead.surveyor_name?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [localLeads, searchQuery, temperatureFilter]);

  function setLeadStatus(next: "active" | "lost") {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "lost") params.set("status", "lost");
    else params.delete("status");
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  function setQueue(next: "all" | "tele_call" | "site_visits") {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "all") params.delete("queue");
    else params.set("queue", next);
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname);
  }

  const stageOpts = { canScheduleVisit, canConductSurvey, canCreateQuotations: false };

  function clearDragState() {
    setDraggingId(null);
    setDragOverStage(null);
  }

  function showStatus(type: "error" | "success", text: string) {
    setStatusMessage({ type, text });
    window.setTimeout(() => setStatusMessage(null), 3500);
  }

  function requestStageMove(lead: PipelineLead, targetStage: SalesStage) {
    if (pending || showingLost) return;

    if (targetStage === "visit_scheduled") {
      if (!canScheduleVisit) {
        showStatus("error", "Only tele-callers / managers can schedule site visits");
        return;
      }
      setBookingLead(lead);
      return;
    }

    if (targetStage === "survey_in_progress" || targetStage === "survey_completed") {
      if (lead.sales_stage === "new_lead" || lead.sales_stage === "contacted") {
        if (!canScheduleVisit) {
          showStatus("error", "Schedule a site visit before survey");
          return;
        }
        setBookingLead(lead);
        return;
      }
      openLead(lead.id);
      showStatus("success", "Open the digital survey from the header");
      return;
    }

    if (targetStage === "quoted" || targetStage === "quote_accepted") {
      openLead(lead.id);
      showStatus("success", "Create the quotation from the header");
      return;
    }

    const check = canMoveSalesStage(lead.sales_stage, targetStage, canMoveBackward, stageOpts);
    if (!check.allowed) {
      showStatus("error", check.reason ?? "Cannot move to that stage");
      return;
    }

    const prev = localLeads;
    setLocalLeads((list) =>
      list.map((l) => (l.id === lead.id ? { ...l, sales_stage: targetStage } : l))
    );

    startTransition(async () => {
      try {
        await moveSalesStage(lead.id, targetStage);
        showStatus("success", `Moved to ${SALES_STAGE_LABELS[targetStage]}`);
        router.refresh();
      } catch (err) {
        setLocalLeads(prev);
        showStatus("error", err instanceof Error ? err.message : "Move failed");
      }
    });
  }

  function handleDrop(targetStage: SalesStage) {
    if (!draggingId || pending || showingLost) return;
    const lead = localLeads.find((l) => l.id === draggingId);
    clearDragState();
    if (!lead || lead.sales_stage === targetStage) return;
    requestStageMove(lead, targetStage);
  }

  function moveLeadWithButtons(leadId: string, targetStage: SalesStage) {
    const lead = localLeads.find((l) => l.id === leadId);
    if (!lead) return;
    requestStageMove(lead, targetStage);
  }

  function handleWon(leadId: string) {
    setLocalLeads((list) => list.filter((l) => l.id !== leadId));
    showStatus("success", "Moved to Won — now on Customers");
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-[var(--border)] bg-white p-0.5">
          <button
            type="button"
            onClick={() => setLeadStatus("active")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-semibold transition",
              !showingLost
                ? "bg-[var(--primary)] text-white"
                : "text-[var(--text-muted)] hover:text-[var(--text-dark)]"
            )}
          >
            Active{typeof activeCount === "number" ? ` (${activeCount})` : ""}
          </button>
          <button
            type="button"
            onClick={() => setLeadStatus("lost")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-semibold transition",
              showingLost
                ? "bg-[var(--error)] text-white"
                : "text-[var(--text-muted)] hover:text-[var(--text-dark)]"
            )}
          >
            Lost{typeof lostCount === "number" ? ` (${lostCount})` : ""}
          </button>
        </div>
        <div className="flex rounded-lg border border-[var(--border)] bg-white p-0.5">
          {(
            [
              ["all", "All"],
              ["tele_call", "My tele-calls"],
              ["site_visits", "My site visits"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              onClick={() => setQueue(value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                queue === value
                  ? "bg-[var(--primary-light)] text-[var(--primary)]"
                  : "text-[var(--text-muted)] hover:text-[var(--text-dark)]"
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search FLR29, name, phone…"
          className="max-w-xs"
        />
        <Select
          value={temperatureFilter}
          onChange={(e) =>
            setTemperatureFilter(e.target.value as LeadTemperature | "all")
          }
          className="w-auto"
        >
          <option value="all">All temperatures</option>
          {TEMPERATURES.map((t) => (
            <option key={t} value={t}>
              {TEMPERATURE_LABELS[t]}
            </option>
          ))}
        </Select>
      </div>

      {statusMessage && (
        <p
          className={cn(
            "rounded-lg px-3 py-2 text-sm",
            statusMessage.type === "error"
              ? "bg-[var(--error-light)] text-[var(--error)]"
              : "bg-[var(--success-light)] text-[var(--success)]"
          )}
        >
          {statusMessage.text}
        </p>
      )}

      {showingLost ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredLeads.map((lead) => (
            <LeadCard
              key={lead.id}
              id={lead.id}
              name={lead.name}
              account_code={lead.account_code}
              phone={lead.phone}
              sales_stage={lead.sales_stage}
              temperature={lead.temperature}
              city={lead.city}
              created_at={lead.created_at}
              next_followup_at={lead.next_followup_at}
              last_outward_on={lead.last_outward_on}
              last_inward_on={lead.last_inward_on}
              outward_conversions={lead.outward_conversions}
              outward_earnings_inr={lead.outward_earnings_inr}
              assigned_name={
                [lead.telecaller_name && `TC: ${lead.telecaller_name}`, lead.surveyor_name && `SV: ${lead.surveyor_name}`]
                  .filter(Boolean)
                  .join(" · ") || lead.assigned_profile?.name
              }
            />
          ))}
          {filteredLeads.length === 0 && (
            <p className="col-span-full py-12 text-center text-sm text-[var(--text-muted)]">
              No lost leads
            </p>
          )}
        </div>
      ) : (
        <>
          {/* Desktop kanban */}
          <div className="hidden gap-3 overflow-x-auto pb-2 lg:flex">
            {stageGroups.map((group) => {
              const groupLeads = leadsForGroup(group);
              const dropStage = group.stages[0];
              const isDropTarget =
                dragOverStage !== null && group.stages.includes(dragOverStage);
              return (
                <div
                  key={group.id}
                  className={cn(
                    "flex w-64 shrink-0 flex-col rounded-xl border border-[var(--border)] bg-[var(--bg)]/60",
                    isDropTarget && "border-[var(--primary)] bg-[var(--primary-faint)]"
                  )}
                >
                  <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] px-3 py-2.5">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${STAGE_COLORS[dropStage]}`}
                      />
                      <span className="truncate text-sm font-bold text-[var(--text-dark)]">
                        {group.label}
                      </span>
                    </div>
                    <span className="shrink-0 rounded-full border border-[var(--border-light)] bg-white px-2.5 py-0.5 text-xs font-bold text-[var(--text-muted)]">
                      {groupLeads.length}
                    </span>
                  </div>
                  <div
                    className="flex flex-1 flex-col gap-2 p-2"
                    onDragOver={(event) => {
                      event.preventDefault();
                      setDragOverStage(dropStage);
                    }}
                    onDragLeave={() => setDragOverStage(null)}
                    onDrop={(event) => {
                      event.preventDefault();
                      handleDrop(dropStage);
                    }}
                  >
                    {groupLeads.map((lead) => (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={() => setDraggingId(lead.id)}
                        onDragEnd={clearDragState}
                        className={cn(draggingId === lead.id && "opacity-50")}
                      >
                        <LeadCard
                          id={lead.id}
                          name={lead.name}
              account_code={lead.account_code}
                          phone={lead.phone}
                          sales_stage={lead.sales_stage}
                          temperature={lead.temperature}
                          showStageBadge={false}
                          city={lead.city}
                          created_at={lead.created_at}
                          next_followup_at={lead.next_followup_at}
                          last_outward_on={lead.last_outward_on}
                          last_inward_on={lead.last_inward_on}
                          outward_conversions={lead.outward_conversions}
              outward_earnings_inr={lead.outward_earnings_inr}
                          showMoveToWon={canMarkWon}
                          onWon={() => handleWon(lead.id)}
                          assigned_name={
                            [
                              lead.telecaller_name && `TC: ${lead.telecaller_name}`,
                              lead.surveyor_name && `SV: ${lead.surveyor_name}`,
                            ]
                              .filter(Boolean)
                              .join(" · ") || lead.assigned_profile?.name
                          }
                        />
                      </div>
                    ))}
                    {groupLeads.length === 0 && (
                      <p className="py-6 text-center text-xs text-[var(--text-muted)]">
                        Empty
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Mobile stacked groups */}
          <div className="space-y-4 lg:hidden">
            {stageGroups.map((group) => {
              const groupLeads = leadsForGroup(group);
              const dropStage = group.stages[0];
              return (
                <div
                  key={group.id}
                  className="rounded-xl border border-[var(--border)] bg-white p-3"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className={`h-2.5 w-2.5 shrink-0 rounded-full ${STAGE_COLORS[dropStage]}`}
                      />
                      <span className="truncate text-sm font-bold text-[var(--text-dark)]">
                        {group.label}
                      </span>
                    </div>
                    <span className="shrink-0 rounded-full bg-[var(--bg)] px-2.5 py-0.5 text-xs font-bold text-[var(--text-muted)]">
                      {groupLeads.length}
                    </span>
                  </div>
                  <div className="mt-3 space-y-2">
                    {groupLeads.map((lead) => (
                      <div key={lead.id} className="space-y-1.5">
                        <LeadCard
                          id={lead.id}
                          name={lead.name}
              account_code={lead.account_code}
                          phone={lead.phone}
                          sales_stage={lead.sales_stage}
                          temperature={lead.temperature}
                          showStageBadge={false}
                          city={lead.city}
                          created_at={lead.created_at}
                          next_followup_at={lead.next_followup_at}
                          last_outward_on={lead.last_outward_on}
                          last_inward_on={lead.last_inward_on}
                          outward_conversions={lead.outward_conversions}
              outward_earnings_inr={lead.outward_earnings_inr}
                          showMoveToWon={canMarkWon}
                          onWon={() => handleWon(lead.id)}
                          assigned_name={
                            [
                              lead.telecaller_name && `TC: ${lead.telecaller_name}`,
                              lead.surveyor_name && `SV: ${lead.surveyor_name}`,
                            ]
                              .filter(Boolean)
                              .join(" · ") || lead.assigned_profile?.name
                          }
                        />
                        <div className="flex flex-wrap gap-1 px-1">
                          {stages
                            .filter((target) => !group.stages.includes(target))
                            .map((target) => (
                              <button
                                key={target}
                                type="button"
                                disabled={pending}
                                onClick={() => moveLeadWithButtons(lead.id, target)}
                                className="rounded border border-[var(--border)] px-2 py-0.5 text-[0.65rem] font-medium text-[var(--text-muted)] hover:border-[var(--primary)] hover:text-[var(--primary)]"
                              >
                                → {SALES_STAGE_LABELS[target]}
                              </button>
                            ))}
                          <button
                            type="button"
                            onClick={() => openLead(lead.id)}
                            className="rounded border border-[var(--border)] px-2 py-0.5 text-[0.65rem] font-medium text-[var(--primary)]"
                          >
                            Open
                          </button>
                        </div>
                      </div>
                    ))}
                    {groupLeads.length === 0 && (
                      <p className="py-3 text-center text-xs text-[var(--text-muted)]">
                        Empty
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      <BookSurveyModal
        lead={bookingLead}
        open={Boolean(bookingLead)}
        onClose={() => setBookingLead(null)}
        onDone={() => {
          setBookingLead(null);
          router.refresh();
          showStatus("success", "Site visit scheduled");
        }}
        mode={bookingLead?.visit_scheduled_at ? "reschedule" : "book"}
      />
    </div>
  );
}
