"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { FRS_ALLOW_CONSUMER_WON, frsDefaultQuoteHref } from "@/lib/product-surface";
import { Phone, Bell, CheckCircle2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label, Textarea, Select, Input } from "@/components/ui/input";
import { cn, formatDateTime } from "@/lib/utils";
import {
  CALL_OUTCOME_LABELS,
  LOST_REASONS,
  QUICK_CALL_ACTIONS,
  type CallOutcome,
} from "@/lib/domain/sales";
import {
  getCallLogs,
  getLeadFollowups,
  logCallWithFollowup,
  resolveFollowup,
} from "@/actions/sales";
import { markLeadLost, reopenLead, updateLead } from "@/actions/leads";
import { TEMPERATURE_LABELS, TEMPERATURES } from "@/lib/domain/workflow";
import { isCustomerSalesStage } from "@/lib/domain/workflow";
import type { LeadWithRelations } from "@/lib/domain/types";
import { QuotePlaceholderCard, SurveyCompletePanel } from "@/components/leads/survey-complete-panel";
import { PaymentPanel } from "@/components/leads/payment-panel";
import { FeasibilityPanel } from "@/components/leads/feasibility-panel";
import { InstallationPanel } from "@/components/leads/installation-panel";
import { LiaisonPanel } from "@/components/leads/liaison-panel";

interface CallLog {
  id: string;
  outcome: string;
  notes: string | null;
  created_at: string;
  user?: { name: string } | null;
}

interface FollowupReminder {
  id: string;
  message: string;
  due_at: string;
}

