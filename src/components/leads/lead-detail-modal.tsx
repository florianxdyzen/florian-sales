"use client";

import { useEffect, useState } from "react";
import { X, Loader2, Phone, MessageCircle } from "lucide-react";
import { LeadDetailView } from "@/components/leads/lead-detail-view";
import { LeadHeaderActions } from "@/components/leads/lead-header-actions";
import { useLeadModal } from "@/components/leads/lead-modal-context";
import { getLead } from "@/actions/leads";
import { formatAccountTitle } from "@/lib/domain/account-code";
import { formatPhone, cn } from "@/lib/utils";
import type { LeadWithRelations } from "@/lib/domain/types";

function whatsappHref(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const withCountry = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${withCountry}`;
}

export function LeadDetailModal({
  canEditLead = false,
  canDeleteLead = false,
  canScheduleVisit = true,
  canConductSurvey = true,
  canCreateQuotations = false,
  canMarkWon = false,
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
  canEditLead?: boolean;
  canDeleteLead?: boolean;
  canScheduleVisit?: boolean;
  canConductSurvey?: boolean;
  canCreateQuotations?: boolean;
  canMarkWon?: boolean;
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
  const { leadId, modalKind, closeLead } = useLeadModal();
  const [loading, setLoading] = useState(false);
  const [lead, setLead] = useState<LeadWithRelations | null>(null);

  async function refresh(id: string) {
    try {
      const data = await getLead(id);
      setLead(data);
    } catch {
      // Keep current lead visible; avoid crashing the modal on refresh failures.
    }
  }

  useEffect(() => {
    if (!leadId || modalKind !== "lead") {
      setLead(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    getLead(leadId)
      .then((data) => {
        if (!cancelled) setLead(data);
      })
      .catch(() => {
        if (!cancelled) setLead(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [leadId, modalKind]);

  useEffect(() => {
    if (!leadId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLead();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [leadId, closeLead]);

  if (!leadId || modalKind !== "lead") return null;

  const showSpinner = loading && !lead;

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/40 sm:items-center sm:p-4 sm:backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeLead();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        className="flex max-h-[94dvh] w-full max-w-3xl flex-col rounded-t-2xl bg-white shadow-[var(--shadow-lg)] sm:max-h-[calc(100dvh-2rem)] sm:rounded-[var(--radius-xl)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border)] p-4 sm:p-5">
          <div className="min-w-0">
            <h2 className="truncate font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--text-dark)]">
              {lead ? formatAccountTitle(lead.account_code, lead.name) : "Lead"}
            </h2>
            {lead && (
              <div className="mt-2 flex flex-wrap gap-2">
                <a
                  href={`tel:${lead.phone}`}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--primary)] hover:bg-[var(--primary-faint)]"
                  )}
                >
                  <Phone className="h-3.5 w-3.5" />
                  {formatPhone(lead.phone)}
                </a>
                <a
                  href={whatsappHref(lead.phone)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-2.5 py-1.5 text-xs font-semibold text-[var(--success)] hover:bg-[var(--success-light)]"
                >
                  <MessageCircle className="h-3.5 w-3.5" />
                  WhatsApp
                </a>
              </div>
            )}
          </div>
          <div className="flex min-w-0 shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-start">
            {lead && (
              <LeadHeaderActions
                lead={lead}
                onDone={() => void refresh(lead.id)}
                canScheduleVisit={canScheduleVisit}
                canConductSurvey={canConductSurvey}
                canCreateQuotations={canCreateQuotations}
              />
            )}
            <button
              type="button"
              onClick={closeLead}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg)]"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {showSpinner && (
            <div className="flex items-center justify-center py-16 text-[var(--text-muted)]">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
          {!showSpinner && !lead && (
            <p className="py-12 text-center text-sm text-[var(--text-muted)]">
              Lead not found or you do not have access.
            </p>
          )}
          {lead && (
            <LeadDetailView
              lead={lead}
              canEditLead={canEditLead}
              canDeleteLead={canDeleteLead}
              canScheduleVisit={canScheduleVisit}
              canConductSurvey={canConductSurvey}
              canCreateQuotations={canCreateQuotations}
              canMarkWon={canMarkWon}
              canRecordPayment={canRecordPayment}
              canVerifyPayment={canVerifyPayment}
              canUploadFeasibility={canUploadFeasibility}
              canApproveFeasibility={canApproveFeasibility}
              canAssignInstall={canAssignInstall}
              canUnassignInstall={canUnassignInstall}
              canUploadInstall={canUploadInstall}
              canCompleteInstall={canCompleteInstall}
              canLiaison={canLiaison}
              canVerifySubsidy={canVerifySubsidy}
              canManagePortalDocs={canManagePortalDocs}
              canSubmitCommission={canSubmitCommission}
              canApproveCommission={canApproveCommission}
              canAssignDealer={canAssignDealer}
              onRefresh={() => void refresh(lead.id)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
