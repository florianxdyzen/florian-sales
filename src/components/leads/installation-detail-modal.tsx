"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { HardHat, Loader2, MessageCircle, Phone, X } from "lucide-react";
import { InstallationPanel } from "@/components/leads/installation-panel";
import { useLeadModal } from "@/components/leads/lead-modal-context";
import { Badge } from "@/components/ui/badge";
import { getLead } from "@/actions/leads";
import { SALES_STAGE_LABELS } from "@/lib/domain/workflow";
import type { LeadWithRelations } from "@/lib/domain/types";
import { cn, formatPhone } from "@/lib/utils";

function whatsappHref(phone: string) {
  const digits = phone.replace(/\D/g, "");
  const withCountry = digits.length === 10 ? `91${digits}` : digits;
  return `https://wa.me/${withCountry}`;
}

export function InstallationDetailModal({
  canAssignInstall = false,
  canUnassignInstall = false,
  canUploadInstall = false,
  canCompleteInstall = false,
}: {
  canAssignInstall?: boolean;
  canUnassignInstall?: boolean;
  canUploadInstall?: boolean;
  canCompleteInstall?: boolean;
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
    if (!leadId || modalKind !== "installation") {
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
    if (!leadId || modalKind !== "installation") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLead();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [leadId, modalKind, closeLead]);

  if (!leadId || modalKind !== "installation") return null;

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
        aria-label="Installation"
        className="flex max-h-[94dvh] w-full max-w-2xl flex-col rounded-t-2xl bg-white shadow-[var(--shadow-lg)] sm:max-h-[calc(100dvh-2rem)] sm:rounded-[var(--radius-xl)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--border)] p-4 sm:p-5">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[0.65rem] font-bold uppercase tracking-[0.14em] text-[var(--info)]">
              <HardHat className="h-3.5 w-3.5" />
              Installation
            </p>
            <h2 className="mt-1 truncate font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--text-dark)]">
              {lead?.name ?? "Customer"}
            </h2>
            {lead && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Badge variant={lead.sales_stage}>
                  {SALES_STAGE_LABELS[lead.sales_stage]}
                </Badge>
                {lead.expected_panel_count != null && (
                  <span className="text-xs text-[var(--text-muted)]">
                    {lead.expected_panel_count} panels
                  </span>
                )}
                {lead.city && (
                  <span className="text-xs text-[var(--text-muted)]">{lead.city}</span>
                )}
              </div>
            )}
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
          <button
            type="button"
            onClick={closeLead}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--bg)]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          {showSpinner && (
            <div className="flex items-center justify-center py-16 text-[var(--text-muted)]">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          )}
          {!showSpinner && !lead && (
            <p className="py-12 text-center text-sm text-[var(--text-muted)]">
              Installation job not found or you do not have access.
            </p>
          )}
          {lead && (
            <InstallationPanel
              lead={lead}
              embedded
              onDone={() => void refresh(lead.id)}
              canAssign={canAssignInstall}
              canUnassign={canUnassignInstall}
              canUpload={canUploadInstall}
              canComplete={canCompleteInstall}
            />
          )}
        </div>
      </div>
    </div>
  );
}
