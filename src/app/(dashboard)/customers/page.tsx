import { getCustomers } from "@/actions/leads";
import {
  CustomersList,
  type CustomerRow,
} from "@/components/leads/customers-list";
import { PageHeader } from "@/components/layout/page-header";
import type { SalesStage } from "@/lib/domain/workflow";

export default async function CustomersPage() {
  const customers = await getCustomers();

  const rows: CustomerRow[] = customers.map((customer) => ({
    id: customer.id,
    name: customer.name,
    account_code: customer.account_code ?? null,
    phone: customer.phone,
    city: customer.city,
    address: customer.address,
    requirement_notes: customer.requirement_notes,
    sales_stage: customer.sales_stage as SalesStage,
    portal_code: customer.portal_code ?? null,
    created_at: customer.created_at,
    telecaller_name:
      customer.telecaller_profile?.name ?? customer.assigned_profile?.name ?? null,
    surveyor_name: customer.surveyor_profile?.name ?? null,
    last_outward_on: customer.last_outward_on ?? null,
    last_inward_on: customer.last_inward_on ?? null,
    outward_conversions: customer.outward_conversions ?? null,
    outward_earnings_inr: customer.outward_earnings_inr ?? null,
    next_followup_at: customer.next_followup_at ?? null,
  }));

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Leads"
        title="Accounts"
        subtitle={`B2B counterparties · ${rows.length} on the Won/post-sale list. Open a card for contact details, or Trade ledger for outward / inward lines.`}
        className="mb-0"
      />
      <CustomersList customers={rows} />
    </div>
  );
}
