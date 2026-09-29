"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { accountCodeDbError, parseAccountCodeInput } from "@/lib/domain/account-code";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, requireAuthority, hasAuthority } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { canMoveSalesStage } from "@/lib/workflow-rules";
import type { SalesStage, LeadTemperature, LeadSource } from "@/lib/domain/workflow";
import { CUSTOMER_SALES_STAGES, LEAD_SOURCES, isCustomerSalesStage } from "@/lib/domain/workflow";
import { canSeeAllLeads, ownLeadOrFilter } from "@/lib/leads/visibility";
import { isDealerRole } from "@/lib/domain/dealers";
import { issuePortalCode } from "@/lib/domain/issue-portal-code";
import { FRS_ISSUE_PORTAL_CODES } from "@/lib/product-surface";
import type { LeadWithRelations } from "@/lib/domain/types";
import {
  METER_OWNERSHIPS,
  METER_TYPES,
  PAYMENT_PLANS,
  parseMeterOwnership,
  parseMeterType,
  parsePaymentPlan,
  type MeterOwnership,
  type MeterType,
  type PaymentPlan,
} from "@/lib/domain/lead-profile";
import {
  checkWonClosingGate,
  type WonClosingPayload,
} from "@/lib/leads/won-gate";
import {
  DEFAULT_STRUCTURE_LEGS,
  emptyLegHeights,
  parseStructureLegHeights,
} from "@/lib/leads/structure-legs";
import { assertPaymentWithinQuoteCap } from "@/lib/domain/payment-balance";

const sourceEnum = z.enum(LEAD_SOURCES as unknown as [LeadSource, ...LeadSource[]]);

const meterTypeEnum = z.enum(METER_TYPES as unknown as [MeterType, ...MeterType[]]);
const meterOwnershipEnum = z.enum(
  METER_OWNERSHIPS as unknown as [MeterOwnership, ...MeterOwnership[]]
);
const paymentPlanEnum = z.enum(PAYMENT_PLANS as unknown as [PaymentPlan, ...PaymentPlan[]]);

const wonClosingSchema = z.object({
  panelName: z.string().trim().min(1, "Panel brand & capacity is required"),
  panelQuantity: z.coerce.number().int().min(1, "Panel quantity must be at least 1"),
  inverterCompany: z.string().trim().min(1, "Inverter brand is required"),
  systemSizeKw: z.coerce.number().min(0).optional().nullable(),
  tokenAmount: z.coerce.number().min(0),
  preDispatchAmount: z.coerce.number().min(0),
  finalAmount: z.coerce.number().min(0),
  tokenReceived: z.boolean().optional().default(false),
  preDispatchReceived: z.boolean().optional().default(false),
  finalReceived: z.boolean().optional().default(false),
  structureLegCount: z.coerce
    .number()
    .int()
    .min(2, "Enter total legs between 2 and 24")
    .max(24, "Enter total legs between 2 and 24"),
  structureLegHeights: z.object({
    rows: z.array(z.array(z.coerce.number())).length(2),
  }),
  acceptedQuotationId: z.string().uuid().optional().nullable(),
  meterType: meterTypeEnum.optional().nullable(),
  meterOwnership: meterOwnershipEnum.optional().nullable(),
  paymentPlan: paymentPlanEnum.optional().nullable(),
});

const createLeadSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  phone: z
    .string()
    .trim()
    .min(1, "Phone is required")
    .transform((value) => {
      let digits = value.replace(/\D/g, "");
      if (digits.length === 12 && digits.startsWith("91")) digits = digits.slice(2);
      else if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
      return digits;
    })
    .refine((digits) => /^\d{10}$/.test(digits), {
      message: "Enter a valid 10-digit mobile number",
    }),
  email: z.string().email().optional().or(z.literal("")),
  city: z.string().optional(),
  address: z.string().optional(),
  requirement_notes: z.string().optional(),
  temperature: z.enum(["hot", "warm", "cold"]).optional(),
  source: sourceEnum,
  source_detail: z.string().optional(),
  assigned_to: z.string().uuid().optional(),
  assigned_telecaller_id: z.string().uuid().optional(),
  account_code: z.string().optional(),
});

async function canReassignLeads(profile: { id: string; role: string }): Promise<boolean> {
  if (profile.role === "admin" || profile.role === "sales_manager") return true;
  return hasAuthority(profile.id, "reassign_leads");
}

async function canAssignLeads(profile: { id: string; role: string }): Promise<boolean> {
  if (await canReassignLeads(profile)) return true;
  return hasAuthority(profile.id, "distribute_leads");
}

async function stageMoveOpts(profile: { id: string; role: string }) {
  const isManager = profile.role === "admin" || profile.role === "sales_manager";
  const canScheduleVisit =
    isManager || (await hasAuthority(profile.id, "schedule_site_visit"));
  const canConductSurvey =
    isManager || (await hasAuthority(profile.id, "conduct_survey"));
  // Quote stages advance via quotation actions, not pipeline drag
  return { canScheduleVisit, canConductSurvey, canCreateQuotations: false as const };
}

