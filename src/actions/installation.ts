"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, hasAuthority } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import {
  INSTALL_PHOTO_KINDS,
  installationProofGate,
  type InstallationPhoto,
} from "@/lib/domain/installation";
import { issuePortalCode } from "@/lib/domain/issue-portal-code";
import { FRS_ISSUE_PORTAL_CODES } from "@/lib/product-surface";

async function canAssign(profile: { id: string; role: string }) {
  return (
    profile.role === "admin" ||
    profile.role === "ops_coordinator" ||
    (await hasAuthority(profile.id, "assign_installation_crew")) ||
    (await hasAuthority(profile.id, "full_access"))
  );
}

async function canUnassign(profile: { id: string; role: string }) {
  return (
    profile.role === "admin" || (await hasAuthority(profile.id, "full_access"))
  );
}

async function canUpload(profile: { id: string; role: string }) {
  return (
    profile.role === "admin" ||
    profile.role === "ops_coordinator" ||
    profile.role === "installation_crew" ||
    (await hasAuthority(profile.id, "upload_installation_proofs")) ||
    (await hasAuthority(profile.id, "upload_panel_barcodes")) ||
    (await hasAuthority(profile.id, "full_access"))
  );
}

async function canComplete(profile: { id: string; role: string }) {
  return (
    profile.role === "admin" ||
    profile.role === "ops_coordinator" ||
    profile.role === "installation_crew" ||
    (await hasAuthority(profile.id, "complete_installation")) ||
    (await hasAuthority(profile.id, "full_access"))
  );
}

