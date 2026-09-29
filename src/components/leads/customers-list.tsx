"use client";

import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  HardHat,
  Search,
  Wallet,
} from "lucide-react";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useLeadModal } from "@/components/leads/lead-modal-context";
import {
  CUSTOMER_PHASES,
  CUSTOMER_SALES_STAGES,
  SALES_STAGE_LABELS,
  isInstallationCustomerStage,
  type CustomerPhaseId,
  type SalesStage,
} from "@/lib/domain/workflow";
import { portalPath } from "@/lib/domain/portal";
import { accountCodeMatchesQuery, formatAccountTitle } from "@/lib/domain/account-code";
import { FRS_ALLOW_CONSUMER_WON, FRS_ISSUE_PORTAL_CODES } from "@/lib/product-surface";
import {
  compareDeskSort,
  DESK_SORT_OPTIONS,
  scoreTradeActivity,
  type DeskSort,
} from "@/lib/domain/trade-score";
import { cn, formatCurrency, formatDateTime, formatPhone } from "@/lib/utils";

export type CustomerRow = {
  id: string;
  name: string;
  account_code?: string | null;
  phone: string;
  city: string | null;
  address: string | null;
  requirement_notes: string | null;
  sales_stage: SalesStage;
  portal_code?: string | null;
  created_at: string | null;
  telecaller_name?: string | null;
  surveyor_name?: string | null;
  last_outward_on?: string | null;
  last_inward_on?: string | null;
  outward_conversions?: number | null;
  outward_earnings_inr?: number | null;
  next_followup_at?: string | null;
};

type SortKey =
  | DeskSort
  | "created_desc"
  | "created_asc"
  | "name_asc"
  | "name_desc"
  | "stage_asc";
type PhaseFilter = "all" | CustomerPhaseId;
type FileScope = "active" | "completed" | "all";

const FILE_SCOPE_KEY = "frs.customers.fileScope";

const FILE_SCOPE_OPTIONS: { value: FileScope; label: string }[] = [
  { value: "active", label: "All active" },
  { value: "completed", label: "Completed" },
  { value: "all", label: "All including completed" },
];

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  ...DESK_SORT_OPTIONS,
  { value: "created_desc", label: "Newest first" },
  { value: "created_asc", label: "Oldest first" },
  { value: "name_asc", label: "Name A–Z" },
  { value: "name_desc", label: "Name Z–A" },
  { value: "stage_asc", label: "Stage" },
];

const PHASE_ICONS: Record<CustomerPhaseId, typeof Wallet> = {
  payments: Wallet,
  installation: HardHat,
  liaison: Building2,
  completed: CheckCircle2,
};

