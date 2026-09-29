"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { acceptQuotation, markQuotationSent } from "@/actions/quotations";
import type { QuotationRow } from "@/lib/quotations/types";
import { QUOTE_STATUS_LABELS, quoteTemplateDisplayLabel } from "@/lib/quotations/types";
import { formatCurrency, formatDate } from "@/lib/utils";

export function QuotationDetailActions({ quote }: { quote: QuotationRow }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const editable = quote.status !== "accepted";

  return (
    <div className="flex flex-wrap gap-2">
      <Link
        href="/quotations"
        className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text-body)] hover:bg-[var(--bg)]"
      >
        ← Quotations
      </Link>
      {editable && quote.template_kind !== "non_solar" && (
        <Link
          href={`/quotations/${quote.id}/edit`}
          className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text-body)] hover:bg-[var(--bg)]"
        >
          Edit
        </Link>
      )}
      <Link
        href={`/quotations/${quote.id}/print`}
        className="inline-flex items-center justify-center rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text-body)] hover:bg-[var(--bg)]"
      >
        Print / PDF
      </Link>
      {quote.status === "draft" && (
        <Button
          size="sm"
          variant="secondary"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await markQuotationSent(quote.id);
              router.refresh();
            })
          }
        >
          Mark sent
        </Button>
      )}
      {quote.status !== "accepted" && (
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await acceptQuotation(quote.id);
              router.refresh();
            })
          }
        >
          Accept quotation
        </Button>
      )}
    </div>
  );
}

export function QuotationSummaryCard({ quote }: { quote: QuotationRow }) {
  return (
    <div className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow)]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
            {quoteTemplateDisplayLabel(quote)} ·{" "}
            {QUOTE_STATUS_LABELS[quote.status]}
          </p>
          {quote.template_kind === "non_solar" ? (
            <p className="mt-2 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-900">
              Historical non-solar quote — read-only. New quotes are solar only.
            </p>
          ) : null}
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--text-dark)]">
            {quote.quotation_no}
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {quote.customer_name} · {quote.customer_phone} · {formatDate(quote.quote_date)}
          </p>
        </div>
        <p className="text-2xl font-semibold text-[var(--primary)]">
          {formatCurrency(Number(quote.grand_total))}
        </p>
      </div>
    </div>
  );
}
