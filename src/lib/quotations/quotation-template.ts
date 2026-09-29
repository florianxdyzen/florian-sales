import { BRAND } from "@/lib/quotations/brand";

export type ProposalLayoutId = "horizon";

export type SolarProposalTemplate = {
  layoutId: ProposalLayoutId;
  proposalTitle: string;
  systemType: string;
  primaryColor: string;
  accentColor: string;
  coverBadge: string;
  poweredByLabel: string;
  coverImageUrl: string;
  systemImageUrl: string;
  installImageUrl: string;
  panelImageUrl: string;

  aboutIntro: string;
  whyChooseUs: string[];
  keyBenefits: string[];

  structureDesc: string;
  cableBrand: string;
  acCable: string;
  dcCable: string;
  acdb: string;
  dcdb: string;
  netMeter: string;
  earthPits: number;
  lightningArrestor: number;
  bosWarranty: string;
  panelWarranty: string;
  panelPerfWarranty: string;
  inverterWarranty: string;

  yieldPerKw: number;
  performanceRatio: number;
  tariff: number;
  escalation: number;
  co2Factor: number;
  treeFactor: number;

  additionalCharges: number;
  netMeterCharges: number;
  defaultSubsidy: number;

  meterCharges: {
    singlePhase1to6Label: string;
    singlePhase1to6: number;
    threePhase1to6Label: string;
    threePhase1to6: number;
    threePhase6to10Label: string;
    threePhase6to10: number;
  };

  advancePct: number;
  materialPct: number;
  installPct: number;
  meterPct: number;

  designDays: number;
  procDays: number;
  installDays: number;
  testDays: number;

  ourScope: string;
  customerScope: string;
  termsText: string;
  footerText: string;
  signatureLabel: string;

  preparedBy: string;
  preparedByPhone: string;

  coverHeroLine1: string;
  coverHeroLine2: string;
  coverHeroLine3: string;
  coverHeroSub: string;
  quotationLabel: string;
  quotationHeadline: string;
  quotationTagline: string;

  /** Page 1 — cover */
  coverTitle: string;
  /** Page 2 — offer & payment */
  offerPageTitle: string;
  offerLeadText: string;
  paymentDetailsIntro: string;
  /** Page 3 — system package */
  bomPageKicker: string;
  bomPageTitle: string;
  /** Page 4 — scope, savings & documents */
  scopePageTitle: string;
  savingsBlurb: string;
  /** Page 5 — thank you */
  thanksPageKicker: string;
  thanksPageTitle: string;
  thanksMessage: string;
  thanksContactHeading: string;
  thanksBranchesHeading: string;

  qrCodeUrl: string;
  bankAccountType: string;
  companyAddress: string;
  companyWebsite: string;
  requiredDocuments: string[];
  loanPaymentNote: string;

  previousWorkTitle: string;
  previousWorkPhotos: Array<{
    storagePath: string;
    url: string;
    caption?: string;
  }>;

  standardBomItems: Array<{
    component: string;
    specification: string;
    brand?: string;
    brandImageUrl?: string;
    qty?: string;
  }>;
};

