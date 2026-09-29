export const INSTALL_PHOTO_KINDS = ["site", "panel_barcode", "other"] as const;
export type InstallPhotoKind = (typeof INSTALL_PHOTO_KINDS)[number];

export const INSTALL_PHOTO_LABELS: Record<InstallPhotoKind, string> = {
  site: "Site / overview photo",
  panel_barcode: "Panel barcode / DCR",
  other: "Other proof",
};

export type InstallationPhoto = {
  id: string;
  company_id: string;
  lead_id: string;
  photo_kind: InstallPhotoKind;
  file_url: string;
  caption: string | null;
  panel_index: number | null;
  serial_hint: string | null;
  latitude: number | null;
  longitude: number | null;
  uploaded_by: string | null;
  created_at: string;
};

export function installationProofGate(input: {
  photos: Array<{ photo_kind: string }>;
  expectedPanelCount: number | null | undefined;
}) {
  const siteCount = input.photos.filter((p) => p.photo_kind === "site").length;
  const barcodeCount = input.photos.filter((p) => p.photo_kind === "panel_barcode").length;
  const needed = Math.max(1, Number(input.expectedPanelCount) || 1);

  const missing: string[] = [];
  if (siteCount < 1) missing.push("at least 1 site photo");
  if (barcodeCount < needed) {
    missing.push(`${needed} panel barcode photo${needed === 1 ? "" : "s"} (have ${barcodeCount})`);
  }

  return {
    ok: missing.length === 0,
    siteCount,
    barcodeCount,
    needed,
    missing,
  };
}