export async function listCrewMembers() {
  const profile = await requireAuth();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, role, phone")
    .eq("company_id", profile.company_id)
    .eq("is_active", true)
    .eq("role", "installation_crew")
    .order("name");
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function listInstallationPhotos(leadId: string) {
  await requireAuth();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("installation_photos")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as InstallationPhoto[];
}

export async function listInstallationQueue() {
  const profile = await requireAuth();
  const can =
    (await canAssign(profile)) ||
    (await canUpload(profile)) ||
    (await hasAuthority(profile.id, "view_installation_queue"));
  if (!can) throw new Error("Missing authority: view_installation_queue");

  const supabase = await createClient();
  const stages = [
    "pre_dispatch_verified",
    "installation_assigned",
    "installation_in_progress",
    "installation_completed",
  ];

  let q = supabase
    .from("leads")
    .select(
      "id, name, phone, city, sales_stage, assigned_crew_id, expected_panel_count, installation_assigned_at, installation_completed_at, crew:profiles!leads_assigned_crew_id_fkey(id, name)"
    )
    .eq("company_id", profile.company_id)
    .in("sales_stage", stages)
    .order("updated_at", { ascending: false });

  if (profile.role === "installation_crew") {
    q = q.eq("assigned_crew_id", profile.id);
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function assignInstallationCrew(input: {
  leadId: string;
  crewId: string;
  expectedPanelCount?: number | null;
}) {
  const profile = await requireAuth();
  if (!(await canAssign(profile))) {
    throw new Error("Missing authority: assign_installation_crew");
  }

  const supabase = await createClient();
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, sales_stage, company_id, token_verified")
    .eq("id", input.leadId)
    .eq("company_id", profile.company_id)
    .single();

  if (leadError || !lead) throw new Error("Lead not found");

  const allowed = new Set([
    "pre_dispatch_verified",
    "installation_assigned",
    "installation_in_progress",
  ]);
  if (!allowed.has(lead.sales_stage)) {
    throw new Error("Accounts must verify pre-dispatch first");
  }
  if (!lead.token_verified) {
    throw new Error("Accounts must verify token first");
  }

  const { data: crew } = await supabase
    .from("profiles")
    .select("id, role")
    .eq("id", input.crewId)
    .eq("company_id", profile.company_id)
    .eq("is_active", true)
    .maybeSingle();
  if (!crew) throw new Error("Crew member not found");
  if (crew.role === "admin") {
    throw new Error("Owner cannot be assigned as crew");
  }
  if (crew.role !== "installation_crew") {
    throw new Error("Selected user is not an installation crew member");
  }

  const nextStage =
    lead.sales_stage === "pre_dispatch_verified"
      ? "installation_assigned"
      : lead.sales_stage;

  const { error } = await supabase
    .from("leads")
    .update({
      assigned_crew_id: input.crewId,
      expected_panel_count:
        input.expectedPanelCount != null && input.expectedPanelCount > 0
          ? Math.floor(input.expectedPanelCount)
          : null,
      installation_assigned_at: new Date().toISOString(),
      sales_stage: nextStage,
    })
    .eq("id", lead.id);

  if (error) throw new Error(error.message);

  if (nextStage !== lead.sales_stage) {
    await logAuditEvent({
      companyId: profile.company_id,
      leadId: lead.id,
      actorId: profile.id,
      eventType: "stage_change",
      entityType: "lead",
      entityId: lead.id,
      metadata: {
        from: lead.sales_stage,
        to: nextStage,
        crewId: input.crewId,
      },
    });
  }

  await logAuditEvent({
    companyId: profile.company_id,
    leadId: lead.id,
    actorId: profile.id,
    eventType: "installation_crew_assigned",
    entityType: "lead",
    entityId: lead.id,
    metadata: { crewId: input.crewId },
  });

  revalidatePath("/installation");
  revalidatePath("/pipeline");
  revalidatePath("/customers");
  return { ok: true };
}

export async function unassignInstallationCrew(leadId: string) {
  const profile = await requireAuth();
  if (!(await canUnassign(profile))) {
    throw new Error("Only the Owner can unassign installation crew");
  }

  const supabase = await createClient();
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, sales_stage, company_id, assigned_crew_id")
    .eq("id", leadId)
    .eq("company_id", profile.company_id)
    .single();

  if (leadError || !lead) throw new Error("Lead not found");
  if (!lead.assigned_crew_id) throw new Error("No crew is assigned");

  const revertStages = new Set(["installation_assigned", "installation_in_progress"]);
  const nextStage = revertStages.has(lead.sales_stage)
    ? "pre_dispatch_verified"
    : lead.sales_stage;

  const { error } = await supabase
    .from("leads")
    .update({
      assigned_crew_id: null,
      installation_assigned_at: null,
      sales_stage: nextStage,
    })
    .eq("id", lead.id);

  if (error) throw new Error(error.message);

  if (nextStage !== lead.sales_stage) {
    await logAuditEvent({
      companyId: profile.company_id,
      leadId: lead.id,
      actorId: profile.id,
      eventType: "stage_change",
      entityType: "lead",
      entityId: lead.id,
      metadata: {
        from: lead.sales_stage,
        to: nextStage,
        reason: "installation_crew_unassigned",
      },
    });
  }

  await logAuditEvent({
    companyId: profile.company_id,
    leadId: lead.id,
    actorId: profile.id,
    eventType: "installation_crew_unassigned",
    entityType: "lead",
    entityId: lead.id,
    metadata: { previousCrewId: lead.assigned_crew_id },
  });

  revalidatePath("/installation");
  revalidatePath("/pipeline");
  revalidatePath("/customers");
  return { ok: true };
}

const photoSchema = z.object({
  leadId: z.string().uuid(),
  photoKind: z.enum(INSTALL_PHOTO_KINDS),
  fileUrl: z.string().min(8, "Photo URL missing — upload the file again"),
  caption: z.string().optional().nullable(),
  panelIndex: z.number().int().positive().optional().nullable(),
  serialHint: z.string().optional().nullable(),
});

export async function addInstallationPhoto(input: z.infer<typeof photoSchema>) {
  const profile = await requireAuth();
  if (!(await canUpload(profile))) {
    throw new Error("Missing authority to upload installation proofs");
  }

  const parsedResult = photoSchema.safeParse(input);
  if (!parsedResult.success) {
    throw new Error(parsedResult.error.issues[0]?.message ?? "Invalid photo details");
  }
  const parsed = parsedResult.data;
  if (parsed.photoKind === "panel_barcode" && !parsed.panelIndex) {
    throw new Error("Panel index is required for barcode photos");
  }

  const supabase = await createClient();
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, sales_stage, company_id, assigned_crew_id")
    .eq("id", parsed.leadId)
    .eq("company_id", profile.company_id)
    .single();

  if (leadError || !lead) throw new Error("Lead not found");

  const installStages = new Set([
    "installation_assigned",
    "installation_in_progress",
  ]);
  if (!installStages.has(lead.sales_stage)) {
    throw new Error("Assign a crew before uploading installation proofs");
  }

  const isCrew = lead.assigned_crew_id === profile.id;
  const isOps = await canAssign(profile);
  if (!isCrew && !isOps && !(await hasAuthority(profile.id, "full_access"))) {
    throw new Error("Only the assigned crew (or Ops) can upload proofs");
  }

  const { data: photo, error } = await supabase
    .from("installation_photos")
    .insert({
      company_id: profile.company_id,
      lead_id: lead.id,
      photo_kind: parsed.photoKind,
      file_url: parsed.fileUrl,
      caption: parsed.caption ?? null,
      panel_index: parsed.panelIndex ?? null,
      serial_hint: parsed.serialHint ?? null,
      uploaded_by: profile.id,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);

  if (lead.sales_stage === "installation_assigned") {
    await supabase
      .from("leads")
      .update({
        sales_stage: "installation_in_progress",
        installation_started_at: new Date().toISOString(),
      })
      .eq("id", lead.id);

    await logAuditEvent({
      companyId: profile.company_id,
      leadId: lead.id,
      actorId: profile.id,
      eventType: "stage_change",
      entityType: "lead",
      entityId: lead.id,
      metadata: {
        from: "installation_assigned",
        to: "installation_in_progress",
      },
    });
  }

  await logAuditEvent({
    companyId: profile.company_id,
    leadId: lead.id,
    actorId: profile.id,
    eventType: "installation_photo_added",
    entityType: "installation_photo",
    entityId: photo.id,
    metadata: { photoKind: parsed.photoKind, panelIndex: parsed.panelIndex },
  });

  revalidatePath("/installation");
  revalidatePath("/pipeline");
  revalidatePath("/customers");
  return photo as InstallationPhoto;
}

export async function deleteInstallationPhoto(photoId: string) {
  const profile = await requireAuth();
  const supabase = await createClient();
  const { data: photo } = await supabase
    .from("installation_photos")
    .select("*")
    .eq("id", photoId)
    .eq("company_id", profile.company_id)
    .maybeSingle();

  if (!photo) throw new Error("Photo not found");

  const ok =
    photo.uploaded_by === profile.id ||
    (await canAssign(profile)) ||
    (await hasAuthority(profile.id, "full_access"));
  if (!ok) throw new Error("Cannot delete this photo");

  const { error } = await supabase
    .from("installation_photos")
    .delete()
    .eq("id", photoId);
  if (error) throw new Error(error.message);

  revalidatePath("/installation");
  revalidatePath("/customers");
  return { ok: true };
}

export async function completeInstallation(leadId: string) {
  const profile = await requireAuth();
  if (!(await canComplete(profile))) {
    throw new Error("Missing authority: complete_installation");
  }

  const supabase = await createClient();
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select(
      "id, name, sales_stage, company_id, assigned_crew_id, expected_panel_count, portal_code"
    )
    .eq("id", leadId)
    .eq("company_id", profile.company_id)
    .single();

  if (leadError || !lead) throw new Error("Lead not found");

  if (
    lead.sales_stage !== "installation_in_progress" &&
    lead.sales_stage !== "installation_assigned"
  ) {
    throw new Error("Installation is not in progress");
  }

  const isCrew = lead.assigned_crew_id === profile.id;
  const isOps = await canAssign(profile);
  if (!isCrew && !isOps && !(await hasAuthority(profile.id, "full_access"))) {
    throw new Error("Only the assigned crew (or Ops) can complete installation");
  }

  const photos = await listInstallationPhotos(leadId);
  const gate = installationProofGate({
    photos,
    expectedPanelCount: lead.expected_panel_count,
  });
  if (!gate.ok) {
    throw new Error(`Missing proofs: ${gate.missing.join("; ")}`);
  }

  const portalCode = FRS_ISSUE_PORTAL_CODES
    ? lead.portal_code || (await issuePortalCode(supabase))
    : lead.portal_code;

  const { error } = await supabase
    .from("leads")
    .update({
      sales_stage: "liaison_in_progress",
      installation_completed_at: new Date().toISOString(),
      ...(FRS_ISSUE_PORTAL_CODES && !lead.portal_code && portalCode
        ? { portal_code: portalCode }
        : {}),
    })
    .eq("id", lead.id);

  if (error) throw new Error(error.message);

  const audiences = ["accounts", "sales", "liaison"] as const;
  await supabase.from("notification_outbox").insert(
    audiences.map((audience) => ({
      company_id: profile.company_id,
      lead_id: lead.id,
      event_type: "installation_completed",
      audience,
      payload: {
        leadName: lead.name,
        photoCount: photos.length,
        barcodeCount: gate.barcodeCount,
        portalCode,
      },
      status: "pending",
    }))
  );

  await logAuditEvent({
    companyId: profile.company_id,
    leadId: lead.id,
    actorId: profile.id,
    eventType: "stage_change",
    entityType: "lead",
    entityId: lead.id,
    metadata: {
      from: lead.sales_stage,
      to: "installation_completed",
    },
  });

  await logAuditEvent({
    companyId: profile.company_id,
    leadId: lead.id,
    actorId: profile.id,
    eventType: "stage_change",
    entityType: "lead",
    entityId: lead.id,
    metadata: {
      from: "installation_completed",
      to: "liaison_in_progress",
      portalCode,
    },
  });

  await logAuditEvent({
    companyId: profile.company_id,
    leadId: lead.id,
    actorId: profile.id,
    eventType: "installation_completed",
    entityType: "lead",
    entityId: lead.id,
    metadata: { notified: audiences, portalCode },
  });

  revalidatePath("/installation");
  revalidatePath("/liaison");
  revalidatePath("/payments");
  revalidatePath("/pipeline");
  revalidatePath("/customers");
  return { ok: true, notified: audiences, portalCode };
}