export const DEFAULT_SOLAR_TEMPLATE: SolarProposalTemplate = {
  layoutId: "horizon",
  proposalTitle: "Solar Rooftop Quotation",
  systemType: "Grid-Tied On-Grid",
  primaryColor: BRAND.colors.navy,
  accentColor: BRAND.colors.orange,
  coverBadge: "Solar Rooftop",
  poweredByLabel: BRAND.name,
  coverImageUrl: BRAND.logo.coverHome,
  systemImageUrl: BRAND.logo.coverHome,
  installImageUrl: BRAND.logo.coverHome,
  panelImageUrl: BRAND.logo.coverHome,

  aboutIntro:
    "Thank you for considering {company} for your solar energy requirements. We are pleased to present this proposal for a grid-connected solar photovoltaic power plant at your site — designed, supplied and commissioned end-to-end.",
  whyChooseUs: [
    "Residential, commercial & industrial rooftop specialists",
    "MNRE-aligned EPC practices with quality BOS components",
    "Net-metering, subsidy assistance and DISCOM liaisoning support",
    "Monitoring setup and responsive after-sales service",
  ],
  keyBenefits: [
    "Lower electricity bills with reliable rooftop generation",
    "Net metering: export surplus units and offset grid consumption",
    "Low maintenance, long life — 25+ years of panel performance",
    "Tax depreciation benefit on system investment (where applicable)",
    "Measurable CO₂ reduction every year",
  ],

  structureDesc:
    "Hot-dip galvanized iron (HDGI) module mounting structure designed as per site conditions and relevant IS standards.",
  cableBrand: "Polycab / KEI / Reputed",
  acCable: "As per design — multi-core",
  dcCable: "As per design — solar grade",
  acdb: "Schneider / Havells / Reputed",
  dcdb: "Schneider / Havells / Reputed",
  netMeter: "DISCOM-approved smart / bi-directional meter",
  earthPits: 3,
  lightningArrestor: 1,
  bosWarranty: "As per OEM standard",
  panelWarranty: "12 Years product",
  panelPerfWarranty: "30 Years performance",
  inverterWarranty: "10 Years",

  yieldPerKw: 1440,
  performanceRatio: 100,
  tariff: 11,
  escalation: 3,
  co2Factor: 0.576,
  treeFactor: 0.01076,

  additionalCharges: 0,
  netMeterCharges: 0,
  defaultSubsidy: 0,

  meterCharges: {
    singlePhase1to6Label: "Single Phase (1 kW To 6 kW)",
    singlePhase1to6: 0,
    threePhase1to6Label: "Three Phase (1 kW To 6 kW)",
    threePhase1to6: 1960,
    threePhase6to10Label: "Three Phase (6 kW To 10 kW)",
    threePhase6to10: 25000,
  },

  advancePct: 20,
  materialPct: 70,
  installPct: 5,
  meterPct: 5,

  designDays: 7,
  procDays: 15,
  installDays: 20,
  testDays: 14,

  ourScope:
    "Preparation of engineering drawings and design as per relevant IS standards.\nSupply of solar modules, inverters, structures, cables and balance of plant.\nInstallation of structure, modules, inverter, AC/DC cables and protection boxes.\nMonitoring system installation where included in the offer.\nCommissioning, testing and handover of the solar plant.\nSupport for net-meter / subsidy documentation as applicable.",
  customerScope:
    "Shadow-free roof area ideally from 8:00 AM to 5:00 PM.\nSafe storage space and site access during installation.\nElectrical connection after MCB / ELCB as required by DISCOM.\nProvide ELCB or MCB for DISCOM meter where mandated.\nDesign / drawing approval within agreed timelines.\nPeriodic module cleaning after handover.",
  termsText:
    "This Quotation Is Valid For 15 Days\nIf Loan Approval, Payment, Or Order Confirmation Is Delayed Beyond This Period And There Is Any Increase In Solar System Prices Or Related Material Costs, The Revised Prevailing Rates Shall Apply And This Quotation Will Be Subject To Price Revision Accordingly.\nThe Panel Size May Vary By ±10 Watts In Any Case.\nIt Is Customer's Responsibility To Provide The Appropriate Place For Earthing Pit, Which Has No Obstacles Like Pipelines, Concrete Layer, Etc.\nIt Is Customer's Responsibility To Provide Welding Blanket Or Bedsheet To Prevent Welding Spots On Flooring Area.\nIt Is Customer's Responsibility To Provide High Voltage Socket For Welding Purposes Or We Won't Be Responsible For Any Electronic Equipment Damages.\nNOC Charges Are Under The Client Scope\nClient Is Responsible For Panel Cleaning\nELCB Or RCCB Cost Extra If Required By DISCOM\n5yrs Service Warranty Provided On The Solar System",
  footerText: `Quotation valid for 15 days · ${BRAND.name}`,
  signatureLabel: "Authorised Signatory",

  preparedBy: "",
  preparedByPhone: "",

  coverHeroLine1: BRAND.heroLine1,
  coverHeroLine2: BRAND.heroLine2,
  coverHeroLine3: BRAND.heroLine3,
  coverHeroSub: BRAND.heroSub,
  quotationLabel: BRAND.quotationLabel,
  quotationHeadline: BRAND.quotationTitle,
  quotationTagline: BRAND.quotationTagline,

  coverTitle: "SOLAR PROPOSAL",
  offerPageTitle: "Offer",
  offerLeadText: "Price Quote & Payment schedule for {capacity} Grid Tie Rooftop Solar System:",
  paymentDetailsIntro: "Payment can be paid in Cash or Cheque:",
  bomPageKicker: "Bill of materials",
  bomPageTitle: "System package",
  scopePageTitle: "Scope of work & savings",
  savingsBlurb:
    "Estimated generation, payback, and long-term savings for your rooftop solar plant.",
  thanksPageKicker: BRAND.name,
  thanksPageTitle: "Thank you",
  thanksMessage: "THANK YOU!",
  thanksContactHeading: "Contact Us",
  thanksBranchesHeading: "Our branches",

  qrCodeUrl: BRAND.logo.paymentQr,
  bankAccountType: BRAND.bank.accountType,
  companyAddress: BRAND.contact.address,
  companyWebsite: BRAND.contact.website,
  requiredDocuments: [
    "Copy of Latest Electricity Bill",
    "Copy of Aadhaar Card",
    "Bank Passbook / Cancelled Cheque",
    "Customer Contact Detail",
  ],
  loanPaymentNote:
    "If The Customer Opts For Loan:\nThe Bank will determine the down payment amount.\nThis down payment must be paid directly to the agency by the customer.\nOnce the Demand Draft (DD) from the bank is received, installation will be scheduled.\nDown payment must be provided before installation starts.",

  previousWorkTitle: "Previous Work",
  previousWorkPhotos: [
    {
      storagePath: "",
      url: "/brand/previous-work/01-rooftop.jpg",
      caption: "Rooftop solar",
    },
    {
      storagePath: "",
      url: "/brand/previous-work/02-installation.jpg",
      caption: "Installation",
    },
    {
      storagePath: "",
      url: "/brand/previous-work/03-array.jpg",
      caption: "Solar array",
    },
    {
      storagePath: "",
      url: "/brand/previous-work/04-panels-closeup.jpg",
      caption: "Panel handling",
    },
    {
      storagePath: "",
      url: "/brand/previous-work/05-team-install.jpg",
      caption: "Team installation",
    },
    {
      storagePath: "",
      url: "/brand/previous-work/06-rooftop-field.jpg",
      caption: "Completed rooftop",
    },
  ],

  standardBomItems: [
    {
      component: "Module Mounting Structure (80 Micron HDGI)",
      specification: "Leg & Rafter 80×40 · Purlin 60×40",
      brand: "ISI / Standard",
      brandImageUrl: "/brand/bom-premium/03-module-mounting-structure.png",
      qty: "As Per Design",
    },
    {
      component: "Solar DC Cables (2.5–4 Sq.mm)",
      specification: "As Per System",
      brand: "Polycab / KEI",
      brandImageUrl: "/brand/bom-premium/12-solar-dc-cables.png",
      qty: "As Per System",
    },
    {
      component: "AC Cables Copper (2.5–4 Sq.mm)",
      specification: "UV & Fire Resistant",
      brand: "Polycab / KEI",
      brandImageUrl: "/brand/bom-premium/13-ac-cables.png",
      qty: "As Per System",
    },
    {
      component: "AC/DC Protection (MCB & SPD)",
      specification: "As Per Capacity",
      brand: "Schneider / Havells",
      brandImageUrl: "/brand/bom-premium/16-ac-dc-protection.png",
      qty: "As Per Capacity",
    },
    {
      component: "Maintenance Free Chemical Earthing System",
      specification: "14mm × 1m",
      brand: "ISI / Standard",
      brandImageUrl: "/brand/bom-premium/09-maintenance-free-chemical-earthing-system.png",
      qty: "3 Nos",
    },
    {
      component: "Lightning Protection (Multi Spike)",
      specification: "14mm × 1m",
      brand: "ISI / Standard",
      brandImageUrl: "/brand/bom-premium/10-lightning-protection.png",
      qty: "1 Set",
    },
    {
      component: "Cable Conduit Pipe (25mm White)",
      specification: "As Per Design",
      brand: "ISI / Standard",
      brandImageUrl: "/brand/bom-premium/17-cable-conduit-pipe.png",
      qty: "As Per Design",
    },
    {
      component: "U Hook (SS 304)",
      specification: "60×40×60mm",
      brand: "SS 304",
      brandImageUrl: "/brand/bom-premium/06-u-hook.png",
      qty: "As Per Required",
    },
  ],
};

