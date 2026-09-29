"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import {
  listPaymentsForLead,
  getLeadQuoteGrandTotal,
  recordPayment,
  verifyPayment,
  rejectPayment,
} from "@/actions/payments";
import {
  PAYMENT_METHOD_LABELS,
  PAYMENT_MILESTONE_LABELS,
  PAYMENT_STATUS_LABELS,
  PAYMENT_METHODS,
  nextRecordableMilestone,
  type PaymentMilestone,
  type PaymentMethod,
  type PaymentRow,
} from "@/lib/domain/payments";
import {
  isWhatsAppPhoneValid,
  pendingPaymentWhatsAppMessage,
  summarizeLeadPaymentBalance,
} from "@/lib/domain/payment-balance";
import { buildWhatsAppHref } from "@/lib/domain/portal";
import { isWonOrLaterStage } from "@/lib/domain/workflow";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { LeadWithRelations } from "@/lib/domain/types";

function plannedAmountForMilestone(
  lead: LeadWithRelations,
  milestone: PaymentMilestone
): number | null {
  const raw =
    milestone === "token"
      ? lead.won_token_amount
      : milestone === "pre_dispatch"
        ? lead.won_pre_dispatch_amount
        : lead.won_final_amount;
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function PaymentPanel({
  lead,
  onDone,
  canRecord = false,
  canVerify = false,
}: {
  lead: LeadWithRelations;
  onDone: () => void;
  canRecord?: boolean;
  canVerify?: boolean;
}) {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [quoteGrandTotal, setQuoteGrandTotal] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("upi");
  const [transactionId, setTransactionId] = useState("");
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [bankRef, setBankRef] = useState<Record<string, string>>({});
  const [rejectReason, setRejectReason] = useState<Record<string, string>>({});

  const nextMilestone = nextRecordableMilestone(lead.sales_stage, payments);

  const balance = useMemo(
    () =>
      summarizeLeadPaymentBalance({
        quoteGrandTotal,
        wonTokenAmount: lead.won_token_amount,
        wonPreDispatchAmount: lead.won_pre_dispatch_amount,
        wonFinalAmount: lead.won_final_amount,
        payments: payments.map((p) => ({
          amount: Number(p.amount),
          verification_status: p.verification_status,
        })),
      }),
    [
      quoteGrandTotal,
      lead.won_token_amount,
      lead.won_pre_dispatch_amount,
      lead.won_final_amount,
      payments,
    ]
  );

  async function reload() {
    const [rows, total] = await Promise.all([
      listPaymentsForLead(lead.id),
      getLeadQuoteGrandTotal(lead.id).catch(() => null),
    ]);
    setPayments(rows);
    setQuoteGrandTotal(total);
  }

  useEffect(() => {
    void reload().catch(() => setPayments([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id, lead.accepted_quotation_id]);

  useEffect(() => {
    if (!nextMilestone) return;
    const planned = plannedAmountForMilestone(lead, nextMilestone);
    setAmount(planned != null ? String(planned) : "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nextMilestone, lead.id]);

  if (!isWonOrLaterStage(lead.sales_stage)) {
    return null;
  }

  const remaining = balance.remaining ?? 0;
  const showWhatsApp = remaining > 0;
  const phoneOk = isWhatsAppPhoneValid(lead.phone);
  const whatsappHref =
    showWhatsApp && phoneOk
      ? buildWhatsAppHref(
          lead.phone,
          pendingPaymentWhatsAppMessage(lead.name, remaining)
        )
      : null;

  return (
    <div className="space-y-4 rounded-xl border border-[var(--border)] bg-white p-4">
      <div>
        <h3 className="font-semibold text-[var(--text-dark)]">Milestone payments</h3>
        <p className="text-xs text-[var(--text-muted)]">
          Enter Pre-dispatch after Token is saved. Accounts confirms bank credit.
          Installation starts only after Pre-dispatch is verified.
        </p>
        <p className="mt-1 text-xs text-[var(--text-muted)]">
          Token verified {lead.token_verified ? "✓" : "…"} · feasibility PDF{" "}
          {lead.feasibility_approved ? "✓" : "…"}
          {nextMilestone
            ? ` · Next: ${PAYMENT_MILESTONE_LABELS[nextMilestone]}`
            : ""}
        </p>
      </div>

      {balance.projectTotal != null && (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg bg-[var(--bg)] px-3 py-2">
            <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--text-muted)]">
              Project total
            </p>
            <p className="mt-0.5 text-sm font-bold text-[var(--text-dark)]">
              {formatCurrency(balance.projectTotal)}
            </p>
            <p className="mt-0.5 text-[0.65rem] text-[var(--text-muted)]">
              {balance.source === "quotation" ? "Accepted quote" : "Won plan"}
            </p>
          </div>
          <div className="rounded-lg bg-[var(--success-light)] px-3 py-2">
            <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--success)]">
              Paid
            </p>
            <p className="mt-0.5 text-sm font-bold text-[var(--text-dark)]">
              {formatCurrency(balance.paid)}
            </p>
            {balance.pending > 0 ? (
              <p className="mt-0.5 text-[0.65rem] text-[var(--warn)]">
                {formatCurrency(balance.pending)} pending
              </p>
            ) : null}
          </div>
          <div className="rounded-lg bg-[var(--warn-light)] px-3 py-2">
            <p className="text-[0.65rem] font-semibold uppercase tracking-wide text-[var(--warn)]">
              Remaining
            </p>
            <p className="mt-0.5 text-sm font-bold text-[var(--text-dark)]">
              {balance.remaining == null ? "—" : formatCurrency(balance.remaining)}
            </p>
          </div>
        </div>
      )}

      {showWhatsApp && (
        <div>
          {whatsappHref ? (
            <a
              href={whatsappHref}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--success)] bg-[var(--success-light)] px-3 py-1.5 text-xs font-semibold text-[var(--success)] hover:opacity-90"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              WhatsApp pending ₹{remaining.toLocaleString("en-IN")}
            </a>
          ) : (
            <button
              type="button"
              disabled
              title="Add a valid mobile number to send WhatsApp"
              className="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] opacity-60"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              WhatsApp pending (invalid phone)
            </button>
          )}
        </div>
      )}

      <ul className="space-y-2 text-sm">
        {payments.map((p) => (
          <li
            key={p.id}
            className="rounded-lg border border-[var(--border-light)] px-3 py-2"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-semibold text-[var(--text-dark)]">
                  {PAYMENT_MILESTONE_LABELS[p.milestone as PaymentMilestone]} ·{" "}
                  {formatCurrency(Number(p.amount))}
                </p>
                <p className="text-xs text-[var(--text-muted)]">
                  {PAYMENT_STATUS_LABELS[p.verification_status]} · Txn{" "}
                  {p.transaction_id ?? "—"} · {formatDate(p.paid_at)}
                </p>
                {p.bank_reference && (
                  <p className="text-xs text-[var(--text-body)]">
                    Bank: {p.bank_reference}
                  </p>
                )}
              </div>
              {canVerify && p.verification_status === "pending" && (
                <div className="flex min-w-[200px] flex-col gap-2">
                  <Input
                    placeholder="Bank reference"
                    value={bankRef[p.id] ?? ""}
                    onChange={(e) =>
                      setBankRef((s) => ({ ...s, [p.id]: e.target.value }))
                    }
                  />
                  <div className="flex gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          setError(null);
                          try {
                            await verifyPayment({
                              paymentId: p.id,
                              bankReference: bankRef[p.id] ?? "",
                            });
                            await reload();
                            onDone();
                          } catch (err) {
                            setError(err instanceof Error ? err.message : "Failed");
                          }
                        })
                      }
                    >
                      Verify
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="danger"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          setError(null);
                          try {
                            await rejectPayment({
                              paymentId: p.id,
                              reason: rejectReason[p.id] || "Rejected by Accounts",
                            });
                            await reload();
                            onDone();
                          } catch (err) {
                            setError(err instanceof Error ? err.message : "Failed");
                          }
                        })
                      }
                    >
                      Reject
                    </Button>
                  </div>
                  <Input
                    placeholder="Reject reason"
                    value={rejectReason[p.id] ?? ""}
                    onChange={(e) =>
                      setRejectReason((s) => ({ ...s, [p.id]: e.target.value }))
                    }
                  />
                </div>
              )}
            </div>
          </li>
        ))}
        {payments.length === 0 && (
          <li className="text-xs text-[var(--text-muted)]">No payments recorded yet.</li>
        )}
      </ul>

      {canRecord && nextMilestone && (
        <form
          className="space-y-3 border-t border-[var(--border-light)] pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            startTransition(async () => {
              try {
                await recordPayment({
                  leadId: lead.id,
                  milestone: nextMilestone,
                  amount: Number(amount),
                  method,
                  transactionId,
                  paidAt,
                  notes: notes || null,
                  quotationId: lead.accepted_quotation_id ?? null,
                });
                setTransactionId("");
                setNotes("");
                await reload();
                onDone();
              } catch (err) {
                setError(err instanceof Error ? err.message : "Failed");
              }
            });
          }}
        >
          <p className="text-sm font-semibold text-[var(--text-dark)]">
            Record {PAYMENT_MILESTONE_LABELS[nextMilestone]}
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Amount (₹)</Label>
              <Input
                type="number"
                min={1}
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div>
              <Label>Method</Label>
              <select
                className="w-full rounded-lg border-[1.5px] border-[var(--border)] bg-white px-3 py-2 text-sm"
                value={method}
                onChange={(e) => setMethod(e.target.value as PaymentMethod)}
              >
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Transaction ID</Label>
              <Input
                required
                value={transactionId}
                onChange={(e) => setTransactionId(e.target.value)}
              />
            </div>
            <div>
              <Label>Paid on</Label>
              <Input
                type="date"
                required
                value={paidAt}
                onChange={(e) => setPaidAt(e.target.value)}
              />
            </div>
            <div className="sm:col-span-2">
              <Label>Notes</Label>
              <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
          </div>
          <Button type="submit" size="sm" disabled={pending}>
            {pending ? "Saving…" : "Record payment"}
          </Button>
        </form>
      )}

      {error && <p className="text-sm text-[var(--error)]">{error}</p>}
    </div>
  );
}
