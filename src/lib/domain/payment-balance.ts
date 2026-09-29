import type { PortalPayment } from "@/lib/domain/portal";

export type LeadPaymentBalance = {
  projectTotal: number | null;
  paid: number;
  pending: number;
  remaining: number | null;
  source: "quotation" | "won_plan" | "none";
};

/** Staff + portal shared remaining-balance math. */
export function summarizeLeadPaymentBalance(input: {
  quoteGrandTotal?: number | null;
  wonTokenAmount?: number | null;
  wonPreDispatchAmount?: number | null;
  wonFinalAmount?: number | null;
  payments: Array<Pick<PortalPayment, "amount" | "verification_status">>;
}): LeadPaymentBalance {
  const quoteTotal =
    input.quoteGrandTotal != null && !Number.isNaN(Number(input.quoteGrandTotal))
      ? Number(input.quoteGrandTotal)
      : null;
  const wonPlan =
    (Number(input.wonTokenAmount) || 0) +
    (Number(input.wonPreDispatchAmount) || 0) +
    (Number(input.wonFinalAmount) || 0);

  let projectTotal: number | null = null;
  let source: LeadPaymentBalance["source"] = "none";
  if (quoteTotal != null && quoteTotal > 0) {
    projectTotal = quoteTotal;
    source = "quotation";
  } else if (wonPlan > 0) {
    projectTotal = wonPlan;
    source = "won_plan";
  }

  const counted = input.payments.filter((p) => p.verification_status !== "rejected");
  const paid = counted.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const pending = counted
    .filter((p) => p.verification_status === "pending")
    .reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const remaining =
    projectTotal == null ? null : Math.max(0, Math.round((projectTotal - paid) * 100) / 100);

  return { projectTotal, paid, pending, remaining, source };
}

export function formatPaymentCapInr(amount: number): string {
  return Number(amount).toLocaleString("en-IN", {
    maximumFractionDigits: 2,
  });
}

/** Reject record/verify when non-rejected payments would exceed quote (or Won plan). */
export function assertPaymentWithinQuoteCap(input: {
  projectTotal: number | null;
  existingNonRejectedTotal: number;
  newAmount: number;
  replacingAmount?: number;
}): { ok: true } | { ok: false; message: string; overBy: number } {
  if (input.projectTotal == null || !(input.projectTotal > 0)) {
    return {
      ok: false,
      message:
        "Cannot record payment until an accepted quotation or Won payment plan exists",
      overBy: 0,
    };
  }
  const replacing = Number(input.replacingAmount) || 0;
  const nextTotal =
    input.existingNonRejectedTotal - replacing + (Number(input.newAmount) || 0);
  const overBy = Math.round((nextTotal - input.projectTotal) * 100) / 100;
  if (overBy > 0) {
    return {
      ok: false,
      message: `Amount exceeds quotation total of ₹${formatPaymentCapInr(input.projectTotal)}`,
      overBy,
    };
  }
  return { ok: true };
}

export function pendingPaymentWhatsAppMessage(
  customerName: string,
  remaining: number
): string {
  const name = customerName.trim() || "Customer";
  const rupees = formatPaymentCapInr(remaining);
  return `Hello ${name}, your Florian balance of ₹${rupees} is pending. Please share the UTR.`;
}

export function isWhatsAppPhoneValid(phone: string | null | undefined): boolean {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length === 10) return true;
  if (digits.length === 12 && digits.startsWith("91")) return true;
  return digits.length >= 10 && digits.length <= 15;
}
