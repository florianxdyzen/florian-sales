"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Users, X } from "lucide-react";
import { CustomerDetailView } from "@/components/leads/customer-detail-view";
import { CustomerHeaderActions } from "@/components/leads/customer-header-actions";
import { QuotePlaceholderCard } from "@/components/leads/survey-complete-panel";
import { useLeadModal } from "@/components/leads/lead-modal-context";
import { getLead } from "@/actions/leads";
import { formatAccountTitle } from "@/lib/domain/account-code";
import type { LeadWithRelations } from "@/lib/domain/types";
import type { SalesStage } from "@/lib/domain/workflow";

export function CustomerDetailModal({
  canEditLead = false,
  canDeleteLead = false,
  canCreateQuotations = false,
  canRecordPayment = false,
  canVerifyPayment = false,
  canUploadFeasibility = false,
  canApproveFeasibility = false,
  canLiaison = false,
  canVerifySubsidy = false,
  canManagePortalDocs = false,
  canSubmitCommission = false,
  canApproveCommission = false,
  canAssignDealer = false,
}: {
  canEditLead?: boolean;
  canDeleteLead?: boolean;
  canCreateQuotations?: boolean;
  canRecordPayment?: boolean;
  canVerifyPayment?: boolean;
  canUploadFeasibility?: boolean;
  canApproveFeasibility?: boolean;
  canLiaison?: boolean;
  canVerifySubsidy?: boolean;
  canManagePortalDocs?: boolean;
  canSubmitCommission?: boolean;
  canApproveCommission?: boolean;
  canAssignDealer?: boolean;
}) {
  const { leadId, modalKind, closeLead } = useLeadModal();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [lead, setLead] = useState<LeadWithRelations | null>(null);

  async function refresh(id: string) {
    try {
      const data = await getLead(id);
      setLead(data);
      router.refresh();
    } catch {
      // Keep current lead visible; avoid crashing the modal on refresh failures.
    }
  }

  useEffect(() => {
    if (!leadId || modalKind !== "customer") {
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
    if (!leadId || modalKind !== "customer") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLead();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [leadId, modalKind, closeLead]);

  if (!leadId || modalKind !== "customer") return null;

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
        aria-label="Customer"
        className="flex max-h-[94dvh] w-full max-w-3xl flex-col rounded-t-2xl bg-white shadow-[var(--shadow-lg)] sm:max-h-[calc(100dvh-2rem)] sm:rounded-[var(--radius-xl)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border)] p-4 sm:p-5">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-[var(--primary)]">
              <Users className="h-3.5 w-3.5" />
              Customer
            </p>
            <h2 className="mt-1 truncate font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--text-dark)]">
              {lead ? formatAccountTitle(lead.account_code, lead.name) : "Customer"}
            </h2>
            {lead && (
              <div className="mt-2">
                <CustomerHeaderActions
                  name={lead.name}
                  phone={lead.phone}
                  portalCode={lead.portal_code}
                  salesStage={lead.sales_stage as SalesStage}
                  city={lead.city}
                />
              </div>
            )}
          </div>
          <div className="flex min-w-0 shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-start">
            {lead && (
              <QuotePlaceholderCard
                lead={lead}
                canCreate={canCreateQuotations}
                variant="header"
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
              Customer not found or you do not have access.
            </p>
          )}
          {lead && (
            <CustomerDetailView
              lead={lead}
              onRefresh={() => void refresh(lead.id)}
              canEditLead={canEditLead}
              canDeleteLead={canDeleteLead}
              onDeleted={closeLead}
              canCreateQuotations={canCreateQuotations}
              canRecordPayment={canRecordPayment}
              canVerifyPayment={canVerifyPayment}
              canUploadFeasibility={canUploadFeasibility}
              canApproveFeasibility={canApproveFeasibility}
              canLiaison={canLiaison}
              canVerifySubsidy={canVerifySubsidy}
              canManagePortalDocs={canManagePortalDocs}
              canSubmitCommission={canSubmitCommission}
              canApproveCommission={canApproveCommission}
              canAssignDealer={canAssignDealer}
            />
          )}
        </div>
      </div>
    </div>
  );
}
