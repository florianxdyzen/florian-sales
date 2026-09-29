"use server";

import { revalidatePath } from "next/cache";
import { getQuotationContext } from "@/lib/quotations/context";
import {
  DEFAULT_SOLAR_TEMPLATE,
  normalizeSolarTemplate,
  resolvePreviousWorkPhotos,
  type SolarProposalTemplate,
} from "@/lib/quotations/quotation-template";
import { ATTACHMENTS_BUCKET, getStoragePublicUrl } from "@/lib/storage-url";

export type QuotationCompanyBankSettings = {
  fromName?: string;
  fromPhone?: string;
  fromEmail?: string;
  bankAccountName?: string;
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  branch?: string;
};

export type TemplateAssetKind = "cover" | "savings" | "qr";

const TEMPLATE_ASSET_FIELDS: Record<TemplateAssetKind, keyof SolarProposalTemplate> = {
  cover: "coverImageUrl",
  savings: "systemImageUrl",
  qr: "qrCodeUrl",
};

const TEMPLATE_ASSET_FOLDERS: Record<TemplateAssetKind, string> = {
  cover: "cover",
  savings: "savings",
  qr: "qr",
};

function storagePathFromPublicUrl(url: string, bucket = ATTACHMENTS_BUCKET): string | null {
  const marker = `/object/public/${bucket}/`;
  const idx = url.indexOf(marker);
  if (idx === -1) return null;
  return url.slice(idx + marker.length);
}

async function deleteTemplateAssetIfOwned(
  supabase: Awaited<ReturnType<typeof getQuotationContext>>["supabase"],
  companyId: string,
  url: string | undefined
) {
  if (!url?.trim()) return;
  const storagePath = storagePathFromPublicUrl(url.trim());
  const prefix = `${companyId}/quotation-template/`;
  if (!storagePath?.startsWith(prefix)) return;
  const { error } = await supabase.storage.from(ATTACHMENTS_BUCKET).remove([storagePath]);
  if (error) throw new Error(error.message);
}

async function requireTemplateManage() {
  const ctx = await getQuotationContext();
  if (!ctx.canEditQuotationTemplate) {
    throw new Error("You do not have permission to change the quotation template.");
  }
  return ctx;
}

async function loadCompanyTemplate() {
  const { supabase, companyId } = await requireTemplateManage();
  const { data, error } = await supabase
    .from("quotation_company_settings")
    .select("quotation_template, quotation_terms, quotation_notes_footer, from_name, from_phone")
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw error;
  const template = normalizeSolarTemplate(data?.quotation_template, {
    termsText: data?.quotation_terms,
    footerText: data?.quotation_notes_footer,
    preparedBy: data?.from_name,
    preparedByPhone: data?.from_phone,
  });
  return { supabase, companyId, template };
}

async function persistTemplate(
  supabase: Awaited<ReturnType<typeof getQuotationContext>>["supabase"],
  companyId: string,
  template: SolarProposalTemplate
) {
  const { error } = await supabase.from("quotation_company_settings").upsert(
    {
      company_id: companyId,
      quotation_template: template,
      quotation_terms: template.termsText || null,
      quotation_notes_footer: template.footerText || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "company_id" }
  );
  if (error) throw error;
  revalidatePath("/quotations");
  revalidatePath("/quotations/template");
  revalidatePath("/quotations/new");
}

export async function saveQuotationTemplate(
  input: Partial<SolarProposalTemplate>,
  company?: QuotationCompanyBankSettings
) {
  const { supabase, companyId } = await requireTemplateManage();

  const template = normalizeSolarTemplate({
    ...DEFAULT_SOLAR_TEMPLATE,
    ...input,
  });

  const payload: Record<string, unknown> = {
    company_id: companyId,
    quotation_template: template,
    quotation_terms: template.termsText || null,
    quotation_notes_footer: template.footerText || null,
    updated_at: new Date().toISOString(),
  };

  if (company) {
    if (company.fromName !== undefined) payload.from_name = company.fromName || null;
    if (company.fromPhone !== undefined) payload.from_phone = company.fromPhone || null;
    if (company.fromEmail !== undefined) payload.from_email = company.fromEmail || null;
    if (company.bankAccountName !== undefined) payload.bank_account_name = company.bankAccountName || null;
    if (company.bankName !== undefined) payload.bank_name = company.bankName || null;
    if (company.accountNumber !== undefined) payload.account_number = company.accountNumber || null;
    if (company.ifscCode !== undefined) payload.ifsc_code = company.ifscCode || null;
    if (company.branch !== undefined) payload.branch = company.branch || null;
  }

  const { error } = await supabase
    .from("quotation_company_settings")
    .upsert(payload, { onConflict: "company_id" });
  if (error) throw error;

  revalidatePath("/quotations");
  revalidatePath("/quotations/template");
  revalidatePath("/quotations/new");
}

