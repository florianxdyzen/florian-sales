"use server";

import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAuthority } from "@/lib/auth";
import { logAuditEvent } from "@/lib/audit";
import { accountCodeDbError, parseAccountCodeInput } from "@/lib/domain/account-code";
import {
  IMPORT_FIELD_ALIASES,
  type ImportRowError,
  type LeadImportColumnMapping,
} from "@/lib/domain/lead-import";

const importRowSchema = z.object({
  name: z.string().min(2, "Name is required (at least 2 characters)"),
  phone: z.string().regex(/^\d{10}$/, "Phone must be a valid 10-digit mobile number"),
  address: z.string().optional(),
  city: z.string().optional(),
  requirement: z.string().optional(),
  account_code: z.string().optional(),
});

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, "_");
}

function cellToString(val: unknown): string {
  if (val == null) return "";
  if (typeof val === "number" && Number.isFinite(val)) {
    return Number.isInteger(val) ? String(val) : String(Math.round(val));
  }
  return String(val).trim();
}

function normalizeImportPhone(raw: string): string {
  let digits = raw.replace(/\D/g, "");
  if (digits.length === 12 && digits.startsWith("91")) {
    digits = digits.slice(2);
  } else if (digits.length === 11 && digits.startsWith("0")) {
    digits = digits.slice(1);
  }
  return digits;
}

function formatZodIssues(
  issues: z.ZodIssue[],
  preview: { name: string; phoneRaw: string; phone: string }
): string {
  const parts = issues.map((issue) => {
    const field = issue.path[0];
    if (field === "name") {
      if (!preview.name) return "Name is missing";
      return `Name "${preview.name}" is too short (need at least 2 characters)`;
    }
    if (field === "phone") {
      if (!preview.phoneRaw && !preview.phone) return "Phone is missing";
      const shown = preview.phoneRaw || preview.phone;
      return `Phone "${shown}" is invalid — need a 10-digit mobile (with or without +91)`;
    }
    return issue.message;
  });
  return parts.join("; ");
}

function getMappedCell(
  byExact: Record<string, string>,
  byNorm: Record<string, string>,
  mapping: LeadImportColumnMapping | null | undefined,
  field: keyof LeadImportColumnMapping
): string {
  const header = mapping?.[field]?.trim();
  if (header) {
    return byExact[header] ?? byNorm[normalizeHeader(header)] ?? "";
  }
  for (const alias of IMPORT_FIELD_ALIASES[field]) {
    if (byNorm[alias]) return byNorm[alias];
  }
  return "";
}

function parseRow(
  raw: Record<string, unknown>,
  mapping?: LeadImportColumnMapping | null
) {
  const byNorm: Record<string, string> = {};
  const byExact: Record<string, string> = {};
  for (const [key, val] of Object.entries(raw)) {
    const trimmed = key.trim();
    byExact[trimmed] = cellToString(val);
    byNorm[normalizeHeader(trimmed)] = cellToString(val);
  }

  const name = getMappedCell(byExact, byNorm, mapping, "name");
  const phoneRaw = getMappedCell(byExact, byNorm, mapping, "phone");
  const phone = normalizeImportPhone(phoneRaw);
  const address = getMappedCell(byExact, byNorm, mapping, "address");
  const city = getMappedCell(byExact, byNorm, mapping, "city");
  const requirement = getMappedCell(byExact, byNorm, mapping, "requirement");
  const account_code = getMappedCell(byExact, byNorm, mapping, "account_code");

  const parsed = importRowSchema.safeParse({
    name,
    phone,
    address,
    city,
    requirement,
    account_code,
  });

  if (!parsed.success) {
    return {
      success: false as const,
      errorMessage: formatZodIssues(parsed.error.issues, { name, phoneRaw, phone }),
      preview: { name, phone: phoneRaw || phone },
    };
  }

  return { success: true as const, data: parsed.data, preview: { name, phone } };
}

function sheetHeaders(rows: Record<string, unknown>[]): string[] {
  if (!rows.length) return [];
  return Object.keys(rows[0]).map((h) => h.trim()).filter(Boolean);
}

export async function previewImportHeaders(formData: FormData) {
  await requireAuthority("import_leads");
  const file = formData.get("file") as File | null;
  if (!file) throw new Error("No file provided");

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  if (!workbook.SheetNames.length) throw new Error("Excel file has no sheets");
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const headers = sheetHeaders(rows);
  if (!headers.length) {
    throw new Error("No header row found on the first sheet");
  }
  return {
    headers,
    sampleRowCount: rows.length,
    fileName: file.name,
  };
}

