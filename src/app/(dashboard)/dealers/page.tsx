import {
  dealerCommissionCapabilities,
  listDealerDirectory,
} from "@/actions/dealers";
import { DealersWorkspace } from "@/components/dealers/dealers-workspace";
import { requireAuth } from "@/lib/auth";

export default async function DealersPage() {
  const profile = await requireAuth();
  const caps = await dealerCommissionCapabilities(profile);

  if (!caps.canViewDirectory) {
    return (
      <p className="rounded-xl border border-[var(--border)] bg-white p-6 text-sm text-[var(--text-muted)]">
        You do not have access to the dealers directory.
      </p>
    );
  }

  let dealers: Awaited<ReturnType<typeof listDealerDirectory>> = [];
  let schemaMissing = false;
  let schemaMessage = "";

  try {
    dealers = await listDealerDirectory();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (
      message.includes("027") ||
      message.includes("028") ||
      message.includes("dealer") ||
      message.includes("schema cache") ||
      message.includes("does not exist")
    ) {
      schemaMissing = true;
      schemaMessage = message;
    } else {
      throw error;
    }
  }

  if (schemaMissing) {
    return (
      <div className="rounded-xl border border-[var(--error)]/30 bg-[var(--error-light)] p-6 text-sm text-[var(--text-dark)]">
        <p className="font-semibold">Dealers schema not applied</p>
        <p className="mt-2 text-[var(--text-body)]">
          {schemaMessage || (
            <>
              Run Supabase migrations{" "}
              <code className="rounded bg-white px-1.5 py-0.5 text-xs">
                027_dealer_role.sql
              </code>{" "}
              and{" "}
              <code className="rounded bg-white px-1.5 py-0.5 text-xs">
                028_dealer_commissions.sql
              </code>
              , then refresh.
            </>
          )}
        </p>
      </div>
    );
  }

  return (
    <DealersWorkspace dealers={dealers} canApprove={caps.canApprove} />
  );
}