function assignedLabel(customer: CustomerRow) {
  return (
    [
      customer.telecaller_name && `TC: ${customer.telecaller_name}`,
      customer.surveyor_name && `SV: ${customer.surveyor_name}`,
    ]
      .filter(Boolean)
      .join(" · ") || "—"
  );
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function stagesForPhase(phase: PhaseFilter): SalesStage[] | null {
  if (phase === "all") return null;
  return CUSTOMER_PHASES.find((item) => item.id === phase)?.stages ?? null;
}

export function CustomersList({ customers }: { customers: CustomerRow[] }) {
  const [query, setQuery] = useState("");
  const [fileScope, setFileScope] = useState<FileScope>("active");
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>("all");
  const [stageFilter, setStageFilter] = useState<SalesStage | "all">("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [sortKey, setSortKey] = useState<SortKey>("queue");
  const { openInstallation, openCustomer } = useLeadModal();

  useEffect(() => {
    try {
      const stored = localStorage.getItem(FILE_SCOPE_KEY);
      if (stored === "active" || stored === "completed" || stored === "all") {
        setFileScope(stored);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(FILE_SCOPE_KEY, fileScope);
    } catch {
      /* ignore */
    }
  }, [fileScope]);

  const scoped = useMemo(() => {
    return customers.filter((customer) => {
      if (fileScope === "active") return customer.sales_stage !== "completed";
      if (fileScope === "completed") return customer.sales_stage === "completed";
      return true;
    });
  }, [customers, fileScope]);

  const cities = useMemo(() => {
    const unique = new Set(
      scoped
        .map((customer) => customer.city?.trim())
        .filter((city): city is string => Boolean(city))
    );
    return [...unique].sort((a, b) => a.localeCompare(b));
  }, [scoped]);

  const phaseCounts = useMemo(() => {
    const counts = Object.fromEntries(
      CUSTOMER_PHASES.map((phase) => [phase.id, 0])
    ) as Record<CustomerPhaseId, number>;
    for (const customer of scoped) {
      const phase = CUSTOMER_PHASES.find((item) =>
        item.stages.includes(customer.sales_stage)
      );
      if (phase) counts[phase.id] += 1;
    }
    return counts;
  }, [scoped]);

  const stageOptions = stagesForPhase(phaseFilter) ?? CUSTOMER_SALES_STAGES;

  const filtered = useMemo(() => {
    const value = query.trim().toLowerCase();
    const phoneDigits = query.replace(/\D/g, "");
    const phaseStages = stagesForPhase(phaseFilter);

    const rows = scoped.filter((customer) => {
      if (phaseStages && !phaseStages.includes(customer.sales_stage)) return false;
      if (stageFilter !== "all" && customer.sales_stage !== stageFilter) return false;
      if (cityFilter !== "all" && (customer.city ?? "") !== cityFilter) return false;
      if (!value) return true;

      const phoneMatch =
        customer.phone.includes(value) ||
        (phoneDigits.length >= 2 &&
          customer.phone.replace(/\D/g, "").includes(phoneDigits));
      return (
        customer.name.toLowerCase().includes(value) ||
        accountCodeMatchesQuery(customer.account_code, query) ||
        phoneMatch ||
        (customer.city?.toLowerCase().includes(value) ?? false) ||
        (customer.address?.toLowerCase().includes(value) ?? false) ||
        (customer.requirement_notes?.toLowerCase().includes(value) ?? false) ||
        (customer.portal_code?.toLowerCase().includes(value) ?? false) ||
        assignedLabel(customer).toLowerCase().includes(value)
      );
    });

    const stageOrder = CUSTOMER_SALES_STAGES;
    rows.sort((a, b) => {
      if (
        sortKey === "queue" ||
        sortKey === "conversions" ||
        sortKey === "earnings" ||
        sortKey === "last_outward"
      ) {
        if (sortKey === "queue") return 0;
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
      if (sortKey === "name_asc") return a.name.localeCompare(b.name);
      if (sortKey === "name_desc") return b.name.localeCompare(a.name);
      if (sortKey === "stage_asc") {
        return stageOrder.indexOf(a.sales_stage) - stageOrder.indexOf(b.sales_stage);
      }
      const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
      const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
      return sortKey === "created_asc" ? aTime - bTime : bTime - aTime;
    });

    return rows;
  }, [scoped, query, phaseFilter, stageFilter, cityFilter, sortKey]);

  function setPhase(next: PhaseFilter) {
    setPhaseFilter(next);
    setStageFilter("all");
  }

  function openCustomerRecord(customer: CustomerRow) {
    if (FRS_ALLOW_CONSUMER_WON && isInstallationCustomerStage(customer.sales_stage)) {
      openInstallation(customer.id);
      return;
    }
    openCustomer(customer.id);
  }

  const filtersActive =
    query ||
    stageFilter !== "all" ||
    cityFilter !== "all" ||
    phaseFilter !== "all" ||
    fileScope !== "active";

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {CUSTOMER_PHASES.map((phase) => {
          const Icon = PHASE_ICONS[phase.id];
          const active = phaseFilter === phase.id;
          return (
            <button
              key={phase.id}
              type="button"
              onClick={() => setPhase(active ? "all" : phase.id)}
              className={cn(
                "rounded-2xl border p-4 text-left shadow-[var(--shadow)] transition",
                active
                  ? "border-[var(--primary)] bg-[var(--primary-faint)]"
                  : "border-[var(--border)] bg-white hover:border-[var(--primary)]/40"
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  {phase.label}
                </span>
                <Icon className="h-4 w-4 text-[var(--primary)]" />
              </div>
              <p className="mt-2 font-[family-name:var(--font-display)] text-2xl font-semibold text-[var(--text-dark)]">
                {phaseCounts[phase.id]}
              </p>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[var(--border)] bg-white p-3 shadow-[var(--shadow)]">
        <div className="relative min-w-[12rem] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            type="search"
            placeholder="Search FLR29, name, phone, city…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="pl-9"
          />
        </div>
        <Select
          value={fileScope}
          onChange={(event) => setFileScope(event.target.value as FileScope)}
          className="w-auto"
        >
          {FILE_SCOPE_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <Select
          value={stageFilter}
          onChange={(event) => setStageFilter(event.target.value as SalesStage | "all")}
          className="w-auto"
        >
          <option value="all">All stages</option>
          {stageOptions.map((stage) => (
            <option key={stage} value={stage}>
              {SALES_STAGE_LABELS[stage]}
            </option>
          ))}
        </Select>
        <Select
          value={cityFilter}
          onChange={(event) => setCityFilter(event.target.value)}
          className="w-auto"
        >
          <option value="all">All cities</option>
          {cities.map((city) => (
            <option key={city} value={city}>
              {city}
            </option>
          ))}
        </Select>
        <Select
          value={sortKey}
          onChange={(event) => setSortKey(event.target.value as SortKey)}
          className="w-auto"
        >
          {SORT_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              Sort: {option.label}
            </option>
          ))}
        </Select>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[var(--text-muted)]">
          {filtered.length} customer{filtered.length === 1 ? "" : "s"}
          {phaseFilter !== "all"
            ? ` in ${CUSTOMER_PHASES.find((phase) => phase.id === phaseFilter)?.label}`
            : ""}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((customer) => {
          const install = isInstallationCustomerStage(customer.sales_stage);
          const score = scoreTradeActivity({
            lastOutwardOn: customer.last_outward_on,
            lastInwardOn: customer.last_inward_on,
            conversions: customer.outward_conversions,
            earningsInr: customer.outward_earnings_inr,
            nextFollowupAt: customer.next_followup_at,
          });
          return (
            <button
              key={customer.id}
              type="button"
              onClick={() => openCustomerRecord(customer)}
              className="rounded-2xl border border-[var(--border)] bg-white p-4 text-left shadow-[var(--shadow)] transition hover:-translate-y-0.5 hover:border-[var(--primary)]/35 hover:shadow-[var(--shadow-lg)]"
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold",
                    install
                      ? "bg-[var(--info-light)] text-[var(--info)]"
                      : "bg-[var(--primary-light)] text-[var(--primary)]"
                  )}
                >
                  {initials(customer.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="truncate font-semibold text-[var(--text-dark)]">
                      {formatAccountTitle(customer.account_code, customer.name)}
                    </p>
                    <div className="flex flex-wrap justify-end gap-1">
                      <Badge variant={customer.sales_stage}>
                        {SALES_STAGE_LABELS[customer.sales_stage]}
                      </Badge>
                      {score.conversions > 0 && (
                        <Badge variant="quoted">{score.conversions} conv.</Badge>
                      )}
                      {score.earningsInr > 0 && (
                        <Badge variant="quoted">{formatCurrency(score.earningsInr)}</Badge>
                      )}
                      {score.followUpDue && <Badge variant="follow_up_due">Follow-up due</Badge>}
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {formatPhone(customer.phone)}
                    {customer.city ? ` · ${customer.city}` : ""}
                  </p>
                  {(customer.last_outward_on || customer.last_inward_on) && (
                    <p className="mt-1 text-xs text-[var(--text-muted)]">
                      Last out {customer.last_outward_on ?? "—"}
                      {" · "}
                      Last in {customer.last_inward_on ?? "—"}
                    </p>
                  )}
                </div>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
                {FRS_ISSUE_PORTAL_CODES && customer.portal_code && (
                  <a
                    href={portalPath(customer.portal_code)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(event) => event.stopPropagation()}
                    className="font-mono font-semibold text-[var(--primary)] hover:underline"
                  >
                    Portal {customer.portal_code}
                  </a>
                )}
                <span>{assignedLabel(customer)}</span>
                <span>{formatDateTime(customer.created_at)}</span>
              </div>
              {customer.requirement_notes && (
                <p className="mt-2 line-clamp-2 text-xs text-[var(--text-body)]">
                  {customer.requirement_notes}
                </p>
              )}
              <div className="mt-3 flex items-center justify-between gap-2">
                <p
                  className={cn(
                    "text-xs font-semibold",
                    install ? "text-[var(--info)]" : "text-[var(--primary)]"
                  )}
                >
                  {install ? "Open installation →" : "Open contact →"}
                </p>
                <a
                  href={`/accounts/${customer.id}`}
                  onClick={(event) => event.stopPropagation()}
                  className="text-xs font-semibold text-[var(--accent)] hover:underline"
                >
                  Trade ledger →
                </a>
              </div>
            </button>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <p className="py-12 text-center text-sm text-[var(--text-muted)]">
          {filtersActive ? "No customers match your filters" : "No customers yet"}
        </p>
      )}
    </div>
  );
}
