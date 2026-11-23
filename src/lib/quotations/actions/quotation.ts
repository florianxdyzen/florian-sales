"use server";

import { revalidatePath } from "next/cache";
import { getQuotationContext } from "@/lib/quotations/context";
import { calcQuotationTotals, calcLineTotal } from "@/lib/quotations/quote-math";
import { defaultSiteCharges, normalizeSiteCharges } from "@/lib/quotations/site-charges";
import { quotationSchema } from "@/lib/quotations/validations";
import { allocateQuotationNumber } from "@/lib/quotations/actions/quotation-number";
import { assertSystemCostAllowed, enforceQuotationSubsidyMatrix } from "@/lib/quotations/subsidy";
import { logAuditEvent } from "@/lib/audit";
import { persistQuotationRow } from "@/lib/quotations/quotation-persist";
import { normalizeSolarTemplate } from "@/lib/quotations/quotation-template";
import { pickTemplateSnapshot } from "@/lib/quotations/template-snapshot";
import { ATTACHMENTS_BUCKET, getStoragePublicUrl } from "@/lib/storage-url";
import {
  mergeLastInverterByKw,
  parseLastInverterByKw,
} from "@/lib/quotations/quote-prefs";
import { parseStructureMicron } from "@/lib/quotations/structure-micron";

const r2 = (n: number) => Math.round((Number.isFinite(n) ? n : 0) * 100) / 100;

function dbError(error: { message?: string; code?: string; details?: string } | null, fallback: string) {
  const parts = [error?.message, error?.details, error?.code ? `(${error.code})` : null].filter(Boolean);
  return new Error(parts.join(" — ") || fallback);
}

function errorMessage(err: unknown): string {
  if (err && typeof err === "object" && "issues" in err) {
    const issues = (err as { issues?: Array<{ path?: (string | number)[]; message?: string }> }).issues;
    if (Array.isArray(issues) && issues.length > 0) {
      return issues
        .slice(0, 3)
        .map((i) => `${(i.path ?? []).join(".") || "field"}: ${i.message ?? "invalid"}`)
        .join("; ");
    }
  }
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && err && "message" in err) return String((err as { message: unknown }).message);
  return "Failed to save quotation";
}

