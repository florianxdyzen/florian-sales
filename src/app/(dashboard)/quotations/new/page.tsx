import { redirect } from "next/navigation";
import { NewQuotationWorkspace } from "@/components/quotations/new-quotation-workspace";
import {
  getLeadForQuote,
  listCatalogItems,
  listLeadsForQuote,
} from "@/actions/quotations";
import { getCatalogForQuotation } from "@/lib/quotations/data/items";
import { getRateCardPanels } from "@/lib/quotations/data/rate-card";
import { getRateCardInverters } from "@/lib/quotations/data/rate-card-inverters";
import { loadSolarTemplate } from "@/lib/quotations/data/lookups";
import { peekNextQuotationNumber } from "@/lib/quotations/actions/quotation-number";
import { requireAuth, hasAuthority } from "@/lib/auth";
import { getQuotationContext } from "@/lib/quotations/context";
import type { QuoteTemplateKind } from "@/lib/quotations/types";

export default async function NewQuotationPage({
  searchParams,
}: {
  searchParams: Promise<{ leadId?: string; kind?: string }>;
}) {
  const profile = await requireAuth();
  const can =
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    profile.role === "sales_executive" ||
    (await hasAuthority(profile.id, "create_quotations")) ||
    (await hasAuthority(profile.id, "manage_quotations"));
  if (!can) redirect("/quotations");

  const params = await searchParams;
  const kind = (
    params.kind === "premium" || params.kind === "solar" ? params.kind : "non_solar"
  ) as QuoteTemplateKind;

  const canAddLead =
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    profile.role === "tele_caller" ||
    profile.role === "sales_executive" ||
    (await hasAuthority(profile.id, "add_edit_leads")) ||
    (await hasAuthority(profile.id, "full_access"));

  const canEditQuotationPricing =
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    (await hasAuthority(profile.id, "edit_quotation_pricing"));

  const { canManageCatalog } = await getQuotationContext().catch(() => ({
    canManageCatalog: false,
  }));

  const [leads, catalog, solarCatalog, panels, inverters, template, nextQuotationNo, initialLead] =
    await Promise.all([
      listLeadsForQuote().catch(() => []),
      listCatalogItems(),
      getCatalogForQuotation(),
      getRateCardPanels({ forSales: !canManageCatalog }).catch(() => []),
      getRateCardInverters().catch(() => []),
      loadSolarTemplate(),
      peekNextQuotationNumber().catch(() => undefined),
      params.leadId
        ? getLeadForQuote(params.leadId).catch(() => null)
        : Promise.resolve(null),
    ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--text-dark)]">
          {kind === "premium"
            ? "New premium solar quotation"
            : kind === "solar"
              ? "New solar kit quotation"
              : "New B2B quotation"}
        </h1>
        <p className="text-sm text-[var(--text-muted)]">
          {kind === "non_solar"
            ? "Line-item quotation. Attach the GST invoice on the trade line."
            : "Choose Regular or Premium, then price the kit per kW."}
        </p>
      </div>
      <NewQuotationWorkspace
        leads={leads}
        catalog={catalog}
        solarCatalog={solarCatalog}
        panels={panels}
        inverters={inverters}
        meterCharges={template.meterCharges}
        nextQuotationNo={nextQuotationNo}
        canEditQuotationPricing={canEditQuotationPricing}
        canAddLead={canAddLead}
        proposalTemplate={template}
        initialLead={
          initialLead
            ? {
                id: initialLead.id,
                name: initialLead.name,
                phone: initialLead.phone,
                city: initialLead.city,
                address: initialLead.address,
                sales_stage: initialLead.sales_stage,
                recommended_system_kw: initialLead.recommended_system_kw,
                meter_type: initialLead.meter_type ?? null,
              }
            : null
        }
        initialKind={kind}
      />
    </div>
  );
}
