import { redirect } from "next/navigation";
import { hasAuthority, requireAuth } from "@/lib/auth";
import { LeadImportWorkspace } from "@/components/leads/lead-import-workspace";
import { PageHeader } from "@/components/layout/page-header";

export default async function LeadImportPage() {
  const profile = await requireAuth();
  const canImport = await hasAuthority(profile.id, "import_leads");
  const canDistribute = await hasAuthority(profile.id, "distribute_leads");

  if (!canImport && !canDistribute) {
    redirect("/");
  }

  return (
    <div>
      <PageHeader
        eyebrow="Settings"
        title="Import"
        subtitle="Upload Excel enquiries and distribute them to the tele-calling team."
      />
      <LeadImportWorkspace canImport={canImport} canDistribute={canDistribute} />
    </div>
  );
}
