import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Settings2 } from "lucide-react";
import { listQuotations } from "@/actions/quotations";
import { QuotationsList } from "@/components/quotations/quotations-list";
import { PageHeader } from "@/components/layout/page-header";
import { requireAuth, hasAuthority } from "@/lib/auth";
import { getQuotationContext } from "@/lib/quotations/context";

export default async function QuotationsPage() {
  const profile = await requireAuth();
  const can =
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    profile.role === "sales_executive" ||
    (await hasAuthority(profile.id, "view_quotations")) ||
    (await hasAuthority(profile.id, "create_quotations"));
  if (!can) redirect("/pipeline");

  const canCreate =
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    profile.role === "sales_executive" ||
    (await hasAuthority(profile.id, "create_quotations")) ||
    (await hasAuthority(profile.id, "manage_quotations")) ||
    (await hasAuthority(profile.id, "full_access"));

  const { canEditQuotationTemplate } = await getQuotationContext().catch(() => ({
    canEditQuotationTemplate: false,
  }));

  const quotes = await listQuotations().catch(() => []);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Others"
        title="Quotes"
        subtitle="B2B quotations and solar kit quotations."
        className="mb-0"
        actions={
          <>
            {canEditQuotationTemplate && (
              <Link
                href="/quotations/template"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text-body)] hover:bg-[var(--bg)]"
              >
                <Settings2 className="h-4 w-4" />
                Template
              </Link>
            )}
            {canCreate && (
              <Link
                href="/quotations/new?kind=solar"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border)] bg-white px-4 py-2 text-sm font-semibold text-[var(--text-body)] hover:bg-[var(--bg)]"
              >
                <Plus className="h-4 w-4" />
                New solar quote
              </Link>
            )}
            {canCreate && (
              <Link
                href="/quotations/new?kind=non_solar"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-[var(--primary-hover)]"
              >
                <Plus className="h-4 w-4" />
                New B2B quote
              </Link>
            )}
          </>
        }
      />

      <QuotationsList
        quotes={quotes as Parameters<typeof QuotationsList>[0]["quotes"]}
        canCreate={canCreate}
      />
    </div>
  );
}
