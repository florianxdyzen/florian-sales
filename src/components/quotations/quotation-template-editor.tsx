"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import {
  saveQuotationTemplate,
  uploadTemplateAsset,
  replacePreviousWorkPhoto,
  type QuotationCompanyBankSettings,
  type TemplateAssetKind,
} from "@/lib/quotations/actions/template";
import { QuotationDocumentPreview } from "@/components/quotations/quotation-document-preview";
import {
  DEFAULT_SOLAR_TEMPLATE,
  sampleQuotationForPreview,
  resolvePreviousWorkPhotos,
  type SolarProposalTemplate,
} from "@/lib/quotations/quotation-template";
import type { CompanyInfo } from "@/lib/quotations/solar-proposal-calculations";
import { BRAND } from "@/lib/quotations/brand";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const PAGES = [
  { id: "page1", label: "Page 1 · Cover" },
  { id: "page2", label: "Page 2 · Offer" },
  { id: "page3", label: "Page 3 · System" },
  { id: "page4", label: "Page 4 · Scope & savings" },
  { id: "page5", label: "Page 5 · Thank you" },
  { id: "calculations", label: "Calculations" },
] as const;

type PageId = (typeof PAGES)[number]["id"];

type Props = {
  initial: SolarProposalTemplate;
  company: CompanyInfo;
  bankDefaults: QuotationCompanyBankSettings;
  canEdit: boolean;
};

function linesToText(lines: string[]) {
  return lines.join("\n");
}