export async function createLead(
  formData: z.input<typeof createLeadSchema> | Record<string, unknown>
) {
  const profile = await requireAuthority("add_edit_leads");
  const parsedResult = createLeadSchema.safeParse(formData);
  if (!parsedResult.success) {
    const first = parsedResult.error.issues[0];
    throw new Error(first?.message ?? "Invalid lead details");
  }
  const parsed = parsedResult.data;
  const codeParsed = parseAccountCodeInput(parsed.account_code);
  if (!codeParsed.ok) throw new Error(codeParsed.error);
  const supabase = await createClient();

  let telecallerId = profile.id;
  const requested = parsed.assigned_telecaller_id ?? parsed.assigned_to ?? null;

  if (requested && requested !== profile.id) {
    if (!(await canAssignLeads(profile))) {
      throw new Error("You do not have permission to assign leads");
    }
    const { data: assignee } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", requested)
      .eq("company_id", profile.company_id)
      .eq("is_active", true)
      .maybeSingle();
    if (!assignee) throw new Error("Selected assignee was not found");
    telecallerId = assignee.id;
  } else if (requested) {
    telecallerId = requested;
  }

  const { data, error } = await supabase
    .from("leads")
    .insert({
      company_id: profile.company_id,
      name: parsed.name,
      phone: parsed.phone,
      email: parsed.email || null,
      city: parsed.city || null,
      address: parsed.address || null,
      requirement_notes: parsed.requirement_notes || null,
      temperature: parsed.temperature || "warm",
      source: parsed.source,
      source_detail: parsed.source_detail || null,
      account_code: codeParsed.code,
      assigned_telecaller_id: telecallerId,
      created_by: profile.id,
      ...(isDealerRole(profile) ? { dealer_id: profile.id } : {}),
    })
    .select()
    .single();

  if (error) {
    if (/account_code/i.test(error.message) && /column .* does not exist/i.test(error.message)) {
      throw new Error("Apply supabase/migrations/055_account_code.sql on this database.");
    }
    if (/dealer_id|column .* does not exist/i.test(error.message) && isDealerRole(profile)) {
      throw new Error(
        "Database is missing dealer columns. Run supabase/migrations/027_dealer_role.sql and 028_dealer_commissions.sql."
      );
    }
    throw new Error(accountCodeDbError(error.message) ?? error.message);
  }

  await logAuditEvent({
    companyId: profile.company_id,
    leadId: data.id,
    actorId: profile.id,
    eventType: "lead_created",
    entityType: "lead",
    entityId: data.id,
    metadata: { name: parsed.name, assignedTelecallerId: telecallerId },
  });

  revalidatePath("/");
  revalidatePath("/pipeline");
  return data;
}

export async function updateLead(
  leadId: string,
  updates: Partial<{
    name: string;
    phone: string;
    email: string | null;
    city: string | null;
    address: string | null;
    requirement_notes: string | null;
    temperature: LeadTemperature;
    source: LeadSource;
    alternate_phone: string | null;
    source_detail: string | null;
    roof_area_sqft: number | null;
    recommended_system_kw: number | null;
    meter_type: MeterType | null;
    meter_ownership: MeterOwnership | null;
    payment_plan: PaymentPlan | null;
    account_code: string | null;
  }>
) {
  const profile = await requireAuthority("add_edit_leads");
  const supabase = await createClient();

  const payload = { ...updates };
  if ("account_code" in updates) {
    const raw = updates.account_code;
    if (raw == null || String(raw).trim() === "") {
      delete payload.account_code;
    } else {
      const codeParsed = parseAccountCodeInput(raw);
      if (!codeParsed.ok) throw new Error(codeParsed.error);
      payload.account_code = codeParsed.code;
    }
  }

  const { data, error } = await supabase
    .from("leads")
    .update(payload)
    .eq("id", leadId)
    .eq("company_id", profile.company_id)
    .select()
    .single();

  if (error) {
    if (/account_code/i.test(error.message) && /column .* does not exist/i.test(error.message)) {
      throw new Error("Apply supabase/migrations/055_account_code.sql on this database.");
    }
    if (/meter_type|meter_ownership|payment_plan|column .* does not exist/i.test(error.message)) {
      throw new Error(
        "Database is missing profile columns. Run supabase/migrations/024_lead_profile_fields.sql in the Supabase SQL editor."
      );
    }
    throw new Error(accountCodeDbError(error.message) ?? error.message);
  }

  await logAuditEvent({
    companyId: profile.company_id,
    leadId,
    actorId: profile.id,
    eventType: "lead_updated",
    entityType: "lead",
    entityId: leadId,
    metadata: updates,
  });

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/pipeline");
  revalidatePath("/customers");
  revalidatePath("/");
  return data;
}