export async function getLeadImportProfile(): Promise<{
  mapping: LeadImportColumnMapping;
  sampleHeaders: string[];
  updatedAt: string | null;
} | null> {
  const profile = await requireAuthority("import_leads");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lead_import_profiles")
    .select("mapping, sample_headers, updated_at")
    .eq("company_id", profile.company_id)
    .maybeSingle();

  if (error) {
    if (/lead_import_profiles|does not exist/i.test(error.message)) {
      return null;
    }
    throw new Error(error.message);
  }
  if (!data) return null;
  return {
    mapping: (data.mapping ?? {}) as LeadImportColumnMapping,
    sampleHeaders: Array.isArray(data.sample_headers)
      ? (data.sample_headers as string[])
      : [],
    updatedAt: data.updated_at ?? null,
  };
}

export async function saveLeadImportProfile(input: {
  mapping: LeadImportColumnMapping;
  sampleHeaders?: string[];
}) {
  const profile = await requireAuthority("import_leads");
  const mapping: LeadImportColumnMapping = {
    name: input.mapping.name?.trim() || undefined,
    phone: input.mapping.phone?.trim() || undefined,
    address: input.mapping.address?.trim() || undefined,
    city: input.mapping.city?.trim() || undefined,
    requirement: input.mapping.requirement?.trim() || undefined,
  };
  if (!mapping.name || !mapping.phone) {
    throw new Error("Map at least Name and Phone columns before saving");
  }

  const supabase = await createClient();
  const payload = {
    company_id: profile.company_id,
    name: "Default",
    mapping,
    sample_headers: input.sampleHeaders ?? [],
    updated_by: profile.id,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("lead_import_profiles").upsert(payload, {
    onConflict: "company_id",
  });

  if (error) {
    if (/lead_import_profiles|does not exist/i.test(error.message)) {
      throw new Error(
        "Database is missing import profiles. Run supabase/migrations/025_lead_import_profiles.sql in the Supabase SQL editor."
      );
    }
    throw new Error(error.message);
  }

  revalidatePath("/lead-import");
  return { ok: true as const, mapping };
}

export async function importLeadsFromExcel(formData: FormData) {
  const profile = await requireAuthority("import_leads");
  const file = formData.get("file") as File | null;
  if (!file) throw new Error("No file provided");

  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  if (!workbook.SheetNames.length) {
    throw new Error("Excel file has no sheets");
  }
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet);

  if (rows.length === 0) {
    throw new Error(
      "No data rows found. Check that the first sheet has a header row and at least one lead."
    );
  }

  const saved = await getLeadImportProfile().catch(() => null);
  const mapping = saved?.mapping ?? null;

  const admin = createAdminClient();

  const { data: batch, error: batchError } = await admin
    .from("lead_import_batches")
    .insert({
      company_id: profile.company_id,
      file_name: file.name,
      imported_by: profile.id,
      total_rows: rows.length,
    })
    .select()
    .single();

  if (batchError) throw new Error(batchError.message);

  let successRows = 0;
  let errorRows = 0;
  const errors: ImportRowError[] = [];
  const createdLeadIds: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const rowNumber = i + 2;
    const parsed = parseRow(rows[i], mapping);
    if (!parsed.success) {
      errorRows++;
      errors.push({
        rowNumber,
        message: parsed.errorMessage,
        name: parsed.preview.name || undefined,
        phone: parsed.preview.phone || undefined,
      });
      await admin.from("lead_import_rows").insert({
        batch_id: batch.id,
        company_id: profile.company_id,
        row_number: rowNumber,
        raw_data: rows[i],
        error_message: parsed.errorMessage,
      });
      continue;
    }

    const row = parsed.data;
    const codeParsed = parseAccountCodeInput(row.account_code);
    if (!codeParsed.ok) {
      errorRows++;
      errors.push({
        rowNumber,
        message: codeParsed.error,
        name: row.name,
        phone: row.phone,
      });
      await admin.from("lead_import_rows").insert({
        batch_id: batch.id,
        company_id: profile.company_id,
        row_number: rowNumber,
        raw_data: rows[i],
        error_message: codeParsed.error,
      });
      continue;
    }

    const { data: lead, error: leadError } = await admin
      .from("leads")
      .insert({
        company_id: profile.company_id,
        name: row.name,
        phone: row.phone,
        address: row.address || null,
        city: row.city || null,
        requirement_notes: row.requirement || null,
        account_code: codeParsed.code,
        source: "excel_import",
        temperature: "cold",
        created_by: profile.id,
        assigned_telecaller_id: null,
        assigned_to: null,
      })
      .select("id")
      .single();

    if (leadError) {
      errorRows++;
      errors.push({
        rowNumber,
        message: accountCodeDbError(leadError.message) ?? leadError.message,
        name: row.name,
        phone: row.phone,
      });
      await admin.from("lead_import_rows").insert({
        batch_id: batch.id,
        company_id: profile.company_id,
        row_number: rowNumber,
        raw_data: rows[i],
        error_message: leadError.message,
      });
      continue;
    }

    successRows++;
    createdLeadIds.push(lead.id);
    await admin.from("lead_import_rows").insert({
      batch_id: batch.id,
      company_id: profile.company_id,
      row_number: rowNumber,
      lead_id: lead.id,
      raw_data: rows[i],
    });

    await logAuditEvent({
      companyId: profile.company_id,
      leadId: lead.id,
      actorId: profile.id,
      eventType: "lead_imported",
      metadata: { batchId: batch.id, rowNumber, mappingUsed: Boolean(mapping?.name) },
    });
  }

  await admin
    .from("lead_import_batches")
    .update({ success_rows: successRows, error_rows: errorRows })
    .eq("id", batch.id);

  revalidatePath("/lead-import");
  revalidatePath("/pipeline");

  return {
    batchId: batch.id,
    totalRows: rows.length,
    successRows,
    errorRows,
    errors,
    leadIds: createdLeadIds,
  };
}