export type UpsertQuotationResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function upsertQuotation(input: unknown): Promise<UpsertQuotationResult> {
  try {
    const data = quotationSchema.parse(input);
    const { supabase, userId, companyId, canManageQuotations, canEditQuotations, canManageCatalog } =
      await getQuotationContext();

    if (data.id) {
      if (!canEditQuotations) {
        return { ok: false, error: "You do not have permission to edit quotations." };
      }
      const { data: existing } = await supabase
        .from("quotations")
        .select("status")
        .eq("id", data.id)
        .eq("company_id", companyId)
        .maybeSingle();
      if (!existing) return { ok: false, error: "Quotation not found." };
      if (existing.status === "accepted") {
        return { ok: false, error: "Accepted quotations cannot be edited." };
      }
    } else if (!canManageQuotations) {
      return { ok: false, error: "You do not have permission to create quotations." };
    }

    if (
      data.projectType !== "commercial" &&
      data.ratePackageId &&
      data.systemCost != null &&
      data.minSalePriceSnapshot != null
    ) {
      const net =
        Number(data.systemCost) - Math.max(0, Number(data.discountAmount ?? 0));
      assertSystemCostAllowed(net, Number(data.minSalePriceSnapshot));
    }

    const subsidyMatrix = enforceQuotationSubsidyMatrix({
      projectType: data.projectType,
      subsidyScheme: data.subsidyScheme,
      subsidy: data.subsidy,
    });
    data.projectType = subsidyMatrix.projectType;
    data.subsidyScheme = subsidyMatrix.subsidyScheme;
    data.subsidy = subsidyMatrix.subsidy;

    const settingsRow = await supabase
      .from("quotation_company_settings")
      .select("quotation_template, quotation_terms, quotation_notes_footer, from_name, from_phone")
      .eq("company_id", companyId)
      .maybeSingle();
    const settings = settingsRow.data;

    const panelName = (data.moduleTypeName ?? data.moduleCompanyName ?? "").trim();
    if (panelName) {
      const panelSelect = await supabase
        .from("rate_card_companies")
        .select("id, available_for_sales, panel_name, name")
        .eq("company_id", companyId);
      const panelRows =
        panelSelect.error && /available_for_sales/i.test(panelSelect.error.message ?? "")
          ? (
              await supabase
                .from("rate_card_companies")
                .select("id, panel_name, name")
                .eq("company_id", companyId)
            ).data
          : panelSelect.data;
      const panelRow = (panelRows ?? []).find(
        (row) =>
          (row.panel_name ?? "").trim() === panelName || (row.name ?? "").trim() === panelName
      );
      if (
        panelRow &&
        "available_for_sales" in panelRow &&
        panelRow.available_for_sales === false &&
        !canManageCatalog
      ) {
        return { ok: false, error: "Panel no longer available — choose another." };
      }
    }

    const liveTemplate = normalizeSolarTemplate(settings?.quotation_template, {
      termsText: settings?.quotation_terms,
      footerText: settings?.quotation_notes_footer,
      preparedBy: settings?.from_name,
      preparedByPhone: settings?.from_phone,
    });
    const templateSnapshot = pickTemplateSnapshot(liveTemplate);

    const siteCharges = normalizeSiteCharges(data.siteCharges ?? defaultSiteCharges());
    const t = calcQuotationTotals(data.items, siteCharges);
    const now = new Date().toISOString();

    const lead = data.leadId ? await loadLead(supabase, companyId, data.leadId) : null;
    if (lead?.sales_stage === "lost") {
      return { ok: false, error: "Cannot create a quotation for a lost lead." };
    }

    const extraCharges =
      Number(data.meterChargeAmount ?? 0) + Number(data.gedaChargeAmount ?? 0);
    const grandTotal = Math.max(0, t.total + extraCharges);

    // New quotes always take the next number from the numbering sequence.
    const quotationNo = data.id ? data.quotationNo : await allocateQuotationNumber();

    const base = {
      company_id: companyId,
      quotation_no: quotationNo,
      lead_id: data.leadId ?? null,
      template_kind: "solar",
      customer_name: data.customerName,
      customer_phone: (data.customerPhone ?? "").trim() || null,
      customer_address: data.address ?? null,
      project_type: data.projectType ?? "residential",
      status: data.status,
      quote_date: data.quoteDate,
      valid_till: data.validTill,
      subtotal: r2(t.subtotal + extraCharges),
      discount_total: t.discount,
      discount_percent: Number(data.discountPercent ?? 0),
      taxable_total: r2(t.taxable + extraCharges),
      gst_total: t.gst,
      grand_total: grandTotal,
      notes: data.notes ?? null,
      terms: data.terms ?? null,
      site_charges: siteCharges,
      rate_package_id: data.ratePackageId ?? null,
      module_type_name: data.moduleTypeName ?? null,
      module_company_name: data.moduleCompanyName ?? null,
      module_capacity_label: data.moduleCapacityLabel ?? null,
      inverter_type_name: data.inverterTypeName ?? null,
      inverter_size_label: data.inverterSizeLabel ?? null,
      system_size_kw: data.systemSizeKw ?? null,
      panel_count: data.panelCount ?? null,
      system_cost: data.systemCost ?? null,
      min_sale_price_snapshot: data.minSalePriceSnapshot ?? null,
      subsidy_scheme: data.subsidyScheme,
      subsidy: data.subsidy ?? 0,
      meter_phase: data.meterPhase ?? null,
      meter_charge_amount: data.meterChargeAmount ?? null,
      meter_charges: Number(data.meterChargeAmount ?? 0),
      meter_phase_label: data.meterPhaseLabel ?? null,
      price_per_kw_excl_gst: data.pricePerKwExclGst ?? null,
      commercial_gst_percent:
        data.projectType === "commercial"
          ? (data.commercialGstPercent ?? null)
          : null,
      geda_charge_amount: data.gedaChargeAmount ?? null,
      panel_mount_type: data.panelMountType ?? null,
      tier_type: data.tierType ?? "premium",
      structure_micron: parseStructureMicron(data.structureMicron),
      rate_per_kw_snapshot: data.ratePerKwSnapshot ?? null,
      net_payable_amount: data.netPayableAmount ?? null,
      template_snapshot: templateSnapshot,
      ...(data.bomItems ? { bom_items: data.bomItems } : {}),
      updated_by: userId,
      updated_at: now,
    };

    let saved: { id: string };
    if (data.id) {
      await persistQuotationRow(supabase, "update", base, {
        id: data.id,
        companyId,
      });
      saved = { id: data.id };
    } else {
      let inserted: { id: string } | null = null;
      let lastError: { message?: string; code?: string; details?: string } | null = null;

      for (let attempt = 0; attempt < 3; attempt++) {
        const attemptNo =
          attempt === 0 ? quotationNo : await allocateQuotationNumber();
        const newId = crypto.randomUUID();

        try {
          await persistQuotationRow(supabase, "insert", {
            id: newId,
            ...base,
            quotation_no: attemptNo,
            created_by: userId,
          });
          inserted = { id: newId };
          break;
        } catch (error) {
          lastError =
            error && typeof error === "object"
              ? (error as { message?: string; code?: string; details?: string })
              : { message: String(error) };
          if (lastError?.code !== "23505") break;
        }
      }

      if (!inserted) {
        throw dbError(lastError, "Failed to create quotation");
      }
      saved = inserted;
    }

    const { error: deleteError } = await supabase
      .from("quotation_items")
      .delete()
      .eq("quotation_id", saved.id);
    if (deleteError) throw dbError(deleteError, "Failed to clear quotation items");

    const { error: insertError } = await supabase.from("quotation_items").insert(
      data.items.map((item, idx) => ({
        quotation_id: saved.id,
        sort_order: idx,
        item_id: item.itemId ?? null,
        item_name_snapshot: item.itemName,
        brand_snapshot: item.brand ?? null,
        model_snapshot: item.model ?? null,
        quantity: item.quantity,
        unit: item.unit,
        rate: item.rate,
        gst_percent: item.gstPercent,
        discount_value: item.discountValue,
        line_total: calcLineTotal(item),
        image_url_snapshot: item.imageUrl?.trim() || null,
        brand_image_url_snapshot: item.brandImageUrl?.trim() || null,
      }))
    );
    if (insertError) throw dbError(insertError, "Failed to save quotation items");

    const prefPatch: Record<string, unknown> = { updated_at: now };
    if (data.bomQuoteOnly === false && data.bomItems) {
      prefPatch.last_bom_items = data.bomItems;
    }
    const systemKw = Number(data.systemSizeKw ?? 0);
    const inverterMake = (data.inverterTypeName ?? "").trim();
    const inverterSize = (data.inverterSizeLabel ?? "").trim();
    if (systemKw > 0 && inverterMake && inverterSize) {
      const prefsRow = await supabase
        .from("quotation_company_settings")
        .select("last_inverter_by_kw")
        .eq("company_id", companyId)
        .maybeSingle();
      const existingMap = parseLastInverterByKw(
        prefsRow.error ? {} : prefsRow.data?.last_inverter_by_kw
      );
      prefPatch.last_inverter_by_kw = mergeLastInverterByKw(
        existingMap,
        systemKw,
        inverterMake,
        inverterSize
      );
    }
    if (systemKw > 0 && systemKw < 3) {
      prefPatch.last_subsidy_under_3kw = {
        amount: Math.max(0, Number(data.subsidy ?? 0)),
        scheme: data.subsidyScheme,
        updatedAt: now,
      };
    }

    if (Object.keys(prefPatch).length > 1) {
      let patch = { ...prefPatch };
      for (let attempt = 0; attempt < 4; attempt++) {
        const savedPrefs = await supabase
          .from("quotation_company_settings")
          .update(patch)
          .eq("company_id", companyId);
        if (!savedPrefs.error) break;
        const missing = savedPrefs.error.message?.match(
          /Could not find the '([^']+)' column/i
        )?.[1];
        if (missing && missing in patch) {
          const { [missing]: _drop, ...rest } = patch;
          patch = rest;
          if (Object.keys(patch).length <= 1) break;
          continue;
        }
        if (
          /last_inverter_by_kw|last_subsidy_under_3kw|last_bom_items/i.test(
            `${savedPrefs.error.message ?? ""} ${savedPrefs.error.details ?? ""}`
          )
        ) {
          break;
        }
        console.error("[upsertQuotation] company prefs", savedPrefs.error);
        break;
      }
    }

    // First quote from a completed survey moves the lead to "quoted".
    if (lead?.sales_stage === "survey_completed") {
      await supabase.from("leads").update({ sales_stage: "quoted" }).eq("id", lead.id);
      await logAuditEvent({
        companyId,
        leadId: lead.id,
        actorId: userId,
        eventType: "stage_change",
        entityType: "lead",
        entityId: lead.id,
        metadata: { from: "survey_completed", to: "quoted", quotationId: saved.id },
      });
    }

    await logAuditEvent({
      companyId,
      leadId: lead?.id ?? null,
      actorId: userId,
      eventType: data.id ? "quotation_updated" : "quotation_created",
      entityType: "quotation",
      entityId: saved.id,
      metadata: {
        templateKind: "solar",
        projectType: data.projectType ?? "residential",
        grandTotal,
        status: data.status,
        custom: !lead,
      },
    });

    try {
      revalidatePath("/quotations");
      revalidatePath("/pipeline");
      revalidatePath("/customers");
      revalidatePath(`/quotations/${saved.id}`);
    } catch (err) {
      console.error("[upsertQuotation] revalidatePath", err);
    }
    return { ok: true, id: saved.id };
  } catch (err) {
    console.error("[upsertQuotation]", err);
    return { ok: false, error: errorMessage(err) };
  }
}

