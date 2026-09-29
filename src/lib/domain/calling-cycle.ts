import type { LeadTemperature } from "@/lib/domain/workflow";

/** Plan §7.2 — circular outreach window. */
export const CALL_CYCLE_DAYS = 30;

export type CallQueueBucket = "overdue" | "due_today" | "scheduled" | "unscheduled";

export const CALL_QUEUE_COLUMNS: { id: CallQueueBucket; label: string }[] = [
  { id: "overdue", label: "Overdue" },
  { id: "due_today", label: "Due today" },
  { id: "unscheduled", label: "Unscheduled" },
  { id: "scheduled", label: "Scheduled" },
];

export function bucketLabel(bucket: CallQueueBucket): string {
  return CALL_QUEUE_COLUMNS.find((col) => col.id === bucket)?.label ?? "Unscheduled";
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/** Midnight IST for the calendar day of `now`. */
export function startOfIstDay(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
  return new Date(`${parts}T00:00:00+05:30`);
}

export function endOfIstDay(now = new Date()): Date {
  return new Date(startOfIstDay(now).getTime() + 24 * 60 * 60 * 1000);
}

export function lastTouchAt(input: {
  last_call_at?: string | null;
  created_at?: string | null;
}): Date | null {
  const raw = input.last_call_at || input.created_at;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function classifyCallQueue(
  nextCallAt: string | null | undefined,
  now = new Date()
): CallQueueBucket {
  if (!nextCallAt) return "unscheduled";
  const due = new Date(nextCallAt);
  if (Number.isNaN(due.getTime())) return "unscheduled";
  const start = startOfIstDay(now);
  const end = endOfIstDay(now);
  if (due < start) return "overdue";
  if (due < end) return "due_today";
  return "scheduled";
}

export function isRecycleEligible(
  input: {
    temperature?: LeadTemperature | string | null;
    sales_stage?: string | null;
    last_call_at?: string | null;
    created_at?: string | null;
  },
  now = new Date(),
  cycleDays = CALL_CYCLE_DAYS
): boolean {
  const temp = input.temperature ?? "warm";
  if (temp === "hot") return false;
  if (input.sales_stage === "lost") return false;
  const touch = lastTouchAt(input);
  if (!touch) return true;
  const ageMs = now.getTime() - touch.getTime();
  return ageMs >= cycleDays * 24 * 60 * 60 * 1000;
}

export function cycleBucketFromId(id: string): 1 | 2 | 3 | 4 {
  let n = 0;
  for (let i = 0; i < id.length; i++) n = (n + id.charCodeAt(i)) % 4;
  return ((n % 4) + 1) as 1 | 2 | 3 | 4;
}

/** Hot first, then overdue → due today → unscheduled → scheduled. */
export function compareCallingDesk(
  a: {
    temperature?: LeadTemperature | string | null;
    next_followup_at?: string | null;
  },
  b: {
    temperature?: LeadTemperature | string | null;
    next_followup_at?: string | null;
  },
  now = new Date()
): number {
  const hotA = a.temperature === "hot" ? 0 : 1;
  const hotB = b.temperature === "hot" ? 0 : 1;
  if (hotA !== hotB) return hotA - hotB;
  const order: CallQueueBucket[] = ["overdue", "due_today", "unscheduled", "scheduled"];
  const qa = classifyCallQueue(a.next_followup_at, now);
  const qb = classifyCallQueue(b.next_followup_at, now);
  if (qa !== qb) return order.indexOf(qa) - order.indexOf(qb);
  const ta = a.next_followup_at ? new Date(a.next_followup_at).getTime() : Infinity;
  const tb = b.next_followup_at ? new Date(b.next_followup_at).getTime() : Infinity;
  return ta - tb;
}
