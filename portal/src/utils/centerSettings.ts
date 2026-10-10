export interface WorkingHours {
  start: number;
  end: number;
  holidays: string[];
}

export interface PrintSettings {
  stickerWidth: string;
  stickerHeight: string;
  receiptWidth: string;
  receiptHeader: string;
  receiptFooter: string;
  showQR: boolean;
  themeColor: string;
  fontFamily: string;
  invoiceTerms: string;
  showWatermark: boolean;
  headerLayout: string;
}

export interface ServiceItem {
  title: string;
  description: string;
}

export interface StatItem {
  value: string;
  label: string;
}

export interface HomepageSettings {
  enabled: boolean;
  heroTitle: string;
  heroSubtitle: string;
  announcement: string;
  heroImageUrl: string;
  accentColor: string;
  primaryCtaLabel: string;
  primaryCtaUrl: string;
  secondaryCtaLabel: string;
  secondaryCtaUrl: string;
  services: ServiceItem[];
  stats: StatItem[];
  highlights: string[];
}

export interface CenterSettings {
  center_name: string;
  center_name_ar?: string;
  branch_name: string;
  branch_name_ar?: string;
  logo_url?: string | null;
  contact_person?: string;
  other_details?: string;
  tax_id?: string;
  phone?: string;
  email?: string;
  address?: string;
  invoice_prefix?: string;
  report_header?: string;
  report_footer?: string;
  working_hours: WorkingHours;
  print_settings: PrintSettings;
  homepage_settings: HomepageSettings;
}

const DEFAULT_CENTER_SETTINGS: CenterSettings = {
  center_name: "Radiology Center",
  branch_name: "",
  logo_url: "",
  contact_person: "",
  other_details: "",
  tax_id: "",
  phone: "",
  email: "",
  address: "",
  invoice_prefix: "INV-",
  report_header: "",
  report_footer: "",
  working_hours: { start: 6, end: 22, holidays: [] },
  print_settings: {
    stickerWidth: "3.8in",
    stickerHeight: "1.8in",
    receiptWidth: "80mm",
    receiptHeader: "",
    receiptFooter: "",
    showQR: true,
    themeColor: "#087F5B",
    fontFamily: "Inter",
    invoiceTerms: "",
    showWatermark: true,
    headerLayout: "classic",
  },
  homepage_settings: {
    enabled: true,
    heroTitle: "",
    heroSubtitle: "",
    announcement: "",
    heroImageUrl: "",
    accentColor: "",
    primaryCtaLabel: "",
    primaryCtaUrl: "",
    secondaryCtaLabel: "",
    secondaryCtaUrl: "",
    services: [],
    stats: [],
    highlights: [],
  },
};

export const normalizeCenterSettings = (
  settings: Record<string, any> = {},
  language: string = "en",
): CenterSettings => {
  const workingHours = settings.working_hours || {};
  const printSettings = settings.print_settings || {};
  const homepageSettings = settings.homepage_settings || {};

  const isRtl = language === "ar";
  const centerName =
    isRtl && settings.center_name_ar
      ? settings.center_name_ar
      : settings.center_name || DEFAULT_CENTER_SETTINGS.center_name;
  const branchName =
    isRtl && settings.branch_name_ar
      ? settings.branch_name_ar
      : settings.branch_name || DEFAULT_CENTER_SETTINGS.branch_name;

  return {
    ...DEFAULT_CENTER_SETTINGS,
    ...settings,
    center_name: centerName,
    branch_name: branchName,
    working_hours: {
      ...DEFAULT_CENTER_SETTINGS.working_hours,
      ...workingHours,
      holidays: Array.isArray(workingHours.holidays) ? workingHours.holidays : [],
    },
    print_settings: {
      ...DEFAULT_CENTER_SETTINGS.print_settings,
      ...printSettings,
      showQR: printSettings.showQR !== false,
      showWatermark: printSettings.showWatermark !== false,
    },
    homepage_settings: {
      ...DEFAULT_CENTER_SETTINGS.homepage_settings,
      ...homepageSettings,
      enabled: homepageSettings.enabled !== false,
      heroTitle: homepageSettings.heroTitle || "",
      heroSubtitle: homepageSettings.heroSubtitle || "",
      announcement: homepageSettings.announcement || "",
      heroImageUrl: homepageSettings.heroImageUrl || "",
      accentColor: homepageSettings.accentColor || "",
      primaryCtaLabel: homepageSettings.primaryCtaLabel || "",
      primaryCtaUrl: homepageSettings.primaryCtaUrl || "",
      secondaryCtaLabel: homepageSettings.secondaryCtaLabel || "",
      secondaryCtaUrl: homepageSettings.secondaryCtaUrl || "",
      services: Array.isArray(homepageSettings.services) ? homepageSettings.services : [],
      stats: Array.isArray(homepageSettings.stats) ? homepageSettings.stats : [],
      highlights: Array.isArray(homepageSettings.highlights) ? homepageSettings.highlights : [],
    },
  };
};

export const getCenterDisplayName = (settings: Record<string, any> = {}): string => {
  const normalized = normalizeCenterSettings(settings);
  return [normalized.center_name, normalized.branch_name].filter(Boolean).join(" - ");
};

export const buildReceiptHeader = (settings: Record<string, any> = {}): string => {
  const normalized = normalizeCenterSettings(settings);
  if (normalized.print_settings.receiptHeader?.trim())
    return normalized.print_settings.receiptHeader;

  return [
    normalized.center_name,
    normalized.branch_name,
    normalized.address,
    normalized.phone && `Phone: ${normalized.phone}`,
    normalized.email && `Email: ${normalized.email}`,
    normalized.contact_person && `Contact: ${normalized.contact_person}`,
    normalized.other_details,
  ]
    .filter(Boolean)
    .join("\n");
};

export const buildReceiptFooter = (settings: Record<string, any> = {}): string => {
  const normalized = normalizeCenterSettings(settings);
  return (
    normalized.print_settings.receiptFooter?.trim() ||
    `Thank you for choosing ${normalized.center_name}.`
  );
};

export const buildReportHeader = (settings: Record<string, any> = {}): string => {
  const normalized = normalizeCenterSettings(settings);
  return (
    normalized.report_header?.trim() ||
    [
      getCenterDisplayName(normalized),
      normalized.address,
      normalized.phone && `Phone: ${normalized.phone}`,
      normalized.email && `Email: ${normalized.email}`,
    ]
      .filter(Boolean)
      .join("\n")
  );
};

export const buildReportFooter = (settings: Record<string, any> = {}): string => {
  const normalized = normalizeCenterSettings(settings);
  return (
    normalized.report_footer?.trim() || `${normalized.center_name} - Confidential medical report`
  );
};
