import { notFound } from "next/navigation";
import { getTradeAccount } from "@/actions/trade";
import {
  TradeAccountWorkspace,
  type TradeTab,
} from "@/components/trade/trade-account-workspace";
import { tradeMissingTableError } from "@/lib/domain/trade-ledger";

export const dynamic = "force-dynamic";

export default async function AccountTradePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: raw } = await searchParams;
  const tab: TradeTab = raw === "outward" || raw === "inward" ? raw : "summary";

  let data;
  try {
    data = await getTradeAccount(id);
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    if (/not found/i.test(message)) notFound();
    const hint = tradeMissingTableError(message);
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-white p-6 text-sm text-[var(--text-body)]">
        {hint ?? message ?? "Could not load the trade ledger."}
      </div>
    );
  }

  return <TradeAccountWorkspace data={data} tab={tab} />;
}
