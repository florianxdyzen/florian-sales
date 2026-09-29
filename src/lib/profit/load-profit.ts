import { createClient } from "@/lib/supabase/server";
import { formatAccountTitle } from "@/lib/domain/account-code";
import {
  buildProfitLoss,
  type ProfitLine,
  type ProfitReport,
} from "@/lib/domain/profit-loss";
import { tradeMissingTableError } from "@/lib/domain/trade-ledger";

type EntryRow = {
  direction: string;
  occurred_on: string;
  amount_inr: number | string | null;
  sku_id: string | null;
  sku_or_description: string | null;
  lead_id: string;
};

export async function loadProfitReport(
  companyId: string,
  range: { from: string; to: string }
): Promise<{ report: ProfitReport; error: string | null }> {
  const supabase = await createClient();
  const rows: EntryRow[] = [];
  const pageSize = 1000;

  for (let offset = 0; offset < 20000; offset += pageSize) {
    const { data, error } = await supabase
      .from("trade_entries")
      .select("direction, occurred_on, amount_inr, sku_id, sku_or_description, lead_id")
      .eq("company_id", companyId)
      .gte("occurred_on", range.from)
      .lte("occurred_on", range.to)
      .order("occurred_on", { ascending: true })
      .range(offset, offset + pageSize - 1);

    if (error) {
      return {
        report: buildProfitLoss([], range),
        error: tradeMissingTableError(error.message) ?? error.message,
      };
    }
    const batch = (data ?? []) as EntryRow[];
    rows.push(...batch);
    if (batch.length < pageSize) break;
  }

  const leadIds = [...new Set(rows.map((row) => row.lead_id).filter(Boolean))];
  const names = new Map<string, { name: string; account_code: string | null }>();
  for (let i = 0; i < leadIds.length; i += 200) {
    const chunk = leadIds.slice(i, i + 200);
    const { data } = await supabase
      .from("leads")
      .select("id, name, account_code")
      .in("id", chunk);
    for (const lead of data ?? []) {
      names.set(lead.id, { name: lead.name, account_code: lead.account_code });
    }
  }

  const lines: ProfitLine[] = rows
    .filter((row) => row.direction === "outward" || row.direction === "inward")
    .map((row) => {
      const lead = names.get(row.lead_id);
      const label = lead
        ? formatAccountTitle(lead.account_code, lead.name)
        : "Account";
      const skuLabel = row.sku_or_description?.trim() || "Untitled item";
      const amount =
        row.amount_inr == null || row.amount_inr === ""
          ? null
          : Number(row.amount_inr);
      return {
        direction: row.direction as ProfitLine["direction"],
        occurredOn: String(row.occurred_on).slice(0, 10),
        amountInr: amount != null && Number.isFinite(amount) ? amount : null,
        leadId: row.lead_id,
        accountLabel: label,
        skuKey: row.sku_id || `text:${skuLabel.toLowerCase()}`,
        skuLabel,
      };
    });

  return { report: buildProfitLoss(lines, range), error: null };
}