export async function getAssignmentOptions() {
  const profile = await requireAuth();
  const canAssign = await canAssignLeads(profile);
  if (!canAssign) {
    return {
      canAssign: false as const,
      employees: [] as Array<{ id: string; name: string }>,
      currentUserId: profile.id,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name")
    .eq("company_id", profile.company_id)
    .eq("is_active", true)
    .order("name");

  if (error) throw error;
  return {
    canAssign: true as const,
    employees: (data ?? []).map((e) => ({ id: e.id, name: e.name })),
    currentUserId: profile.id,
  };
}

/** Alias for forms that expect getLeadAssignmentOptions naming */
export async function getLeadAssignmentOptions() {
  return getAssignmentOptions();
}

export async function getLeadReassignmentOptions() {
  const profile = await requireAuth();
  const canReassign = await canReassignLeads(profile);
  if (!canReassign) {
    return {
      canReassign: false as const,
      telecallers: [] as Array<{ id: string; name: string }>,
      surveyors: [] as Array<{ id: string; name: string }>,
      employees: [] as Array<{ id: string; name: string }>,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, role")
    .eq("company_id", profile.company_id)
    .eq("is_active", true)
    .order("name");

  if (error) throw error;
  const employees = data ?? [];
  const telecallers = employees.filter(
    (e) =>
      e.role === "tele_caller" ||
      e.role === "sales_manager" ||
      e.role === "admin" ||
      e.role === "sales_executive"
  );
  const surveyors = employees.filter(
    (e) => e.role === "surveyor" || e.role === "sales_manager" || e.role === "admin"
  );

  return {
    canReassign: true as const,
    telecallers: telecallers.map((e) => ({ id: e.id, name: e.name })),
    surveyors: surveyors.map((e) => ({ id: e.id, name: e.name })),
    employees: employees.map((e) => ({ id: e.id, name: e.name })),
  };
}

/** Surveyors available when scheduling a site visit. */
export async function getSurveyorOptions() {
  const profile = await requireAuthority("schedule_site_visit");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, role")
    .eq("company_id", profile.company_id)
    .eq("is_active", true)
    .in("role", ["surveyor", "sales_manager", "admin"])
    .order("name");

  if (error) throw error;
  return (data ?? []).map((e) => ({ id: e.id, name: e.name, role: e.role as string }));
}

export async function reassignLead(
  leadId: string,
  input: {
    telecallerId?: string | null;
    surveyorId?: string | null;
    /** @deprecated use telecallerId */
    assigneeId?: string;
  }
) {
  const profile = await requireAuth();
  if (!(await canReassignLeads(profile))) {
    throw new Error("You do not have permission to reassign leads");
  }

  const supabase = await createClient();
  const telecallerId =
    input.telecallerId !== undefined ? input.telecallerId : input.assigneeId ?? undefined;
  const surveyorId = input.surveyorId;

  async function assertMember(id: string | null | undefined) {
    if (!id) return null;
    const { data, error } = await supabase
      .from("profiles")
      .select("id, name, role")
      .eq("id", id)
      .eq("company_id", profile.company_id)
      .eq("is_active", true)
      .maybeSingle();
    if (error || !data) throw new Error("Selected team member was not found");
    return data;
  }

  const telecaller = await assertMember(telecallerId ?? undefined);
  const surveyor = await assertMember(surveyorId ?? undefined);

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, assigned_telecaller_id, assigned_surveyor_id, assigned_to")
    .eq("id", leadId)
    .eq("company_id", profile.company_id)
    .single();

  if (leadError || !lead) throw new Error("Lead not found");

  const updates: Record<string, string | null> = {};
  if (telecallerId !== undefined) {
    updates.assigned_telecaller_id = telecallerId || null;
  }
  if (surveyorId !== undefined) {
    updates.assigned_surveyor_id = surveyorId || null;
  }
  if (!Object.keys(updates).length) {
    throw new Error("No assignment changes provided");
  }

  const { data, error } = await supabase
    .from("leads")
    .update(updates)
    .eq("id", leadId)
    .eq("company_id", profile.company_id)
    .select("id, assigned_telecaller_id, assigned_surveyor_id, assigned_to")
    .single();

  if (error) throw new Error(error.message);

  await logAuditEvent({
    companyId: profile.company_id,
    leadId,
    actorId: profile.id,
    eventType: "lead_reassigned",
    entityType: "lead",
    entityId: leadId,
    metadata: {
      fromTelecaller: lead.assigned_telecaller_id,
      fromSurveyor: lead.assigned_surveyor_id,
      toTelecaller: updates.assigned_telecaller_id ?? lead.assigned_telecaller_id,
      toSurveyor: updates.assigned_surveyor_id ?? lead.assigned_surveyor_id,
      telecallerName: telecaller?.name ?? null,
      surveyorName: surveyor?.name ?? null,
    },
  });

  revalidatePath(`/leads/${leadId}`);
  revalidatePath("/pipeline");
  return data;
}

export async function moveSalesStage(leadId: string, nextStage: SalesStage) {
  const profile = await requireAuthority("move_lead_stage");
  const supabase = await createClient();

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, sales_stage, survey_date, visit_scheduled_at, company_id")
    .eq("id", leadId)
    .eq("company_id", profile.company_id)
    .single();

  if (leadError || !lead) throw new Error("Lead not found");

  const isManagerRole = profile.role === "admin" || profile.role === "sales_manager";
  const allowBackward =
    isManagerRole || (await hasAuthority(profile.id, "reassign_leads"));
  const opts = await stageMoveOpts(profile);

  // visit_scheduled always goes through bookSurvey (surveyor + datetime)
  if (nextStage === "visit_scheduled") {
    throw new Error("Use Schedule site visit to assign a surveyor and set the appointment");
  }

  // survey_completed requires the digital survey form
  if (nextStage === "survey_completed") {
    throw new Error("Complete the digital survey form to mark survey completed");
  }

  if (nextStage === "quoted" || nextStage === "quote_accepted") {
    throw new Error("Use the quotation builder to quote or accept a quotation");
  }

  if (
    nextStage === "token_pending_verification" ||
    nextStage === "token_verified_and_feasibility_ok" ||
    nextStage === "pre_dispatch_pending_verification" ||
    nextStage === "pre_dispatch_verified" ||
    nextStage === "installation_assigned" ||
    nextStage === "installation_in_progress" ||
    nextStage === "installation_completed" ||
    nextStage === "final_pending_verification" ||
    nextStage === "final_verified" ||
    nextStage === "liaison_in_progress" ||
    nextStage === "meter_installed" ||
    nextStage === "subsidy_pending" ||
    nextStage === "subsidy_received_pending_accounts" ||
    nextStage === "completed"
  ) {
    throw new Error(
      "Use Payments / Feasibility / Installation / Liaison or Customer Portal to advance these stages"
    );
  }

  const moveCheck = canMoveSalesStage(lead.sales_stage, nextStage, allowBackward, opts);
  if (!moveCheck.allowed) {
    throw new Error(moveCheck.reason ?? "Invalid stage transition");
  }

  const updates: Record<string, unknown> = {
    sales_stage: nextStage,
  };

  const { data, error } = await supabase
    .from("leads")
    .update(updates)
    .eq("id", leadId)
    .eq("company_id", profile.company_id)
    .select("id, sales_stage, survey_date, visit_scheduled_at")
    .single();

  if (error) throw new Error(error.message);

  if (lead.sales_stage === "visit_scheduled") {
    await supabase
      .from("reminders")
      .update({ resolved_at: new Date().toISOString() })
      .eq("lead_id", leadId)
      .eq("company_id", profile.company_id)
      .eq("reminder_type", "survey_scheduled")
      .is("resolved_at", null);
  }

  await logAuditEvent({
    companyId: profile.company_id,
    leadId,
    actorId: profile.id,
    eventType: "stage_change",
    entityType: "lead",
    entityId: leadId,
    metadata: { from: lead.sales_stage, to: nextStage },
  });

  revalidatePath("/pipeline");
  revalidatePath("/alerts");
  revalidatePath("/reminders");
  revalidatePath(`/leads/${leadId}`);
  return data;
}

/** Load survey + docs + quote hints for the Won closing modal. */
export async function getWonGateContext(leadId: string) {
  const profile = await requireAuth();
  const supabase = await createClient();

  let lead: {
    id: string;
    name: string;
    phone: string;
    sales_stage: string;
    meter_type?: string | null;
    meter_ownership?: string | null;
    payment_plan?: string | null;
    won_panel_name?: string | null;
    won_panel_quantity?: number | null;
    won_inverter_company?: string | null;
    won_system_size_kw?: number | null;
    won_token_amount?: number | null;
    won_pre_dispatch_amount?: number | null;
    won_final_amount?: number | null;
    recommended_system_kw?: number | null;
    structure_leg_count?: number | null;
    structure_leg_heights?: { rows: number[][] } | null;
  } | null = null;

  {
    const full = await supabase
      .from("leads")
      .select(
        "id, name, phone, sales_stage, meter_type, meter_ownership, payment_plan, won_panel_name, won_panel_quantity, won_inverter_company, won_system_size_kw, won_token_amount, won_pre_dispatch_amount, won_final_amount, recommended_system_kw, structure_leg_count, structure_leg_heights"
      )
      .eq("id", leadId)
      .eq("company_id", profile.company_id)
      .single();

    if (full.error && /meter_type|meter_ownership|payment_plan|structure_leg|column .* does not exist/i.test(full.error.message)) {
      const fallback = await supabase
        .from("leads")
        .select(
          "id, name, phone, sales_stage, won_panel_name, won_panel_quantity, won_inverter_company, won_system_size_kw, won_token_amount, won_pre_dispatch_amount, won_final_amount, recommended_system_kw"
        )
        .eq("id", leadId)
        .eq("company_id", profile.company_id)
        .single();
      if (fallback.error || !fallback.data) throw new Error("Lead not found");
      lead = fallback.data;
    } else if (full.error || !full.data) {
      throw new Error("Lead not found");
    } else {
      lead = full.data;
    }
  }

  const quotesQuery = supabase
    .from("quotations")
    .select(
      "id, quotation_no, status, grand_total, system_size_kw, panel_count, module_company_name, module_type_name, module_capacity_label, quote_date, updated_at"
    )
    .eq("company_id", profile.company_id)
    .order("updated_at", { ascending: false })
    .limit(12);

  const [{ data: survey }, { data: docs }, { data: quotes }] = await Promise.all([
    supabase
      .from("surveys")
      .select("capacity_kw, notes")
      .eq("lead_id", leadId)
      .eq("company_id", profile.company_id)
      .maybeSingle(),
    supabase
      .from("portal_documents")
      .select("id, doc_type, title, file_url, created_at")
      .eq("lead_id", leadId)
      .eq("company_id", profile.company_id)
      .order("created_at", { ascending: false }),
    lead.phone
      ? quotesQuery.or(`lead_id.eq.${leadId},customer_phone.eq.${lead.phone}`)
      : quotesQuery.eq("lead_id", leadId),
  ]);

  const docTypes = [...new Set((docs ?? []).map((d) => d.doc_type))];
  const quotations = (quotes ?? []).map((q) => ({
    id: q.id,
    quotation_no: q.quotation_no,
    status: q.status,
    grand_total: q.grand_total != null ? Number(q.grand_total) : null,
    system_size_kw: q.system_size_kw != null ? Number(q.system_size_kw) : null,
    panel_count: q.panel_count != null ? Number(q.panel_count) : null,
    module_company_name: q.module_company_name,
    module_type_name: q.module_type_name,
    module_capacity_label: q.module_capacity_label,
    quote_date: q.quote_date ?? null,
  }));

  const preferredQuote =
    quotations.find((q) => q.status === "accepted") ??
    quotations.find((q) => q.status === "sent") ??
    quotations[0] ??
    null;

  const panelFromQuote = preferredQuote
    ? [preferredQuote.module_company_name, preferredQuote.module_type_name, preferredQuote.module_capacity_label]
        .filter(Boolean)
        .join(" ")
        .trim()
    : "";

  const defaults = {
    panelName: lead.won_panel_name || panelFromQuote || "",
    panelQuantity: lead.won_panel_quantity || preferredQuote?.panel_count || 1,
    inverterCompany: lead.won_inverter_company || "",
    systemSizeKw:
      Number(lead.won_system_size_kw) ||
      Number(preferredQuote?.system_size_kw) ||
      Number(survey?.capacity_kw) ||
      Number(lead.recommended_system_kw) ||
      0,
    tokenAmount: Number(lead.won_token_amount) || 0,
    preDispatchAmount: Number(lead.won_pre_dispatch_amount) || 0,
    finalAmount:
      Number(lead.won_final_amount) ||
      (preferredQuote?.grand_total != null ? Number(preferredQuote.grand_total) : 0),
    acceptedQuotationId: preferredQuote?.status === "accepted" ? preferredQuote.id : preferredQuote?.id ?? null,
    meterType: parseMeterType(lead.meter_type) ?? null,
    meterOwnership: parseMeterOwnership(lead.meter_ownership) ?? null,
    paymentPlan: parsePaymentPlan(lead.payment_plan) ?? null,
    structureLegCount: lead.structure_leg_count || DEFAULT_STRUCTURE_LEGS,
    structureLegHeights: parseStructureLegHeights(lead.structure_leg_heights) ?? {
      rows: emptyLegHeights(lead.structure_leg_count || DEFAULT_STRUCTURE_LEGS),
    },
    tokenReceived: false,
    preDispatchReceived: false,
    finalReceived: false,
  };

  const gate = checkWonClosingGate(defaults, docTypes);

  return {
    lead: {
      id: lead.id,
      name: lead.name,
      sales_stage: lead.sales_stage,
      meter_type: lead.meter_type ?? null,
      meter_ownership: lead.meter_ownership ?? null,
      payment_plan: lead.payment_plan ?? null,
    },
    defaults,
    documents: docs ?? [],
    docTypes,
    quotations,
    latestQuote: preferredQuote,
    surveyCapacityKw: survey?.capacity_kw != null ? Number(survey.capacity_kw) : null,
    gate,
  };
}

async function insertWonReceivedPayments(input: {
  companyId: string;
  leadId: string;
  actorId: string;
  quotationId: string | null;
  tokenAmount: number;
  preDispatchAmount: number;
  finalAmount: number;
  tokenReceived?: boolean;
  preDispatchReceived?: boolean;
  finalReceived?: boolean;
}): Promise<Array<"token" | "pre_dispatch" | "final">> {
  const milestones: Array<{
    key: "token" | "pre_dispatch" | "final";
    received: boolean;
    amount: number;
  }> = [
    { key: "token", received: Boolean(input.tokenReceived), amount: input.tokenAmount },
    {
      key: "pre_dispatch",
      received: Boolean(input.preDispatchReceived),
      amount: input.preDispatchAmount,
    },
    { key: "final", received: Boolean(input.finalReceived), amount: input.finalAmount },
  ];
  const created: Array<"token" | "pre_dispatch" | "final"> = [];
  const supabase = await createClient();
  const paidAt = new Date().toISOString().slice(0, 10);

  const incoming = milestones
    .filter((row) => row.received)
    .reduce((sum, row) => sum + row.amount, 0);
  if (incoming > 0) {
    let projectTotal: number | null = null;
    if (input.quotationId) {
      const { data: quote } = await supabase
        .from("quotations")
        .select("grand_total")
        .eq("id", input.quotationId)
        .eq("company_id", input.companyId)
        .maybeSingle();
      if (quote?.grand_total != null) projectTotal = Number(quote.grand_total);
    }
    if (projectTotal == null || !(projectTotal > 0)) {
      const wonPlan = input.tokenAmount + input.preDispatchAmount + input.finalAmount;
      if (wonPlan > 0) projectTotal = wonPlan;
    }
    const { data: existingPays } = await supabase
      .from("payments")
      .select("amount, verification_status, milestone")
      .eq("lead_id", input.leadId);
    const existingTotal = (existingPays ?? [])
      .filter((p) => p.verification_status !== "rejected")
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const replacing = (existingPays ?? [])
      .filter(
        (p) =>
          p.verification_status !== "rejected" &&
          milestones.some((m) => m.received && m.key === p.milestone)
      )
      .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
    const cap = assertPaymentWithinQuoteCap({
      projectTotal,
      existingNonRejectedTotal: existingTotal,
      newAmount: incoming,
      replacingAmount: replacing,
    });
    if (!cap.ok) throw new Error(cap.message);
  }

  for (const row of milestones) {
    if (!row.received) continue;
    if (!(row.amount > 0)) {
      throw new Error(`Received requires a ${row.key.replace("_", " ")} amount greater than 0`);
    }

    const payload = {
      company_id: input.companyId,
      lead_id: input.leadId,
      quotation_id: input.quotationId,
      milestone: row.key,
      amount: row.amount,
      method: "other",
      transaction_id: "WON-RECEIVED",
      paid_at: paidAt,
      notes: "Marked received when moving to Won",
      verification_status: "pending" as const,
      recorded_by: input.actorId,
      verified_by: null,
      verified_at: null,
      rejection_reason: null,
      bank_reference: null,
    };

    const { data: existing } = await supabase
      .from("payments")
      .select("id, verification_status")
      .eq("lead_id", input.leadId)
      .eq("milestone", row.key)
      .maybeSingle();

    if (existing?.verification_status === "verified") {
      throw new Error(`A verified ${row.key.replace("_", " ")} payment already exists`);
    }

    const { error } = existing
      ? await supabase.from("payments").update(payload).eq("id", existing.id)
      : await supabase.from("payments").insert(payload);

    if (error) throw new Error(error.message);
    created.push(row.key);
    await logAuditEvent({
      companyId: input.companyId,
      leadId: input.leadId,
      actorId: input.actorId,
      eventType: "payment_recorded",
      entityType: "payment",
      entityId: input.leadId,
      metadata: { milestone: row.key, amount: row.amount, via: "won_received" },
    });
  }

  return created;
}

/**
 * Survey Done (or Quoted) → Won. Requires WonClosingPayload + mandatory docs + profile fields.
 * Calling without a complete payload is rejected (Phase 0 / 5a hard gate).
 */
export async function markLeadWon(leadId: string, payload?: WonClosingPayload) {
  const profile = await requireAuthority("move_lead_stage");
  const supabase = await createClient();

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, sales_stage, portal_code, company_id")
    .eq("id", leadId)
    .eq("company_id", profile.company_id)
    .single();

  if (leadError || !lead) throw new Error("Lead not found");
  if (lead.sales_stage === "lost") {
    throw new Error("Lost leads cannot be marked Won");
  }
  if (lead.sales_stage !== "survey_completed" && lead.sales_stage !== "quoted") {
    throw new Error(
      isCustomerSalesStage(lead.sales_stage)
        ? "This lead is already a customer"
        : "Complete the survey before marking Won"
    );
  }

  const parsed = wonClosingSchema.safeParse(payload);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ??
        "Complete system technical details and payment breakdown before marking Won"
    );
  }

  const { data: docs, error: docsError } = await supabase
    .from("portal_documents")
    .select("doc_type")
    .eq("lead_id", leadId)
    .eq("company_id", profile.company_id);

  if (docsError) throw new Error(docsError.message);

  const gate = checkWonClosingGate(
    parsed.data,
    (docs ?? []).map((d) => d.doc_type)
  );
  if (!gate.passed) {
    throw new Error(gate.blockedReasons.join(". "));
  }

  if (parsed.data.acceptedQuotationId) {
    const { data: quote, error: quoteError } = await supabase
      .from("quotations")
      .select("id, lead_id, status, company_id")
      .eq("id", parsed.data.acceptedQuotationId)
      .eq("company_id", profile.company_id)
      .maybeSingle();
    if (quoteError) throw new Error(quoteError.message);
    if (!quote) throw new Error("Selected quotation was not found");
    if (quote.lead_id && quote.lead_id !== leadId) {
      throw new Error("Selected quotation belongs to a different lead");
    }
  }

  const portalCode = FRS_ISSUE_PORTAL_CODES
    ? lead.portal_code || (await issuePortalCode(supabase))
    : lead.portal_code;
  const now = new Date().toISOString();
  const systemSize =
    parsed.data.systemSizeKw != null && Number(parsed.data.systemSizeKw) > 0
      ? Number(parsed.data.systemSizeKw)
      : null;
  const updates: Record<string, unknown> = {
    sales_stage: "quote_accepted",
    won_panel_name: parsed.data.panelName.trim(),
    won_panel_quantity: parsed.data.panelQuantity,
    won_inverter_company: parsed.data.inverterCompany.trim(),
    won_system_size_kw: systemSize,
    won_token_amount: parsed.data.tokenAmount,
    won_pre_dispatch_amount: parsed.data.preDispatchAmount,
    won_final_amount: parsed.data.finalAmount,
    won_closed_at: now,
    expected_panel_count: parsed.data.panelQuantity,
    accepted_quotation_id: parsed.data.acceptedQuotationId ?? null,
    structure_leg_count: parsed.data.structureLegCount,
    structure_leg_heights: parsed.data.structureLegHeights,
  };
  if (parsed.data.meterType) updates.meter_type = parsed.data.meterType;
  if (parsed.data.meterOwnership) updates.meter_ownership = parsed.data.meterOwnership;
  if (parsed.data.paymentPlan) updates.payment_plan = parsed.data.paymentPlan;
  if (FRS_ISSUE_PORTAL_CODES && !lead.portal_code && portalCode) {
    updates.portal_code = portalCode;
  }

  const { data, error } = await supabase
    .from("leads")
    .update(updates)
    .eq("id", leadId)
    .eq("company_id", profile.company_id)
    .select("id, sales_stage, portal_code")
    .single();

  if (error) {
    if (/structure_leg_count|structure_leg_heights/i.test(error.message)) {
      throw new Error(
        "Database is missing structure-leg columns. Run supabase/migrations/047_won_structure_legs.sql in the Supabase SQL editor."
      );
    }
    if (/won_panel_name|won_closed_at|column .* does not exist/i.test(error.message)) {
      throw new Error(
        "Database is missing Won gate columns. Run supabase/migrations/022_won_closing_gate.sql in the Supabase SQL editor."
      );
    }
    if (/meter_type|meter_ownership|payment_plan|column .* does not exist/i.test(error.message)) {
      throw new Error(
        "Database is missing profile columns. Run supabase/migrations/024_lead_profile_fields.sql in the Supabase SQL editor."
      );
    }
    throw new Error(error.message);
  }

  if (parsed.data.acceptedQuotationId) {
    await supabase
      .from("quotations")
      .update({ status: "accepted", updated_by: profile.id })
      .eq("id", parsed.data.acceptedQuotationId)
      .eq("company_id", profile.company_id)
      .neq("status", "accepted");
  }

  await logAuditEvent({
    companyId: profile.company_id,
    leadId,
    actorId: profile.id,
    eventType: "stage_change",
    entityType: "lead",
    entityId: leadId,
    metadata: {
      from: lead.sales_stage,
      to: "quote_accepted",
      portalCode,
      via: "move_to_won",
      systemSizeKw: systemSize,
      acceptedQuotationId: parsed.data.acceptedQuotationId ?? null,
      paymentTotal:
        parsed.data.tokenAmount + parsed.data.preDispatchAmount + parsed.data.finalAmount,
      structureLegCount: parsed.data.structureLegCount,
      received: {
        token: parsed.data.tokenReceived,
        preDispatch: parsed.data.preDispatchReceived,
        final: parsed.data.finalReceived,
      },
    },
  });

  const receivedPayments = await insertWonReceivedPayments({
    companyId: profile.company_id,
    leadId,
    actorId: profile.id,
    quotationId: parsed.data.acceptedQuotationId ?? null,
    tokenAmount: parsed.data.tokenAmount,
    preDispatchAmount: parsed.data.preDispatchAmount,
    finalAmount: parsed.data.finalAmount,
    tokenReceived: parsed.data.tokenReceived,
    preDispatchReceived: parsed.data.preDispatchReceived,
    finalReceived: parsed.data.finalReceived,
  });

  if (receivedPayments.includes("token")) {
    await supabase
      .from("leads")
      .update({ sales_stage: "token_pending_verification", token_verified: false })
      .eq("id", leadId)
      .eq("company_id", profile.company_id);
    await logAuditEvent({
      companyId: profile.company_id,
      leadId,
      actorId: profile.id,
      eventType: "stage_change",
      entityType: "lead",
      entityId: leadId,
      metadata: {
        from: "quote_accepted",
        to: "token_pending_verification",
        via: "won_received_token",
      },
    });
  }

  revalidatePath("/");
  revalidatePath("/pipeline");
  revalidatePath("/customers");
  revalidatePath("/payments");
  revalidatePath("/portal");
  revalidatePath(`/leads/${leadId}`);
  return data;
}

/** Book a site visit — requires surveyor assignment + datetime. */
export async function bookSurvey(input: {
  leadId: string;
  surveyDate: string;
  surveyTime: string;
  surveyorId: string;
  notes?: string;
}) {
  const profile = await requireAuthority("schedule_site_visit");
  const supabase = await createClient();

  if (profile.role === "surveyor") {
    throw new Error("Surveyors cannot schedule visits — ask a tele-caller or manager");
  }

  const date = input.surveyDate.trim();
  const time = input.surveyTime.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error("Choose a valid visit date");
  }
  if (!/^\d{2}:\d{2}$/.test(time)) {
    throw new Error("Choose a valid visit time");
  }
  if (!input.surveyorId) {
    throw new Error("Select a field surveyor for this visit");
  }

  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const dueLocal = new Date(y, m - 1, d, hh, mm, 0, 0);
  if (Number.isNaN(dueLocal.getTime())) {
    throw new Error("Invalid visit date or time");
  }

  const { data: surveyor, error: surveyorError } = await supabase
    .from("profiles")
    .select("id, name, role")
    .eq("id", input.surveyorId)
    .eq("company_id", profile.company_id)
    .eq("is_active", true)
    .maybeSingle();

  if (surveyorError || !surveyor) {
    throw new Error("Selected surveyor was not found");
  }

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, sales_stage, company_id, name, assigned_telecaller_id, assigned_to")
    .eq("id", input.leadId)
    .eq("company_id", profile.company_id)
    .single();

  if (leadError || !lead) throw new Error("Lead not found");

  const isManagerRole = profile.role === "admin" || profile.role === "sales_manager";
  const allowBackward =
    isManagerRole || (await hasAuthority(profile.id, "reassign_leads"));
  const opts = await stageMoveOpts(profile);

  if (lead.sales_stage !== "visit_scheduled") {
    const moveCheck = canMoveSalesStage(
      lead.sales_stage,
      "visit_scheduled",
      allowBackward,
      opts
    );
    if (!moveCheck.allowed) {
      throw new Error(moveCheck.reason ?? "Cannot schedule visit from this stage");
    }
  }

  const dueAt = dueLocal.toISOString();
  const timeLabel = dueLocal.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const notes = input.notes?.trim();
  const message = notes
    ? `Site visit with ${surveyor.name} on ${timeLabel} — ${notes}`
    : `Site visit with ${surveyor.name} on ${timeLabel}`;

  const telecallerId =
    lead.assigned_telecaller_id ??
    (profile.role === "tele_caller" ? profile.id : lead.assigned_to);

  const { data, error } = await supabase
    .from("leads")
    .update({
      sales_stage: "visit_scheduled",
      survey_date: date,
      visit_scheduled_at: dueAt,
      visit_notes: notes || null,
      assigned_surveyor_id: surveyor.id,
      assigned_telecaller_id: telecallerId,
    })
    .eq("id", input.leadId)
    .eq("company_id", profile.company_id)
    .select(
      "id, sales_stage, survey_date, visit_scheduled_at, assigned_surveyor_id, assigned_telecaller_id"
    )
    .single();

  if (error) throw new Error(error.message);

  await supabase
    .from("reminders")
    .update({ resolved_at: new Date().toISOString() })
    .eq("lead_id", input.leadId)
    .eq("company_id", profile.company_id)
    .eq("reminder_type", "survey_scheduled")
    .is("resolved_at", null);

  const { error: reminderError } = await supabase.from("reminders").insert({
    company_id: profile.company_id,
    lead_id: input.leadId,
    reminder_type: "survey_scheduled",
    message,
    due_at: dueAt,
  });

  if (reminderError) throw new Error(reminderError.message);

  if (lead.sales_stage !== "visit_scheduled") {
    await logAuditEvent({
      companyId: profile.company_id,
      leadId: input.leadId,
      actorId: profile.id,
      eventType: "stage_change",
      entityType: "lead",
      entityId: input.leadId,
      metadata: { from: lead.sales_stage, to: "visit_scheduled" },
    });
  }

  await logAuditEvent({
    companyId: profile.company_id,
    leadId: input.leadId,
    actorId: profile.id,
    eventType: "survey_scheduled",
    entityType: "lead",
    entityId: input.leadId,
    metadata: {
      surveyDate: date,
      surveyTime: time,
      dueAt,
      notes: notes || null,
      surveyorId: surveyor.id,
      surveyorName: surveyor.name,
    },
  });

  revalidatePath("/pipeline");
  revalidatePath("/alerts");
  revalidatePath("/reminders");
  revalidatePath(`/leads/${input.leadId}`);
  return data;
}

export async function markLeadLost(leadId: string, reason: string, notes?: string) {
  const profile = await requireAuthority("move_lead_stage");
  const supabase = await createClient();

  const { data: lead } = await supabase
    .from("leads")
    .select("sales_stage")
    .eq("id", leadId)
    .eq("company_id", profile.company_id)
    .single();

  if (!lead || lead.sales_stage === "lost") {
    throw new Error("Cannot mark as lost");
  }

  const { data, error } = await supabase
    .from("leads")
    .update({
      sales_stage: "lost",
      loss_reason: reason,
      loss_notes: notes || null,
    })
    .eq("id", leadId)
    .eq("company_id", profile.company_id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  await logAuditEvent({
    companyId: profile.company_id,
    leadId,
    actorId: profile.id,
    eventType: "lead_lost",
    metadata: { reason, notes },
  });

  revalidatePath("/");
  revalidatePath("/pipeline");
  return data;
}

export async function reopenLead(leadId: string) {
  const profile = await requireAuthority("reopen_lost_leads");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("leads")
    .update({
      sales_stage: "new_lead",
      loss_reason: null,
      loss_notes: null,
    })
    .eq("id", leadId)
    .eq("sales_stage", "lost")
    .eq("company_id", profile.company_id)
    .select()
    .single();

  if (error) throw new Error(error.message);

  await logAuditEvent({
    companyId: profile.company_id,
    leadId,
    actorId: profile.id,
    eventType: "lead_reopened",
  });

  revalidatePath("/");
  revalidatePath("/pipeline");
  return data;
}

export async function deleteLead(leadId: string) {
  const profile = await requireAuth();
  const isOwner =
    profile.role === "admin" || (await hasAuthority(profile.id, "full_access"));
  if (!isOwner) {
    throw new Error("Only the Owner can delete leads");
  }

  const supabase = await createClient();

  const { data: lead, error: fetchError } = await supabase
    .from("leads")
    .select("id, name, company_id, sales_stage")
    .eq("id", leadId)
    .eq("company_id", profile.company_id)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);
  if (!lead) throw new Error("Lead not found");

  await logAuditEvent({
    companyId: profile.company_id,
    leadId,
    actorId: profile.id,
    eventType: "lead_deleted",
    metadata: { name: lead.name, sales_stage: lead.sales_stage },
  });

  const { error } = await supabase
    .from("leads")
    .delete()
    .eq("id", leadId)
    .eq("company_id", profile.company_id);

  if (error) throw new Error(error.message);

  revalidatePath("/");
  revalidatePath("/pipeline");
  revalidatePath("/customers");
}

export async function listLeads(filters?: {
  sales_stage?: string;
  assigned_to?: string;
  assigned_telecaller_id?: string;
  assigned_surveyor_id?: string;
  temperature?: LeadTemperature;
  status?: "active" | "lost" | "all";
  /** Pipeline queue filter */
  queue?: "all" | "tele_call" | "site_visits";
}) {
  const profile = await requireAuth();
  const supabase = await createClient();
  const canSeeAll = await canSeeAllLeads(profile);

  let query = supabase
    .from("leads")
    .select(
      `id, name, account_code, phone, sales_stage, temperature, city, address, loss_reason, requirement_notes,
       created_at, source, last_call_at, next_followup_at, next_followup_action, visit_scheduled_at, visit_notes, survey_date, portal_code,
       last_outward_on, last_inward_on, outward_qty_30d, outward_conversions, outward_earnings_inr,
       assigned_to, assigned_telecaller_id, assigned_surveyor_id,
       assigned_profile:profiles!leads_assigned_to_fkey(id, name),
       telecaller_profile:profiles!leads_assigned_telecaller_id_fkey(id, name),
       surveyor_profile:profiles!leads_assigned_surveyor_id_fkey(id, name)`
    )
    .eq("company_id", profile.company_id)
    .order("updated_at", { ascending: false });

  if (filters?.sales_stage) query = query.eq("sales_stage", filters.sales_stage);
  if (filters?.assigned_to) query = query.eq("assigned_to", filters.assigned_to);
  if (filters?.assigned_telecaller_id) {
    query = query.eq("assigned_telecaller_id", filters.assigned_telecaller_id);
  }
  if (filters?.assigned_surveyor_id) {
    query = query.eq("assigned_surveyor_id", filters.assigned_surveyor_id);
  }
  if (filters?.temperature) query = query.eq("temperature", filters.temperature);

  if (filters?.status === "lost") {
    query = query.eq("sales_stage", "lost");
  } else if (filters?.status === "active" || !filters?.status) {
    if (!filters?.sales_stage) {
      query = query.neq("sales_stage", "lost");
    }
  }

  const queue = filters?.queue ?? "all";
  if (queue === "tele_call") {
    query = query.eq("assigned_telecaller_id", profile.id);
  } else if (queue === "site_visits") {
    query = query.eq("assigned_surveyor_id", profile.id);
  } else if (!canSeeAll && !filters?.assigned_to) {
    query = query.or(ownLeadOrFilter(profile.id));
  }

  const { data, error } = await query;
  if (error) {
    if (/account_code/i.test(error.message)) {
      throw new Error("Apply supabase/migrations/055_account_code.sql on this database.");
    }
    if (/last_outward_on|last_inward_on|outward_qty_30d/i.test(error.message)) {
      throw new Error("Apply supabase/migrations/058_trade_score.sql on this database.");
    }
    if (/outward_conversions|outward_earnings_inr/i.test(error.message)) {
      throw new Error("Apply supabase/migrations/060_discovery_lock.sql on this database.");
    }
    throw error;
  }
  return (data ?? []).map((row) => {
    const assigned = row.assigned_profile;
    const tele = row.telecaller_profile;
    const surv = row.surveyor_profile;
    return {
      ...row,
      assigned_profile: Array.isArray(assigned) ? (assigned[0] ?? null) : assigned,
      telecaller_profile: Array.isArray(tele) ? (tele[0] ?? null) : tele,
      surveyor_profile: Array.isArray(surv) ? (surv[0] ?? null) : surv,
    };
  });
}

/** Won and post-sale leads shown in the staff Customers workspace (Quoted stays on Leads). */
export async function getCustomers() {
  const leads = await listLeads({ status: "all", queue: "all" });
  return leads.filter((lead) =>
    CUSTOMER_SALES_STAGES.includes(lead.sales_stage as SalesStage)
  );
}

export async function getLead(leadId: string): Promise<LeadWithRelations> {
  const profile = await requireAuth();
  const supabase = await createClient();
  const canSeeAll = await canSeeAllLeads(profile);

  let query = supabase
    .from("leads")
    .select(
      `
      *,
      assigned_profile:profiles!leads_assigned_to_fkey(id, name, phone),
      telecaller_profile:profiles!leads_assigned_telecaller_id_fkey(id, name, phone, role),
      surveyor_profile:profiles!leads_assigned_surveyor_id_fkey(id, name, phone, role),
      survey:surveys(*)
    `
    )
    .eq("id", leadId)
    .eq("company_id", profile.company_id);

  if (!canSeeAll) {
    query = query.or(ownLeadOrFilter(profile.id));
  }

  const { data, error } = await query.single();
  if (error) throw new Error(error.message || "Lead not found");

  const assigned = data.assigned_profile;
  const tele = data.telecaller_profile;
  const surv = data.surveyor_profile;
  const surveyRel = data.survey;
  const survey = Array.isArray(surveyRel) ? (surveyRel[0] ?? null) : surveyRel;
  return {
    ...data,
    assigned_profile: Array.isArray(assigned) ? (assigned[0] ?? null) : assigned,
    telecaller_profile: Array.isArray(tele) ? (tele[0] ?? null) : tele,
    surveyor_profile: Array.isArray(surv) ? (surv[0] ?? null) : surv,
    survey,
  } as LeadWithRelations;
}
