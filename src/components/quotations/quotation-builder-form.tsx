"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useForm, type Resolver } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { quotationSchema, type QuotationPayload } from "@/lib/quotations/validations";
import { Button } from "@/components/ui/button";
import { Input, Textarea } from "@/components/ui/input";
import { BuilderAccordionStep } from "@/components/quotations/builder-accordion";
import { LeadNameAutocomplete } from "@/components/quotations/lead-name-autocomplete";
import type { QuoteLeadOption } from "@/components/quotations/quote-customer-picker";
import { QuoteTierToggle, type QuoteTier } from "@/components/quotations/quote-tier-toggle";
import { FlorianBomPanel } from "@/components/quotations/florian-bom-panel";
import { SystemDetailsPanel } from "@/components/quotations/system-details-panel";
import { OtherItemsPanel } from "@/components/quotations/other-items-panel";
import { calcQuotationTotals, calcItemTotals } from "@/lib/quotations/quote-math";
import { defaultSiteCharges } from "@/lib/quotations/site-charges";
import { inr } from "@/lib/quotations/format";
import { upsertQuotation } from "@/lib/quotations/actions/quotation";
import { MeterTypeSelector } from "@/components/quotations/meter-type-selector";
import {
  parseProjectType,
  type ProjectType,
} from "@/lib/quotations/project-type";
import { FLOOR_RATE_DEFAULTS } from "@/lib/quotations/site-charges";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { CatalogItem } from "@/lib/quotations/catalog-items";
import type { QuoteItemInput } from "@/lib/quotations/types";
import {
  buildRateCardSystemLines,
  extractAdditionalItems,
  inferSystemSelection,
} from "@/lib/quotations/catalog-items";
import type { RateCardPanel } from "@/lib/quotations/rate-card-panels";
import {
  parseInverterSizeKw,
  type RateCardInverter,
} from "@/lib/quotations/rate-card-inverters";
import { calcSystemKw } from "@/lib/quotations/per-kw-pricing";
import {
  isFlorianInverterMake,
  isFlorianPanelCompany,
  normalizeFlorianInverterMake,
  normalizeFlorianPanelCompany,
  type FlorianInverterMake,
  type FlorianPanelCompany,
} from "@/lib/quotations/florian-brands";
import {
  cloneFlorianSampleBom,
  parseFlorianBom,
  type FlorianBomItem,
} from "@/lib/quotations/sample-bom";
import {
  calcQuotationSubsidy,
  meterTypeToQuoteDefaults,
  parseSubsidyScheme,
  quoteMeterTypeFromFields,
  SUBSIDY_SCHEME_LABELS,
} from "@/lib/quotations/subsidy";
import { METER_TYPE_LABELS, parseMeterType, type MeterType } from "@/lib/domain/lead-profile";
import { DEFAULT_SOLAR_TEMPLATE, type SolarProposalTemplate } from "@/lib/quotations/quotation-template";
import { formatPaymentTermsFromTemplate } from "@/lib/quotations/payment-schedule";
import {
  meterPhaseOptions,
  commercialMeterPhaseLabel,
  sanitizeCommercialMeterLabel,
  type MeterPhase,
  type MeterPhaseOption,
} from "@/lib/quotations/meter-phase";
import {
  normalizeCommercialGstPercent,
  parsePanelMountType,
  type PanelMountType,
} from "@/lib/quotations/commercial";
import {
  defaultStructureMicron,
  micronBand,
  parseStructureMicron,
  type StructureMicron,
} from "@/lib/quotations/structure-micron";
import {
  kwPrefKey,
  lookupLastFinalAmount,
  lookupLastInverter,
  panelsPrefKey,
  parseLastFinalAmountByPanels,
  parseLastInverterByKw,
  parseLastSubsidyUnder3,
  type LastFinalAmountPref,
  type LastInverterPref,
  type LastSubsidyUnder3Pref,
} from "@/lib/quotations/quote-prefs";

type OpenSection = "customer" | "system" | "materials" | "other" | "quote" | null;

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function initialDiscountFromDefaults(defaults?: Partial<QuotationPayload>) {
  const systemCost = Number(defaults?.systemCost ?? 0);
  const fromAmount = Number(defaults?.discountAmount ?? 0);
  const fromPackage = (defaults?.items ?? []).find((i) =>
    /solar pv system package/i.test(i.itemName)
  );
  const amount = fromAmount > 0 ? fromAmount : Number(fromPackage?.discountValue ?? 0);
  const percent =
    defaults?.discountPercent != null && Number(defaults.discountPercent) > 0
      ? Number(defaults.discountPercent)
      : systemCost > 0 && amount > 0
        ? round2((amount / systemCost) * 100)
        : 0;
  return {
    amount: round2(Math.max(0, amount)),
    percent: round2(Math.max(0, Math.min(100, percent))),
  };
}

function findPanelFromDefaults(defaults?: Partial<QuotationPayload>) {
  const panelName = defaults?.moduleTypeName?.trim() ?? "";
  const legacyBrand = defaults?.moduleCompanyName?.trim() ?? "";
  const company =
    normalizeFlorianPanelCompany(panelName) ||
    normalizeFlorianPanelCompany(legacyBrand) ||
    "";
  const legacyLabel =
    company ? "" : panelName || legacyBrand || "";

  return {
    panelCompany: company as FlorianPanelCompany | "",
    legacyPanelLabel: legacyLabel,
    systemCost: Number(defaults?.systemCost ?? 0),
    systemSizeKw: Number(defaults?.systemSizeKw ?? 0),
    panelCount: Number(defaults?.panelCount ?? 0),
    moduleCapacityLabel: defaults?.moduleCapacityLabel ?? "",
  };
}

function findInverterFromDefaults(defaults?: Partial<QuotationPayload>): {
  inverterMake: FlorianInverterMake | "";
  legacyInverterLabel: string;
  inverterSizeLabel: string;
} {
  const invLine = (defaults?.items ?? []).find((row) => /inverter/i.test(row.itemName));
  const rawName =
    defaults?.inverterTypeName?.trim() || invLine?.brand?.trim() || "";
  const make = normalizeFlorianInverterMake(rawName);
  const sizeLabel =
    defaults?.inverterSizeLabel?.trim() || invLine?.model?.trim() || "";
  return {
    inverterMake: make,
    legacyInverterLabel: make ? "" : rawName,
    inverterSizeLabel: sizeLabel,
  };
}

function wattsFromCapacity(label: string | null | undefined): number {
  const match = (label ?? "").match(/(\d{2,4})/);
  if (!match) return 0;
  const n = Number(match[1]);
  return n > 0 ? n : 0;
}

