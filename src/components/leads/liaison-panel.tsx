"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { DealerCommissionPanel } from "@/components/dealers/dealer-commission-panel";
import {
  addPortalDocument,
  markMeterInstalled,
  markSubsidyReceived,
  verifySubsidy,
} from "@/actions/liaison";
import {
  daysUntilSubsidyDue,
  isSubsidyTimerOverdue,
  PORTAL_DOC_TYPES,
  PORTAL_DOC_LABELS,
} from "@/lib/domain/portal";
import type { LeadWithRelations } from "@/lib/domain/types";
import { formatDateTime } from "@/lib/utils";

const LIAISON_STAGES = new Set([
  "installation_completed",
  "liaison_in_progress",
  "meter_installed",
  "subsidy_pending",
  "subsidy_received_pending_accounts",
  "completed",
]);

export function LiaisonPanel({
  lead,
  onDone,
  canLiaison = false,
  canVerifySubsidy = false,
  canManageDocs = false,
  canSubmitCommission = false,
  canApproveCommission = false,
  canAssignDealer = false,
}: {
  lead: LeadWithRelations;
  onDone: () => void;
  canLiaison?: boolean;
  canVerifySubsidy?: boolean;
  canManageDocs?: boolean;
  canSubmitCommission?: boolean;
  canApproveCommission?: boolean;
  canAssignDealer?: boolean;
}) {
  if (!LIAISON_STAGES.has(lead.sales_stage) && !lead.installation_completed_at) {
    return null;
  }

  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [bankRef, setBankRef] = useState("");
  const [certUrl, setCertUrl] = useState("");
  const [docTitle, setDocTitle] = useState("");
  const [docUrl, setDocUrl] = useState("");
  const [docType, setDocType] = useState<(typeof PORTAL_DOC_TYPES)[number]>("invoice");
  const [promptCommission, setPromptCommission] = useState(false);

  const overdue = isSubsidyTimerOverdue(lead);
  const daysLeft = daysUntilSubsidyDue(lead.subsidy_timer_due_at);

  return (
    <div className="space-y-4">
    <div className="space-y-4 rounded-xl border border-[var(--border)] bg-white p-4">
      <div>
        <h3 className="font-semibold text-[var(--text-dark)]">Discom / Subsidy</h3>
        <p className="text-xs text-[var(--text-muted)]">
          Portal code:{" "}
          <span className="font-mono font-semibold text-[var(--primary)]">
            {lead.portal_code ?? "—"}
          </span>
          {lead.portal_code && (
            <>
              {" "}
              ·{" "}
              <a
                className="font-semibold text-[var(--primary)]"
                href={`/portal/${lead.portal_code}`}
                target="_blank"
                rel="noreferrer"
              >
                Open portal
              </a>
            </>
          )}
        </p>
        {lead.subsidy_timer_due_at && !lead.subsidy_received_at && (
          <p
            className={`mt-1 text-xs ${overdue ? "text-[var(--error)]" : "text-[var(--text-muted)]"}`}
          >
            Subsidy timer due {formatDateTime(lead.subsidy_timer_due_at)}
            {daysLeft != null ? ` (${daysLeft}d)` : ""}
            {overdue ? " — OVERDUE" : ""}
          </p>
        )}
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs text-[var(--text-muted)]">Meter installed</dt>
          <dd>{formatDateTime(lead.meter_installed_at)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--text-muted)]">Subsidy received</dt>
          <dd>{formatDateTime(lead.subsidy_received_at)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--text-muted)]">Subsidy verified</dt>
          <dd>{formatDateTime(lead.subsidy_verified_at)}</dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--text-muted)]">Certificate</dt>
          <dd className="truncate">
            {lead.completion_certificate_url ? (
              <a
                href={lead.completion_certificate_url}
                className="text-[var(--primary)]"
                target="_blank"
                rel="noreferrer"
              >
                View
              </a>
            ) : (
              "—"
            )}
          </dd>
        </div>
      </dl>

      {canLiaison &&
        (lead.sales_stage === "liaison_in_progress" ||
          lead.sales_stage === "installation_completed") && (
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                try {
                  await markMeterInstalled({ leadId: lead.id });
                  setOk("Meter marked installed — 15-day subsidy timer started");
                  onDone();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Failed");
                }
              })
            }
          >
            Mark meter installed
          </Button>
        )}

      {canLiaison &&
        (lead.sales_stage === "subsidy_pending" ||
          lead.sales_stage === "meter_installed") &&
        Boolean(lead.meter_installed_at) &&
        !lead.subsidy_received_at && (
          <Button
            type="button"
            size="sm"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                setError(null);
                try {
                  await markSubsidyReceived({ leadId: lead.id });
                  setOk("Subsidy marked received — awaiting Accounts");
                  onDone();
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Failed");
                }
              })
            }
          >
            Mark subsidy received
          </Button>
        )}

      {canVerifySubsidy &&
        lead.sales_stage === "subsidy_received_pending_accounts" && (
          <div className="space-y-2 border-t border-[var(--border-light)] pt-3">
            <Label>Bank reference</Label>
            <Input value={bankRef} onChange={(e) => setBankRef(e.target.value)} />
            <Label>Certificate URL (optional)</Label>
            <Input value={certUrl} onChange={(e) => setCertUrl(e.target.value)} />
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  setError(null);
                  try {
                    const result = await verifySubsidy({
                      leadId: lead.id,
                      bankReference: bankRef,
                      certificateUrl: certUrl || null,
                    });
                    setOk("Project completed");
                    if (result.needsCommissionForm) setPromptCommission(true);
                    onDone();
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Failed");
                  }
                })
              }
            >
              Verify subsidy & complete
            </Button>
          </div>
        )}

      {canManageDocs && lead.sales_stage !== "completed" && (
        <form
          className="space-y-2 border-t border-[var(--border-light)] pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              try {
                await addPortalDocument({
                  leadId: lead.id,
                  docType,
                  title: docTitle,
                  fileUrl: docUrl,
                });
                setDocTitle("");
                setDocUrl("");
                setOk("Document added to portal");
                onDone();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed");
              }
            });
          }}
        >
          <p className="text-sm font-semibold">Add portal document</p>
          <select
            className="w-full rounded-lg border-[1.5px] border-[var(--border)] bg-white px-3 py-2 text-sm"
            value={docType}
            onChange={(e) =>
              setDocType(e.target.value as (typeof PORTAL_DOC_TYPES)[number])
            }
          >
            {PORTAL_DOC_TYPES.filter((t) => t !== "customer_upload").map((t) => (
              <option key={t} value={t}>
                {PORTAL_DOC_LABELS[t]}
              </option>
            ))}
          </select>
          <Input
            placeholder="Title"
            required
            value={docTitle}
            onChange={(e) => setDocTitle(e.target.value)}
          />
          <Input
            placeholder="https://…"
            type="url"
            required
            value={docUrl}
            onChange={(e) => setDocUrl(e.target.value)}
          />
          <Button type="submit" size="sm" disabled={pending}>
            Upload link
          </Button>
        </form>
      )}

      {error && <p className="text-sm text-[var(--error)]">{error}</p>}
      {ok && <p className="text-sm text-[var(--success)]">{ok}</p>}
    </div>

    {(canAssignDealer ||
      canSubmitCommission ||
      canApproveCommission ||
      lead.sales_stage === "completed" ||
      promptCommission) && (
      <DealerCommissionPanel
        leadId={lead.id}
        dealerId={lead.dealer_id}
        salesStage={promptCommission ? "completed" : lead.sales_stage}
        forceOpen={promptCommission}
        canSubmit={canSubmitCommission}
        canApprove={canApproveCommission}
        canAssign={canAssignDealer}
        onDone={onDone}
      />
    )}
    </div>
  );
}
