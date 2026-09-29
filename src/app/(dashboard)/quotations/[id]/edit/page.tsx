import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { QuotationBuilderForm } from "@/components/quotations/quotation-builder-form";
import { getQuotation, listLeadsForQuote } from "@/actions/quotations";
import { getCatalogForQuotation } from "@/lib/quotations/data/items";
import { getRateCardPanels } from "@/lib/quotations/data/rate-card";
import { getRateCardInverters } from "@/lib/quotations/data/rate-card-inverters";
import { loadSolarTemplate } from "@/lib/quotations/data/lookups";
import { quotationToBuilderDefaults } from "@/lib/quotations/quotation-defaults";
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
    return (
      <div className="space-y-4">
        {heading}
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          This is a historical non-solar quotation. It is read-only. Print still works; new quotes
          are solar only.
        </div>
        <Link
          href={`/quotations/${id}/print`}
          className="inline-flex rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold"
        >
          Print / PDF
        </Link>
      </div>
    );
  }

  if (quote.template_kind === "solar" || quote.template_kind === "premium") {
    const { canManageCatalog } = await getQuotationContext().catch(() => ({
      canManageCatalog: false,
    }));
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
        />
      </div>
    );
  }

  redirect(`/quotations/${id}`);
}
