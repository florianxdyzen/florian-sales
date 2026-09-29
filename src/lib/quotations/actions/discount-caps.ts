"use server";

import { revalidatePath } from "next/cache";
import { getQuotationContext } from "@/lib/quotations/context";
import {
  DEFAULT_DISCOUNT_CAPS,
  parseDiscountCaps,
  type DiscountCaps,
} from "@/lib/quotations/discount-caps";

export async function getDiscountCaps(): Promise<DiscountCaps> {
  const { supabase, companyId } = await getQuotationContext();

  const settings = await supabase
    .from("quotation_company_settings")
    .select("max_discount_percent, max_discount_per_kw")
    .eq("company_id", companyId)
    .maybeSingle();

  if (!settings.error && settings.data) {
    return parseDiscountCaps(settings.data);
  }

  const company = await supabase
    .from("companies")
    .select("max_discount_percent, max_discount_per_kw")
    .eq("id", companyId)
    .maybeSingle();

  if (!company.error && company.data) {
    return parseDiscountCaps(company.data);
  }

  return { ...DEFAULT_DISCOUNT_CAPS };
}

export async function saveDiscountCaps(input: {
  maxDiscountPercent: number;
  maxDiscountPerKw: number;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { supabase, companyId, canEditQuotationTemplate, role } = await getQuotationContext();
  if (!canEditQuotationTemplate && role !== "admin") {
    return { ok: false, error: "Only Owner can change discount limits." };
  }

  const maxDiscountPercent = Math.max(0, Math.min(100, Number(input.maxDiscountPercent) || 0));
  const maxDiscountPerKw = Math.max(0, Number(input.maxDiscountPerKw) || 0);
  const now = new Date().toISOString();

  const settings = await supabase.from("quotation_company_settings").upsert(
    {
      company_id: companyId,
      max_discount_percent: maxDiscountPercent,
      max_discount_per_kw: maxDiscountPerKw,
      updated_at: now,
    },
    { onConflict: "company_id" }
  );
  if (settings.error && !/max_discount/i.test(settings.error.message ?? "")) {
    return { ok: false, error: settings.error.message };
  }
  if (settings.error) {
    return {
      ok: false,
      error: "Apply migration 049, then save discount limits again.",
    };
  }

  await supabase
    .from("companies")
    .update({
      max_discount_percent: maxDiscountPercent,
      max_discount_per_kw: maxDiscountPerKw,
      updated_at: now,
    })
    .eq("id", companyId);

  revalidatePath("/quotations");
  revalidatePath("/quotations/template");
  revalidatePath("/quotations/new");
  return { ok: true };
}
