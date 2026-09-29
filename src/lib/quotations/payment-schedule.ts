import { fmtMoney } from "@/lib/quotations/solar-proposal-calculations";
import type { SolarProposalTemplate } from "@/lib/quotations/quotation-template";

export type PaymentScheduleStep = {
  amount: number;
  label: string;
  note: string | null;
  pct: number;
};

const r0 = (n: number) => Math.round(Number.isFinite(n) ? n : 0);

/**
 * Payment lines from template advance/material/install/meter percentages.
 * Falls back to the historic ₹5,000 booking / hold split when percents are all 0.
 */
export function paymentScheduleFromTemplate(
  payable: number,
  template: Pick<
    SolarProposalTemplate,
    "advancePct" | "materialPct" | "installPct" | "meterPct"
  >
): PaymentScheduleStep[] {
  const base = Math.max(0, Number(payable) || 0);
  const rows = [
    {
      pct: Number(template.advancePct) || 0,
      label: "Advance / Booking Amount Along With Documents",
      note: null as string | null,
    },
    {
      pct: Number(template.materialPct) || 0,
      label: "At The Time Of Material Received",
      note: "(Cheque / DD / NEFT / RTGS / UPI proof required before installation start)",
    },
    {
      pct: Number(template.installPct) || 0,
      label: "After Installation Before GEB Meter File Submit",
      note: null,
    },
    {
      pct: Number(template.meterPct) || 0,
      label: "At net-meter / DISCOM filing",
      note: null,
    },
  ].filter((row) => row.pct > 0);

  if (rows.length === 0) {
    const booking = Math.min(5000, base);
    const hold = Math.min(5000, Math.max(0, base - booking));
    const material = Math.max(0, base - booking - hold);
    return [
      { amount: booking, label: "Advance / Booking Amount Along With Documents", note: null, pct: 0 },
      {
        amount: material,
        label: "At The Time Of Material Received",
        note: "(Cheque / DD / NEFT / RTGS / UPI proof required before installation start)",
        pct: 0,
      },
      { amount: hold, label: "After Installation Before GEB Meter File Submit", note: null, pct: 0 },
    ];
  }

  const amounts = rows.map((row) => r0((base * row.pct) / 100));
  const drift = r0(base) - amounts.reduce((sum, n) => sum + n, 0);
  if (amounts.length > 0) amounts[amounts.length - 1] += drift;

  return rows.map((row, i) => ({
    amount: Math.max(0, amounts[i] ?? 0),
    label: row.label,
    note: row.note,
    pct: row.pct,
  }));
}

export function formatPaymentTermsFromTemplate(
  payable: number,
  template: Pick<
    SolarProposalTemplate,
    "advancePct" | "materialPct" | "installPct" | "meterPct"
  >
): string {
  return paymentScheduleFromTemplate(payable, template)
    .map((step) => `${fmtMoney(step.amount)} — ${step.label}`)
    .join("\n");
}
