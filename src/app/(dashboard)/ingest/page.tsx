import { redirect } from "next/navigation";
import {
  listReferralLinks,
  listRecentIngestEvents,
  getLeadSourceStats,
} from "@/actions/ingest";
import {
  StaffReferralForm,
  ReferralLinksPanel,
  IngestEventsTable,
} from "@/components/leads/ingest-workspace";
import { PageHeader } from "@/components/layout/page-header";
import { requireAuth, hasAuthority } from "@/lib/auth";

export default async function IngestPage() {
  const profile = await requireAuth();
  const can =
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    (await hasAuthority(profile.id, "import_leads")) ||
    (await hasAuthority(profile.id, "add_edit_leads")) ||
    (await hasAuthority(profile.id, "full_access"));

  if (!can) redirect("/pipeline");

  const canImport =
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    (await hasAuthority(profile.id, "import_leads")) ||
    (await hasAuthority(profile.id, "full_access"));

  const [links, events, sources] = await Promise.all([
    canImport ? listReferralLinks().catch(() => []) : Promise.resolve([]),
    canImport ? listRecentIngestEvents().catch(() => []) : Promise.resolve([]),
    getLeadSourceStats().catch(() => []),
  ]);

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Settings"
        title="Ingest"
        subtitle="Referral forms, Facebook Lead Ads webhook, and source mix."
        className="mb-0"
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <StaffReferralForm />
        {canImport && <ReferralLinksPanel links={links} />}
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-white p-4">
        <h2 className="text-sm font-semibold text-[var(--text-dark)]">Facebook Lead Ads</h2>
        <p className="mt-1 text-sm text-[var(--text-muted)]">
          Webhook URL: <code className="text-[var(--primary)]">/api/ingest/facebook</code>
        </p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-xs text-[var(--text-muted)]">
          <li>Set <code>FACEBOOK_VERIFY_TOKEN</code> for Meta subscription verification</li>
          <li>Set <code>FACEBOOK_PAGE_ACCESS_TOKEN</code> to fetch lead fields from Graph API</li>
          <li>
            Set <code>FACEBOOK_DEFAULT_COMPANY_ID</code> (KT seed:{" "}
            <code>a0000000-0000-4000-8000-000000000001</code>)
          </li>
          <li>Leads are idempotent on <code>external_id = fb:&#123;leadgen_id&#125;</code></li>
        </ul>
      </div>

      {sources.length > 0 && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-[var(--text-dark)]">
            Source analytics
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {sources.map((s) => (
              <div
                key={s.source}
                className="rounded-xl border border-[var(--border)] bg-white p-4 shadow-[var(--shadow)]"
              >
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  {s.label}
                </p>
                <p className="mt-2 text-2xl font-semibold text-[var(--text-dark)]">{s.total}</p>
                <p className="mt-1 text-xs text-[var(--text-muted)]">
                  Active {s.active} · Lost {s.lost} · Survey done {s.surveyCompleted}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {canImport && (
        <div>
          <h2 className="mb-3 text-sm font-semibold text-[var(--text-dark)]">
            Recent ingest events
          </h2>
          <IngestEventsTable events={events} />
        </div>
      )}
    </div>
  );
}