export type DuplicateQuotationOverrides = {
  customerName: string;
  customerPhone?: string | null;
  leadId?: string | null;
};

export async function duplicateQuotation(
  id: string,
  overrides?: DuplicateQuotationOverrides
): Promise<string> {
  const { supabase, userId, companyId, canManageQuotations } = await getQuotationContext();
  if (!canManageQuotations) {
    throw new Error("You do not have permission to modify quotations.");
  }
  const { data: orig, error } = await supabase
    .from("quotations")
    .select("*,quotation_items(*)")
    .eq("id", id)
    .eq("company_id", companyId)
    .single();
  if (error) throw dbError(error, "Failed to load quotation");

  const customerName = (overrides?.customerName ?? orig.customer_name ?? "").trim();
  if (customerName.length < 2) {
    throw new Error("Customer name is required to duplicate.");
  }
  const phoneRaw =
    overrides?.customerPhone !== undefined
      ? (overrides.customerPhone ?? "").trim()
      : (orig.customer_phone ?? "").trim();
  const phoneDigits = phoneRaw.replace(/\D/g, "");
  if (phoneDigits.length > 0 && phoneDigits.length < 10) {
    throw new Error("Enter a valid phone (10+ digits) or leave blank.");
  }
  const leadId =
    overrides?.leadId !== undefined ? overrides.leadId : (orig.lead_id as string | null);

  if (leadId) {
    const lead = await loadLead(supabase, companyId, leadId);
    if (lead.sales_stage === "lost") {
      throw new Error("Cannot link a duplicated quotation to a lost lead.");
    }
  }

  const insertPayload: Record<string, unknown> = {
    company_id: companyId,
    quotation_no: `${orig.quotation_no}-R${Date.now().toString().slice(-4)}`,
    lead_id: leadId ?? null,
    template_kind: orig.template_kind ?? "solar",
    customer_name: customerName,
    customer_phone: phoneRaw || null,
    customer_address: orig.customer_address,
    project_type: orig.project_type ?? "residential",
    status: "draft",
    quote_date: new Date().toISOString().slice(0, 10),
    valid_till: orig.valid_till,
    subtotal: orig.subtotal,
    discount_total: orig.discount_total,
    discount_percent: orig.discount_percent ?? 0,
    taxable_total: orig.taxable_total,
    gst_total: orig.gst_total,
    grand_total: orig.grand_total,
    notes: orig.notes,
    terms: orig.terms,
    site_charges: orig.site_charges ?? null,
    rate_package_id: orig.rate_package_id ?? null,
    module_type_name: orig.module_type_name ?? null,
    module_company_name: orig.module_company_name ?? null,
    module_capacity_label: orig.module_capacity_label ?? null,
    inverter_type_name: orig.inverter_type_name ?? null,
    inverter_size_label: orig.inverter_size_label ?? null,
    system_size_kw: orig.system_size_kw ?? null,
    panel_count: orig.panel_count ?? null,
    system_cost: orig.system_cost ?? null,
    min_sale_price_snapshot: orig.min_sale_price_snapshot ?? null,
    subsidy_scheme: orig.subsidy_scheme ?? "residential",
    subsidy: orig.subsidy ?? null,
    meter_phase: orig.meter_phase ?? null,
    meter_charge_amount: orig.meter_charge_amount ?? null,
    meter_phase_label: orig.meter_phase_label ?? null,
    price_per_kw_excl_gst: orig.price_per_kw_excl_gst ?? null,
    commercial_gst_percent: orig.commercial_gst_percent ?? null,
    geda_charge_amount: orig.geda_charge_amount ?? null,
    panel_mount_type: orig.panel_mount_type ?? null,
    tier_type: orig.tier_type ?? "premium",
    structure_micron: parseStructureMicron(orig.structure_micron),
    rate_per_kw_snapshot: orig.rate_per_kw_snapshot ?? null,
    net_payable_amount: orig.net_payable_amount ?? null,
    template_snapshot: orig.template_snapshot ?? null,
    ...(Array.isArray(orig.bom_items) ? { bom_items: orig.bom_items } : {}),
    created_by: userId,
    updated_by: userId,
  };

  let q: { id: string } | null = null;
  let insertError: { message?: string; code?: string; details?: string } | null = null;
  for (let attempt = 0; attempt < 12; attempt++) {
    const result = await supabase.from("quotations").insert(insertPayload).select("id").single();
    if (!result.error && result.data) {
      q = result.data;
      break;
    }
    insertError = result.error;
    const missing = result.error?.message?.match(/Could not find the '([^']+)' column/i)?.[1];
    if (missing && missing in insertPayload) {
      delete insertPayload[missing];
      continue;
    }
    break;
  }
  if (!q) throw dbError(insertError, "Failed to duplicate quotation");

  if (orig.quotation_items?.length) {
    const { error: itemsError } = await supabase.from("quotation_items").insert(
      orig.quotation_items.map(({ id: _id, quotation_id: _qid, ...rest }: Record<string, unknown>) => ({
        ...rest,
        quotation_id: q.id,
      }))
    );
    if (itemsError) throw dbError(itemsError, "Failed to duplicate quotation items");
  }

  revalidatePath("/quotations");
  revalidatePath(`/quotations/${q.id}`);
  return q.id;
}

