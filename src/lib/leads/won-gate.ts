/** Phase 0 + 5a Won hard-gate — system details, payment breakdown, mandatory docs. */

import {
  METER_OWNERSHIP_LABELS,
  METER_TYPE_LABELS,
  PAYMENT_PLAN_LABELS,
  parseMeterOwnership,
  parseMeterType,
  parsePaymentPlan,
} from "@/lib/domain/lead-profile";
import {
  validateStructureLegs,
  type StructureLegHeights,
} from "@/lib/leads/structure-legs";

export const WON_MANDATORY_DOC_TYPES = ["electricity_bill", "customer_id"] as const;
export type WonMandatoryDocType = (typeof WON_MANDATORY_DOC_TYPES)[number];

export const WON_MANDATORY_DOC_LABELS: Record<WonMandatoryDocType, string> = {
  electricity_bill: "Electricity bill",
  customer_id: "Customer ID (Aadhaar / PAN / other)",
};

/** Optional attach at Won — not required to pass the gate. */
export const WON_OPTIONAL_DOC_TYPES = ["feasibility_report"] as const;
export type WonOptionalDocType = (typeof WON_OPTIONAL_DOC_TYPES)[number];

export const WON_OPTIONAL_DOC_LABELS: Record<WonOptionalDocType, string> = {
  feasibility_report: "Feasibility report",
};

export type WonClosingPayload = {
  panelName: string;
  panelQuantity: number;
  inverterCompany: string;
  /** Snapshot from selected quote when known; not required in UI. */
  systemSizeKw?: number | null;
  tokenAmount: number;
  preDispatchAmount: number;
  finalAmount: number;
  tokenReceived?: boolean;
  preDispatchReceived?: boolean;
  finalReceived?: boolean;
  structureLegCount: number;
  structureLegHeights: StructureLegHeights;
  acceptedQuotationId?: string | null;
  /** Kept for backward compatibility — no longer collected in Won UI. */
  meterType?: string | null;
  meterOwnership?: string | null;
  paymentPlan?: string | null;
};

export type WonGateResult = {
  passed: boolean;
  blockedReasons: string[];
};

export function checkWonClosingGate(
  payload: Partial<WonClosingPayload> | null | undefined,
  docTypesPresent: Iterable<string>
): WonGateResult {
  const blockedReasons: string[] = [];
  const docs = new Set(
    [...docTypesPresent].map((t) => String(t).trim().toLowerCase()).filter(Boolean)
  );

  if (!payload) {
    return {
      passed: false,
      blockedReasons: [
        "Complete the Won form: system details, payment breakdown, and mandatory documents",
      ],
    };
  }

  if (!payload.panelName?.trim()) {
    blockedReasons.push("Enter panel / module brand & capacity");
  }
  if (!(Number(payload.panelQuantity) >= 1)) {
    blockedReasons.push("Enter panel quantity (at least 1)");
  }
  if (!payload.inverterCompany?.trim()) {
    blockedReasons.push("Enter inverter brand");
  }

  const token = Number(payload.tokenAmount);
  const pre = Number(payload.preDispatchAmount);
  const finalAmt = Number(payload.finalAmount);
  if (!(token >= 0) || !(pre >= 0) || !(finalAmt >= 0)) {
    blockedReasons.push("Payment amounts must be zero or positive numbers");
  } else if (!(token + pre + finalAmt > 0)) {
    blockedReasons.push(
      "Enter a final payment breakdown (token + pre-dispatch + final must total > 0)"
    );
  }
  if (payload.tokenReceived && !(token > 0)) {
    blockedReasons.push("Received requires a Token amount greater than 0");
  }
  if (payload.preDispatchReceived && !(pre > 0)) {
    blockedReasons.push("Received requires a Pre-dispatch amount greater than 0");
  }
  if (payload.finalReceived && !(finalAmt > 0)) {
    blockedReasons.push("Received requires a Final amount greater than 0");
  }

  blockedReasons.push(
    ...validateStructureLegs(Number(payload.structureLegCount), payload.structureLegHeights)
  );

  for (const key of WON_MANDATORY_DOC_TYPES) {
    if (!docs.has(key)) {
      blockedReasons.push(`Upload ${WON_MANDATORY_DOC_LABELS[key]}`);
    }
  }

  return { passed: blockedReasons.length === 0, blockedReasons };
}

export function paymentBreakdownTotal(
  payload: Pick<WonClosingPayload, "tokenAmount" | "preDispatchAmount" | "finalAmount">
) {
  return (
    (Number(payload.tokenAmount) || 0) +
    (Number(payload.preDispatchAmount) || 0) +
    (Number(payload.finalAmount) || 0)
  );
}

export function profileFieldLabels(payload: {
  meter_type?: string | null;
  meter_ownership?: string | null;
  payment_plan?: string | null;
  meterType?: string | null;
  meterOwnership?: string | null;
  paymentPlan?: string | null;
}) {
  const meterType = parseMeterType(payload.meter_type ?? payload.meterType);
  const meterOwnership = parseMeterOwnership(
    payload.meter_ownership ?? payload.meterOwnership
  );
  const paymentPlan = parsePaymentPlan(payload.payment_plan ?? payload.paymentPlan);
  return {
    meterType: meterType ? METER_TYPE_LABELS[meterType] : null,
    meterOwnership: meterOwnership ? METER_OWNERSHIP_LABELS[meterOwnership] : null,
    paymentPlan: paymentPlan ? PAYMENT_PLAN_LABELS[paymentPlan] : null,
  };
}
