"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { hasAuthority, requireAuth } from "@/lib/auth";
import { getLead } from "@/actions/leads";
import {
  TRADE_ATTACHMENT_KINDS,
  TRADE_DIRECTIONS,
  TRADE_FAMILIES,
  TRADE_SKU_DIRECTIONS,
  TRADE_STATUSES,
  summarizeTradeEntries,
  tradeMissingTableError,
  type TradeAttachmentKind,
  type TradeDirection,
  type TradeFamily,
  type TradeSkuDirection,
  type TradeStatus,
  type TradeSummary,
} from "@/lib/domain/trade-ledger";

export type TradeSku = {
  id: string;
  direction: TradeSkuDirection;
  name: string;
  family: TradeFamily;
  uom: string;
  is_active: boolean;
  sort_order: number;
};

export type TradeAttachment = {
  id: string;
  kind: TradeAttachmentKind;
  title: string | null;
  file_url: string;
  created_at: string;
};

export type TradeEntry = {
  id: string;
  lead_id: string;
  direction: TradeDirection;
  occurred_on: string;
  sku_id: string | null;
  sku_or_description: string;
  family: TradeFamily;
  qty: number;
  uom: string;
  amount_inr: number | null;
  external_invoice_no: string | null;
  gr_no: string | null;
  vehicle_no: string | null;
  transporter_name: string | null;
  status: TradeStatus;
  dispatched_on: string | null;
  received_on: string | null;
  notes: string | null;
  created_at: string;
  attachments: TradeAttachment[];
};

export type TradeAccount = {
  lead: {
    id: string;
    name: string;
    account_code: string | null;
    phone: string;
    city: string | null;
  };
  entries: TradeEntry[];
  summary: TradeSummary;
  skus: TradeSku[];
  canLogOutward: boolean;
  canLogInward: boolean;
  canManageSkus: boolean;
};

function wrapDb(message: string): never {
  throw new Error(tradeMissingTableError(message) ?? message);
}

function asNum(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : 0;
}

async function requireTradeView() {
  const profile = await requireAuth();
  const allowed =
    profile.role === "admin" ||
    profile.role === "sales_manager" ||
    (await hasAuthority(profile.id, "view_trade_ledger")) ||
    (await hasAuthority(profile.id, "full_access"));
  if (!allowed) throw new Error("Missing authority to view the trade ledger");
  return profile;
}

async function canLog(profile: { id: string; role: string }, direction: TradeDirection) {
  if (profile.role === "admin" || profile.role === "sales_manager") return true;
  if (await hasAuthority(profile.id, "full_access")) return true;
  if (direction === "outward") return hasAuthority(profile.id, "log_trade_outward");
  return hasAuthority(profile.id, "log_trade_inward");
}

async function canManageSkus(profile: { id: string; role: string }) {
  return (
    profile.role === "admin" ||
    (await hasAuthority(profile.id, "manage_trade_skus")) ||
    (await hasAuthority(profile.id, "full_access"))
  );
}

function revalidateAccount(leadId: string) {
  revalidatePath(`/accounts/${leadId}`);
  revalidatePath("/customers");
  revalidatePath("/catalog");
}

export async function listTradeSkus(opts?: { includeInactive?: boolean }): Promise<TradeSku[]> {
  const profile = await requireTradeView();
  const supabase = await createClient();
  let q = supabase
    .from("trade_skus")
    .select("id, direction, name, family, uom, is_active, sort_order")
    .eq("company_id", profile.company_id)
    .order("sort_order")
    .order("name");
  if (!opts?.includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) wrapDb(error.message);
  return (data ?? []) as TradeSku[];
}

const skuSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(160),
  direction: z.enum(TRADE_SKU_DIRECTIONS),
  family: z.enum(TRADE_FAMILIES),
  uom: z.string().trim().min(1).max(24).default("unit"),
  is_active: z.boolean().optional(),
  sort_order: z.coerce.number().int().min(0).max(9999).optional(),
});

export async function upsertTradeSku(input: z.infer<typeof skuSchema>) {
  const profile = await requireAuth();
  if (!(await canManageSkus(profile))) throw new Error("Only Admin can manage trade SKUs");
  const parsed = skuSchema.parse(input);
  const supabase = await createClient();
  const row = {
    company_id: profile.company_id,
    name: parsed.name,
    direction: parsed.direction,
    family: parsed.family,
    uom: parsed.uom,
    is_active: parsed.is_active ?? true,
    sort_order: parsed.sort_order ?? 100,
  };
  const q = parsed.id
    ? supabase.from("trade_skus").update(row).eq("id", parsed.id).eq("company_id", profile.company_id)
    : supabase.from("trade_skus").insert(row);
  const { error } = await q;
  if (error) wrapDb(error.message);
  revalidatePath("/catalog");
}

