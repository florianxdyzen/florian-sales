/** Basename for Save as PDF (without .pdf). */

export function quotationPdfBasename(input: {
  customerName?: string | null;
  systemSizeKw?: number | null;
  quotationNo?: string | null;
}): string {
  const name = sanitizeName(input.customerName ?? "");
  const kw = Number(input.systemSizeKw);
  const kwPart =
    Number.isFinite(kw) && kw > 0
      ? `${trimKw(kw)}kW`
      : null;

  if (name && kwPart) return `${name}_${kwPart}`;
  if (name) return name;
  if (kwPart) return `Quote_${kwPart}`;
  const no = sanitizeName(input.quotationNo ?? "") || "quotation";
  return `Quote_${no}`;
}

function trimKw(kw: number): string {
  const rounded = Math.round(kw * 100) / 100;
  return String(rounded).replace(/\.0+$/, "").replace(/(\.\d*?)0+$/, "$1");
}

function sanitizeName(raw: string): string {
  return raw
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^\w.\-]+/g, "")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 80);
}
