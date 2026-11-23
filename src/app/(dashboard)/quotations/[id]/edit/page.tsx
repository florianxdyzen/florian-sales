import { notFound, redirect } from "next/navigation";
import { QuotationBuilderForm } from "@/components/quotations/quotation-builder-form";
import { QuotationBuilderFormAppliance } from "@/components/quotations/quotation-builder-form-appliance";
import { getQuotation, listCatalogItems, listLeadsForQuote } from "@/actions/quotations";
import { getCatalogForQuotation } from "@/lib/quotations/data/items";
import { getRateCardPanels } from "@/lib/quotations/data/rate-card";
import { getRateCardInverters } from "@/lib/quotations/data/rate-card-inverters";
import { loadSolarTemplate } from "@/lib/quotations/data/lookups";
import { quotationToBuilderDefaults } from "@/lib/quotations/quotation-defaults";
import {
  parseLastInverterByKw,
  parseLastSubsidyUnder3,
} from "@/lib/quotations/quote-prefs";
import { requireAuth, hasAuthority } from "@/lib/auth";
import { getQuotationContext } from "@/lib/quotations/context";

export default async function EditQuotationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const profile = await requireAuth();
  const can =
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    profile.role === "sales_executive" ||
    (await hasAuthority(profile.id, "create_quotations")) ||
    (await hasAuthority(profile.id, "manage_quotations"));
  if (!can) redirect("/quotations");

  const canEditQuotationPricing =
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    (await hasAuthority(profile.id, "edit_quotation_pricing"));

  const canAddLead =
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    profile.role === "tele_caller" ||
    profile.role === "sales_executive" ||
    (await hasAuthority(profile.id, "add_edit_leads")) ||
    (await hasAuthority(profile.id, "full_access"));

  const { id } = await params;
  const quote = await getQuotation(id).catch(() => null);
  if (!quote) notFound();
  if (quote.status === "accepted") redirect(`/quotations/${id}`);

  const heading = (
    <div>
      <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold text-[var(--text-dark)]">
        Edit {quote.quotation_no}
      </h1>
    </div>
  );

  if (quote.template_kind === "non_solar") {
    const [catalog, leads] = await Promise.all([
      listCatalogItems("non_solar"),
      listLeadsForQuote().catch(() => []),
    ]);
    return (
      <div className="space-y-6">
        {heading}
        <QuotationBuilderFormAppliance
          customer={{
            id: quote.lead_id,
            name: quote.customer_name,
            phone: quote.customer_phone ?? "",
            address: quote.customer_address,
            city: quote.customer_city,
          }}
          catalog={catalog}
          leads={leads}
          canAddLead={canAddLead}
          canEditQuotationPricing={canEditQuotationPricing}
          initial={quote}
        />
      </div>
    );
  }

  if (quote.template_kind === "solar" || quote.template_kind === "premium") {
    const quotationContext = await getQuotationContext().catch(() => null);
    const canManageCatalog = quotationContext?.canManageCatalog ?? false;
    let lastInverterByKw = parseLastInverterByKw({});
    let lastSubsidyUnder3Kw = parseLastSubsidyUnder3(null);
    if (quotationContext) {
      const prefs = await quotationContext.supabase
        .from("quotation_company_settings")
        .select("last_inverter_by_kw, last_subsidy_under_3kw")
        .eq("company_id", quotationContext.companyId)
        .maybeSingle();
      if (!prefs.error) {
        lastInverterByKw = parseLastInverterByKw(prefs.data?.last_inverter_by_kw);
        lastSubsidyUnder3Kw = parseLastSubsidyUnder3(prefs.data?.last_subsidy_under_3kw);
      }
    }
    const [solarCatalog, allPanels, inverters, template, leads] = await Promise.all([
      getCatalogForQuotation(),
      getRateCardPanels().catch(() => []),
      getRateCardInverters().catch(() => []),
      loadSolarTemplate(),
      listLeadsForQuote().catch(() => []),
    ]);

    const defaults = quotationToBuilderDefaults(quote);
    const quoteTier =
      quote.template_kind === "premium" || defaults.tierType !== "regular"
        ? "premium"
        : "regular";

    const salesPanels = canManageCatalog
      ? allPanels
      : allPanels.filter((p) => p.available_for_sales !== false);
    const selectedName = (defaults.moduleTypeName ?? defaults.moduleCompanyName ?? "").trim();
    const selected = allPanels.find(
      (p) => p.panel_name === selectedName || p.id === defaults.ratePackageId
    );
    const panels =
      selected && !salesPanels.some((p) => p.id === selected.id)
        ? [selected, ...salesPanels]
        : salesPanels;

    return (
      <div className="space-y-6">
        {heading}
        <QuotationBuilderForm
          catalog={solarCatalog}
          panels={panels}
          inverters={inverters}
          leads={leads}
          canAddLead={canAddLead}
          meterCharges={template.meterCharges}
          canEditQuotationPricing={canEditQuotationPricing}
          quoteTier={quoteTier}
          defaultValues={defaults}
          proposalTemplate={template}
          lastInverterByKw={lastInverterByKw}
          lastSubsidyUnder3Kw={lastSubsidyUnder3Kw}
        />
      </div>
    );
  }

  redirect(`/quotations/${id}`);
}
