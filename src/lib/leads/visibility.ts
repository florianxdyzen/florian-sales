import { getUserAuthorities } from "@/lib/auth";
import type { Profile, Lead } from "@/lib/domain/types";
import { isDealerRole } from "@/lib/domain/dealers";

export type PipelineQueue = "all" | "tele_call" | "site_visits";

/** Admins, sales managers, and holders of View All Leads see every company lead. */
export async function canSeeAllLeads(profile: Profile): Promise<boolean> {
  // Dealers never see the full company pipeline (revise Phase 6).
  if (isDealerRole(profile)) return false;
  if (profile.role === "admin" || profile.role === "sales_manager") {
    return true;
  }
  const auths = await getUserAuthorities(profile.id);
  return auths.has("full_access") || auths.has("view_all_leads");
}

export function ownsLead(
  profile: Profile,
  lead: {
    assigned_to?: string | null;
    assigned_telecaller_id?: string | null;
    assigned_surveyor_id?: string | null;
    created_by?: string | null;
    dealer_id?: string | null;
  }
): boolean {
  return (
    lead.assigned_telecaller_id === profile.id ||
    lead.assigned_surveyor_id === profile.id ||
    lead.assigned_to === profile.id ||
    lead.created_by === profile.id ||
    lead.dealer_id === profile.id
  );
}

/** Supabase `.or()` filter for scoped lead lists. */
export function ownLeadOrFilter(profileId: string): string {
  return [
    `assigned_telecaller_id.eq.${profileId}`,
    `assigned_surveyor_id.eq.${profileId}`,
    `assigned_to.eq.${profileId}`,
    `assigned_crew_id.eq.${profileId}`,
    `created_by.eq.${profileId}`,
    `dealer_id.eq.${profileId}`,
  ].join(",");
}

/** Default pipeline queue for a role when no URL filter is set. */
export function defaultPipelineQueue(profile: Profile): PipelineQueue {
  if (profile.role === "surveyor") return "site_visits";
  if (profile.role === "tele_caller") return "tele_call";
  if (profile.role === "dealer") return "all";
  return "all";
}

/** Whether this profile may act as tele-caller on the lead (schedule, call). */
export function isLeadTelecaller(
  profile: Profile,
  lead: Pick<Lead, "assigned_telecaller_id" | "assigned_to">
): boolean {
  return (
    lead.assigned_telecaller_id === profile.id ||
    (!lead.assigned_telecaller_id && lead.assigned_to === profile.id)
  );
}

export function isLeadSurveyor(
  profile: Profile,
  lead: Pick<Lead, "assigned_surveyor_id">
): boolean {
  return lead.assigned_surveyor_id === profile.id;
}
