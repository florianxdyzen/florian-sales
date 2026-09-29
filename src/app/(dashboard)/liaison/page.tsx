import { listPreInstallFeasibilityQueue } from "@/actions/feasibility";
import { listLiaisonQueue } from "@/actions/liaison";
import { LiaisonWorkspace } from "@/components/liaison/liaison-workspace";
import { requireAuth, hasAuthority } from "@/lib/auth";

export default async function LiaisonPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const profile = await requireAuth();
  const canLiaison =
    profile.role === "admin" ||
    profile.role === "liaison" ||
    profile.role === "sales_manager" ||
    (await hasAuthority(profile.id, "manage_liaison")) ||
    (await hasAuthority(profile.id, "full_access"));
  const canUploadFeasibility =
    profile.role === "admin" ||
    profile.role === "feasibility" ||
    profile.role === "liaison" ||
    profile.role === "sales_manager" ||
    (await hasAuthority(profile.id, "upload_feasibility_report")) ||
    (await hasAuthority(profile.id, "manage_liaison")) ||
    (await hasAuthority(profile.id, "full_access"));
  const canVerify =
    profile.role === "admin" ||
    profile.role === "accounts" ||
    (await hasAuthority(profile.id, "verify_subsidy")) ||
    (await hasAuthority(profile.id, "full_access"));
  const canSubmitCommission =
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    profile.role === "accounts" ||
    profile.role === "dealer" ||
    (await hasAuthority(profile.id, "submit_dealer_commission")) ||
    (await hasAuthority(profile.id, "full_access"));
  const canApproveCommission =
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    profile.role === "accounts" ||
    (await hasAuthority(profile.id, "approve_dealer_commission")) ||
    (await hasAuthority(profile.id, "full_access"));
  const canAssignDealer =
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    (await hasAuthority(profile.id, "assign_dealer")) ||
    (await hasAuthority(profile.id, "full_access"));

  if (!canLiaison && !canVerify && !canUploadFeasibility) {
    return (
      <p className="rounded-xl border border-[var(--border)] bg-white p-6 text-sm text-[var(--text-muted)]">
        You do not have access to Documentation.
      </p>
    );
  }

  const [leads, preInstallLeads] = await Promise.all([
    canLiaison || canVerify ? listLiaisonQueue().catch(() => []) : Promise.resolve([]),
    canUploadFeasibility || canLiaison
      ? listPreInstallFeasibilityQueue().catch(() => [])
      : Promise.resolve([]),
  ]);

  return (
    <LiaisonWorkspace
      leads={leads}
      preInstallLeads={preInstallLeads}
      initialTab={tab === "pre-install" ? "pre-install" : "post-install"}
      canLiaison={canLiaison}
      canVerifySubsidy={canVerify}
      canUploadFeasibility={canUploadFeasibility}
      canSubmitCommission={canSubmitCommission}
      canApproveCommission={canApproveCommission}
      canAssignDealer={canAssignDealer}
    />
  );
}
