"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { verifyPayment, rejectPayment } from "@/actions/payments";
import {
  PAYMENT_MILESTONE_LABELS,
  PAYMENT_STATUS_LABELS,
  type PaymentMilestone,
  type PaymentVerificationStatus,
} from "@/lib/domain/payments";
import { formatCurrency, formatDate } from "@/lib/utils";

type QueueRow = {
  id: string;
  milestone: string;
  amount: number;
  transaction_id: string | null;
  paid_at: string | null;
  verification_status: string;
  lead?: {
    id: string;
    name: string;
    phone: string;
    city: string | null;
    sales_stage: string;
  } | null;
};

export function PaymentsQueueClient({
  initialRows,
  canVerify,
}: {
  initialRows: QueueRow[];
  canVerify: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState(initialRows);
  const [pending, startTransition] = useTransition();
  const [bankRef, setBankRef] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-[var(--error)]">{error}</p>}
      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--bg)] text-xs uppercase tracking-wider text-[var(--text-muted)]">
            <tr>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Milestone</th>
              <th className="px-3 py-2">Amount</th>
              <th className="px-3 py-2">Txn / date</th>
              <th className="px-3 py-2">Status</th>
              {canVerify && <th className="px-3 py-2">Actions</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-b border-[var(--border-light)] align-top">
                <td className="px-3 py-2">
                  <p className="font-medium text-[var(--text-dark)]">
                    {row.lead?.name ?? "—"}
                  </p>
                  <p className="text-xs text-[var(--text-muted)]">
                    {row.lead?.phone}
                    {row.lead?.city ? ` · ${row.lead.city}` : ""}
                  </p>
                </td>
                <td className="px-3 py-2">
                  {PAYMENT_MILESTONE_LABELS[row.milestone as PaymentMilestone] ??
                    row.milestone}
                </td>
                <td className="px-3 py-2 font-semibold">
                  {formatCurrency(Number(row.amount))}
                </td>
                <td className="px-3 py-2 text-xs">
                  <p>{row.transaction_id ?? "—"}</p>
                  <p className="text-[var(--text-muted)]">{formatDate(row.paid_at)}</p>
                </td>
                <td className="px-3 py-2">
                  {PAYMENT_STATUS_LABELS[
                    row.verification_status as PaymentVerificationStatus
                  ] ?? row.verification_status}
                </td>
                {canVerify && (
                  <td className="px-3 py-2">
                    <div className="flex min-w-[180px] flex-col gap-2">
                      <Input
                        placeholder="Bank reference"
                        value={bankRef[row.id] ?? ""}
                        onChange={(e) =>
                          setBankRef((s) => ({ ...s, [row.id]: e.target.value }))
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
                                  paymentId: row.id,
                                  bankReference: bankRef[row.id] ?? "",
                                });
                                setRows((prev) => prev.filter((r) => r.id !== row.id));
                                router.refresh();
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
                                  paymentId: row.id,
                                  reason: "Rejected from payments queue",
                                });
                                setRows((prev) => prev.filter((r) => r.id !== row.id));
                                router.refresh();
                              } catch (err) {
                                setError(err instanceof Error ? err.message : "Failed");
                              }
                            })
                          }
                        >
                          Reject
                        </Button>
                      </div>
                    </div>
                  </td>
                )}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td
                  colSpan={canVerify ? 6 : 5}
                  className="px-3 py-10 text-center text-[var(--text-muted)]"
                >
                  No pending payments.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