function textToLines(text: string) {
  return text
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function QuotationTemplateEditor({ initial, company, bankDefaults, canEdit }: Props) {
  const [form, setForm] = useState<SolarProposalTemplate>(initial);
  const [bank, setBank] = useState<QuotationCompanyBankSettings>(bankDefaults);
  const [page, setPage] = useState<PageId>("page1");
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const previewCompany = useMemo<CompanyInfo>(
    () => ({
      ...company,
      name: bank.fromName || company.name,
      phone: bank.fromPhone || company.phone,
      email: bank.fromEmail || company.email,
      address: form.companyAddress || company.address,
      bankAccountName: bank.bankAccountName,
      bankName: bank.bankName,
      accountNumber: bank.accountNumber,
      ifscCode: bank.ifscCode,
      branch: bank.branch,
    }),
    [bank, company, form.companyAddress]
  );

  const previewData = useMemo(() => sampleQuotationForPreview(form), [form]);

  function setField<K extends keyof SolarProposalTemplate>(key: K, value: SolarProposalTemplate[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setMessage("");
    setError("");
  }

  function setBankField<K extends keyof QuotationCompanyBankSettings>(
    key: K,
    value: QuotationCompanyBankSettings[K]
  ) {
    setBank((prev) => ({ ...prev, [key]: value }));
    setMessage("");
    setError("");
  }

  function save() {
    if (!canEdit) return;
    start(async () => {
      try {
        await saveQuotationTemplate(form, bank);
        setMessage("Template saved. New quotations snapshot this content; issued quotes keep theirs.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save template");
      }
    });
  }

  function uploadAsset(kind: TemplateAssetKind, files: FileList | null) {
    if (!canEdit || !files?.length) return;
    const file = files[0];
    start(async () => {
      try {
        const fd = new FormData();
        fd.set("file", file);
        fd.set("kind", kind);
        const result = await uploadTemplateAsset(fd);
        setForm((prev) => ({
          ...prev,
          [result.field]: result.url,
        }));
        setMessage("Image uploaded and saved to the template.");
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      }
    });
  }

  function uploadPreviousWork(slot: number, files: FileList | null) {
    if (!canEdit || !files?.length) return;
    const file = files[0];
    start(async () => {
      try {
        const fd = new FormData();
        fd.set("file", file);
        fd.set("slot", String(slot));
        const photos = await replacePreviousWorkPhoto(fd);
        setForm((prev) => ({ ...prev, previousWorkPhotos: photos }));
        setMessage("Previous work photo uploaded and saved to the template.");
        setError("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      }
    });
  }

  return (
    <div className="space-y-6">
      <EditorNotice message={message} error={error} onDismiss={() => { setMessage(""); setError(""); }} />

      <div className="grid gap-6 xl:grid-cols-[minmax(340px,420px)_1fr]">
        <div className="flex max-h-[calc(100vh-8rem)] flex-col gap-4 rounded-xl border border-[var(--border)] bg-white p-5 shadow-sm">
          <div className="shrink-0">
            <h2 className="text-sm font-semibold text-[var(--text-dark)]">Solar proposal template</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Edit each page of the 5-page solar quotation. Customer name, system size, and line items
              still come from each quotation.
            </p>
          </div>

          <div className="flex flex-wrap gap-1.5 border-b border-[var(--border-light)] pb-3">
            {PAGES.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPage(p.id)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition ${
                  page === p.id
                    ? "bg-[var(--primary)] text-white"
                    : "bg-[var(--bg)] text-[var(--text-muted)] hover:bg-[var(--primary-light)]"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto pr-1">
          {page === "page1" && (
            <div className="space-y-3">
              <PageHint>
                Cover shows customer details, proposal number, and validity from each quotation. System
                size (kW) is calculated from catalogue items.
              </PageHint>
              <Field
                label="Cover title"
                value={form.coverTitle}
                onChange={(v) => setField("coverTitle", v)}
                disabled={!canEdit}
                placeholder="SOLAR PROPOSAL"
              />
              <TemplateImageField
                label="Cover image"
                value={form.coverImageUrl}
                onChange={(v) => setField("coverImageUrl", v)}
                onUpload={(files) => uploadAsset("cover", files)}
                disabled={!canEdit}
                pending={pending}
                previewClass="h-24 w-full object-cover"
              />
              <div className="grid grid-cols-2 gap-2">
                <ColorField
                  label="Primary colour"
                  value={form.primaryColor}
                  onChange={(v) => setField("primaryColor", v)}
                  disabled={!canEdit}
                />
                <ColorField
                  label="Accent colour"
                  value={form.accentColor}
                  onChange={(v) => setField("accentColor", v)}
                  disabled={!canEdit}
                />
              </div>
              <Field
                label="Footer note"
                value={form.footerText}
                onChange={(v) => setField("footerText", v)}
                disabled={!canEdit}
              />
              <Field
                label="Prepared by (default)"
                value={form.preparedBy}
                onChange={(v) => setField("preparedBy", v)}
                disabled={!canEdit}
                placeholder={company.name}
              />
              <Field
                label="Prepared by phone"
                value={form.preparedByPhone}
                onChange={(v) => setField("preparedByPhone", v)}
                disabled={!canEdit}
              />
            </div>
          )}

          {page === "page2" && (
            <div className="space-y-3">
              <PageHint>
                Page kicker uses the quotation project type (Residential / Commercial). Pricing rows are
                built from quotation line items.
              </PageHint>
              <Field
                label="Page title"
                value={form.offerPageTitle}
                onChange={(v) => setField("offerPageTitle", v)}
                disabled={!canEdit}
              />
              <Field
                label="Intro line"
                value={form.offerLeadText}
                onChange={(v) => setField("offerLeadText", v)}
                disabled={!canEdit}
                placeholder="Use {capacity} for system size"
              />
              <Field
                label="Payment details intro"
                value={form.paymentDetailsIntro}
                onChange={(v) => setField("paymentDetailsIntro", v)}
                disabled={!canEdit}
              />
              <TextField
                label="Loan payment note (one line per point)"
                rows={4}
                value={form.loanPaymentNote}
                onChange={(v) => setField("loanPaymentNote", v)}
                disabled={!canEdit}
              />
              <hr className="border-[var(--border-light)]" />
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Bank &amp; payment QR
              </p>
              <Field
                label="Bank account name"
                value={bank.bankAccountName ?? ""}
                onChange={(v) => setBankField("bankAccountName", v)}
                disabled={!canEdit}
              />
              <Field
                label="Bank name"
                value={bank.bankName ?? ""}
                onChange={(v) => setBankField("bankName", v)}
                disabled={!canEdit}
              />
              <Field
                label="Account number"
                value={bank.accountNumber ?? ""}
                onChange={(v) => setBankField("accountNumber", v)}
                disabled={!canEdit}
              />
              <div className="grid grid-cols-2 gap-2">
                <Field
                  label="IFSC"
                  value={bank.ifscCode ?? ""}
                  onChange={(v) => setBankField("ifscCode", v)}
                  disabled={!canEdit}
                />
                <Field
                  label="Account type"
                  value={form.bankAccountType}
                  onChange={(v) => setField("bankAccountType", v)}
                  disabled={!canEdit}
                />
              </div>
              <Field
                label="Branch"
                value={bank.branch ?? ""}
                onChange={(v) => setBankField("branch", v)}
                disabled={!canEdit}
              />
              <TemplateImageField
                label="Payment QR code"
                value={form.qrCodeUrl}
                onChange={(v) => setField("qrCodeUrl", v)}
                onUpload={(files) => uploadAsset("qr", files)}
                disabled={!canEdit}
                pending={pending}
                placeholder={BRAND.logo.paymentQr}
                previewClass="h-28 w-28 object-contain bg-white p-1"
                squarePreview
              />
              <div className="grid grid-cols-2 gap-2">
                <NumField
                  label="Advance %"
                  value={form.advancePct}
                  onChange={(v) => setField("advancePct", v)}
                  disabled={!canEdit}
                />
                <NumField
                  label="Material %"
                  value={form.materialPct}
                  onChange={(v) => setField("materialPct", v)}
                  disabled={!canEdit}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <NumField
                  label="Install %"
                  value={form.installPct}
                  onChange={(v) => setField("installPct", v)}
                  disabled={!canEdit}
                />
                <NumField
                  label="Meter %"
                  value={form.meterPct}
                  onChange={(v) => setField("meterPct", v)}
                  disabled={!canEdit}
                />
              </div>
            </div>
          )}

          {page === "page3" && (
            <div className="space-y-3">
              <PageHint>
                Panel and inverter rows use items from the quotation. Defaults below fill structure,
                cables, and warranty when not overridden by line items.
              </PageHint>
              <Field
                label="Page kicker"
                value={form.bomPageKicker}
                onChange={(v) => setField("bomPageKicker", v)}
                disabled={!canEdit}
              />
              <Field
                label="Page title"
                value={form.bomPageTitle}
                onChange={(v) => setField("bomPageTitle", v)}
                disabled={!canEdit}
              />
              <Field
                label="Structure material"
                value={form.structureDesc}
                onChange={(v) => setField("structureDesc", v)}
                disabled={!canEdit}
              />
              <Field
                label="Earthing cable brand"
                value={form.cableBrand}
                onChange={(v) => setField("cableBrand", v)}
                disabled={!canEdit}
              />
              <div className="grid grid-cols-2 gap-2">
                <Field
                  label="AC cable"
                  value={form.acCable}
                  onChange={(v) => setField("acCable", v)}
                  disabled={!canEdit}
                />
                <Field
                  label="DC cable"
                  value={form.dcCable}
                  onChange={(v) => setField("dcCable", v)}
                  disabled={!canEdit}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field
                  label="ACDB"
                  value={form.acdb}
                  onChange={(v) => setField("acdb", v)}
                  disabled={!canEdit}
                />
                <Field
                  label="DCDB"
                  value={form.dcdb}
                  onChange={(v) => setField("dcdb", v)}
                  disabled={!canEdit}
                />
              </div>
              <Field
                label="Net meter"
                value={form.netMeter}
                onChange={(v) => setField("netMeter", v)}
                disabled={!canEdit}
              />
              <div className="grid grid-cols-2 gap-2">
                <NumField
                  label="Earth pits"
                  value={form.earthPits}
                  onChange={(v) => setField("earthPits", v)}
                  disabled={!canEdit}
                />
                <NumField
                  label="Lightning arrestors"
                  value={form.lightningArrestor}
                  onChange={(v) => setField("lightningArrestor", v)}
                  disabled={!canEdit}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field
                  label="Panel warranty"
                  value={form.panelWarranty}
                  onChange={(v) => setField("panelWarranty", v)}
                  disabled={!canEdit}
                />
                <Field
                  label="Panel performance warranty"
                  value={form.panelPerfWarranty}
                  onChange={(v) => setField("panelPerfWarranty", v)}
                  disabled={!canEdit}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field
                  label="Inverter warranty"
                  value={form.inverterWarranty}
                  onChange={(v) => setField("inverterWarranty", v)}
                  disabled={!canEdit}
                />
                <Field
                  label="BOS warranty"
                  value={form.bosWarranty}
                  onChange={(v) => setField("bosWarranty", v)}
                  disabled={!canEdit}
                />
              </div>
            </div>
          )}

          {page === "page4" && (
            <div className="space-y-3">
              <PageHint>
                Savings KPIs and the 15-year chart use tariff, yield, and escalation from Calculations.
                Scope lists use one line per bullet.
              </PageHint>
              <Field
                label="Page kicker"
                value={form.coverHeroSub}
                onChange={(v) => setField("coverHeroSub", v)}
                disabled={!canEdit}
              />
              <Field
                label="Page title"
                value={form.scopePageTitle}
                onChange={(v) => setField("scopePageTitle", v)}
                disabled={!canEdit}
              />
              <TextField
                label="Savings band blurb"
                rows={2}
                value={form.savingsBlurb}
                onChange={(v) => setField("savingsBlurb", v)}
                disabled={!canEdit}
              />
              <TemplateImageField
                label="Savings section image"
                value={form.systemImageUrl}
                onChange={(v) => setField("systemImageUrl", v)}
                onUpload={(files) => uploadAsset("savings", files)}
                disabled={!canEdit}
                pending={pending}
                previewClass="h-20 w-full object-cover"
              />
              <TextField
                label="Our scope (one per line)"
                rows={5}
                value={form.ourScope}
                onChange={(v) => setField("ourScope", v)}
                disabled={!canEdit}
              />
              <TextField
                label="Customer scope (one per line)"
                rows={4}
                value={form.customerScope}
                onChange={(v) => setField("customerScope", v)}
                disabled={!canEdit}
              />
              <TextField
                label="Required documents (one per line)"
                rows={4}
                value={linesToText(form.requiredDocuments)}
                onChange={(v) => setField("requiredDocuments", textToLines(v))}
                disabled={!canEdit}
              />
              <TextField
                label="Terms & conditions (one per line)"
                rows={8}
                value={form.termsText}
                onChange={(v) => setField("termsText", v)}
                disabled={!canEdit}
              />
              <div className="grid grid-cols-2 gap-2">
                <NumField
                  label="Tariff ₹/unit"
                  value={form.tariff}
                  step={0.1}
                  onChange={(v) => setField("tariff", v)}
                  disabled={!canEdit}
                />
                <NumField
                  label="Yield units/kW/yr"
                  value={form.yieldPerKw}
                  onChange={(v) => setField("yieldPerKw", v)}
                  disabled={!canEdit}
                />
              </div>
              <NumField
                label="Annual escalation %"
                value={form.escalation}
                step={0.1}
                onChange={(v) => setField("escalation", v)}
                disabled={!canEdit}
              />
            </div>
          )}

          {page === "page5" && (
            <div className="space-y-3">
              <PageHint>
                Phone, email, and web use company settings unless overridden below. Branch addresses
                are defined in brand configuration.
              </PageHint>
              <Field
                label="Page kicker"
                value={form.thanksPageKicker}
                onChange={(v) => setField("thanksPageKicker", v)}
                disabled={!canEdit}
              />
              <Field
                label="Page title"
                value={form.thanksPageTitle}
                onChange={(v) => setField("thanksPageTitle", v)}
                disabled={!canEdit}
              />
              <Field
                label="Thank you message"
                value={form.thanksMessage}
                onChange={(v) => setField("thanksMessage", v)}
                disabled={!canEdit}
              />
              <hr className="border-[var(--border-light)]" />
              <Field
                label="Previous work heading"
                value={form.previousWorkTitle}
                onChange={(v) => setField("previousWorkTitle", v)}
                disabled={!canEdit}
              />
              <p className="text-xs text-[var(--text-muted)]">
                Six photos shown in two rows of three on the Component list page. Upload to replace each slot.
              </p>
              {resolvePreviousWorkPhotos(form.previousWorkPhotos).map((photo, index) => (
                <TemplateImageField
                  key={`${photo.url}-${index}`}
                  label={`Photo ${index + 1}`}
                  value={photo.url}
                  onChange={(v) => {
                    const next = [...form.previousWorkPhotos];
                    next[index] = { ...next[index], url: v, storagePath: next[index]?.storagePath ?? "" };
                    setField("previousWorkPhotos", next);
                  }}
                  onUpload={(files) => uploadPreviousWork(index, files)}
                  disabled={!canEdit}
                  pending={pending}
                  previewClass="h-20 w-full object-cover"
                />
              ))}
              <hr className="border-[var(--border-light)]" />
              <Field
                label="Contact section heading"
                value={form.thanksContactHeading}
                onChange={(v) => setField("thanksContactHeading", v)}
                disabled={!canEdit}
              />
              <Field
                label="Branches section heading"
                value={form.thanksBranchesHeading}
                onChange={(v) => setField("thanksBranchesHeading", v)}
                disabled={!canEdit}
              />
              <hr className="border-[var(--border-light)]" />
              <Field
                label="PDF from name"
                value={bank.fromName ?? ""}
                onChange={(v) => setBankField("fromName", v)}
                disabled={!canEdit}
              />
              <div className="grid grid-cols-2 gap-2">
                <Field
                  label="From phone"
                  value={bank.fromPhone ?? ""}
                  onChange={(v) => setBankField("fromPhone", v)}
                  disabled={!canEdit}
                />
                <Field
                  label="From email"
                  value={bank.fromEmail ?? ""}
                  onChange={(v) => setBankField("fromEmail", v)}
                  disabled={!canEdit}
                />
              </div>
              <TextField
                label="Registered office address"
                rows={2}
                value={form.companyAddress}
                onChange={(v) => setField("companyAddress", v)}
                disabled={!canEdit}
              />
              <Field
                label="Website"
                value={form.companyWebsite}
                onChange={(v) => setField("companyWebsite", v)}
                disabled={!canEdit}
              />
              <p className="text-xs text-[var(--text-muted)]">
                Quotation numbering is managed in{" "}
                <Link href="/settings" className="font-medium text-[var(--primary)] hover:underline">
                  Settings
                </Link>
                .
              </p>
            </div>
          )}

          {page === "calculations" && (
            <div className="space-y-3">
              <PageHint>
                These defaults affect pricing, meter charges, and subsidy on new quotations. They do
                not appear as a separate page on the PDF.
              </PageHint>
              <div className="grid grid-cols-2 gap-2">
                <NumField
                  label="Default subsidy ₹"
                  value={form.defaultSubsidy}
                  onChange={(v) => setField("defaultSubsidy", v)}
                  disabled={!canEdit}
                />
                <NumField
                  label="Legacy flat meter charge ₹"
                  value={form.netMeterCharges}
                  onChange={(v) => setField("netMeterCharges", v)}
                  disabled={!canEdit}
                />
              </div>
              <NumField
                label="Additional charges ₹"
                value={form.additionalCharges}
                onChange={(v) => setField("additionalCharges", v)}
                disabled={!canEdit}
              />
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                Meter charges schedule
              </p>
              <div className="space-y-2 rounded-lg border border-[var(--border)] p-3">
                <label className="block text-xs text-[var(--text-muted)]">
                  Single phase 1–6 kW label
                  <Input
                    className="mt-1"
                    value={form.meterCharges.singlePhase1to6Label}
                    disabled={!canEdit}
                    onChange={(e) =>
                      setField("meterCharges", {
                        ...form.meterCharges,
                        singlePhase1to6Label: e.target.value,
                      })
                    }
                  />
                </label>
                <NumField
                  label="Single phase 1–6 kW amount (0 = Nil)"
                  value={form.meterCharges.singlePhase1to6}
                  onChange={(v) =>
                    setField("meterCharges", { ...form.meterCharges, singlePhase1to6: v })
                  }
                  disabled={!canEdit}
                />
                <label className="block text-xs text-[var(--text-muted)]">
                  Three phase 1–6 kW label
                  <Input
                    className="mt-1"
                    value={form.meterCharges.threePhase1to6Label}
                    disabled={!canEdit}
                    onChange={(e) =>
                      setField("meterCharges", {
                        ...form.meterCharges,
                        threePhase1to6Label: e.target.value,
                      })
                    }
                  />
                </label>
                <NumField
                  label="Three phase 1–6 kW amount"
                  value={form.meterCharges.threePhase1to6}
                  onChange={(v) =>
                    setField("meterCharges", { ...form.meterCharges, threePhase1to6: v })
                  }
                  disabled={!canEdit}
                />
                <label className="block text-xs text-[var(--text-muted)]">
                  Three phase 6–10 kW label
                  <Input
                    className="mt-1"
                    value={form.meterCharges.threePhase6to10Label}
                    disabled={!canEdit}
                    onChange={(e) =>
                      setField("meterCharges", {
                        ...form.meterCharges,
                        threePhase6to10Label: e.target.value,
                      })
                    }
                  />
                </label>
                <NumField
                  label="Three phase 6–10 kW amount"
                  value={form.meterCharges.threePhase6to10}
                  onChange={(v) =>
                    setField("meterCharges", { ...form.meterCharges, threePhase6to10: v })
                  }
                  disabled={!canEdit}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <NumField
                  label="Design days"
                  value={form.designDays}
                  onChange={(v) => setField("designDays", v)}
                  disabled={!canEdit}
                />
                <NumField
                  label="Procurement days"
                  value={form.procDays}
                  onChange={(v) => setField("procDays", v)}
                  disabled={!canEdit}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <NumField
                  label="Installation days"
                  value={form.installDays}
                  onChange={(v) => setField("installDays", v)}
                  disabled={!canEdit}
                />
                <NumField
                  label="Testing days"
                  value={form.testDays}
                  onChange={(v) => setField("testDays", v)}
                  disabled={!canEdit}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <NumField
                  label="CO₂ factor"
                  value={form.co2Factor}
                  step={0.01}
                  onChange={(v) => setField("co2Factor", v)}
                  disabled={!canEdit}
                />
                <NumField
                  label="Trees factor"
                  value={form.treeFactor}
                  step={0.0001}
                  onChange={(v) => setField("treeFactor", v)}
                  disabled={!canEdit}
                />
              </div>
            </div>
          )}
          </div>

          {canEdit ? (
            <div className="flex shrink-0 flex-wrap gap-2 border-t border-[var(--border-light)] pt-4">
              <Button type="button" disabled={pending} onClick={save}>
                {pending ? "Saving…" : "Save template"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                disabled={pending}
                onClick={() => {
                  setForm(DEFAULT_SOLAR_TEMPLATE);
                  setMessage("");
                  setError("");
                }}
              >
                Reset defaults
              </Button>
            </div>
          ) : (
            <p className="text-xs text-[var(--text-muted)]">
              View only — Manage Quotations permission is required to edit.
            </p>
          )}
        </div>

        <div className="min-w-0">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-[var(--text-dark)]">Live preview</h2>
            <p className="text-xs text-[var(--text-muted)]">
              5-page Florian proposal · sample quotation data
            </p>
          </div>
          <QuotationDocumentPreview data={previewData} company={previewCompany} template={form} canViewItemPricing />
        </div>
      </div>
    </div>
  );
}

function EditorNotice({
  message,
  error,
  onDismiss,
}: {
  message: string;
  error: string;
  onDismiss: () => void;
}) {
  const text = message || error;
  if (!text) return null;

  return createPortal(
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "pointer-events-auto fixed bottom-6 left-1/2 z-[250] w-[min(92vw,28rem)] -translate-x-1/2 rounded-xl border px-4 py-3 text-sm leading-relaxed shadow-[var(--shadow-lg)]",
        message
          ? "border-[var(--success)]/35 bg-[var(--success-light)] text-[var(--success)]"
          : "border-[var(--error)]/35 bg-[var(--error-light)] text-[var(--error)]"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="break-words">{text}</p>
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 text-xs font-semibold uppercase tracking-wide opacity-70 hover:opacity-100"
          aria-label="Dismiss notification"
        >
          Dismiss
        </button>
      </div>
    </div>,
    document.body
  );
}

function PageHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-lg border border-[var(--border-light)] bg-[var(--bg)] px-3 py-2 text-xs leading-relaxed text-[var(--text-muted)]">
      {children}
    </p>
  );
}

function TemplateImageField({
  label,
  value,
  onChange,
  onUpload,
  disabled,
  pending,
  placeholder,
  previewClass,
  squarePreview,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onUpload: (files: FileList | null) => void;
  disabled?: boolean;
  pending?: boolean;
  placeholder?: string;
  previewClass?: string;
  squarePreview?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const previewSrc = value.trim() || placeholder || "";

  return (
    <div className="space-y-2">
      <Field
        label={label}
        value={value}
        onChange={onChange}
        disabled={disabled}
        placeholder={placeholder}
      />
      {!disabled && (
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="hidden"
            disabled={pending}
            onChange={(e) => {
              onUpload(e.target.files);
              e.target.value = "";
            }}
          />
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={pending}
            onClick={() => inputRef.current?.click()}
          >
            {pending ? "Uploading…" : "Upload image"}
          </Button>
          <span className="text-[0.65rem] text-[var(--text-muted)]">JPG, PNG, WebP · max 8 MB (QR 4 MB)</span>
        </div>
      )}
      {previewSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={previewSrc}
          alt={`${label} preview`}
          className={`rounded-lg border border-[var(--border)] ${previewClass ?? "h-24 w-full object-cover"} ${
            squarePreview ? "inline-block" : ""
          }`}
        />
      ) : null}
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[0.69rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </span>
      <Input
        value={value}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

function TextField({
  label,
  rows,
  value,
  onChange,
  disabled,
}: {
  label: string;
  rows: number;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[0.69rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </span>
      <Textarea rows={rows} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}

function NumField({
  label,
  value,
  onChange,
  disabled,
  step,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  disabled?: boolean;
  step?: number;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[0.69rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </span>
      <Input
        type="number"
        step={step ?? 1}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

function ColorField({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[0.69rem] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
        {label}
      </span>
      <div className="flex gap-2">
        <input
          type="color"
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 w-12 rounded-lg border border-[var(--border)] p-1"
        />
        <Input
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="font-mono uppercase"
        />
      </div>
    </label>
  );
}
