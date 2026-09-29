import { redirect } from "next/navigation";
import { hasAuthority, requireAuth } from "@/lib/auth";
import { getAccountCodeSettings } from "@/actions/account-code-settings";
import { AccountCodeSettingsForm } from "@/components/settings/account-code-settings-form";
import { PageHeader } from "@/components/layout/page-header";

export const dynamic = "force-dynamic";

export default async function CompanySettingsPage() {
  const profile = await requireAuth();
  const allowed =
    profile.role === "admin" ||
    (await hasAuthority(profile.id, "manage_settings")) ||
    (await hasAuthority(profile.id, "full_access"));
  if (!allowed) redirect("/");

  const settings = await getAccountCodeSettings();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Company settings"
        subtitle="Account codes stay FLR + a number. Set where the next unused code starts."
      />
      <AccountCodeSettingsForm initial={settings} />
    </div>
  );
}
