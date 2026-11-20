"use client";

import { parseInverterSizeKw } from "@/lib/quotations/rate-card-inverters";
import type { QuoteTier } from "@/components/quotations/quote-tier-toggle";
import { Input } from "@/components/ui/input";
import { inr } from "@/lib/quotations/format";
import { SUBSIDY_SCHEME_LABELS, type SubsidyScheme } from "@/lib/quotations/subsidy";
import type { ProjectType } from "@/lib/quotations/project-type";
import {
  PANEL_MOUNT_TYPES,
  PANEL_MOUNT_TYPE_LABELS,
  type PanelMountType,
} from "@/lib/quotations/commercial";
import {
  FLORIAN_INVERTER_MAKES,
  FLORIAN_PANEL_COMPANIES,
  type FlorianInverterMake,
  type FlorianPanelCompany,
} from "@/lib/quotations/florian-brands";
import { cn } from "@/lib/utils";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="mb-1.5 block text-sm font-medium text-slate-700">{children}</label>;
}

function ChipGroup<T extends string>({
  options,
  value,
  onChange,
  columns = "grid-cols-2 sm:grid-cols-4",
}: {
  options: readonly T[];
  value: T | "";
  onChange: (next: T) => void;
  columns?: string;
}) {
  return (
    <div className={cn("grid gap-2", columns)}>
      {options.map((option) => {
        const active = value === option;
        return (
          <button
            key={option}
            type="button"
            onClick={() => onChange(option)}
            className={cn(
              "min-h-11 rounded-xl border px-3 py-2.5 text-sm font-semibold transition",
              active
                ? "border-brand-300 bg-brand-50 text-brand-900 ring-1 ring-brand-200"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
            )}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

export function SystemDetailsPanel({
  projectType,
  quoteTier = "premium",
  subsidyScheme = "residential",
  subsidyTotal = 0,
  subsidyLabel = "Subsidy (auto)",
  panelCompany,
  systemCost,
  systemSizeKw,
  panelCount,
  ratePerKw = 0,
  wattPeak = 0,
  onWattPeakChange,
  onFinalAmountChange,
  inverterBrand,
  inverterSize,
  panelMountType = null,
  onPanelCompanyChange,
  onPanelCountChange,
  onInverterMakeChange,
  onInverterSizeChange,
  onPanelMountTypeChange,
  showPricing = true,
  legacyPanelLabel = "",
  legacyInverterLabel = "",
}: {
  projectType: ProjectType;
  quoteTier?: QuoteTier;
  subsidyScheme?: SubsidyScheme;
  subsidyTotal?: number;
  subsidyLabel?: string;
  panelCompany: FlorianPanelCompany | "";
  systemCost: number;
  systemSizeKw: number;
  panelCount: number;
  ratePerKw?: number;
  wattPeak?: number;
  onWattPeakChange?: (watts: number) => void;
  onFinalAmountChange?: (amount: number) => void;
  inverterBrand: FlorianInverterMake | "";
  inverterSize: string;
  panelMountType?: PanelMountType | null;
  onPanelCompanyChange: (company: FlorianPanelCompany) => void;
  onPanelCountChange?: (count: number) => void;
  onInverterMakeChange: (make: FlorianInverterMake) => void;
  onInverterSizeChange: (size: string) => void;
  onPanelMountTypeChange?: (mount: PanelMountType) => void;
  showPricing?: boolean;
  /** Saved brand outside the chip list (edit path). */
  legacyPanelLabel?: string;
  legacyInverterLabel?: string;
}) {
  const isCommercial = projectType === "commercial";
  const inverterKw = inverterSize ? parseInverterSizeKw(inverterSize) : 0;
  const tierLabel = quoteTier === "premium" ? "Premium" : "Regular";
  const projectLabel = isCommercial ? "Commercial" : "Residential";
  const showSystemSummary = Boolean(panelCompany && panelCount > 0 && wattPeak > 0);

  return (
    <div className="space-y-5">
      <div>
        <FieldLabel>Panel company</FieldLabel>
        <ChipGroup
          options={FLORIAN_PANEL_COMPANIES}
          value={panelCompany}
          onChange={onPanelCompanyChange}
        />
        {!panelCompany && (
          <p className="mt-1.5 text-xs text-red-600">Select a panel company.</p>
        )}
        {!panelCompany && legacyPanelLabel.trim() ? (
          <p className="mt-1.5 text-xs text-amber-700">
            Current quote uses {legacyPanelLabel}. Pick a company chip to update.
          </p>
        ) : null}
      </div>

      {panelCompany ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-brand-100 bg-brand-50/40 px-4 py-3 text-sm">
            <p className="font-semibold text-brand-900">
              {tierLabel} · {projectLabel} · {panelCompany}
            </p>
            <p className="mt-0.5 text-brand-800/80">
              Enter watt peak, panel count, and Final Amount. ₹/kW is calculated for you.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <FieldLabel>Watt peak</FieldLabel>
              <Input
                type="number"
                min={1}
                step={1}
                value={wattPeak || ""}
                onChange={(e) =>
                  onWattPeakChange?.(Math.max(0, Math.round(Number(e.target.value) || 0)))
                }
                className="min-h-11"
                placeholder="e.g. 540"
              />
              <p className="mt-1.5 text-xs text-slate-500">
                Watts per panel. System kW is watt peak × panel count ÷ 1000.
              </p>
            </div>
            <div>
              <FieldLabel>Number of panels</FieldLabel>
              <Input
                type="number"
                min={1}
                step={1}
                value={panelCount || ""}
                onChange={(e) => onPanelCountChange?.(Math.max(0, Number(e.target.value) || 0))}
                className="min-h-11"
                placeholder="e.g. 10"
              />
              {systemSizeKw > 0 && (
                <p className="mt-1.5 text-xs text-slate-500">
                  System capacity: {systemSizeKw} kW
                  {wattPeak > 0 && panelCount > 0
                    ? ` · ${panelCount} × ${Math.round(wattPeak)}W`
                    : ""}
                </p>
              )}
            </div>
          </div>

          <div className="max-w-md">
            <FieldLabel>Final Amount (₹)</FieldLabel>
            <Input
              type="number"
              min={0}
              step="0.01"
              value={systemCost || ""}
              onChange={(e) =>
                onFinalAmountChange?.(Math.max(0, Number(e.target.value) || 0))
              }
              className="min-h-11"
              placeholder="e.g. 262500"
            />
            <p className="mt-1.5 text-xs text-slate-500">
              Gross turnkey system package (GST incl.), before subsidy. Discount stays optional below
              on the quote.
            </p>
            {systemSizeKw > 0 && ratePerKw > 0 && (
              <p className="mt-1.5 text-xs font-medium text-slate-600">
                Implied ₹/kW: {inr(ratePerKw)}
              </p>
            )}
            {!(systemCost > 0) && (
              <p className="mt-1.5 text-xs text-red-600">Enter Final Amount.</p>
            )}
          </div>
        </div>
      ) : null}

      {showSystemSummary && (
        <div className="grid grid-cols-1 gap-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4 sm:grid-cols-2">
          <div>
            <p className="text-xs font-medium text-slate-500">Panels</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">{panelCount || "—"}</p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">DC size</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">
              {systemSizeKw ? `${systemSizeKw} kW` : "—"}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">{subsidyLabel}</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">
              {subsidyTotal > 0 ? inr(subsidyTotal) : "—"}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {SUBSIDY_SCHEME_LABELS[subsidyScheme]}
              {isCommercial ? " · commercial" : ""}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-slate-500">Final Amount</p>
            <p className="mt-0.5 text-sm font-semibold text-slate-900">
              {systemCost > 0 ? inr(systemCost) : "—"}
            </p>
          </div>
        </div>
      )}

      {showPricing && systemSizeKw > 0 && systemCost > 0 && (
        <div className="space-y-1.5 rounded-xl border border-slate-200 bg-white p-4 text-sm">
          <div className="flex justify-between text-slate-600">
            <span>
              {ratePerKw > 0 ? `${inr(ratePerKw)}/kW × ${systemSizeKw} kW` : `${systemSizeKw} kW`}
            </span>
            <span className="font-medium tabular-nums text-slate-900">{inr(systemCost)}</span>
          </div>
          <p className="text-xs text-slate-500">
            Final Amount is the turnkey system package (GST inclusive), before subsidy.
          </p>
        </div>
      )}

      {isCommercial && (
        <div>
          <FieldLabel>Panel mount option</FieldLabel>
          <div className="grid gap-2">
            {PANEL_MOUNT_TYPES.map((mount) => {
              const active = panelMountType === mount;
              return (
                <button
                  key={mount}
                  type="button"
                  onClick={() => onPanelMountTypeChange?.(mount)}
                  className={cn(
                    "min-h-11 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition",
                    active
                      ? "border-brand-300 bg-brand-50 text-brand-900 ring-1 ring-brand-200"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                  )}
                >
                  {PANEL_MOUNT_TYPE_LABELS[mount]}
                </button>
              );
            })}
          </div>
          {!panelMountType && (
            <p className="mt-1.5 text-xs text-red-600">Select a panel mount option.</p>
          )}
        </div>
      )}

      <div>
        <FieldLabel>Inverter make</FieldLabel>
        <ChipGroup
          options={FLORIAN_INVERTER_MAKES}
          value={inverterBrand}
          onChange={onInverterMakeChange}
          columns="grid-cols-2 sm:grid-cols-4"
        />
        {!inverterBrand && (
          <p className="mt-1.5 text-xs text-red-600">Select an inverter make.</p>
        )}
        {!inverterBrand && legacyInverterLabel.trim() ? (
          <p className="mt-1.5 text-xs text-amber-700">
            Current quote uses {legacyInverterLabel}
            {inverterSize.trim() ? ` · ${inverterSize.trim()}` : ""}. Pick a make chip to update.
          </p>
        ) : null}
      </div>

      <div className="max-w-md">
        <FieldLabel>Inverter size (shown on quote)</FieldLabel>
        <Input
          type="text"
          value={inverterSize}
          onChange={(e) => onInverterSizeChange(e.target.value)}
          placeholder="e.g. 50KW, 5 kW three phase"
          className="min-h-11"
          autoComplete="off"
        />
        <p className="mt-1.5 text-xs text-slate-500">Free text — appears on the proposal system page.</p>
        {!inverterSize.trim() && (
          <p className="mt-1.5 text-xs text-red-600">Enter an inverter size.</p>
        )}
      </div>
      {inverterBrand && inverterSize.trim() && inverterKw > 0 && (
        <p className="text-xs text-slate-500">
          {inverterBrand} · parsed capacity ≈ {inverterKw} kW
        </p>
      )}
    </div>
  );
}