export async function getUndistributedLeads() {
  const profile = await requireAuthority("distribute_leads");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("leads")
    .select("id, name, account_code, phone, city, address, requirement_notes, created_at, source")
    .eq("company_id", profile.company_id)
    .or("assigned_telecaller_id.is.null,assigned_to.is.null")
    .neq("sales_stage", "lost")
    .order("created_at", { ascending: false });

  if (error) throw error;
  return data ?? [];
}

export async function getSalesEmployees() {
  const profile = await requireAuthority("distribute_leads");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, name, phone, role")
    .eq("company_id", profile.company_id)
    .eq("is_active", true)
    .order("name");

  if (error) throw error;
  return data ?? [];
}

export async function distributeLeads(leadIds: string[], assigneeId: string) {
  const profile = await requireAuthority("distribute_leads");
  const admin = createAdminClient();

  if (!leadIds.length) throw new Error("No leads selected");

  const { data: assignee } = await admin
    .from("profiles")
    .select("id, name")
    .eq("id", assigneeId)
    .eq("company_id", profile.company_id)
    .eq("is_active", true)
    .maybeSingle();

  if (!assignee) throw new Error("Selected assignee was not found");

  const { data, error } = await admin
    .from("leads")
    .update({ assigned_telecaller_id: assigneeId })
    .in("id", leadIds)
    .eq("company_id", profile.company_id)
    .select("id");

  if (error) throw new Error(error.message);

  for (const lead of data ?? []) {
    await logAuditEvent({
      companyId: profile.company_id,
      leadId: lead.id,
      actorId: profile.id,
      eventType: "lead_distributed",
      metadata: { assignedTelecallerId: assigneeId, toName: assignee.name },
    });
  }

  revalidatePath("/lead-import");
  revalidatePath("/pipeline");
  return { count: data?.length ?? 0 };
}

export async function distributeLead(leadId: string, salesEmployeeId: string) {
  return distributeLeads([leadId], salesEmployeeId);
}

export async function getImportBatches() {
  const profile = await requireAuthority("import_leads");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("lead_import_batches")
    .select("*, importer:profiles!lead_import_batches_imported_by_fkey(name)")
    .eq("company_id", profile.company_id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) throw error;
  return data ?? [];
}

export async function getImportBatchErrors(batchId: string): Promise<ImportRowError[]> {
  const profile = await requireAuthority("import_leads");
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("lead_import_rows")
    .select("row_number, error_message, raw_data")
    .eq("batch_id", batchId)
    .eq("company_id", profile.company_id)
    .not("error_message", "is", null)
    .order("row_number", { ascending: true })
    .limit(100);

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => {
    const raw = (row.raw_data ?? {}) as Record<string, unknown>;
    const name =
      cellToString(raw.name ?? raw.Name ?? raw["Customer Name"] ?? raw.customer_name) ||
      undefined;
    const phone =
      cellToString(raw.phone ?? raw.Phone ?? raw.mobile ?? raw.Mobile) || undefined;
    return {
      rowNumber: row.row_number,
      message: row.error_message ?? "Unknown error",
      name,
      phone,
    };
  });
}

