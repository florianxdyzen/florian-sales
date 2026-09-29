"use client";

import { Badge } from "@/components/ui/badge";
import { MoveToWonButton } from "@/components/leads/move-to-won-button";
import { scoreTradeActivity } from "@/lib/domain/trade-score";
import { SALES_STAGE_LABELS, TEMPERATURE_LABELS } from "@/lib/domain/workflow";
import { formatAccountTitle } from "@/lib/domain/account-code";
import { formatAgeShort, formatCurrency, formatDateTime, formatPhone, cn } from "@/lib/utils";
import Link from "next/link";
import { useLeadModal } from "@/components/leads/lead-modal-context";
import type { LeadTemperature, SalesStage } from "@/lib/domain/workflow";

interface LeadCardProps {
  id: string;
  name: string;
  account_code?: string | null;
  phone: string;
  sales_stage: SalesStage;
  temperature?: LeadTemperature;
  assigned_name?: string | null;
  showStageBadge?: boolean;
  city?: string | null;
  created_at?: string | null;
  next_followup_at?: string | null;
  last_outward_on?: string | null;
  last_inward_on?: string | null;
  outward_conversions?: number | null;
  outward_earnings_inr?: number | null;
  showMoveToWon?: boolean;
  onWon?: () => void;
}

export function LeadCard({
  id,
  name,
  account_code,
  phone,
  sales_stage,
  temperature = "warm",
  assigned_name,
  showStageBadge = true,
  city,
  created_at,
  next_followup_at,
  last_outward_on,
  last_inward_on,
  outward_conversions,
  outward_earnings_inr,
  showMoveToWon = false,
  onWon,
}: LeadCardProps) {
  const { openLead } = useLeadModal();
  const ageShort = created_at ? formatAgeShort(created_at) : null;
  const exactWhen = created_at ? formatDateTime(created_at) : null;
  const ageMs = created_at ? Date.now() - new Date(created_at).getTime() : 0;
  const ageDays = ageMs / (1000 * 60 * 60 * 24);
  const isStale =
    Boolean(created_at) &&
    ageDays >= 3 &&
    (sales_stage === "new_lead" || sales_stage === "contacted");
  const score = scoreTradeActivity({
    lastOutwardOn: last_outward_on,
    lastInwardOn: last_inward_on,
    conversions: outward_conversions,
    earningsInr: outward_earnings_inr,
    nextFollowupAt: next_followup_at,
  });
  const canMoveToWon =
    showMoveToWon &&
    (sales_stage === "survey_completed" || sales_stage === "quoted");

  return (
    <div className="relative rounded-lg border-[1.5px] border-[var(--border)] bg-white transition hover:-translate-y-px hover:border-[var(--primary)] hover:shadow-[var(--shadow)]">
      <button
        type="button"
        data-lead-id={id}
        onClick={() => openLead(id)}
        className={cn(
          "block w-full p-3 text-left",
          canMoveToWon ? "pb-3" : "pb-7"
        )}
      >
        <p className="truncate text-sm font-semibold text-[var(--text-dark)]">
          {formatAccountTitle(account_code, name)}
        </p>
        <p className="mt-0.5 text-xs text-[var(--text-muted)] tabular-nums">{formatPhone(phone)}</p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <Badge variant={temperature}>{TEMPERATURE_LABELS[temperature]}</Badge>
          {score.conversions > 0 && (
            <Badge variant="quoted">{score.conversions} conv.</Badge>
          )}
          {score.earningsInr > 0 && (
            <Badge variant="quoted">{formatCurrency(score.earningsInr)}</Badge>
          )}
          {score.followUpDue && <Badge variant="follow_up_due">Follow-up due</Badge>}
          {showStageBadge && (
            <Badge variant={sales_stage}>{SALES_STAGE_LABELS[sales_stage]}</Badge>
          )}
        </div>
        {city && <p className="mt-1.5 truncate text-[0.7rem] text-[var(--text-muted)]">{city}</p>}
        {next_followup_at && (
          <p className="mt-1 text-[0.7rem] text-[var(--text-light)]">
            Follow-up:{" "}
            {new Date(next_followup_at).toLocaleDateString(undefined, {
              month: "short",
              day: "numeric",
            })}
          </p>
        )}
        {assigned_name && (
          <p className={cn("mt-1 truncate text-[0.7rem] text-[var(--text-muted)]", !canMoveToWon && "pr-8")}>
            {assigned_name}
          </p>
        )}
      </button>
      {canMoveToWon && (
        <div className="px-3 pb-7">
          <MoveToWonButton leadId={id} leadName={name} variant="card" onWon={onWon} />
        </div>
      )}
      <Link
        href={`/accounts/${id}`}
        onClick={(event) => event.stopPropagation()}
        className="absolute bottom-2 left-2.5 text-[0.65rem] font-semibold text-[var(--primary)] hover:underline"
      >
        Ledger
      </Link>
      {ageShort && (
        <span
          className={cn(
            "absolute bottom-2 right-2.5 text-[0.65rem] font-semibold tabular-nums",
            isStale ? "text-[var(--warn)]" : "text-[var(--text-muted)]"
          )}
          title={exactWhen ?? undefined}
        >
          {ageShort}
        </span>
      )}
    </div>
  );
}