export const FALLBACK_PREVIOUS_WORK_PHOTOS: SolarProposalTemplate["previousWorkPhotos"] = [
  {
    storagePath: "",
    url: "/brand/previous-work/01-rooftop.jpg",
    caption: "Rooftop solar",
  },
  {
    storagePath: "",
    url: "/brand/previous-work/02-installation.jpg",
    caption: "Installation",
  },
  {
    storagePath: "",
    url: "/brand/previous-work/03-array.jpg",
    caption: "Solar array",
  },
  {
    storagePath: "",
    url: "/brand/previous-work/04-panels-closeup.jpg",
    caption: "Panel handling",
  },
  {
    storagePath: "",
    url: "/brand/previous-work/05-team-install.jpg",
    caption: "Team installation",
  },
  {
    storagePath: "",
    url: "/brand/previous-work/06-rooftop-field.jpg",
    caption: "Completed rooftop",
  },
];

/** Always six Previous Work photos (two rows of three), filling empty slots from defaults. */
export function resolvePreviousWorkPhotos(
  photos?: SolarProposalTemplate["previousWorkPhotos"] | null
): SolarProposalTemplate["previousWorkPhotos"] {
  const incoming = Array.isArray(photos) ? photos : [];
  return FALLBACK_PREVIOUS_WORK_PHOTOS.map((fallback, index) => {
    const row = incoming[index];
    const url = row?.url?.trim();
    if (!url) return fallback;
    return {
      storagePath: row.storagePath ?? "",
      url,
      ...(row.caption?.trim() ? { caption: row.caption.trim() } : fallback.caption ? { caption: fallback.caption } : {}),
    };
  });
}

