/** Build a WhatsApp click-to-chat URL for Indian mobiles. */

export function digitsOnlyPhone(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

/** Last 10 digits for Indian mobile; empty if not usable. */
export function indianMobile10(raw: string | null | undefined): string | null {
  const digits = digitsOnlyPhone(raw);
  if (digits.length < 10) return null;
  const last10 = digits.slice(-10);
  if (!/^[6-9]\d{9}$/.test(last10)) {
    // Still allow if 10 digits — some landlines / test numbers
    if (last10.length === 10) return last10;
    return null;
  }
  return last10;
}

export function whatsappChatUrl(phone: string | null | undefined, text: string): string | null {
  const mobile = indianMobile10(phone);
  if (!mobile) return null;
  const q = encodeURIComponent(text.trim());
  return `https://wa.me/91${mobile}${q ? `?text=${q}` : ""}`;
}

export function quotationWhatsAppMessage(input: {
  quotationNo: string;
  customerName: string;
  systemSizeKw?: number | null;
  grandTotal?: number | null;
}): string {
  const parts = [`Florian quotation ${input.quotationNo}`];
  const kw = Number(input.systemSizeKw);
  if (kw > 0) parts.push(`${kw} kW`);
  if (input.customerName.trim()) parts.push(input.customerName.trim());
  const total = Number(input.grandTotal);
  if (total > 0) {
    parts.push(
      `Total ₹${total.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`
    );
  }
  return parts.join(" · ");
}