/** Replace one of the six Previous Work photos (slot 0–5). */
export async function replacePreviousWorkPhoto(formData: FormData) {
  const { supabase, companyId, template } = await loadCompanyTemplate();
  const slot = Number(formData.get("slot"));
  if (!Number.isInteger(slot) || slot < 0 || slot > 5) {
    throw new Error("Invalid photo slot");
  }

  const file = formData.get("file") as File | null;
  if (!file) throw new Error("No file provided");
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files are allowed");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("Image must be under 8 MB");
  }

  const ext =
    (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const storagePath = `${companyId}/quotation-template/previous-work/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .upload(storagePath, arrayBuffer, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) throw new Error(uploadError.message);

  const url = getStoragePublicUrl(storagePath);
  const caption = String(formData.get("caption") || "").trim() || undefined;
  const photos = [...resolvePreviousWorkPhotos(template.previousWorkPhotos)];
  const previous = photos[slot];
  photos[slot] = { storagePath, url, ...(caption ? { caption } : previous.caption ? { caption: previous.caption } : {}) };

  if (previous.storagePath) {
    const prefix = `${companyId}/quotation-template/previous-work/`;
    if (previous.storagePath.startsWith(prefix)) {
      await supabase.storage.from(ATTACHMENTS_BUCKET).remove([previous.storagePath]).catch(() => undefined);
    }
  }

  const next: SolarProposalTemplate = {
    ...template,
    previousWorkPhotos: photos,
  };
  await persistTemplate(supabase, companyId, next);
  return next.previousWorkPhotos;
}

/** Remove a gallery image from the template and delete it from the storage bucket. */
export async function removePreviousWorkPhoto(storagePath: string) {
  const { supabase, companyId, template } = await loadCompanyTemplate();
  if (!storagePath) throw new Error("Missing storage path");

  const prefix = `${companyId}/quotation-template/previous-work/`;
  if (!storagePath.startsWith(prefix)) {
    throw new Error("Invalid photo path");
  }

  const { error: storageError } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .remove([storagePath]);
  if (storageError) throw new Error(storageError.message);

  const next: SolarProposalTemplate = {
    ...template,
    previousWorkPhotos: template.previousWorkPhotos.filter((p) => p.storagePath !== storagePath),
  };
  await persistTemplate(supabase, companyId, next);
  return next.previousWorkPhotos;
}

/** Upload cover, savings-band, or payment QR image for the solar proposal template. */
export async function uploadTemplateAsset(formData: FormData) {
  const { supabase, companyId, template } = await loadCompanyTemplate();
  const kind = String(formData.get("kind") || "") as TemplateAssetKind;
  if (!TEMPLATE_ASSET_FIELDS[kind]) {
    throw new Error("Invalid template image type");
  }

  const file = formData.get("file") as File | null;
  if (!file) throw new Error("No file provided");
  if (!file.type.startsWith("image/")) {
    throw new Error("Only image files are allowed");
  }
  const maxSize = kind === "qr" ? 4 * 1024 * 1024 : 8 * 1024 * 1024;
  if (file.size > maxSize) {
    throw new Error(`Image must be under ${kind === "qr" ? "4" : "8"} MB`);
  }

  const ext =
    (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const folder = TEMPLATE_ASSET_FOLDERS[kind];
  const storagePath = `${companyId}/quotation-template/${folder}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2, 8)}.${ext}`;

  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await supabase.storage
    .from(ATTACHMENTS_BUCKET)
    .upload(storagePath, arrayBuffer, {
      contentType: file.type,
      upsert: false,
    });
  if (uploadError) throw new Error(uploadError.message);

  const url = getStoragePublicUrl(storagePath);
  const field = TEMPLATE_ASSET_FIELDS[kind];
  const previousUrl = template[field] as string;

  await deleteTemplateAssetIfOwned(supabase, companyId, previousUrl);

  const next: SolarProposalTemplate = { ...template, [field]: url };
  await persistTemplate(supabase, companyId, next);

  return { url, storagePath, field };
}