export function QuotationBuilderForm({
  catalog,
  panels: _panels = [],
  inverters: _inverters = [],
  leads = [],
  canAddLead = false,
  defaultValues,
  pricingLocked = false,
  canEditQuotationPricing = false,
  meterCharges = DEFAULT_SOLAR_TEMPLATE.meterCharges,
  quoteTier = "premium",
  proposalTemplate,
  initialBomItems = null,
  lastInverterByKw: lastInverterByKwProp = null,
  lastSubsidyUnder3Kw: lastSubsidyUnder3KwProp = null,
  lastFinalAmountByPanels: lastFinalAmountByPanelsProp = null,
}: {
  catalog: CatalogItem[];
  /** @deprecated Solar System Details uses fixed Florian panel chips. */
  panels?: RateCardPanel[];
  /** @deprecated Solar System Details uses fixed Florian inverter chips. */
  inverters?: RateCardInverter[];
  leads?: QuoteLeadOption[];
  canAddLead?: boolean;
  defaultValues?: Partial<QuotationPayload> & { id?: string };
  pricingLocked?: boolean;
  canEditQuotationPricing?: boolean;
  meterCharges?: typeof DEFAULT_SOLAR_TEMPLATE.meterCharges;
  quoteTier?: QuoteTier;
  proposalTemplate?: SolarProposalTemplate;
  /** Last-used list for a new solar quote. Ignored when editing a saved quote. */
  initialBomItems?: FlorianBomItem[] | null;
  lastInverterByKw?: Record<string, LastInverterPref> | null;
  lastSubsidyUnder3Kw?: LastSubsidyUnder3Pref | null;
  lastFinalAmountByPanels?: Record<string, LastFinalAmountPref> | null;
}) {
  void _panels;
  void _inverters;
  const router = useRouter();
  const lastInverterByKw = useMemo(
    () => parseLastInverterByKw(lastInverterByKwProp ?? {}),
    [lastInverterByKwProp]
  );
  const lastSubsidyUnder3 = useMemo(
    () => lastSubsidyUnder3KwProp ?? parseLastSubsidyUnder3(null),
    [lastSubsidyUnder3KwProp]
  );
  const lastFinalAmountByPanels = useMemo(
    () => parseLastFinalAmountByPanels(lastFinalAmountByPanelsProp ?? {}),
    [lastFinalAmountByPanelsProp]
  );
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [tier, setTier] = useState<QuoteTier>(quoteTier);
  const today = new Date().toISOString().slice(0, 10);
  const valid7 = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);

  const initialRate = useMemo(() => findPanelFromDefaults(defaultValues), [defaultValues]);
  const initialInverter = useMemo(() => findInverterFromDefaults(defaultValues), [defaultValues]);
  const initialSystem = useMemo(
    () => inferSystemSelection(catalog, defaultValues?.items ?? []),
    [catalog, defaultValues?.items]
  );

  const [openSection, setOpenSection] = useState<OpenSection>(() =>
    defaultValues?.customerName?.trim() ? "system" : "customer"
  );
  const [panelCompany, setPanelCompany] = useState<FlorianPanelCompany | "">(
    initialRate.panelCompany
  );
  const [legacyPanelLabel] = useState(initialRate.legacyPanelLabel);
  const [systemCost, setSystemCost] = useState(initialRate.systemCost);
  const [minSalePrice, setMinSalePrice] = useState(0);
  const initialDiscount = useMemo(() => initialDiscountFromDefaults(defaultValues), [defaultValues]);
  const [discountPercent, setDiscountPercent] = useState(initialDiscount.percent);
  const [discountAmount, setDiscountAmount] = useState(initialDiscount.amount);
  const [systemSizeKw, setSystemSizeKw] = useState(initialRate.systemSizeKw);
  const [panelCount, setPanelCount] = useState(initialRate.panelCount);
  const [moduleTypeName, setModuleTypeName] = useState(
    initialRate.panelCompany || initialRate.legacyPanelLabel
  );
  const [moduleCapacityLabel, setModuleCapacityLabel] = useState(initialRate.moduleCapacityLabel);
  const [inverterTypeName, setInverterTypeName] = useState<FlorianInverterMake | "">(
    initialInverter.inverterMake
  );
  const [legacyInverterLabel] = useState(initialInverter.legacyInverterLabel);
  const [inverterSizeLabelState, setInverterSizeLabelState] = useState(
    initialInverter.inverterSizeLabel
  );
  const [additionalItems, setAdditionalItems] = useState<QuoteItemInput[]>(() =>
    extractAdditionalItems(
      catalog,
      (defaultValues?.items ?? []) as QuoteItemInput[],
      initialSystem.panelItemId,
      initialSystem.panelQty || 1,
      initialInverter.inverterMake
        ? {
            brand: initialInverter.inverterMake,
            sizeLabel: initialInverter.inverterSizeLabel,
          }
        : null
    ).filter((i) => !/solar pv system package/i.test(i.itemName) && !/^solar module$/i.test(i.itemName))
  );
  const phaseOptions = useMemo(() => meterPhaseOptions(meterCharges), [meterCharges]);
  const [meterPhase, setMeterPhase] = useState<MeterPhase | "">(
    (defaultValues?.meterPhase as MeterPhase | undefined) ?? ""
  );
  const [meterChargeAmount, setMeterChargeAmount] = useState(
    Number(defaultValues?.meterChargeAmount ?? 0)
  );
  const [pricePerKwExclGst, setPricePerKwExclGst] = useState(
    Number(defaultValues?.pricePerKwExclGst ?? 0)
  );
  const [commercialGstPercent, setCommercialGstPercent] = useState(
    normalizeCommercialGstPercent(defaultValues?.commercialGstPercent)
  );
  const [gedaChargeAmount, setGedaChargeAmount] = useState(
    Number(defaultValues?.gedaChargeAmount ?? 0)
  );
  const [meterPhaseLabel, setMeterPhaseLabel] = useState(() => {
    const raw = defaultValues?.meterPhaseLabel ?? "";
    if (parseProjectType(defaultValues?.projectType ?? "residential") === "commercial") {
      return sanitizeCommercialMeterLabel(raw) ?? raw;
    }
    return raw;
  });
  const [panelMountType, setPanelMountType] = useState<PanelMountType | null>(
    parsePanelMountType(defaultValues?.panelMountType)
  );
  const [bomItems, setBomItems] = useState<FlorianBomItem[]>(() => {
    const saved = parseFlorianBom(defaultValues?.bomItems);
    if (saved) return saved;
    if (defaultValues?.id) return cloneFlorianSampleBom();
    return initialBomItems ?? cloneFlorianSampleBom();
  });
  const [bomQuoteOnly, setBomQuoteOnly] = useState(true);
  const [wattPeak, setWattPeak] = useState(() => wattsFromCapacity(initialRate.moduleCapacityLabel));
  const [structureMicron, setStructureMicron] = useState<StructureMicron>(() =>
    parseStructureMicron(defaultValues?.structureMicron) ??
      defaultStructureMicron(initialRate.systemSizeKw)
  );
  const lastMicronBandRef = useRef(micronBand(initialRate.systemSizeKw));
  const skipInverterPrefOnce = useRef(Boolean(defaultValues?.id));
  /** null on new quotes so first kW apply can pull last inverter. */
  const lastInverterKwKeyRef = useRef<string | null>(
    defaultValues?.id ? kwPrefKey(initialRate.systemSizeKw) : null
  );
  const skipSubsidyPrefOnce = useRef(Boolean(defaultValues?.id));
  const lastSubsidyKwBandRef = useRef(
    defaultValues?.id
      ? initialRate.systemSizeKw > 0 && initialRate.systemSizeKw < 3
        ? "under3"
        : "other"
      : "init"
  );
  const skipFinalAmountPrefOnce = useRef(Boolean(defaultValues?.id));
  const initialWattPeak = wattsFromCapacity(initialRate.moduleCapacityLabel);
  const lastFinalAmountKeyRef = useRef<string | null>(
    defaultValues?.id ? panelsPrefKey(initialWattPeak, initialRate.panelCount) : null
  );
  const skipMeterPhasePrefOnce = useRef(Boolean(defaultValues?.id));
  const lastMeterKwBandRef = useRef(
    defaultValues?.id
      ? initialRate.systemSizeKw > 0 && initialRate.systemSizeKw < 6
        ? "under6"
        : "other"
      : "init"
  );
  const [ratePerKw, setRatePerKw] = useState(() => {
    const saved = Number(defaultValues?.ratePerKwSnapshot ?? 0);
    if (saved > 0) return saved;
    const cost = Number(defaultValues?.systemCost ?? 0);
    const kw = Number(defaultValues?.systemSizeKw ?? 0);
    return cost > 0 && kw > 0 ? round2(cost / kw) : 0;
  });

  const initialMeterType = quoteMeterTypeFromFields(
    defaultValues?.projectType ?? "residential",
    defaultValues?.subsidyScheme
  );
  const [meterType, setMeterType] = useState<MeterType>(initialMeterType);
  const [applyResidentialSubsidy, setApplyResidentialSubsidy] = useState(
    () =>
      initialMeterType === "residential" &&
      parseSubsidyScheme(defaultValues?.subsidyScheme) !== "none"
  );
  const [subsidyAmount, setSubsidyAmount] = useState(() => {
    const saved = Number(defaultValues?.subsidy ?? NaN);
    if (Number.isFinite(saved) && saved >= 0 && defaultValues?.id) return saved;
    if (
      !defaultValues?.id &&
      lastSubsidyUnder3KwProp &&
      Number(lastSubsidyUnder3KwProp.amount) >= 0 &&
      initialRate.systemSizeKw > 0 &&
      initialRate.systemSizeKw < 3
    ) {
      return Math.max(0, Number(lastSubsidyUnder3KwProp.amount));
    }
    return Math.max(0, Number(defaultValues?.subsidy ?? 0));
  });
  const skipNextResidentialAuto = useRef(
    (initialMeterType === "residential" &&
      defaultValues?.subsidy != null &&
      Number(defaultValues.subsidy) >= 0) ||
      (!defaultValues?.id &&
        Boolean(lastSubsidyUnder3KwProp) &&
        initialRate.systemSizeKw > 0 &&
        initialRate.systemSizeKw < 3)
  );
  const [linkedLeadId, setLinkedLeadId] = useState<string | null>(
    defaultValues?.leadId ?? null
  );

  const form = useForm<QuotationPayload>({
    resolver: zodResolver(quotationSchema) as unknown as Resolver<QuotationPayload>,
    defaultValues: {
      customerName: "",
      customerPhone: "",
      address: "",
      projectType: meterTypeToQuoteDefaults(initialMeterType).projectType,
      quotationNo: `QTN-${Date.now().toString().slice(-6)}`,
      quoteDate: today,
      validTill: valid7,
      status: "draft",
      notes: "",
      terms: "",
      subsidyScheme: meterTypeToQuoteDefaults(initialMeterType, {
        applyResidentialSubsidy:
          initialMeterType === "residential" &&
          parseSubsidyScheme(defaultValues?.subsidyScheme) !== "none",
      }).subsidyScheme,
      items: [],
      ...defaultValues,
      siteCharges: defaultValues?.siteCharges ?? defaultSiteCharges(),
    },
  });

  const { register, setValue, watch, handleSubmit, getValues, formState: { errors } } = form;
  const items = watch("items");
  const siteCharges = watch("siteCharges");
  const totals = useMemo(() => calcQuotationTotals(items || [], siteCharges), [items, siteCharges]);
  const customerName = watch("customerName");
  const customerPhone = watch("customerPhone");
  const quotationNo = watch("quotationNo");
  const projectType = watch("projectType") ?? "residential";
  const subsidyScheme = parseSubsidyScheme(watch("subsidyScheme"));

  useEffect(() => {
    setValue("siteCharges.floors.buildingType", projectType);
    setValue("siteCharges.floors.ratePerFloor", FLOOR_RATE_DEFAULTS[projectType as ProjectType]);
  }, [projectType, setValue]);

  const inverterKw = parseInverterSizeKw(inverterSizeLabelState);
  const residentialCalc = useMemo(
    () => calcQuotationSubsidy(systemSizeKw, "residential"),
    [systemSizeKw]
  );

  // Phase 4: sync scheme + amount from meter type / residential toggle
  useEffect(() => {
    const mapped = meterTypeToQuoteDefaults(meterType, { applyResidentialSubsidy });
    setValue("projectType", mapped.projectType, { shouldDirty: true });
    setValue("subsidyScheme", mapped.subsidyScheme, { shouldDirty: true });

    if (meterType === "commercial") {
      setSubsidyAmount(0);
      return;
    }
    if (meterType === "residential") {
      if (!applyResidentialSubsidy) {
        setSubsidyAmount(0);
        return;
      }
      if (skipNextResidentialAuto.current) {
        skipNextResidentialAuto.current = false;
        return;
      }
      setSubsidyAmount(residentialCalc.total);
    }
    // common: keep manual subsidyAmount
  }, [meterType, applyResidentialSubsidy, residentialCalc.total, setValue]);

  const systemLineItems = useMemo(
    () =>
      buildRateCardSystemLines({
        moduleCompanyName: moduleTypeName,
        moduleCapacityLabel,
        moduleTypeName,
        panelCount,
        systemCost,
        discountAmount,
        inverterBrand: inverterTypeName,
        inverterSizeLabel: inverterSizeLabelState,
      }),
    [
      moduleCapacityLabel,
      moduleTypeName,
      panelCount,
      systemCost,
      discountAmount,
      inverterTypeName,
      inverterSizeLabelState,
    ]
  );
  const otherTotals = useMemo(() => calcItemTotals(additionalItems), [additionalItems]);
  const isCommercial = parseProjectType(projectType) === "commercial";
  const netSystemCost = Math.max(0, systemCost - discountAmount);
  const netPayableAmount = Math.max(0, netSystemCost - subsidyAmount);
  const belowMin =
    !isCommercial && netSystemCost > 0 && minSalePrice > 0 && netSystemCost < minSalePrice;
  const selectedMeterOption: MeterPhaseOption | null =
    phaseOptions.find((o) => o.id === meterPhase) ?? null;

  function onMeterPhaseChange(phase: MeterPhase) {
    setMeterPhase(phase);
    const opt = phaseOptions.find((o) => o.id === phase);
    setValue("meterPhase", phase, { shouldValidate: true });
    const label = isCommercial
      ? commercialMeterPhaseLabel(phase)
      : opt?.label ?? null;
    setMeterPhaseLabel(label ?? "");
    setValue("meterPhaseLabel", label);
  }

  function onMeterChargeAmountChange(raw: string) {
    const amount = Math.max(0, Number(raw) || 0);
    setMeterChargeAmount(amount);
    setValue("meterChargeAmount", amount, { shouldDirty: true });
  }

  // System < 6 kW → auto-select single phase (staff can still change).
  useEffect(() => {
    const band = systemSizeKw > 0 && systemSizeKw < 6 ? "under6" : "other";
    if (skipMeterPhasePrefOnce.current) {
      skipMeterPhasePrefOnce.current = false;
      lastMeterKwBandRef.current = band;
      return;
    }
    if (band !== "under6") {
      lastMeterKwBandRef.current = band;
      return;
    }
    if (band === lastMeterKwBandRef.current) return;
    lastMeterKwBandRef.current = band;
    const phase: MeterPhase = "single_phase_1_6";
    const opt = phaseOptions.find((o) => o.id === phase);
    setMeterPhase(phase);
    setValue("meterPhase", phase, { shouldValidate: true });
    const label = isCommercial
      ? commercialMeterPhaseLabel(phase)
      : opt?.label ?? null;
    setMeterPhaseLabel(label ?? "");
    setValue("meterPhaseLabel", label);
  }, [systemSizeKw, phaseOptions, isCommercial, setValue]);

  useEffect(() => {
    const nextKw = calcSystemKw(wattPeak, panelCount);
    setSystemSizeKw(nextKw);
    if (wattPeak > 0) {
      setModuleCapacityLabel(`${Math.round(wattPeak)}W`);
    }
    if (systemCost > 0 && nextKw > 0) {
      setRatePerKw(round2(systemCost / nextKw));
    } else if (!(systemCost > 0)) {
      setRatePerKw(0);
    }
    if (discountPercent > 0) {
      setDiscountAmount(systemCost > 0 ? round2((systemCost * discountPercent) / 100) : 0);
    }
  }, [wattPeak, panelCount, systemCost, discountPercent]);

  // Structure micron: reset to auto default when system kW band changes.
  useEffect(() => {
    const band = micronBand(systemSizeKw);
    if (band === lastMicronBandRef.current) return;
    lastMicronBandRef.current = band;
    setStructureMicron(defaultStructureMicron(systemSizeKw));
  }, [systemSizeKw]);

  // Last inverter used for the same system kW.
  useEffect(() => {
    if (skipInverterPrefOnce.current) {
      skipInverterPrefOnce.current = false;
      lastInverterKwKeyRef.current = kwPrefKey(systemSizeKw);
      return;
    }
    const key = kwPrefKey(systemSizeKw);
    if (!key || key === lastInverterKwKeyRef.current) return;
    lastInverterKwKeyRef.current = key;
    const hit = lookupLastInverter(lastInverterByKw, systemSizeKw);
    if (!hit) return;
    setInverterTypeName(hit.make);
    setInverterSizeLabelState(hit.sizeLabel);
  }, [systemSizeKw, lastInverterByKw]);

  // Last Final Amount for the same watt peak × panel count.
  useEffect(() => {
    if (skipFinalAmountPrefOnce.current) {
      skipFinalAmountPrefOnce.current = false;
      lastFinalAmountKeyRef.current = panelsPrefKey(wattPeak, panelCount);
      return;
    }
    const key = panelsPrefKey(wattPeak, panelCount);
    if (!key || key === lastFinalAmountKeyRef.current) return;
    lastFinalAmountKeyRef.current = key;
    const amount = lookupLastFinalAmount(lastFinalAmountByPanels, wattPeak, panelCount);
    if (amount == null) return;
    setSystemCost(amount);
  }, [wattPeak, panelCount, lastFinalAmountByPanels]);

  // Last subsidy when system size drops under 3 kW (manual / editable paths).
  useEffect(() => {
    const band = systemSizeKw > 0 && systemSizeKw < 3 ? "under3" : "other";
    if (skipSubsidyPrefOnce.current) {
      skipSubsidyPrefOnce.current = false;
      lastSubsidyKwBandRef.current = band;
      return;
    }
    if (band === lastSubsidyKwBandRef.current) return;
    lastSubsidyKwBandRef.current = band;
    if (band !== "under3" || !lastSubsidyUnder3) return;
    if (meterType === "commercial") return;
    if (meterType === "residential" && !applyResidentialSubsidy) return;
    skipNextResidentialAuto.current = true;
    setSubsidyAmount(Math.max(0, Number(lastSubsidyUnder3.amount) || 0));
  }, [systemSizeKw, lastSubsidyUnder3, meterType, applyResidentialSubsidy]);

  useEffect(() => {
    setValue("items", [...systemLineItems, ...additionalItems], { shouldValidate: true });
    setValue("tierType", tier);
    setValue("structureMicron", structureMicron);
    setValue("ratePerKwSnapshot", ratePerKw > 0 ? ratePerKw : null);
    setValue("netPayableAmount", netPayableAmount > 0 ? netPayableAmount : null);
    setValue("ratePackageId", null);
    setValue("moduleTypeName", moduleTypeName || null);
    setValue("moduleCompanyName", moduleTypeName || null);
    setValue("moduleCapacityLabel", moduleCapacityLabel || null);
    setValue("inverterTypeName", inverterTypeName || null);
    setValue("inverterSizeLabel", inverterSizeLabelState || null);
    setValue("systemSizeKw", systemSizeKw || null);
    setValue("panelCount", panelCount || null);
    setValue("systemCost", systemCost || null);
    setValue("minSalePriceSnapshot", minSalePrice || null);
    setValue("discountPercent", discountPercent || 0);
    setValue("discountAmount", discountAmount || 0);
    setValue("subsidyScheme", subsidyScheme);
    setValue("subsidy", subsidyAmount);
    setValue("meterPhase", meterPhase || null);
    setValue("meterChargeAmount", meterPhase ? meterChargeAmount : null);
    setValue("pricePerKwExclGst", isCommercial ? pricePerKwExclGst || null : null);
    setValue("commercialGstPercent", isCommercial ? commercialGstPercent : null);
    setValue("gedaChargeAmount", isCommercial ? gedaChargeAmount || null : null);
    setValue("panelMountType", isCommercial ? panelMountType : null);
    setValue(
      "meterPhaseLabel",
      meterPhase
        ? isCommercial
          ? sanitizeCommercialMeterLabel(meterPhaseLabel) || commercialMeterPhaseLabel(meterPhase)
          : meterPhaseLabel || selectedMeterOption?.label || null
        : null
    );

    const base = defaultSiteCharges();
    const floors = defaultValues?.siteCharges?.floors ?? siteCharges?.floors ?? base.floors;
    setValue("siteCharges", {
      height: { ...base.height, enabled: false, quantity: 0 },
      floors,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    systemLineItems,
    additionalItems,
    moduleTypeName,
    moduleCapacityLabel,
    inverterTypeName,
    inverterSizeLabelState,
    systemSizeKw,
    panelCount,
    systemCost,
    minSalePrice,
    discountPercent,
    discountAmount,
    subsidyScheme,
    subsidyAmount,
    meterPhase,
    meterChargeAmount,
    selectedMeterOption,
    pricePerKwExclGst,
    commercialGstPercent,
    gedaChargeAmount,
    panelMountType,
    meterPhaseLabel,
    isCommercial,
    tier,
    structureMicron,
    ratePerKw,
    netPayableAmount,
    setValue,
  ]);

  const phoneDigits = (customerPhone ?? "").replace(/\D/g, "");
  const phoneOk = phoneDigits.length === 0 || phoneDigits.length >= 10;
  const customerComplete = Boolean(customerName?.trim() && phoneOk);
  const systemComplete = Boolean(
    isFlorianPanelCompany(panelCompany) &&
      wattPeak > 0 &&
      panelCount > 0 &&
      systemSizeKw > 0 &&
      systemCost > 0 &&
      isFlorianInverterMake(inverterTypeName) &&
      inverterSizeLabelState.trim() &&
      meterPhase &&
      (!isCommercial || panelMountType) &&
      !belowMin
  );
  const canSave = customerComplete && systemComplete && !pending;
  const saveBlockers = useMemo(() => {
    const missing: string[] = [];
    if (!customerName?.trim()) missing.push("customer name");
    if (!phoneOk) missing.push("valid phone (10+ digits) or leave blank");
    if (!isFlorianPanelCompany(panelCompany)) missing.push("panel company");
    if (!(wattPeak > 0)) missing.push("watt peak");
    if (!(panelCount > 0)) missing.push("panel count");
    if (!(systemCost > 0)) missing.push("Final Amount");
    if (!(systemSizeKw > 0)) missing.push("system capacity");
    if (!isFlorianInverterMake(inverterTypeName)) missing.push("inverter make");
    if (!inverterSizeLabelState.trim()) missing.push("inverter size");
    if (!meterPhase) missing.push("meter phase");
    if (isCommercial && !panelMountType) missing.push("panel mount option");
    if (belowMin) missing.push(`net cost ≥ minimum (${inr(minSalePrice)})`);
    return missing;
  }, [
    customerName,
    phoneOk,
    panelCompany,
    wattPeak,
    panelCount,
    systemSizeKw,
    systemCost,
    inverterTypeName,
    inverterSizeLabelState,
    meterPhase,
    isCommercial,
    panelMountType,
    belowMin,
    minSalePrice,
  ]);

  function toggleSection(section: Exclude<OpenSection, null>) {
    setOpenSection((prev) => (prev === section ? null : section));
  }

  function onMeterTypeChange(type: MeterType) {
    setMeterType(type);
    if (type === "residential") {
      setApplyResidentialSubsidy(true);
    }
    if (type === "commercial" && meterPhase) {
      const short = commercialMeterPhaseLabel(meterPhase);
      setMeterPhaseLabel(short);
      setValue("meterPhaseLabel", short);
      if (!commercialGstPercent) {
        setCommercialGstPercent(normalizeCommercialGstPercent(undefined));
      }
    }
    if (type === "common") {
      // Keep existing amount if any; otherwise start at 0 for manual entry
      setSubsidyAmount((prev) => (prev > 0 ? prev : 0));
    }
  }

  function applyLead(lead: QuoteLeadOption) {
    setLinkedLeadId(lead.id);
    setValue("leadId", lead.id);
    setValue("customerName", lead.name, { shouldValidate: true });
    setValue("customerPhone", lead.phone, { shouldValidate: true });
    setValue("address", lead.address ?? "", { shouldDirty: true });
    if (lead.meter_type) {
      const parsed = parseMeterType(lead.meter_type);
      if (parsed) onMeterTypeChange(parsed);
    }
  }

  function onCustomerNameChange(name: string) {
    setValue("customerName", name, { shouldValidate: true });
    if (linkedLeadId) {
      const linked = leads.find((l) => l.id === linkedLeadId);
      if (!linked || linked.name !== name) {
        setLinkedLeadId(null);
        setValue("leadId", undefined);
      }
    }
  }

  function onDiscountPercentChange(raw: string) {
    const pct = Math.max(0, Math.min(100, Number(raw) || 0));
    const amount = systemCost > 0 ? round2((systemCost * pct) / 100) : 0;
    setDiscountPercent(round2(pct));
    setDiscountAmount(amount);
  }

  function onDiscountAmountChange(raw: string) {
    const amount = Math.max(0, Math.min(systemCost || 0, Number(raw) || 0));
    const pct = systemCost > 0 ? round2((amount / systemCost) * 100) : 0;
    setDiscountAmount(round2(amount));
    setDiscountPercent(pct);
  }

  function onPanelCompanyChange(company: FlorianPanelCompany) {
    setPanelCompany(company);
    setModuleTypeName(company);
  }

  function onWattPeakChange(watts: number) {
    setWattPeak(watts);
  }

  function onFinalAmountChange(amount: number) {
    const next = Math.max(0, amount);
    setSystemCost(next);
    setMinSalePrice(0);
  }

  function onPanelCountChange(count: number) {
    setPanelCount(Math.max(0, Math.floor(count)));
  }

  function onInverterMakeChange(make: FlorianInverterMake) {
    setInverterTypeName(make);
  }

  function goToSystem() {
    if (customerComplete) setOpenSection("system");
  }

  function leaveQuote() {
    const leadId = linkedLeadId || defaultValues?.leadId;
    router.push(leadId ? `/quotations?leadId=${leadId}` : "/quotations");
  }

  function saveDraftAndLeave() {
    if (pending) return;
    if (defaultValues?.status === "accepted") {
      leaveQuote();
      return;
    }
    const name = (customerName ?? "").trim();
    const phone = (customerPhone ?? "").trim();
    const digits = phone.replace(/\D/g, "");
    if (!name || (digits.length > 0 && digits.length < 10)) {
      leaveQuote();
      return;
    }
    const values = getValues();
    const filled = [...systemLineItems, ...additionalItems].filter(
      (item) => item.itemName.trim() && Number(item.quantity) > 0
    );
    const items =
      filled.length > 0
        ? filled
        : [
            {
              itemName: moduleTypeName.trim() || "Solar system",
              brand: moduleTypeName.trim(),
              model: moduleCapacityLabel.trim(),
              quantity: 1,
              unit: "set",
              rate: Math.max(0, Number(systemCost) || 0),
              gstPercent: 0,
              discountValue: 0,
            },
          ];
    setError("");
    startTransition(async () => {
      try {
        const saved = await upsertQuotation({
          ...values,
          ...(defaultValues?.id ? { id: defaultValues.id } : {}),
          items,
          status: "draft",
          customerName: name,
          customerPhone: phone,
          notes: values.notes ?? "",
          terms: values.terms ?? "",
          bomItems,
          bomQuoteOnly,
        });
        if (!saved.ok) {
          setError(saved.error);
          return;
        }
        leaveQuote();
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to save draft");
      }
    });
  }

  const submit = handleSubmit(
    (values) => {
      if (belowMin) {
        setError(
          `Net system cost after discount cannot be below minimum sale of ${inr(minSalePrice)}`
        );
        return;
      }
      if (!customerComplete) {
        setError(
          phoneOk
            ? "Enter customer name before saving."
            : "Enter a valid phone (10+ digits) or leave it blank."
        );
        return;
      }
      const payload = {
        ...(defaultValues?.id ? { ...values, id: defaultValues.id } : values),
        status: "draft" as const,
        notes: "",
        terms: "",
        bomItems,
        bomQuoteOnly,
      };
      setError("");
      startTransition(async () => {
        try {
          const saved = await upsertQuotation(payload);
          if (!saved.ok) {
            setError(saved.error);
            return;
          }
          router.push(`/quotations/${saved.id}`);
          router.refresh();
        } catch (e) {
          setError(e instanceof Error ? e.message : "Failed to save quotation");
        }
      });
    },
    (formErrors) => {
      const messages = Object.values(formErrors)
        .map((err) => err?.message)
        .filter(Boolean) as string[];
      setError(
        messages[0] ||
          (saveBlockers.length > 0
            ? `Complete: ${saveBlockers.join(", ")}`
            : "Fix the highlighted fields before saving.")
      );
    }
  );

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[var(--border)] bg-white px-4 py-3">
        <div>
          <p className="text-sm font-semibold text-[var(--text-dark)]">Regular or Premium</p>
          <p className="text-xs text-[var(--text-muted)]">
            This picks the per-kW rate card used for the system price.
          </p>
        </div>
        <QuoteTierToggle value={tier} onChange={setTier} />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px] lg:items-start">
        <div className="space-y-4">
          <BuilderAccordionStep
            title="Customer Details"
            open={openSection === "customer"}
            onToggle={() => toggleSection("customer")}
            complete={customerComplete}
          >
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">Name</label>
                  <LeadNameAutocomplete
                    leads={leads}
                    canAddLead={canAddLead}
                    value={customerName ?? ""}
                    onChange={onCustomerNameChange}
                    onLeadSelect={applyLead}
                    selectedLeadId={linkedLeadId}
                    error={errors.customerName?.message}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Number <span className="font-normal text-slate-400">(optional)</span>
                  </label>
                  <Input
                    {...register("customerPhone")}
                    placeholder="Mobile number"
                    inputMode="tel"
                    className="min-h-11"
                  />
                  {errors.customerPhone && (
                    <p className="mt-1 text-xs text-red-600">{errors.customerPhone.message}</p>
                  )}
                </div>
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Address</label>
                <Textarea {...register("address")} rows={3} placeholder="Site address" />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Meter type
                </label>
                <MeterTypeSelector value={meterType} onChange={onMeterTypeChange} />
              </div>

              {meterType === "residential" && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                  <label className="flex cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-slate-300 text-[var(--primary)]"
                      checked={applyResidentialSubsidy}
                      onChange={(e) => setApplyResidentialSubsidy(e.target.checked)}
                    />
                    <span>
                      <span className="block text-sm font-semibold text-slate-800">
                        Apply residential subsidy
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        PM Surya Ghar slabs (capped at 3 kW / ₹78,000). Turn off when policy does not
                        apply — subsidy becomes ₹0.
                      </span>
                    </span>
                  </label>
                  {applyResidentialSubsidy && (
                    <div className="mt-3">
                      <label className="mb-1 block text-xs font-medium text-slate-600">
                        Subsidy ₹ (auto, editable)
                      </label>
                      <Input
                        type="number"
                        min={0}
                        value={subsidyAmount || ""}
                    onChange={(e) => {
                      skipNextResidentialAuto.current = false;
                      setSubsidyAmount(Math.max(0, Number(e.target.value) || 0));
                    }}
                        className="min-h-10"
                      />
                      <p className="mt-1 text-[11px] text-slate-500">
                        Formula suggests {inr(residentialCalc.total)} for {systemSizeKw || 0} kW
                      </p>
                    </div>
                  )}
                </div>
              )}

              {meterType === "common" && (
                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Subsidy ₹ (manual)
                  </label>
                  <p className="mb-2 text-xs text-slate-500">
                    Society / GHS common meter — enter the subsidy amount (varies by flats). Use 0 if
                    none.
                  </p>
                  <Input
                    type="number"
                    min={0}
                    value={subsidyAmount || ""}
                    onChange={(e) => setSubsidyAmount(Math.max(0, Number(e.target.value) || 0))}
                    className="min-h-11"
                    placeholder="e.g. 540000"
                  />
                </div>
              )}

              {meterType === "commercial" && (
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
                  Commercial / industrial — subsidy is disabled (₹0).
                </p>
              )}

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={goToSystem}
                  disabled={!customerComplete}
                  className="inline-flex min-h-10 items-center rounded-xl border border-brand-200 bg-brand-50 px-4 text-sm font-medium text-brand-800 transition hover:bg-brand-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Continue to system details →
                </button>
              </div>
            </div>
          </BuilderAccordionStep>

          <BuilderAccordionStep
            title="System Details"
            open={openSection === "system"}
            onToggle={() => toggleSection("system")}
            complete={systemComplete}
          >
            <SystemDetailsPanel
              projectType={parseProjectType(projectType)}
              quoteTier={tier}
              subsidyScheme={subsidyScheme}
              subsidyTotal={subsidyAmount}
              subsidyLabel={
                meterType === "common"
                  ? "Subsidy (manual)"
                  : meterType === "commercial"
                    ? "Subsidy"
                    : applyResidentialSubsidy
                      ? "Subsidy (auto)"
                      : "Subsidy (off)"
              }
              panelCompany={panelCompany}
              systemCost={systemCost}
              systemSizeKw={systemSizeKw}
              panelCount={panelCount}
              ratePerKw={ratePerKw}
              wattPeak={wattPeak}
              onWattPeakChange={onWattPeakChange}
              onFinalAmountChange={onFinalAmountChange}
              inverterBrand={inverterTypeName}
              inverterSize={inverterSizeLabelState}
              panelMountType={panelMountType}
              onPanelCompanyChange={onPanelCompanyChange}
              onPanelCountChange={onPanelCountChange}
              onPanelMountTypeChange={setPanelMountType}
              onInverterMakeChange={onInverterMakeChange}
              onInverterSizeChange={setInverterSizeLabelState}
              structureMicron={structureMicron}
              onStructureMicronChange={setStructureMicron}
              showPricing={!pricingLocked}
              legacyPanelLabel={legacyPanelLabel}
              legacyInverterLabel={
                legacyInverterLabel ||
                (!isFlorianInverterMake(inverterTypeName) ? inverterTypeName : "")
              }
            />

            <div className="mt-5 space-y-2">
              <label className="block text-sm font-medium text-slate-700">
                Meter phase <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-slate-500">
                Choose the connection type — GEB Meter Charges start from the matching preset
                {isCommercial ? " and can be edited below" : ""}.
              </p>
              <div className="grid gap-2">
                {phaseOptions.map((opt) => {
                  const active = meterPhase === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => onMeterPhaseChange(opt.id)}
                      className={`flex min-h-11 items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition ${
                        active
                          ? "border-brand-300 bg-brand-50 text-brand-900 ring-1 ring-brand-200"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                    >
                      <span className="font-medium">{opt.label}</span>
                      <span className={`shrink-0 font-semibold ${active ? "text-brand-700" : "text-slate-500"}`}>
                        {opt.amount <= 0 ? "Hint: Nil" : `Hint ${inr(opt.amount)}`}
                      </span>
                    </button>
                  );
                })}
              </div>
              {!meterPhase && (
                <p className="text-xs text-red-600">Select a meter phase to continue.</p>
              )}
            </div>

            {meterPhase && (
              <div className="mt-4 space-y-4">
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Meter charges (₹)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={meterChargeAmount === 0 ? "" : meterChargeAmount}
                    onChange={(e) => onMeterChargeAmountChange(e.target.value)}
                    className="min-h-11"
                    placeholder="Type amount (0 = Nil on PDF)"
                  />
                  <p className="mt-1 text-xs text-slate-500">
                    Type the meter amount for this quote. Phase labels stay from the template;
                    {selectedMeterOption
                      ? ` owner preset for this phase is ${
                          selectedMeterOption.amount > 0
                            ? inr(selectedMeterOption.amount)
                            : "Nil"
                        }.`
                      : " amount is never auto-filled."}
                  </p>
                </div>
                {isCommercial && (
                  <div>
                    <label className="mb-1.5 block text-sm font-medium text-slate-700">
                      GEB meter label (printed)
                    </label>
                    <Input
                      type="text"
                      value={meterPhaseLabel}
                      onChange={(e) => setMeterPhaseLabel(e.target.value)}
                      className="min-h-11"
                      placeholder="e.g. Three Phase"
                    />
                    <p className="mt-1 text-xs text-slate-500">
                      Shown on the proposal without kW bands (e.g. “Three Phase”).
                    </p>
                  </div>
                )}
              </div>
            )}

            {isCommercial && (
              <div className="mt-4">
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  GEDA charges
                </label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={gedaChargeAmount || ""}
                  onChange={(e) => setGedaChargeAmount(Math.max(0, Number(e.target.value) || 0))}
                  className="min-h-11"
                  placeholder="e.g. 5000"
                />
              </div>
            )}

            {errors.items && (
              <p className="mt-3 text-xs text-red-600">
                {isCommercial
                  ? "Select panel, count, mount option, inverter make + size, and meter phase."
                  : "Select panel, count, inverter make + size, and meter phase."}
              </p>
            )}
          </BuilderAccordionStep>

          <BuilderAccordionStep
            title="Bill of materials"
            subtitle="8 items"
            open={openSection === "materials"}
            onToggle={() => toggleSection("materials")}
            complete={bomItems.every((row) => row.component.trim() && row.imageUrl.trim())}
          >
            <FlorianBomPanel
              items={bomItems}
              quoteOnly={bomQuoteOnly}
              onItemsChange={setBomItems}
              onQuoteOnlyChange={setBomQuoteOnly}
            />
          </BuilderAccordionStep>

          <BuilderAccordionStep
            title="Other Items"
            subtitle={additionalItems.length > 0 ? `${additionalItems.length} added` : "Optional"}
            open={openSection === "other"}
            onToggle={() => toggleSection("other")}
            complete={additionalItems.length > 0}
          >
            <OtherItemsPanel
              catalog={catalog}
              items={additionalItems}
              onChange={setAdditionalItems}
              showPricing={!pricingLocked}
              canEditPricing={canEditQuotationPricing}
            />
          </BuilderAccordionStep>

          <BuilderAccordionStep
            title="Quote Details"
            open={openSection === "quote"}
            onToggle={() => toggleSection("quote")}
            complete={Boolean(quotationNo)}
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Quote number</label>
                <Input {...register("quotationNo")} readOnly className="min-h-11 bg-slate-50 text-slate-700" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Quote date</label>
                <Input {...register("quoteDate")} type="date" className="min-h-11" />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">Valid till</label>
                <Input {...register("validTill")} type="date" className="min-h-11" />
              </div>
            </div>
          </BuilderAccordionStep>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm lg:sticky lg:top-20">
          <h2 className="mb-3 text-base font-semibold text-slate-900">Quote summary</h2>

          {pricingLocked && (
            <p className="mb-3 text-xs text-slate-500">Pricing is locked for your role — only the final amount is shown.</p>
          )}

          {(systemSizeKw > 0 || inverterKw > 0) && (
            <div className="mb-4 rounded-xl border border-brand-100 bg-brand-50/50 px-3 py-3 text-sm">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-700/70">System</p>
              <p className="mt-0.5 text-xs font-medium uppercase tracking-wide text-slate-500">
                {METER_TYPE_LABELS[meterType]}
              </p>
              {moduleTypeName && <p className="mt-1 font-medium text-slate-800">{moduleTypeName}</p>}
              {systemSizeKw > 0 && (
                <p className="text-slate-600">
                  {systemSizeKw} kW · {panelCount} modules
                </p>
              )}
              {inverterTypeName && inverterSizeLabelState.trim() && (
                <p className="text-slate-600">
                  {inverterTypeName}
                  {inverterSizeLabelState.trim() ? ` · ${inverterSizeLabelState.trim()}` : ""}
                  {inverterKw > 0 ? ` (≈ ${inverterKw} kW)` : ""}
                </p>
              )}
            </div>
          )}

          <div className="space-y-2 text-sm">
            {!pricingLocked && (
              <>
                <div className="flex justify-between">
                  <span className="text-slate-500">System cost</span>
                  <span>{inr(systemCost)}</span>
                </div>

                {!pricingLocked && canEditQuotationPricing && systemCost > 0 && (
                  <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                    <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                      Discount
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="mb-1 block text-xs text-slate-500">Discount %</label>
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={0.01}
                          className="min-h-10 bg-white"
                          value={discountPercent || ""}
                          placeholder="0"
                          onChange={(e) => onDiscountPercentChange(e.target.value)}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-xs text-slate-500">Discount ₹</label>
                        <Input
                          type="number"
                          min={0}
                          max={systemCost}
                          step={1}
                          className="min-h-10 bg-white"
                          value={discountAmount || ""}
                          placeholder="0"
                          onChange={(e) => onDiscountAmountChange(e.target.value)}
                        />
                      </div>
                    </div>
                    {discountAmount > 0 && (
                      <div className="mt-2 flex justify-between text-xs text-rose-700">
                        <span>Less discount</span>
                        <span>− {inr(discountAmount)}</span>
                      </div>
                    )}
                  </div>
                )}

                {discountAmount > 0 && (
                  <div className="flex justify-between font-medium">
                    <span className="text-slate-600">Net system cost</span>
                    <span>{inr(netSystemCost)}</span>
                  </div>
                )}

                {additionalItems.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">Other items ({additionalItems.length})</span>
                    <span>{inr(otherTotals.total)}</span>
                  </div>
                )}
                {isCommercial && gedaChargeAmount > 0 && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">GEDA charges</span>
                    <span>{inr(gedaChargeAmount)}</span>
                  </div>
                )}
                {meterPhase && (
                  <div className="flex justify-between">
                    <span className="text-slate-500">
                      GEB Meter Charges
                      {isCommercial
                        ? meterPhaseLabel
                          ? ` (${meterPhaseLabel})`
                          : ""
                        : ` (${selectedMeterOption?.label ?? "phase"})`}
                    </span>
                    <span>{meterChargeAmount > 0 ? inr(meterChargeAmount) : "Nil"}</span>
                  </div>
                )}
                {subsidyAmount > 0 && (
                  <div className="flex justify-between text-emerald-700">
                    <span>
                      Subsidy
                      {meterType === "common" ? " (Common)" : ""}
                    </span>
                    <span>− {inr(subsidyAmount)}</span>
                  </div>
                )}
                {meterType === "common" && (
                  <p className="text-[11px] leading-snug text-slate-500">
                    {SUBSIDY_SCHEME_LABELS.society_common_meter}: manual amount
                  </p>
                )}
                {subsidyAmount > 0 && (
                  <div className="flex justify-between font-medium">
                    <span className="text-slate-600">After subsidy</span>
                    <span>{inr(Math.max(0, netSystemCost - subsidyAmount))}</span>
                  </div>
                )}
                {belowMin && (
                  <p className="text-xs text-red-600">
                    Net cost is below minimum sale price ({inr(minSalePrice)}).
                  </p>
                )}
              </>
            )}
            <div className={`flex justify-between ${pricingLocked ? "" : "border-t border-slate-200 pt-3"} text-lg font-bold text-slate-900`}>
              <span>Grand total</span>
              <span className="text-brand-700">
                {inr(
                  Math.max(
                    0,
                    totals.total +
                      (meterPhase ? meterChargeAmount : 0) +
                      (isCommercial ? gedaChargeAmount : 0)
                  )
                )}
              </span>
            </div>
          </div>

          {proposalTemplate ? (
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50/80 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Payment terms (from template)
              </p>
              <pre className="mt-2 whitespace-pre-wrap font-sans text-xs leading-relaxed text-slate-700">
                {formatPaymentTermsFromTemplate(
                  Math.max(
                    0,
                    netSystemCost +
                      (meterPhase ? meterChargeAmount : 0) +
                      (isCommercial ? gedaChargeAmount : 0)
                  ),
                  proposalTemplate
                )}
              </pre>
            </div>
          ) : null}

          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          {!canSave && !pending && saveBlockers.length > 0 && (
            <p className="mt-2 text-xs text-slate-500">
              To save, complete: {saveBlockers.join(", ")}.
            </p>
          )}

          <div className="mt-4 hidden flex-col gap-2 lg:flex">
            <Button disabled={!canSave} type="submit" className="w-full min-h-11">
              {pending ? "Saving…" : defaultValues?.id ? "Update quotation" : "Save quotation"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              className="w-full min-h-11"
              onClick={saveDraftAndLeave}
            >
              Back
            </Button>
            {defaultValues?.id && (
              <Link
                href={`/quotations/${defaultValues.id}/print`}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Open printable proposal
              </Link>
            )}
          </div>
        </div>
      </div>

      <div className="sticky-mobile-actions-spacer" aria-hidden />
      <div className="sticky-mobile-actions">
        <div className="mx-auto flex max-w-lg items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Grand total</p>
            <p className="text-lg font-bold text-slate-900">{inr(totals.total)}</p>
            {error && <p className="truncate text-xs text-red-600">{error}</p>}
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            className="min-h-11 shrink-0 px-4"
            onClick={saveDraftAndLeave}
          >
            Back
          </Button>
          <Button disabled={!canSave} type="submit" className="min-h-11 shrink-0 px-5">
            {pending ? "Saving…" : defaultValues?.id ? "Update" : "Save"}
          </Button>
        </div>
      </div>
    </form>
  );
}
