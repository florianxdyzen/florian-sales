import { redirect } from "next/navigation";
import { ProfitReportView } from "@/components/profit/profit-report";
import { getCurrentUser, hasAuthority } from "@/lib/auth";
import { resolveProfitRange } from "@/lib/domain/profit-loss";
import { loadProfitReport } from "@/lib/profit/load-profit";

export const dynamic = "force-dynamic";

export default async function ProfitPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; from?: string; to?: string }>;
}) {
  const profile = await getCurrentUser();
  if (!profile) redirect("/login");
  const allowed =
    profile.role === "admin" || (await hasAuthority(profile.id, "view_profit"));
  if (!allowed) redirect("/");

  const query = await searchParams;
  const period = query.period === "last" || query.period === "custom" ? query.period : "this";
  const { range, error } = resolveProfitRange({
    period,
    from: query.from,
    to: query.to,
  });
  const { report, error: loadError } = await loadProfitReport(profile.company_id, range);

  return (
    <ProfitReportView
      range={range}
      period={error ? "this" : period}
      report={report}
      error={error}
      loadError={loadError}
    />
  );
}