export async function setTradeSkuActive(id: string, isActive: boolean) {
  const profile = await requireAuth();
  if (!(await canManageSkus(profile))) throw new Error("Only Admin can manage trade SKUs");
  const supabase = await createClient();
  const { error } = await supabase
    .from("trade_skus")
    .update({ is_active: isActive })
    .eq("id", id)
    .eq("company_id", profile.company_id);
  if (error) wrapDb(error.message);
  revalidatePath("/catalog");
}

const attachSchema = z.object({
  kind: z.enum(TRADE_ATTACHMENT_KINDS),
  file_url: z.string().min(8).max(2000),
  title: z.string().trim().max(160).optional().nullable(),
});

const entrySchema = z.object({
  leadId: z.string().uuid(),
  direction: z.enum(TRADE_DIRECTIONS),
  occurredOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  skuId: z.string().uuid().optional().nullable(),
  description: z.string().trim().min(1).max(240),
  family: z.enum(TRADE_FAMILIES).optional(),
  qty: z.coerce.number().positive().optional().default(1),
  uom: z.string().trim().min(1).max(24).default("unit"),
  amountInr: z.coerce.number().nonnegative(),
  invoiceNo: z.string().trim().max(80).optional().nullable(),
  grNo: z.string().trim().max(80).optional().nullable(),
  vehicleNo: z.string().trim().max(80).optional().nullable(),
  transporterName: z.string().trim().max(160).optional().nullable(),
  saveNamedSku: z.boolean().optional(),
  status: z.enum(TRADE_STATUSES).optional(),
  dispatchedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  receivedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  attachments: z.array(attachSchema).max(8).optional(),
});

export async function createTradeEntry(input: z.infer<typeof entrySchema>) {
  const profile = await requireAuth();
  const parsed = entrySchema.parse(input);
  if (!(await canLog(profile, parsed.direction))) {
    throw new Error(
      parsed.direction === "outward"
        ? "Missing authority to log outward sales"
        : "Missing authority to log inward receipts"
    );
  }

  await getLead(parsed.leadId);

  const supabase = await createClient();
  let family = parsed.family ?? "other";
  let description = parsed.description;
  let uom = parsed.uom;
  if (parsed.skuId) {
    const { data: sku, error: skuErr } = await supabase
      .from("trade_skus")
      .select("name, family, uom, direction")
      .eq("id", parsed.skuId)
      .eq("company_id", profile.company_id)
      .maybeSingle();
    if (skuErr) wrapDb(skuErr.message);
    if (!sku) throw new Error("SKU not found");
    if (sku.direction !== "both" && sku.direction !== parsed.direction) {
      throw new Error("That SKU is not allowed on this direction");
    }
    family = sku.family as TradeFamily;
    description = parsed.description || sku.name;
    uom = parsed.uom || sku.uom;
  } else if (parsed.saveNamedSku && description.trim()) {
    const { data: created, error: skuCreateErr } = await supabase
      .from("trade_skus")
      .insert({
        company_id: profile.company_id,
        name: description.trim(),
        direction: parsed.direction,
        family,
        uom,
        is_active: true,
        sort_order: 100,
      })
      .select("id")
      .maybeSingle();
    if (skuCreateErr && !/duplicate|unique/i.test(skuCreateErr.message)) wrapDb(skuCreateErr.message);
    if (created?.id) parsed.skuId = created.id;
  }

  const status =
    parsed.status ??
    (parsed.direction === "outward" && parsed.dispatchedOn
      ? "dispatched"
      : parsed.direction === "inward" && parsed.receivedOn
        ? "received"
        : "logged");

  const { data: entry, error } = await supabase
    .from("trade_entries")
    .insert({
      company_id: profile.company_id,
      lead_id: parsed.leadId,
      direction: parsed.direction,
      occurred_on: parsed.occurredOn,
      sku_id: parsed.skuId || null,
      sku_or_description: description,
      family,
      qty: parsed.qty ?? 1,
      uom,
      amount_inr: parsed.amountInr,
      external_invoice_no: parsed.invoiceNo || null,
      gr_no: parsed.grNo || null,
      vehicle_no: parsed.vehicleNo || null,
      transporter_name: parsed.transporterName || null,
      status,
      dispatched_on: parsed.dispatchedOn || null,
      received_on: parsed.receivedOn || null,
      notes: parsed.notes || null,
      created_by: profile.id,
    })
    .select("id")
    .single();
  if (error) wrapDb(error.message);

  const files = parsed.attachments ?? [];
  if (files.length && entry?.id) {
    const { error: attErr } = await supabase.from("trade_entry_attachments").insert(
      files.map((f) => ({
        company_id: profile.company_id,
        entry_id: entry.id,
        kind: f.kind,
        title: f.title || null,
        file_url: f.file_url,
        uploaded_by: profile.id,
      }))
    );
    if (attErr) wrapDb(attErr.message);
  }

  revalidateAccount(parsed.leadId);
  return { id: entry.id };
}