export function SalesActionsPanel({
  lead,
  onDone,
  canCreateQuotations = false,
  canRecordPayment = false,
  canVerifyPayment = false,
  canUploadFeasibility = false,
  canApproveFeasibility = false,
  canAssignInstall = false,
  canUnassignInstall = false,
  canUploadInstall = false,
  canCompleteInstall = false,
  canLiaison = false,
  canVerifySubsidy = false,
  canManagePortalDocs = false,
  canSubmitCommission = false,
  canApproveCommission = false,
  canAssignDealer = false,
}: {
  lead: LeadWithRelations;
  onDone: () => void;
  canScheduleVisit?: boolean;
  canConductSurvey?: boolean;
  canCreateQuotations?: boolean;
  canRecordPayment?: boolean;
  canVerifyPayment?: boolean;
  canUploadFeasibility?: boolean;
  canApproveFeasibility?: boolean;
  canAssignInstall?: boolean;
  canUnassignInstall?: boolean;
  canUploadInstall?: boolean;
  canCompleteInstall?: boolean;
  canLiaison?: boolean;
  canVerifySubsidy?: boolean;
  canManagePortalDocs?: boolean;
  canSubmitCommission?: boolean;
  canApproveCommission?: boolean;
  canAssignDealer?: boolean;
}) {
  const [outcome, setOutcome] = useState<CallOutcome>("connected");
  const [notes, setNotes] = useState("");
  const [followupAction, setFollowupAction] = useState("");
  const [followupAt, setFollowupAt] = useState("");
  const [callLogs, setCallLogs] = useState<CallLog[]>([]);
  const [followups, setFollowups] = useState<FollowupReminder[]>([]);
  const [lossReason, setLossReason] = useState("");
  const [temperature, setTemperature] = useState(lead.temperature);
  const [pending, startTransition] = useTransition();

  const isActive = lead.sales_stage !== "lost";

  async function loadData() {
    const [logs, reminders] = await Promise.all([
      getCallLogs(lead.id),
      getLeadFollowups(lead.id),
    ]);
    setCallLogs(logs as CallLog[]);
    setFollowups(reminders as FollowupReminder[]);
  }

  useEffect(() => {
    void loadData();
    if (lead.next_followup_at && !followupAt) {
      setFollowupAt(new Date(lead.next_followup_at).toISOString().slice(0, 16));
    }
    if (lead.next_followup_action) setFollowupAction(lead.next_followup_action);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);

  const nextFollowup = followups[0];
  const isOverdue = nextFollowup && new Date(nextFollowup.due_at) < new Date();

  function saveCall(nextOutcome: CallOutcome) {
    startTransition(async () => {
      if (temperature !== lead.temperature) {
        await updateLead(lead.id, { temperature });
      }
      await logCallWithFollowup({
        leadId: lead.id,
        outcome: nextOutcome,
        notes,
        followupAction: followupAt
          ? followupAction.trim() || "Follow-up"
          : undefined,
        followupAt: followupAt ? new Date(followupAt).toISOString() : undefined,
      });
      setNotes("");
      setFollowupAction("");
      setFollowupAt("");
      setOutcome(nextOutcome);
      await loadData();
      onDone();
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
      <Link
        href={`/accounts/${lead.id}`}
        className="inline-flex text-sm font-semibold text-[var(--primary)] hover:underline"
      >
        Open trade ledger
      </Link>
      <Link
        href={frsDefaultQuoteHref(lead.id)}
        className="inline-flex text-sm font-semibold text-[var(--primary)] hover:underline"
      >
        New B2B quote
      </Link>
      </div>
      {nextFollowup && (
        <div
          className={cn(
            "flex items-start gap-3 rounded-xl border p-4",
            isOverdue
              ? "border-[var(--error)] bg-[var(--error-light)]"
              : "border-[var(--primary)] bg-[var(--primary-faint)]"
          )}
        >
          {isOverdue ? (
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--error)]" />
          ) : (
            <Bell className="mt-0.5 h-5 w-5 shrink-0 text-[var(--primary)]" />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-[var(--text-dark)]">
              {isOverdue ? "Overdue follow-up" : "Upcoming follow-up"}
            </p>
            <p className="mt-0.5 text-sm text-[var(--text-body)]">{nextFollowup.message}</p>
            <p className="mt-1 text-xs font-medium text-[var(--text-muted)]">
              {formatDateTime(nextFollowup.due_at)}
            </p>
          </div>
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                await resolveFollowup(nextFollowup.id, lead.id);
                await loadData();
                onDone();
              })
            }
          >
            <CheckCircle2 className="h-3.5 w-3.5" /> Done
          </Button>
        </div>
      )}

      {isActive && (
        <div className="space-y-3 rounded-xl border border-[var(--border)] bg-white p-4">
          <div className="flex items-center gap-2">
            <Phone className="h-4 w-4 text-[var(--primary)]" />
            <h3 className="text-sm font-semibold text-[var(--text-dark)]">Log call</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {QUICK_CALL_ACTIONS.map((action) => (
              <Button
                key={action.value}
                type="button"
                size="sm"
                variant={outcome === action.value ? "primary" : "secondary"}
                disabled={pending}
                onClick={() => saveCall(action.value)}
              >
                {action.label}
              </Button>
            ))}
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="What was discussed…"
              rows={3}
            />
          </div>
          <div>
            <Label>Temperature</Label>
            <Select
              value={temperature}
              onChange={(e) =>
                setTemperature(e.target.value as typeof lead.temperature)
              }
            >
              {TEMPERATURES.map((t) => (
                <option key={t} value={t}>
                  {TEMPERATURE_LABELS[t]}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Next call action</Label>
              <Input
                value={followupAction}
                onChange={(e) => setFollowupAction(e.target.value)}
                placeholder="e.g. Call back, send brochure…"
              />
            </div>
            <div>
              <Label>Next call</Label>
              <Input
                type="datetime-local"
                value={followupAt}
                onChange={(e) => setFollowupAt(e.target.value)}
              />
            </div>
          </div>
          <Button
            type="button"
            disabled={pending}
            onClick={() => saveCall("connected")}
          >
            Save call
          </Button>
        </div>
      )}

      <QuotePlaceholderCard lead={lead} canCreate={canCreateQuotations} />

      {FRS_ALLOW_CONSUMER_WON && lead.sales_stage === "survey_completed" && (
        <SurveyCompletePanel
          lead={lead}
          onDone={onDone}
          canConductSurvey={false}
        />
      )}

      {FRS_ALLOW_CONSUMER_WON && isCustomerSalesStage(lead.sales_stage) && lead.portal_code && (
        <div className="rounded-xl border border-[var(--border)] bg-white p-4">
          <h3 className="font-semibold text-[var(--text-dark)]">Customer portal</h3>
          <p className="mt-1 text-xs text-[var(--text-muted)]">
            Created when this lead was won. Share the code and registered mobile number.
          </p>
          <p className="mt-2 font-mono text-lg font-semibold text-[var(--primary)]">
            {lead.portal_code}
          </p>
          <a
            className="mt-2 inline-block text-sm font-semibold text-[var(--primary)]"
            href={`/portal/${lead.portal_code}`}
            target="_blank"
            rel="noreferrer"
          >
            Open portal
          </a>
        </div>
      )}

      {FRS_ALLOW_CONSUMER_WON && (
        <>
      <PaymentPanel
        lead={lead}
        onDone={onDone}
        canRecord={canRecordPayment}
        canVerify={canVerifyPayment}
      />
      <FeasibilityPanel
        lead={lead}
        onDone={onDone}
        canUpload={canUploadFeasibility}
        canApprove={canApproveFeasibility}
      />
      <InstallationPanel
        lead={lead}
        onDone={onDone}
        canAssign={canAssignInstall}
        canUnassign={canUnassignInstall}
        canUpload={canUploadInstall}
        canComplete={canCompleteInstall}
      />
      <LiaisonPanel
        lead={lead}
        onDone={onDone}
        canLiaison={canLiaison}
        canVerifySubsidy={canVerifySubsidy}
        canManageDocs={canManagePortalDocs}
        canSubmitCommission={canSubmitCommission}
        canApproveCommission={canApproveCommission}
        canAssignDealer={canAssignDealer}
      />
        </>
      )}

      {isActive && !isCustomerSalesStage(lead.sales_stage) && (
        <div className="rounded-xl border border-[var(--error)]/30 bg-[var(--error-light)] p-4">
          <Label>Mark as lost</Label>
          <Select
            className="mt-1"
            value={lossReason}
            onChange={(e) => setLossReason(e.target.value)}
          >
            <option value="">Select a reason</option>
            {LOST_REASONS.map((reason) => (
              <option key={reason} value={reason}>
                {reason}
              </option>
            ))}
          </Select>
          <Button
            className="mt-2"
            size="sm"
            variant="danger"
            disabled={pending || !lossReason.trim()}
            onClick={() =>
              startTransition(async () => {
                await markLeadLost(lead.id, lossReason.trim());
                onDone();
              })
            }
          >
            Mark lost
          </Button>
        </div>
      )}

      {lead.sales_stage === "lost" && (
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await reopenLead(lead.id);
              onDone();
            })
          }
        >
          Reopen lead
        </Button>
      )}

      {callLogs.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            Recent calls
          </h4>
          {callLogs.slice(0, 5).map((log) => (
            <div
              key={log.id}
              className="rounded-lg border border-[var(--border-light)] bg-[var(--bg)] px-3 py-2 text-sm"
            >
              <div className="flex justify-between gap-2">
                <span className="font-medium text-[var(--text-dark)]">
                  {CALL_OUTCOME_LABELS[log.outcome] ?? log.outcome}
                </span>
                <span className="text-xs text-[var(--text-muted)]">
                  {formatDateTime(log.created_at)}
                </span>
              </div>
              {log.notes && <p className="mt-1 text-[var(--text-body)]">{log.notes}</p>}
              {log.user?.name && (
                <p className="mt-0.5 text-xs text-[var(--text-muted)]">{log.user.name}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
