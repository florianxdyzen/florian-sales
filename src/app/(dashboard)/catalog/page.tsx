import { redirect } from "next/navigation";
import { getQuotationContext } from "@/lib/quotations/context";
import { getRateCardPanels } from "@/lib/quotations/data/rate-card";
import { getRateCardInverters } from "@/lib/quotations/data/rate-card-inverters";
import { listCatalogAdmin } from "@/actions/catalog";
import { CatalogAdmin } from "@/components/catalog/catalog-admin";
import { InverterRateCardManager } from "@/components/catalog/inverter-rate-card-manager";
import { RateCardManager } from "@/components/catalog/rate-card-manager";
import { CatalogTabs } from "@/components/catalog/catalog-tabs";
import { listTradeSkus } from "@/actions/trade";
import { TradeSkuAdmin } from "@/components/trade/trade-sku-admin";
import { getCurrentUser, hasAuthority } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function CatalogPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const activeTab =
    tab === "rate-card"
      ? "rate-card"
      : tab === "inverters"
        ? "inverters"
        : tab === "items"
          ? "items"
          : "trade-skus";
  const { canManageCatalog } = await getQuotationContext();

  if (!canManageCatalog) {
    redirect("/");
  }

  const profile = await getCurrentUser();
  const canManageSkus = Boolean(
    profile &&
      (profile.role === "admin" ||
        (await hasAuthority(profile.id, "manage_trade_skus")) ||
        (await hasAuthority(profile.id, "full_access")))
  );

  const [catalog, ratePanels, rateInverters, tradeSkus] = await Promise.all([
    listCatalogAdmin(),
    getRateCardPanels(),
    getRateCardInverters(),
    listTradeSkus({ includeInactive: true }).catch(() => []),
  ]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">Catalogue</h1>
        <p className="text-sm text-[var(--text-muted)]">
          Trade SKUs for the ledger. Quote lines are B2B items. Kit rate card is optional.
        </p>
      </div>

      <CatalogTabs active={activeTab} />

      {activeTab === "rate-card" ? (
        <RateCardManager panels={ratePanels} canEdit={canManageCatalog} />
      ) : activeTab === "inverters" ? (
        <InverterRateCardManager inverters={rateInverters} canEdit={canManageCatalog} />
      ) : activeTab === "trade-skus" ? (
        <TradeSkuAdmin skus={tradeSkus} canEdit={canManageSkus} />
      ) : (
        <CatalogAdmin
          items={catalog.items}
          brands={catalog.brands}
          categories={catalog.categories}
          canManage={canManageCatalog}
        />
      )}
    </div>
  );
}