export async function updateTradeEntryStatus(input: {
  entryId: string;
  status: TradeStatus;
  dispatchedOn?: string | null;
  receivedOn?: string | null;
}) {
  const profile = await requireAuth();
  const supabase = await createClient();
  const { data: existing, error: findErr } = await supabase
    .from("trade_entries")
    .select("id, lead_id, direction")
    .eq("id", input.entryId)
    .eq("company_id", profile.company_id)
    .maybeSingle();
  if (findErr) wrapDb(findErr.message);
  if (!existing) throw new Error("Entry not found");
  if (!(await canLog(profile, existing.direction as TradeDirection))) {
    throw new Error("Missing authority to update this line");
  }

  const { error } = await supabase
    .from("trade_entries")
    .update({
      status: input.status,
      dispatched_on: input.dispatchedOn ?? undefined,
      received_on: input.receivedOn ?? undefined,
    })
    .eq("id", input.entryId)
    .eq("company_id", profile.company_id);
  if (error) wrapDb(error.message);
  revalidateAccount(existing.lead_id);
}

export async function deleteTradeEntry(entryId: string) {
  const profile = await requireAuth();
  if (!(await canManageSkus(profile))) throw new Error("Only Admin can delete trade lines");
  const supabase = await createClient();
  const { data: existing, error: findErr } = await supabase
    .from("trade_entries")
    .select("lead_id")
    .eq("id", entryId)
    .eq("company_id", profile.company_id)
    .maybeSingle();
  if (findErr) wrapDb(findErr.message);
  const { error } = await supabase
    .from("trade_entries")
    .delete()
    .eq("id", entryId)
    .eq("company_id", profile.company_id);
  if (error) wrapDb(error.message);
  if (existing?.lead_id) revalidateAccount(existing.lead_id);
}

export async function getTradeAccount(leadId: string): Promise<TradeAccount> {
  const profile = await requireTradeView();
  const lead = await getLead(leadId);
  const supabase = await createClient();

  const [{ data: rows, error }, skus] = await Promise.all([
    supabase
      .from("trade_entries")
      .select(
        "id, lead_id, direction, occurred_on, sku_id, sku_or_description, family, qty, uom, amount_inr, external_invoice_no, gr_no, vehicle_no, transporter_name, status, dispatched_on, received_on, notes, created_at, attachments:trade_entry_attachments(id, kind, title, file_url, created_at)"
      )
      .eq("company_id", profile.company_id)
      .eq("lead_id", leadId)
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false }),
    listTradeSkus(),
  ]);
  if (error) wrapDb(error.message);

  const entries: TradeEntry[] = (rows ?? []).map((row) => ({
    id: row.id,
    lead_id: row.lead_id,
    direction: row.direction as TradeDirection,
    occurred_on: row.occurred_on,
    sku_id: row.sku_id,
    sku_or_description: row.sku_or_description,
    family: row.family as TradeFamily,
    qty: asNum(row.qty),
    uom: row.uom,
    amount_inr: row.amount_inr == null ? null : asNum(row.amount_inr),
    external_invoice_no: row.external_invoice_no,
    gr_no: row.gr_no,
    vehicle_no: row.vehicle_no ?? null,
    transporter_name: row.transporter_name ?? null,
    status: row.status as TradeStatus,
    dispatched_on: row.dispatched_on,
    received_on: row.received_on,
    notes: row.notes,
    created_at: row.created_at,
    attachments: (row.attachments ?? []) as TradeAttachment[],
  }));

  return {
    lead: {
      id: lead.id,
      name: lead.name,
      account_code: lead.account_code ?? null,
      phone: lead.phone,
      city: lead.city,
    },
    entries,
    summary: summarizeTradeEntries(entries, new Date(), {
      nextFollowupAt: lead.next_followup_at,
    }),
    skus,
    canLogOutward: await canLog(profile, "outward"),
    canLogInward: await canLog(profile, "inward"),
    canManageSkus: await canManageSkus(profile),
  };
}