export async function updateQuotationStatus(id: string, status: string) {
  const { supabase, companyId, canManageQuotations } = await getQuotationContext();
  if (!canManageQuotations) throw new Error("You do not have permission to modify quotations.");
  const { error } = await supabase
    .from("quotations")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("company_id", companyId);
  if (error) throw dbError(error, "Failed to update status");
  revalidatePath("/quotations");
  revalidatePath(`/quotations/${id}`);
}

export async function deleteQuotation(id: string) {
  const { supabase, companyId, canDeleteQuotations } = await getQuotationContext();
  if (!canDeleteQuotations) throw new Error("You do not have permission to delete quotations.");
  const { error } = await supabase.from("quotations").delete().eq("id", id).eq("company_id", companyId);
  if (error) throw dbError(error, "Failed to delete quotation");
  revalidatePath("/quotations");
}

/** Upload a bill-of-materials photo. Returns a public URL stored on that row. */
export async function uploadQuotationBomImage(formData: FormData) {
  const { supabase, companyId, canManageQuotations, canEditQuotations } = await getQuotationContext();
  if (!canManageQuotations && !canEditQuotations) {
    throw new Error("You do not have permission to upload quotation images.");
  }
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("No file provided");
  if (!file.type.startsWith("image/")) throw new Error("Only image files are allowed");
  if (file.size > 8 * 1024 * 1024) throw new Error("Image must be under 8 MB");
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  if (!["jpg", "jpeg", "png", "webp", "gif"].includes(ext)) {
    throw new Error("Use a JPG, PNG, WebP, or GIF image");
  }
  const storagePath = `${companyId}/quotation-bom/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const { error } = await supabase.storage.from(ATTACHMENTS_BUCKET).upload(storagePath, await file.arrayBuffer(), {
    contentType: file.type,
    upsert: false,
  });
  if (error) throw new Error(error.message);
  return { url: getStoragePublicUrl(storagePath) };
}

async function loadLead(
  supabase: Awaited<ReturnType<typeof getQuotationContext>>["supabase"],
  companyId: string,
  leadId: string
) {
  const { data, error } = await supabase
    .from("leads")
    .select("id, name, phone, address, city, sales_stage")
    .eq("id", leadId)
    .eq("company_id", companyId)
    .maybeSingle();
  if (error) throw dbError(error, "Failed to load lead");
  if (!data) throw new Error("Lead not found");
  return data as {
    id: string;
    name: string;
    phone: string;
    address: string | null;
    city: string | null;
    sales_stage: string;
  };
}