function asString(v: unknown, fallback: string) {
  return typeof v === "string" && v.trim() ? v : fallback;
}

function asNumber(v: unknown, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function asStringList(v: unknown, fallback: string[]) {
  if (Array.isArray(v)) return v.map(String).filter(Boolean);
  if (typeof v === "string" && v.trim()) return v.split("\n").map((s) => s.trim()).filter(Boolean);
  return fallback;
}

function hexOk(hex: string, fallback: string) {
  return /^#[0-9A-Fa-f]{6}$/.test(hex) ? hex : fallback;
}

function isProposalLayoutId(v: unknown): v is ProposalLayoutId {
  return v === "horizon";
}

/** Normalize stored JSON — supports legacy simple template keys. */
export function normalizeSolarTemplate(
  raw: unknown,
  fallbacks?: {
    termsText?: string | null;
    footerText?: string | null;
    preparedBy?: string | null;
    preparedByPhone?: string | null;
  }
): SolarProposalTemplate {
  const src = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const d = DEFAULT_SOLAR_TEMPLATE;

  return {
    layoutId: isProposalLayoutId(src.layoutId) ? src.layoutId : d.layoutId,
    proposalTitle: asString(src.proposalTitle ?? src.documentTitle, d.proposalTitle),
    systemType: asString(src.systemType, d.systemType),
    primaryColor: hexOk(asString(src.primaryColor ?? src.accentColor, d.primaryColor), d.primaryColor),
    accentColor: hexOk(asString(src.accentColor, d.accentColor), d.accentColor),
    coverBadge: asString(src.coverBadge, d.coverBadge),
    poweredByLabel: asString(src.poweredByLabel, d.poweredByLabel),
    coverImageUrl: asString(src.coverImageUrl, d.coverImageUrl),
    systemImageUrl: asString(src.systemImageUrl, d.systemImageUrl),
    installImageUrl: asString(src.installImageUrl, d.installImageUrl),
    panelImageUrl: asString(src.panelImageUrl, d.panelImageUrl),

    aboutIntro: asString(src.aboutIntro ?? src.introText, d.aboutIntro),
    whyChooseUs: asStringList(src.whyChooseUs, d.whyChooseUs),
    keyBenefits: asStringList(src.keyBenefits, d.keyBenefits),

    structureDesc: asString(src.structureDesc, d.structureDesc),
    cableBrand: asString(src.cableBrand, d.cableBrand),
    acCable: asString(src.acCable, d.acCable),
    dcCable: asString(src.dcCable, d.dcCable),
    acdb: asString(src.acdb, d.acdb),
    dcdb: asString(src.dcdb, d.dcdb),
    netMeter: asString(src.netMeter, d.netMeter),
    earthPits: asNumber(src.earthPits, d.earthPits),
    lightningArrestor: asNumber(src.lightningArrestor, d.lightningArrestor),
    bosWarranty: asString(src.bosWarranty, d.bosWarranty),
    panelWarranty: asString(src.panelWarranty, d.panelWarranty),
    panelPerfWarranty: asString(src.panelPerfWarranty, d.panelPerfWarranty),
    inverterWarranty: asString(src.inverterWarranty, d.inverterWarranty),

    yieldPerKw: asNumber(src.yieldPerKw, d.yieldPerKw),
    performanceRatio: asNumber(src.performanceRatio, d.performanceRatio),
    tariff: asNumber(src.tariff, d.tariff),
    escalation: asNumber(src.escalation, d.escalation),
    co2Factor: asNumber(src.co2Factor, d.co2Factor),
    treeFactor: asNumber(src.treeFactor, d.treeFactor),

    additionalCharges: asNumber(src.additionalCharges, d.additionalCharges),
    netMeterCharges: asNumber(src.netMeterCharges, d.netMeterCharges),
    defaultSubsidy: asNumber(src.defaultSubsidy, d.defaultSubsidy),
    meterCharges: (() => {
      const rawMeter = src.meterCharges;
      const m =
        rawMeter && typeof rawMeter === "object" && !Array.isArray(rawMeter)
          ? (rawMeter as Record<string, unknown>)
          : {};
      return {
        singlePhase1to6Label: asString(m.singlePhase1to6Label, d.meterCharges.singlePhase1to6Label),
        singlePhase1to6: asNumber(m.singlePhase1to6, d.meterCharges.singlePhase1to6),
        threePhase1to6Label: asString(m.threePhase1to6Label, d.meterCharges.threePhase1to6Label),
        threePhase1to6: asNumber(m.threePhase1to6, d.meterCharges.threePhase1to6),
        threePhase6to10Label: asString(m.threePhase6to10Label, d.meterCharges.threePhase6to10Label),
        threePhase6to10: asNumber(m.threePhase6to10, d.meterCharges.threePhase6to10),
      };
    })(),

    advancePct: asNumber(src.advancePct, d.advancePct),
    materialPct: asNumber(src.materialPct, d.materialPct),
    installPct: asNumber(src.installPct, d.installPct),
    meterPct: asNumber(src.meterPct, d.meterPct),

    designDays: asNumber(src.designDays, d.designDays),
    procDays: asNumber(src.procDays, d.procDays),
    installDays: asNumber(src.installDays, d.installDays),
    testDays: asNumber(src.testDays, d.testDays),

    ourScope: asString(src.ourScope, d.ourScope),
    customerScope: asString(src.customerScope, d.customerScope),
    termsText: asString(src.termsText, fallbacks?.termsText?.trim() || d.termsText),
    footerText: asString(src.footerText, fallbacks?.footerText?.trim() || d.footerText),
    signatureLabel: asString(src.signatureLabel, d.signatureLabel),

    preparedBy: asString(src.preparedBy, fallbacks?.preparedBy?.trim() || d.preparedBy),
    preparedByPhone: asString(src.preparedByPhone, fallbacks?.preparedByPhone?.trim() || d.preparedByPhone),

    coverHeroLine1: asString(src.coverHeroLine1, d.coverHeroLine1),
    coverHeroLine2: asString(src.coverHeroLine2, d.coverHeroLine2),
    coverHeroLine3: asString(src.coverHeroLine3, d.coverHeroLine3),
    coverHeroSub: asString(src.coverHeroSub, d.coverHeroSub),
    quotationLabel: asString(src.quotationLabel, d.quotationLabel),
    quotationHeadline: asString(src.quotationHeadline, d.quotationHeadline),
    quotationTagline: asString(src.quotationTagline, d.quotationTagline),

    coverTitle: asString(src.coverTitle, d.coverTitle),
    offerPageTitle: asString(src.offerPageTitle, d.offerPageTitle),
    offerLeadText: asString(src.offerLeadText, d.offerLeadText),
    paymentDetailsIntro: asString(src.paymentDetailsIntro, d.paymentDetailsIntro),
    bomPageKicker: asString(src.bomPageKicker, d.bomPageKicker),
    bomPageTitle: asString(src.bomPageTitle, d.bomPageTitle),
    scopePageTitle: asString(src.scopePageTitle, d.scopePageTitle),
    savingsBlurb: asString(src.savingsBlurb, d.savingsBlurb),
    thanksPageKicker: asString(src.thanksPageKicker, d.thanksPageKicker),
    thanksPageTitle: asString(src.thanksPageTitle, d.thanksPageTitle),
    thanksMessage: asString(src.thanksMessage, d.thanksMessage),
    thanksContactHeading: asString(src.thanksContactHeading, d.thanksContactHeading),
    thanksBranchesHeading: asString(src.thanksBranchesHeading, d.thanksBranchesHeading),

    qrCodeUrl: asString(src.qrCodeUrl, d.qrCodeUrl),
    bankAccountType: asString(src.bankAccountType, d.bankAccountType),
    companyAddress: asString(src.companyAddress, d.companyAddress),
    companyWebsite: asString(src.companyWebsite, d.companyWebsite),
    requiredDocuments: asStringList(src.requiredDocuments, d.requiredDocuments),
    loanPaymentNote: asString(src.loanPaymentNote, d.loanPaymentNote),
    previousWorkTitle: asString(src.previousWorkTitle, d.previousWorkTitle),
    previousWorkPhotos: (() => {
      const out: SolarProposalTemplate["previousWorkPhotos"] = [];
      if (Array.isArray(src.previousWorkPhotos)) {
        for (const row of src.previousWorkPhotos) {
          if (!row || typeof row !== "object") continue;
          const r = row as Record<string, unknown>;
          const storagePath = typeof r.storagePath === "string" ? r.storagePath : "";
          const url = typeof r.url === "string" ? r.url : "";
          if (!storagePath && !url) continue;
          out.push({
            storagePath,
            url,
            ...(typeof r.caption === "string" ? { caption: r.caption } : {}),
          });
        }
      }
      return resolvePreviousWorkPhotos(out);
    })(),
    standardBomItems: (() => {
      if (!Array.isArray(src.standardBomItems) || src.standardBomItems.length === 0) {
        return d.standardBomItems;
      }
      const out: SolarProposalTemplate["standardBomItems"] = [];
      for (const row of src.standardBomItems) {
        if (!row || typeof row !== "object") continue;
        const r = row as Record<string, unknown>;
        const component = typeof r.component === "string" ? r.component.trim() : "";
        if (!component) continue;
        out.push({
          component,
          specification: typeof r.specification === "string" ? r.specification : "",
          ...(typeof r.brand === "string" ? { brand: r.brand } : {}),
          ...(typeof r.brandImageUrl === "string" ? { brandImageUrl: r.brandImageUrl } : {}),
          ...(typeof r.qty === "string" ? { qty: r.qty } : {}),
        });
      }
      return out.length ? out : d.standardBomItems;
    })(),
  };
}

/** Sample quote used by the live preview on the template editor. */
export function sampleQuotationForPreview(template: SolarProposalTemplate) {
  return {
    quotationNo: "RK-2026-0042",
    quoteDate: "2026-07-14",
    validTill: "2026-08-14",
    status: "draft",
    customerName: "Sample Customer",
    customerPhone: "9876543210",
    customerAddress: "Vadodara, Gujarat",
    projectType: "residential" as const,
    items: [
      {
        item_name_snapshot: "Solar PV System Package",
        brand_snapshot: "Waaree",
        model_snapshot: "TOPCON · 615/620WP",
        quantity: 1,
        unit: "set",
        rate: 249000,
        gst_percent: 0,
        line_total: 249000,
      },
      {
        item_name_snapshot: "Solar Module",
        brand_snapshot: "Waaree",
        model_snapshot: "615/620WP",
        quantity: 8,
        unit: "pcs",
        rate: 0,
        gst_percent: 0,
        line_total: 0,
      },
      {
        item_name_snapshot: "On Grid Tied Inverter",
        brand_snapshot: "VSOLE",
        model_snapshot: "5 kW",
        quantity: 1,
        unit: "nos",
        rate: 0,
        gst_percent: 0,
        line_total: 0,
      },
    ],
    subtotal: 249000,
    discountTotal: 0,
    taxableTotal: 249000,
    gstTotal: 0,
    grandTotal: 249000,
    terms: template.termsText,
    subsidy: template.defaultSubsidy || 78000,
    moduleTypeName: "TOPCON (610/615/620 WP)",
    moduleCompanyName: "Waaree",
    moduleCapacityLabel: "615/620WP",
    systemSizeKw: 4.96,
    panelCount: 8,
    systemCost: 249000,
    meterPhase: "single_phase_1_6",
    meterChargeAmount: template.meterCharges.singlePhase1to6,
    meterPhaseLabel: template.meterCharges.singlePhase1to6Label,
  };
}

