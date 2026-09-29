import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import type { ProfitBucket, ProfitRange, ProfitReport } from "@/lib/domain/profit-loss";
import { cn, formatCurrency } from "@/lib/utils";

export function ProfitReportView({
  range,
  period,
  report,
  error,
  loadError,
}: {
  range: ProfitRange;
  period: string;
  report: ProfitReport;
  error: string | null;
  loadError: string | null;
}) {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Accounts"
        title="Profit & loss"
        subtitle="Realized trade for the period: outward sales minus inward purchases. Lines with no rupee amount are counted separately and left out of the totals."
      />

      <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] bg-white p-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <PeriodLink href="/profit?period=this" active={period === "this"}>
            This month
          </PeriodLink>
          <PeriodLink href="/profit?period=last" active={period === "last"}>
            Last month
          </PeriodLink>
        </div>
        <form action="/profit" className="flex flex-wrap items-end gap-2">
          <input type="hidden" name="period" value="custom" />
          <label className="text-xs font-semibold text-[var(--text-muted)]">
            From
            <input
              type="date"
              name="from"
              required
              defaultValue={period === "custom" ? range.from : ""}
              className="mt-1 block rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-sm text-[var(--text-dark)]"
            />
          </label>
          <label className="text-xs font-semibold text-[var(--text-muted)]">
            To
            <input
              type="date"
              name="to"
              required
              defaultValue={period === "custom" ? range.to : ""}
              className="mt-1 block rounded-lg border border-[var(--border)] bg-white px-2 py-1.5 text-sm text-[var(--text-dark)]"
            />
          </label>
          <button
            type="submit"
            className="rounded-lg bg-[var(--primary)] px-3 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-hover)]"
          >
            Apply
          </button>
        </form>
      </div>

      <p className="text-sm text-[var(--text-muted)]">
        {range.label}
        <span className="mx-1.5">·</span>
        {range.from} to {range.to}
      </p>

      {error ? (
        <p className="rounded-xl border border-[var(--warn)]/40 bg-[var(--warn-light)] px-4 py-3 text-sm text-[var(--text-dark)]">
          {error}
        </p>
      ) : null}
      {loadError ? (
        <p className="rounded-xl border border-[var(--error)]/30 bg-[var(--error-light)] px-4 py-3 text-sm text-[var(--text-dark)]">
          {loadError}
        </p>
      ) : null}
      {report.missingAmountCount > 0 ? (
        <p className="rounded-xl border border-[var(--warn)]/40 bg-[var(--warn-light)] px-4 py-3 text-sm text-[var(--text-dark)]">
          {report.missingAmountCount}{" "}
          {report.missingAmountCount === 1 ? "line has" : "lines have"} no rupee amount and{" "}
          {report.missingAmountCount === 1 ? "is" : "are"} left out of sales and purchases.
        </p>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Sales" value={formatCurrency(report.sales)} hint="Outward ₹" />
        <Stat label="Purchases" value={formatCurrency(report.purchases)} hint="Inward ₹" />
        <Stat
          label="Gross profit"
          value={formatCurrency(report.grossProfit)}
          hint="Sales minus purchases"
          tone={report.grossProfit < 0 ? "danger" : "success"}
        />
        <Stat
          label="Margin"
          value={report.marginPercent == null ? "—" : `${report.marginPercent}%`}
          hint={report.sales > 0 ? "Gross profit ÷ sales" : "No sales in this period"}
        />
      </div>

      <Section title="By month">
        <MoneyTable
          rows={report.trend}
          nameHeader="Month"
        />
      </Section>

      <Section
        title="By account"
        note={
          report.accountTotal > report.accounts.length
            ? `Showing ${report.accounts.length} of ${report.accountTotal}, largest gross profit first.`
            : undefined
        }
      >
        <MoneyTable
          rows={report.accounts}
          nameHeader="Account"
          hrefFor={(row) => `/accounts/${row.key}`}
          empty="No trade lines in this period."
        />
      </Section>

      <Section
        title="By item"
        note={
          report.skuTotal > report.skus.length
            ? `Showing ${report.skus.length} of ${report.skuTotal}, largest gross profit first.`
            : undefined
        }
      >
        <MoneyTable
          rows={report.skus}
          nameHeader="Item"
          empty="No trade lines in this period."
        />
      </Section>
    </div>
  );
}

function PeriodLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "rounded-lg px-3 py-2 text-sm font-semibold",
        active
          ? "bg-[var(--primary)] text-white"
          : "bg-[var(--primary-light)] text-[var(--text-dark)] hover:bg-[var(--primary)]/15"
      )}
    >
      {children}
    </Link>
  );
}

function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint: string;
  tone?: "default" | "success" | "danger";
}) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow)]">
      <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--text-muted)]">
        {label}
      </p>
      <p
        className={cn(
          "mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight",
          tone === "danger" && "text-[var(--error)]",
          tone === "success" && "text-[var(--success)]",
          tone === "default" && "text-[var(--text-dark)]"
        )}
      >
        {value}
      </p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">{hint}</p>
    </div>
  );
}

function Section({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow)]">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-[family-name:var(--font-display)] text-lg font-semibold text-[var(--text-dark)]">
          {title}
        </h2>
        {note ? <p className="text-xs text-[var(--text-muted)]">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

function MoneyTable({
  rows,
  nameHeader,
  hrefFor,
  empty = "Nothing in this period.",
}: {
  rows: ProfitBucket[];
  nameHeader: string;
  hrefFor?: (row: ProfitBucket) => string;
  empty?: string;
}) {
  if (rows.length === 0) {
    return <p className="text-sm text-[var(--text-muted)]">{empty}</p>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[36rem] text-left text-sm">
        <thead>
          <tr className="border-b border-[var(--border)] text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--text-muted)]">
            <th className="px-2 py-2 font-bold">{nameHeader}</th>
            <th className="px-2 py-2 text-right font-bold">Sales</th>
            <th className="px-2 py-2 text-right font-bold">Purchases</th>
            <th className="px-2 py-2 text-right font-bold">Gross profit</th>
            <th className="px-2 py-2 text-right font-bold">₹ missing</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-b border-[var(--border-light)] last:border-0">
              <td className="px-2 py-2.5 font-medium text-[var(--text-dark)]">
                {hrefFor ? (
                  <Link href={hrefFor(row)} className="text-[var(--primary)] hover:underline">
                    {row.label}
                  </Link>
                ) : (
                  row.label
                )}
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums">{formatCurrency(row.sales)}</td>
              <td className="px-2 py-2.5 text-right tabular-nums">{formatCurrency(row.purchases)}</td>
              <td
                className={cn(
                  "px-2 py-2.5 text-right font-semibold tabular-nums",
                  row.grossProfit < 0 ? "text-[var(--error)]" : "text-[var(--text-dark)]"
                )}
              >
                {formatCurrency(row.grossProfit)}
              </td>
              <td className="px-2 py-2.5 text-right tabular-nums text-[var(--text-muted)]">
                {row.missingAmountCount || "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
