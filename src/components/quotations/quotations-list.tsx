"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  QUOTE_STATUS_LABELS,
  quoteTemplateDisplayLabel,
} from "@/lib/quotations/types";
import { cn } from "@/lib/utils";

type QuoteRow = {
  id: string;
  quotation_no: string;
  template_kind: string;
  tier_type?: string | null;
  customer_name: string;
  customer_phone: string | null;
  status: string;
  quote_date: string;
  grand_total: number | null;
};

const TABS = [
  { id: "b2b", label: "B2B" },
  { id: "solar", label: "Kit (solar)" },
  { id: "all", label: "All" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function matchesTab(quote: QuoteRow, tab: TabId): boolean {
  if (tab === "all") return true;
  if (tab === "b2b") return quote.template_kind === "non_solar";
  return quote.template_kind === "solar" || quote.template_kind === "premium";
}

function newQuoteHref(tab: TabId): string {
  if (tab === "solar") return "/quotations/new?kind=solar";
  return "/quotations/new?kind=non_solar";
}

export function QuotationsList({
  quotes,
  canCreate,
}: {
  quotes: QuoteRow[];
  canCreate: boolean;
}) {
  const [tab, setTab] = useState<TabId>("b2b");

  const counts = useMemo(() => {
    const b2b = quotes.filter((q) => matchesTab(q, "b2b")).length;
    const solar = quotes.filter((q) => matchesTab(q, "solar")).length;
    return { b2b, solar, all: quotes.length };
  }, [quotes]);

  const filtered = useMemo(() => quotes.filter((q) => matchesTab(q, tab)), [quotes, tab]);

  return (
    <div className="space-y-4">
      <div className="flex gap-1 border-b border-[var(--border)]">
        {TABS.map((t) => {
          const count = counts[t.id];
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "border-b-2 px-3 py-2.5 text-sm font-medium transition",
                tab === t.id
                  ? "border-[var(--primary)] text-[var(--primary)]"
                  : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-dark)]"
              )}
            >
              {t.label}
              <span
                className={cn(
                  "ml-1.5 rounded-full px-1.5 py-0.5 text-[0.65rem] font-bold",
                  tab === t.id
                    ? "bg-[var(--primary-light)] text-[var(--primary)]"
                    : "bg-[var(--bg)] text-[var(--text-muted)]"
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="overflow-x-auto rounded-xl border border-[var(--border)] bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-[var(--border)] bg-[var(--bg)] text-xs uppercase tracking-wider text-[var(--text-muted)]">
            <tr>
              <th className="px-3 py-2">Quote #</th>
              <th className="px-3 py-2">Customer</th>
              {tab === "all" && <th className="px-3 py-2">Template</th>}
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Date</th>
              <th className="px-3 py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((q) => (
              <tr key={q.id} className="border-b border-[var(--border-light)]">
                <td className="px-3 py-2">
                  <Link
                    href={`/quotations/${q.id}`}
                    className="font-semibold text-[var(--primary)]"
                  >
                    {q.quotation_no}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  <p className="font-medium text-[var(--text-dark)]">{q.customer_name}</p>
                  <p className="text-xs text-[var(--text-muted)]">{q.customer_phone}</p>
                </td>
                {tab === "all" && (
                  <td className="px-3 py-2">{quoteTemplateDisplayLabel(q)}</td>
                )}
                <td className="px-3 py-2">
                  {QUOTE_STATUS_LABELS[q.status as "draft"] ?? q.status}
                </td>
                <td className="px-3 py-2">{formatDate(q.quote_date)}</td>
                <td className="px-3 py-2 text-right font-semibold">
                  {formatCurrency(Number(q.grand_total))}
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td
                  colSpan={tab === "all" ? 6 : 5}
                  className="px-3 py-10 text-center text-[var(--text-muted)]"
                >
                  {tab === "b2b"
                    ? "No B2B quotations yet."
                    : tab === "solar"
                      ? "No kit (solar) quotations yet."
                      : "No quotations yet."}
                  {canCreate && (
                    <>
                      {" "}
                      <Link href={newQuoteHref(tab)} className="font-semibold text-[var(--primary)]">
                        Create one
                      </Link>
                    </>
                  )}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
