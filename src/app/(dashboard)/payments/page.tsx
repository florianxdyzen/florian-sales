import { redirect } from "next/navigation";
import { listPaymentQueue } from "@/actions/payments";
import { requireAuth, hasAuthority } from "@/lib/auth";
import { PaymentsQueueClient } from "@/components/payments/payments-queue-client";
import { PageHeader } from "@/components/layout/page-header";

export default async function PaymentsPage() {
  const profile = await requireAuth();
  const can =
    profile.role === "admin" ||
    profile.role === "accounts" ||
    profile.role === "sales_manager" ||
    profile.role === "sales_executive" ||
    (await hasAuthority(profile.id, "view_payment_queues")) ||
    (await hasAuthority(profile.id, "record_payment")) ||
    (await hasAuthority(profile.id, "verify_payment"));
  if (!can) redirect("/pipeline");

  const canVerify =
    profile.role === "admin" ||
    profile.role === "accounts" ||
    (await hasAuthority(profile.id, "verify_payment")) ||
    (await hasAuthority(profile.id, "full_access"));

  const rows = await listPaymentQueue("pending").catch(() => []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        subtitle="Verify Token / Pre-dispatch / Final — same milestones as RK. Accounts confirms txn ID, date, and bank credit."
        className="mb-0"
      />
      <PaymentsQueueClient initialRows={rows as never} canVerify={canVerify} />
    </div>
  );
}