export async function startLeadImportBatch(input: { fileName: string; totalRows: number }) {
  const profile = await requireAuthority("import_leads");
  if (input.totalRows < 1) throw new Error("No data rows in the file");
  if (input.totalRows > 20000) throw new Error("Import is capped at 20,000 rows per file");

  const admin = createAdminClient();
  const { data: batch, error } = await admin
    .from("lead_import_batches")
    .insert({
      company_id: profile.company_id,
      file_name: input.fileName.slice(0, 255),
      imported_by: profile.id,
      total_rows: input.totalRows,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { batchId: batch.id };
}

export async function importLeadRowsChunk(input: {
  batchId: string;
  rows: Record<string, unknown>[];
  startRowNumber: number;
}) {
  const profile = await requireAuthority("import_leads");
  if (input.rows.length > 200) throw new Error("Send at most 200 rows per chunk");

  const admin = createAdminClient();
  const { data: batch, error: batchError } = await admin
    .from("lead_import_batches")
    .select("id, company_id, success_rows, error_rows")
    .eq("id", input.batchId)
    .eq("company_id", profile.company_id)
    .single();
  if (batchError || !batch) throw new Error("Import batch was not found");

  const saved = await getLeadImportProfile().catch(() => null);
  const mapping = saved?.mapping ?? null;

  let successRows = 0;
  let errorRows = 0;
  const errors: ImportRowError[] = [];

  for (let i = 0; i < input.rows.length; i++) {
    const rowNumber = input.startRowNumber + i;
    const raw = input.rows[i];
    const parsed = parseRow(raw, mapping);
    if (!parsed.success) {
      errorRows += 1;
      errors.push({
        rowNumber,
        message: parsed.errorMessage,
        name: parsed.preview.name || undefined,
        phone: parsed.preview.phone || undefined,
      });
      await admin.from("lead_import_rows").insert({
        batch_id: batch.id,
        company_id: profile.company_id,
        row_number: rowNumber,
        raw_data: raw,
        error_message: parsed.errorMessage,
      });
      continue;
    }

    const row = parsed.data;
    const codeParsed = parseAccountCodeInput(row.account_code);
    if (!codeParsed.ok) {
      errorRows += 1;
      errors.push({
        rowNumber,
        message: codeParsed.error,
        name: row.name,
        phone: row.phone,
      });
      await admin.from("lead_import_rows").insert({
        batch_id: batch.id,
        company_id: profile.company_id,
        row_number: rowNumber,
        raw_data: raw,
        error_message: codeParsed.error,
      });
      continue;
    }

    const { data: lead, error: leadError } = await admin
      .from("leads")
      .insert({
        company_id: profile.company_id,
        name: row.name,
        phone: row.phone,
        address: row.address || null,
        city: row.city || null,
        requirement_notes: row.requirement || null,
        account_code: codeParsed.code,
        source: "excel_import",
        temperature: "cold",
        created_by: profile.id,
        assigned_telecaller_id: null,
        assigned_to: null,
      })
      .select("id")
      .single();

    if (leadError) {
      const message = accountCodeDbError(leadError.message) ?? leadError.message;
      errorRows += 1;
      errors.push({ rowNumber, message, name: row.name, phone: row.phone });
      await admin.from("lead_import_rows").insert({
        batch_id: batch.id,
        company_id: profile.company_id,
        row_number: rowNumber,
        raw_data: raw,
        error_message: message,
      });
      continue;
    }

    successRows += 1;
    await admin.from("lead_import_rows").insert({
      batch_id: batch.id,
      company_id: profile.company_id,
      row_number: rowNumber,
      lead_id: lead.id,
      raw_data: raw,
    });
  }

  await admin
    .from("lead_import_batches")
    .update({
      success_rows: (batch.success_rows ?? 0) + successRows,
      error_rows: (batch.error_rows ?? 0) + errorRows,
    })
    .eq("id", batch.id);

  revalidatePath("/lead-import");
  revalidatePath("/pipeline");

  return {
    successRows,
    errorRows,
    errors: errors.slice(0, 40),
    done: input.startRowNumber - 2 + input.rows.length,
  };
}

export async function finishLeadImportBatch() {
  revalidatePath("/lead-import");
  revalidatePath("/pipeline");
  return { ok: true as const };
}
