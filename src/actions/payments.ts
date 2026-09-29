"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireAuth, hasAuthority } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import {
  PAYMENT_MILESTONES,
  PAYMENT_METHODS,
  type PaymentMilestone,
  type PaymentRow,
} from "@/lib/domain/payments";
import { assertPaymentWithinQuoteCap } from "@/lib/domain/payment-balance";
import { isWonOrLaterStage } from "@/lib/domain/workflow";

const recordSchema = z.object({
  leadId: z.string().uuid(),
  milestone: z.enum(PAYMENT_MILESTONES),
  amount: z.number().positive(),
  method: z.enum(PAYMENT_METHODS),
  transactionId: z.string().min(2),
  paidAt: z.string().min(4),
  notes: z.string().optional().nullable(),
  quotationId: z.string().uuid().optional().nullable(),
});

async function canRecord(profile: { id: string; role: string }) {
  return (
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    profile.role === "sales_executive" ||
    profile.role === "accounts" ||
    (await hasAuthority(profile.id, "record_payment")) ||
    (await hasAuthority(profile.id, "full_access"))
  );
}

async function canVerify(profile: { id: string; role: string }) {
  return (
    profile.role === "admin" ||
    profile.role === "accounts" ||
    (await hasAuthority(profile.id, "verify_payment")) ||
    (await hasAuthority(profile.id, "full_access"))
  );
}

async function maybeAdvanceTokenGates(
  companyId: string,
  leadId: string,
  actorId: string
) {
  const supabase = await createClient();
  const { data: lead } = await supabase
    .from("leads")
    .select("id, sales_stage, token_verified, feasibility_approved")
    .eq("id", leadId)
    .single();

  if (!lead) return;
  if (lead.sales_stage !== "token_pending_verification") return;
  if (!lead.token_verified || !lead.feasibility_approved) return;

  await supabase
    .from("leads")
    .update({ sales_stage: "token_verified_and_feasibility_ok" })
    .eq("id", leadId);

  await logAuditEvent({
    companyId,
    leadId,
    actorId,
    eventType: "stage_change",
    entityType: "lead",
    entityId: leadId,
    metadata: {
      from: "token_pending_verification",
      to: "token_verified_and_feasibility_ok",
      reason: "token_verified_and_feasibility_approved",
    },
  });
}

export async function listPaymentsForLead(leadId: string): Promise<PaymentRow[]> {
  await requireAuth();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("payments")
    .select("*")
    .eq("lead_id", leadId)
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as PaymentRow[];
}

