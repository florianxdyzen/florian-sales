"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  deleteTradeEntry,
  updateTradeEntryStatus,
  type TradeAccount,
  type TradeEntry,
} from "@/actions/trade";
import { TradeEntryForm } from "@/components/trade/trade-entry-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TRADE_ATTACHMENT_LABELS,
  TRADE_DIRECTION_LABELS,
  TRADE_FAMILY_LABELS,
  TRADE_STATUS_LABELS,
  type TradeDirection,
} from "@/lib/domain/trade-ledger";
import { formatAccountTitle } from "@/lib/domain/account-code";
import { cn, formatCurrency, formatPhone } from "@/lib/utils";

export type TradeTab = "summary" | "outward" | "inward";

function formatDay(iso: string | null) {
  if (!iso) return "—";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function EntryCard({
  entry,
  canDelete,
  canEdit,
}: {
  entry: TradeEntry;
  canDelete: boolean;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  return (
    <article className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow)]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-[var(--text-dark)]">{entry.sku_or_description}</p>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">
            {entry.amount_inr != null ? formatCurrency(entry.amount_inr) : "₹ —"}
            {` · ${formatDay(entry.occurred_on)}`}
          </p>
        </div>
        <span className="rounded-full bg-[var(--bg)] px-2.5 py-0.5 text-xs font-semibold text-[var(--text-body)]">
          {TRADE_STATUS_LABELS[entry.status]}
        </span>
      </div>
      <p className="mt-2 text-xs text-[var(--text-muted)]">
        {entry.external_invoice_no ? `Bill ${entry.external_invoice_no}` : "No bill number"}
        {entry.gr_no ? ` · GR ${entry.gr_no}` : ""}
        {entry.vehicle_no ? ` · Vehicle ${entry.vehicle_no}` : ""}
        {entry.transporter_name ? ` · ${entry.transporter_name}` : ""}
        {entry.dispatched_on ? ` · Dispatch ${formatDay(entry.dispatched_on)}` : ""}
        {entry.received_on ? ` · Received ${formatDay(entry.received_on)}` : ""}
      </p>
      {entry.notes && <p className="mt-2 text-sm text-[var(--text-body)]">{entry.notes}</p>}
      {entry.attachments.length > 0 && (
        <ul className="mt-2 space-y-1">
          {entry.attachments.map((a) => (
            <li key={a.id}>
              <a
                href={a.file_url}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-semibold text-[var(--primary)] hover:underline"
              >
                {TRADE_ATTACHMENT_LABELS[a.kind]}
                {a.title && a.title !== TRADE_ATTACHMENT_LABELS[a.kind] ? ` — ${a.title}` : ""}
              </a>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {canEdit && entry.direction === "outward" && entry.status === "logged" && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const today = new Date().toISOString().slice(0, 10);
                await updateTradeEntryStatus({
                  entryId: entry.id,
                  status: "dispatched",
                  dispatchedOn: today,
                });
                router.refresh();
              })
            }
          >
            Mark dispatched
          </Button>
        )}
        {canEdit && entry.direction === "inward" && entry.status === "logged" && (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const today = new Date().toISOString().slice(0, 10);
                await updateTradeEntryStatus({
                  entryId: entry.id,
                  status: "received",
                  receivedOn: today,
                });
                router.refresh();
              })
            }
          >
            Mark received
          </Button>
        )}
        {canDelete && (
          <Button
            type="button"
            size="sm"
            variant="danger"
            disabled={pending}
            onClick={() =>
              start(async () => {
                if (!confirm("Delete this trade line?")) return;
                await deleteTradeEntry(entry.id);
                router.refresh();
              })
            }
          >
            Delete
          </Button>
        )}
      </div>
    </article>
  );
}

export function TradeAccountWorkspace({
  data,
  tab,
}: {
  data: TradeAccount;
  tab: TradeTab;
}) {
  const { lead, entries, summary, skus } = data;
  const outward = entries.filter((e) => e.direction === "outward");
  const inward = entries.filter((e) => e.direction === "inward");

  const tabs: { id: TradeTab; label: string; href: string }[] = [
    { id: "summary", label: "Summary", href: `/accounts/${lead.id}` },
    { id: "outward", label: "Outward", href: `/accounts/${lead.id}?tab=outward` },
    { id: "inward", label: "Inward", href: `/accounts/${lead.id}?tab=inward` },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--accent)]">
            Trade ledger
          </p>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--text-dark)]">
            {formatAccountTitle(lead.account_code, lead.name)}
          </h1>
          <p className="mt-1 text-sm text-[var(--text-muted)]">
            {formatPhone(lead.phone)}
            {lead.city ? ` · ${lead.city}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {summary.followUpDue && <Badge variant="follow_up_due">Follow-up due</Badge>}
          </div>
        </div>
        <Link
          href="/customers"
          className="text-sm font-semibold text-[var(--primary)] hover:underline"
        >
          All accounts
        </Link>
      </div>

      <div className="flex gap-2 border-b border-[var(--border)]">
        {tabs.map((t) => (
          <Link
            key={t.id}
            href={t.href}
            className={cn(
              "border-b-2 px-3 py-2 text-sm font-semibold",
              tab === t.id
                ? "border-[var(--primary)] text-[var(--primary)]"
                : "border-transparent text-[var(--text-muted)] hover:text-[var(--text-dark)]"
            )}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {tab === "summary" && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryTile label="Conversions" value={String(summary.conversions)} />
            <SummaryTile label="Earnings ₹" value={formatCurrency(summary.outwardAmount)} />
            <SummaryTile label="Purchases" value={String(summary.purchases)} />
            <SummaryTile label="Spend ₹" value={formatCurrency(summary.inwardAmount)} />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <SummaryTile label="Last outward" value={formatDay(summary.lastOutwardOn)} />
            <SummaryTile label="Last inward" value={formatDay(summary.lastInwardOn)} />
          </div>
          <p className="text-sm text-[var(--text-muted)]">
            Conversions are outward lines. Earnings and spend are rupees only — no combo-to-panel
            conversion.
          </p>
          {summary.byFamily.length > 0 && (
            <div className="overflow-x-auto rounded-2xl border border-[var(--border)] bg-white">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--text-muted)]">
                    <th className="px-4 py-2">Named family</th>
                    <th className="px-4 py-2">Outward lines</th>
                    <th className="px-4 py-2">Inward lines</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.byFamily.map((row) => (
                    <tr key={row.family} className="border-b border-[var(--border)] last:border-0">
                      <td className="px-4 py-2">{TRADE_FAMILY_LABELS[row.family]}</td>
                      <td className="px-4 py-2">{row.outwardQty}</td>
                      <td className="px-4 py-2">{row.inwardQty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {(tab === "outward" || tab === "inward") && (
        <div className="space-y-4">
          {((tab === "outward" && data.canLogOutward) ||
            (tab === "inward" && data.canLogInward)) && (
            <TradeEntryForm leadId={lead.id} direction={tab} skus={skus} />
          )}
          {(tab === "outward" ? outward : inward).length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">
              No {TRADE_DIRECTION_LABELS[tab as TradeDirection].toLowerCase()} lines yet.
            </p>
          ) : (
            <div className="space-y-3">
              {(tab === "outward" ? outward : inward).map((entry) => (
                <EntryCard
                  key={entry.id}
                  entry={entry}
                  canDelete={data.canManageSkus}
                  canEdit={tab === "outward" ? data.canLogOutward : data.canLogInward}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function SummaryTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow)]">
      <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </p>
      <p className="mt-1 font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--text-dark)]">
        {value}
      </p>
    </div>
  );
}
