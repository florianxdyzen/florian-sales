"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { LeadCard } from "@/components/leads/lead-card";
import { runCallingCycleNow } from "@/actions/calling";
import {
  CALL_QUEUE_COLUMNS,
  classifyCallQueue,
  compareCallingDesk,
  type CallQueueBucket,
} from "@/lib/domain/calling-cycle";
import { TEMPERATURE_LABELS, TEMPERATURES, type LeadTemperature } from "@/lib/domain/workflow";
import { accountCodeMatchesQuery } from "@/lib/domain/account-code";
import { compareDeskSort, DESK_SORT_OPTIONS, type DeskSort } from "@/lib/domain/trade-score";
import { cn } from "@/lib/utils";
import type { PipelineLead } from "@/components/leads/pipeline-board";

export function CallingDeskBoard({
  leads,
  canRunCycle = false,
}: {
  leads: PipelineLead[];
  canRunCycle?: boolean;
}) {
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState("");
  const [temperatureFilter, setTemperatureFilter] = useState<LeadTemperature | "all">("all");
  const [sortKey, setSortKey] = useState<DeskSort>("queue");
  const [pending, startTransition] = useTransition();
  const [status, setStatus] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const phoneDigits = searchQuery.replace(/\D/g, "");
    const now = new Date();
    return leads
      .filter((lead) => {
        if (temperatureFilter !== "all" && (lead.temperature ?? "warm") !== temperatureFilter) {
          return false;
        }
        if (!q) return true;
        const phoneMatch =
          lead.phone.includes(q) ||
          (phoneDigits.length >= 2 && lead.phone.replace(/\D/g, "").includes(phoneDigits));
        return (
          lead.name.toLowerCase().includes(q) ||
          accountCodeMatchesQuery(lead.account_code, searchQuery) ||
          phoneMatch ||
          (lead.city?.toLowerCase().includes(q) ?? false)
        );
      })
      .sort((a, b) => {
        if (sortKey !== "queue") {
          return compareDeskSort(
            {
              conversions: a.outward_conversions,
              earningsInr: a.outward_earnings_inr,
              lastOutwardOn: a.last_outward_on,
            },
            {
              conversions: b.outward_conversions,
              earningsInr: b.outward_earnings_inr,
              lastOutwardOn: b.last_outward_on,
            },
            sortKey
          );
        }
        return compareCallingDesk(a, b, now);
      });
  }, [leads, searchQuery, temperatureFilter, sortKey]);

  const grouped = useMemo(() => {
    const now = new Date();
    const map = new Map<CallQueueBucket, PipelineLead[]>();
    for (const col of CALL_QUEUE_COLUMNS) map.set(col.id, []);
    for (const lead of filtered) {
      const bucket = classifyCallQueue(lead.next_followup_at, now);
      map.get(bucket)?.push(lead);
    }
    return map;
  }, [filtered]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search FLR29, name, phone…"
          className="max-w-xs"
        />
        <Select
          value={temperatureFilter}
          onChange={(e) => setTemperatureFilter(e.target.value as LeadTemperature | "all")}
          className="w-auto"
        >
          <option value="all">All temperatures</option>
          {TEMPERATURES.map((t) => (
            <option key={t} value={t}>
              {TEMPERATURE_LABELS[t]}
            </option>
          ))}
        </Select>
        <Select
          value={sortKey}
          onChange={(e) => setSortKey(e.target.value as DeskSort)}
          className="w-auto"
        >
          {DESK_SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              Sort: {opt.label}
            </option>
          ))}
        </Select>
        {canRunCycle && (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                try {
                  const res = await runCallingCycleNow();
                  setStatus(`Recycled ${res.recycled} cold/warm accounts (30-day cycle).`);
                  router.refresh();
                } catch (err) {
                  setStatus(err instanceof Error ? err.message : "Cycle failed");
                }
              })
            }
          >
            {pending ? "Running…" : "Run cycle now"}
          </Button>
        )}
        <p className="text-xs text-[var(--text-muted)]">
          High-volume (≥50 outward / 30 days) pins first, then Hot. Idle regulars show Follow-up due.
        </p>
      </div>
      {status && <p className="text-sm text-[var(--text-body)]">{status}</p>}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        {CALL_QUEUE_COLUMNS.map((col) => {
          const rows = grouped.get(col.id) ?? [];
          return (
            <section
              key={col.id}
              className="rounded-xl border border-[var(--border)] bg-white p-3 shadow-[var(--shadow)]"
            >
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-[var(--text-dark)]">{col.label}</h3>
                <span className="text-xs tabular-nums text-[var(--text-muted)]">{rows.length}</span>
              </div>
              <div className="space-y-2">
                {rows.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    id={lead.id}
                    name={lead.name}
                    account_code={lead.account_code}
                    phone={lead.phone}
                    sales_stage={lead.sales_stage}
                    temperature={lead.temperature}
                    city={lead.city}
                    created_at={lead.created_at}
                    next_followup_at={lead.next_followup_at}
                    last_outward_on={lead.last_outward_on}
                    outward_conversions={lead.outward_conversions}
                    outward_earnings_inr={lead.outward_earnings_inr}
                    last_inward_on={lead.last_inward_on}
                    assigned_name={lead.telecaller_name}
                    showStageBadge={false}
                  />
                ))}
                {rows.length === 0 && (
                  <p className="px-1 py-6 text-center text-xs text-[var(--text-muted)]">None</p>
                )}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