/** Grand total for a lead's accepted quotation (staff payment balance). */
export async function getLeadQuoteGrandTotal(leadId: string): Promise<number | null> {
  await requireAuth();
  const supabase = await createClient();
  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("accepted_quotation_id, company_id")
    .eq("id", leadId)
    .maybeSingle();
  if (leadError) throw new Error(leadError.message);
  if (!lead?.accepted_quotation_id) return null;

  const { data: quote, error } = await supabase
    .from("quotations")
    .select("grand_total")
    .eq("id", lead.accepted_quotation_id)
    .eq("company_id", lead.company_id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return quote?.grand_total != null ? Number(quote.grand_total) : null;
}

export async function listPaymentQueue(filter: "pending" | "all" = "pending") {
  const profile = await requireAuth();
  const can =
    (await canVerify(profile)) ||
    (await canRecord(profile)) ||
    (await hasAuthority(profile.id, "view_payment_queues"));
  if (!can) throw new Error("Missing authority: view_payment_queues");

  const supabase = await createClient();
  let q = supabase
    .from("payments")
    .select(
      "*, lead:leads!payments_lead_id_fkey(id, name, phone, city, sales_stage, token_verified, feasibility_approved)"
    )
    .eq("company_id", profile.company_id)
    .order("created_at", { ascending: false });

  if (filter === "pending") {
    q = q.eq("verification_status", "pending");
  }

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function recordPayment(input: z.infer<typeof recordSchema>) {
  const profile = await requireAuth();
  if (!(await canRecord(profile))) throw new Error("Missing authority: record_payment");

  const parsed = recordSchema.parse(input);
  const supabase = await createClient();

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select(
      "id, sales_stage, company_id, accepted_quotation_id, token_verified, feasibility_approved, won_token_amount, won_pre_dispatch_amount, won_final_amount"
    )
    .eq("id", parsed.leadId)
    .eq("company_id", profile.company_id)
    .single();

  if (leadError || !lead) throw new Error("Lead not found");

  const stage = lead.sales_stage as string;
  const milestone = parsed.milestone as PaymentMilestone;

  if (milestone === "token") {
    if (stage !== "quote_accepted" && stage !== "token_pending_verification") {
      throw new Error("Token payment requires an accepted quotation");
    }
  } else if (milestone === "pre_dispatch") {
    if (!isWonOrLaterStage(stage)) {
      throw new Error("Pre-dispatch can be recorded after the file is Won");
    }
    const { data: tokenRow } = await supabase
      .from("payments")
      .select("id, verification_status")
      .eq("lead_id", lead.id)
      .eq("milestone", "token")
      .maybeSingle();
    if (!tokenRow || tokenRow.verification_status === "rejected") {
      throw new Error("Record Token first, then Pre-dispatch");
    }
  } else if (milestone === "final") {
    const okFinal = new Set([
      "installation_completed",
      "final_pending_verification",
      "final_verified",
      "liaison_in_progress",
      "meter_installed",
      "subsidy_pending",
      "subsidy_received_pending_accounts",
    ]);
    if (!okFinal.has(stage)) {
      throw new Error("Final payment requires installation completed");
    }
  }

  const quotationId =
    parsed.quotationId ?? lead.accepted_quotation_id ?? null;

  // Replace rejected row if re-recording
  await supabase
    .from("payments")
    .delete()
    .eq("lead_id", lead.id)
    .eq("milestone", milestone)
    .eq("verification_status", "rejected");

  const { data: existing } = await supabase
    .from("payments")
    .select("id, verification_status, amount")
    .eq("lead_id", lead.id)
    .eq("milestone", milestone)
    .maybeSingle();

  if (existing?.verification_status === "verified") {
    throw new Error("This milestone is already verified");
  }

  const { data: allPays } = await supabase
    .from("payments")
    .select("amount, verification_status")
    .eq("lead_id", lead.id);

  let projectTotal: number | null = null;
  if (quotationId) {
    const { data: quote } = await supabase
      .from("quotations")
      .select("grand_total")
      .eq("id", quotationId)
      .eq("company_id", profile.company_id)
      .maybeSingle();
    if (quote?.grand_total != null) projectTotal = Number(quote.grand_total);
  }
  if (projectTotal == null || !(projectTotal > 0)) {
    const wonPlan =
      (Number(lead.won_token_amount) || 0) +
      (Number(lead.won_pre_dispatch_amount) || 0) +
      (Number(lead.won_final_amount) || 0);
    if (wonPlan > 0) projectTotal = wonPlan;
  }

  const existingTotal = (allPays ?? [])
    .filter((p) => p.verification_status !== "rejected")
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const cap = assertPaymentWithinQuoteCap({
    projectTotal,
    existingNonRejectedTotal: existingTotal,
    newAmount: parsed.amount,
    replacingAmount: existing ? Number(existing.amount) || 0 : 0,
  });
  if (!cap.ok) throw new Error(cap.message);

  const payload = {
    company_id: profile.company_id,
    lead_id: lead.id,
    quotation_id: quotationId,
    milestone,
    amount: parsed.amount,
    method: parsed.method,
    transaction_id: parsed.transactionId.trim(),
    paid_at: parsed.paidAt,
    notes: parsed.notes ?? null,
    verification_status: "pending" as const,
    recorded_by: profile.id,
    verified_by: null,
    verified_at: null,
    rejection_reason: null,
    bank_reference: null,
  };

  const { data: payment, error } = existing
    ? await supabase
        .from("payments")
        .update(payload)
        .eq("id", existing.id)
        .select("*")
        .single()
    : await supabase.from("payments").insert(payload).select("*").single();

  if (error) throw new Error(error.message);

  let nextStage: string | null = null;
  if (milestone === "token" && stage === "quote_accepted") {
    nextStage = "token_pending_verification";
  } else if (
    milestone === "pre_dispatch" &&
    (stage === "quote_accepted" ||
      stage === "token_pending_verification" ||
      stage === "token_verified_and_feasibility_ok")
  ) {
    nextStage = "pre_dispatch_pending_verification";
  } else if (milestone === "final" && stage === "installation_completed") {
    nextStage = "final_pending_verification";
  }

  if (nextStage) {
    const updates: Record<string, unknown> = { sales_stage: nextStage };
    if (milestone === "token") {
      updates.token_verified = false;
    }
    await supabase.from("leads").update(updates).eq("id", lead.id);
    await logAuditEvent({
      companyId: profile.company_id,
      leadId: lead.id,
      actorId: profile.id,
      eventType: "stage_change",
      entityType: "lead",
      entityId: lead.id,
      metadata: { from: stage, to: nextStage, paymentId: payment.id, milestone },
    });
  }

  await logAuditEvent({
    companyId: profile.company_id,
    leadId: lead.id,
    actorId: profile.id,
    eventType: "payment_recorded",
    entityType: "payment",
    entityId: payment.id,
    metadata: {
      milestone,
      amount: parsed.amount,
      transactionId: parsed.transactionId,
    },
  });

  revalidatePath("/payments");
  revalidatePath("/liaison");
  revalidatePath("/pipeline");
  revalidatePath("/customers");
  return payment as PaymentRow;
}

export async function verifyPayment(input: {
  paymentId: string;
  bankReference: string;
}) {
  const profile = await requireAuth();
  if (!(await canVerify(profile))) throw new Error("Missing authority: verify_payment");

  const bankReference = input.bankReference.trim();
  if (bankReference.length < 2) throw new Error("Bank reference is required");

  const supabase = await createClient();
  const { data: payment, error } = await supabase
    .from("payments")
    .select("*")
    .eq("id", input.paymentId)
    .eq("company_id", profile.company_id)
    .single();

  if (error || !payment) throw new Error("Payment not found");
  if (payment.verification_status === "verified") return { ok: true };

  const { data: leadForCap } = await supabase
    .from("leads")
    .select(
      "accepted_quotation_id, company_id, won_token_amount, won_pre_dispatch_amount, won_final_amount"
    )
    .eq("id", payment.lead_id)
    .maybeSingle();

  const { data: allPays } = await supabase
    .from("payments")
    .select("amount, verification_status")
    .eq("lead_id", payment.lead_id);

  let projectTotal: number | null = null;
  const quoteId = payment.quotation_id ?? leadForCap?.accepted_quotation_id ?? null;
  if (quoteId) {
    const { data: quote } = await supabase
      .from("quotations")
      .select("grand_total")
      .eq("id", quoteId)
      .eq("company_id", profile.company_id)
      .maybeSingle();
    if (quote?.grand_total != null) projectTotal = Number(quote.grand_total);
  }
  if ((projectTotal == null || !(projectTotal > 0)) && leadForCap) {
    const wonPlan =
      (Number(leadForCap.won_token_amount) || 0) +
      (Number(leadForCap.won_pre_dispatch_amount) || 0) +
      (Number(leadForCap.won_final_amount) || 0);
    if (wonPlan > 0) projectTotal = wonPlan;
  }
  const existingTotal = (allPays ?? [])
    .filter((p) => p.verification_status !== "rejected")
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);
  if (projectTotal != null && projectTotal > 0) {
    const cap = assertPaymentWithinQuoteCap({
      projectTotal,
      existingNonRejectedTotal: existingTotal,
      newAmount: 0,
      replacingAmount: 0,
    });
    if (!cap.ok) throw new Error(cap.message);
  }

  const { error: updError } = await supabase
    .from("payments")
    .update({
      verification_status: "verified",
      bank_reference: bankReference,
      verified_by: profile.id,
      verified_at: new Date().toISOString(),
      rejection_reason: null,
    })
    .eq("id", payment.id);

  if (updError) throw new Error(updError.message);

  const { data: lead } = await supabase
    .from("leads")
    .select("id, sales_stage, token_verified, feasibility_approved")
    .eq("id", payment.lead_id)
    .single();

  if (lead) {
    if (payment.milestone === "token") {
      await supabase
        .from("leads")
        .update({ token_verified: true })
        .eq("id", lead.id);
      await maybeAdvanceTokenGates(profile.company_id, lead.id, profile.id);
    } else if (payment.milestone === "pre_dispatch") {
      await supabase
        .from("leads")
        .update({ sales_stage: "pre_dispatch_verified" })
        .eq("id", lead.id);
      await logAuditEvent({
        companyId: profile.company_id,
        leadId: lead.id,
        actorId: profile.id,
        eventType: "stage_change",
        entityType: "lead",
        entityId: lead.id,
        metadata: {
          from: lead.sales_stage,
          to: "pre_dispatch_verified",
          paymentId: payment.id,
        },
      });
    } else if (payment.milestone === "final") {
      await supabase
        .from("leads")
        .update({ sales_stage: "final_verified" })
        .eq("id", lead.id);
      await logAuditEvent({
        companyId: profile.company_id,
        leadId: lead.id,
        actorId: profile.id,
        eventType: "stage_change",
        entityType: "lead",
        entityId: lead.id,
        metadata: {
          from: lead.sales_stage,
          to: "final_verified",
          paymentId: payment.id,
        },
      });
    }
  }

  await logAuditEvent({
    companyId: profile.company_id,
    leadId: payment.lead_id,
    actorId: profile.id,
    eventType: "payment_verified",
    entityType: "payment",
    entityId: payment.id,
    metadata: { milestone: payment.milestone, bankReference },
  });

  revalidatePath("/payments");
  revalidatePath("/liaison");
  revalidatePath("/pipeline");
  revalidatePath("/customers");
  return { ok: true };
}

export async function rejectPayment(input: {
  paymentId: string;
  reason: string;
}) {
  const profile = await requireAuth();
  if (!(await canVerify(profile))) throw new Error("Missing authority: verify_payment");

  const reason = input.reason.trim();
  if (reason.length < 2) throw new Error("Rejection reason is required");

  const supabase = await createClient();
  const { data: payment, error } = await supabase
    .from("payments")
    .select("*")
    .eq("id", input.paymentId)
    .eq("company_id", profile.company_id)
    .single();

  if (error || !payment) throw new Error("Payment not found");

  const { error: updError } = await supabase
    .from("payments")
    .update({
      verification_status: "rejected",
      rejection_reason: reason,
      verified_by: profile.id,
      verified_at: new Date().toISOString(),
    })
    .eq("id", payment.id);

  if (updError) throw new Error(updError.message);

  if (payment.milestone === "token") {
    await supabase
      .from("leads")
      .update({ token_verified: false })
      .eq("id", payment.lead_id);
  }

  await logAuditEvent({
    companyId: profile.company_id,
    leadId: payment.lead_id,
    actorId: profile.id,
    eventType: "payment_rejected",
    entityType: "payment",
    entityId: payment.id,
    metadata: { milestone: payment.milestone, reason },
  });

  revalidatePath("/payments");
  revalidatePath("/pipeline");
  revalidatePath("/customers");
  return { ok: true };
}

/** Exported for feasibility action to call after approve. */
export async function advanceTokenGatesIfReady(
  companyId: string,
  leadId: string,
  actorId: string
) {
  return maybeAdvanceTokenGates(companyId, leadId, actorId);
}
