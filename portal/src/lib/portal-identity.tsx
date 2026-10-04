import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useGetCenterSettingsQuery, useGetPublicCenterSettingsQuery } from "../store/api";
import { useAppSelector } from "../store/store";
import { selectTheme } from "../store/preferencesSlice";
import { resolveTheme } from "../utils/theme";

const VIARA_PRIMARY = "#087F5B";

type ThemeMode = "light" | "dark";

type PortalIdentityInput = {
  settings?: Record<string, any> | null;
  branchId?: string | number | null;
  language?: string;
  theme?: ThemeMode;
};

export type PortalIdentity = {
  isLoading: boolean;
  center: {
    name: string;
    legalName: string;
    logoUrl: string;
    initials: string;
    website: string;
    footerText: string;
    welcomeMessage: string;
  };
  branch: {
    id: string;
    name: string;
    address: string;
    phone: string;
    hotline: string;
    whatsapp: string;
    email: string;
    workingHours: string;
    mapsUrl: string;
  };
  contacts: {
    phone: string;
    hotline: string;
    whatsapp: string;
    email: string;
    supportEmail: string;
    address: string;
    website: string;
    workingHours: string;
    mapsUrl: string;
  };
  branding: {
    brand: string;
    brandHover: string;
    brandStrong: string;
    brandSoft: string;
    brandFaint: string;
    brandContrast: string;
    cssVars: React.CSSProperties;
  };
  platform: {
    name: string;
    attribution: string;
  };
};

export type PortalBranchSummary = {
  id: string;
  name: string;
  tag: string;
  address: string;
  phone: string;
  hours: string;
  modalities: string[];
  position: string;
  mapsUrl: string;
};

const safeString = (...values: any[]) =>
  values.find((value) => typeof value === "string" && value.trim())?.trim() || "";
const cleanPhone = (value: string) => value.replace(/[^\d+]/g, "");
const isArabic = (language = "en") => language.split("-")[0] === "ar";

const normalizeHexColor = (value?: string) => {
  const raw = typeof value === "string" ? value.trim() : "";
  const match = raw.match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (!match) return "";
  const hex = match[1];
  return `#${
    hex.length === 3
      ? hex
          .split("")
          .map((char) => `${char}${char}`)
          .join("")
      : hex
  }`.toUpperCase();
};

const isHexColor = (value?: string) => Boolean(normalizeHexColor(value));

const hexToRgbParts = (hex: string) => {
  const normalized = normalizeHexColor(hex) || VIARA_PRIMARY;
  const value = Number.parseInt(normalized.slice(1), 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
};

const luminance = (hex: string) => {
  const { r, g, b } = hexToRgbParts(hex);
  const values = [r, g, b].map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.03928 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return values[0] * 0.2126 + values[1] * 0.7152 + values[2] * 0.0722;
};

const contrastRatio = (a: string, b: string) => {
  const light = Math.max(luminance(a), luminance(b));
  const dark = Math.min(luminance(a), luminance(b));
  return (light + 0.05) / (dark + 0.05);
};

const safeBrandColor = (value?: string) => {
  const normalized = normalizeHexColor(value);
  return normalized || VIARA_PRIMARY;
};

const mixWith = (hex: string, target: string, amount: number) => {
  const from = hexToRgbParts(hex);
  const to = hexToRgbParts(target);
  const mix = (a: number, b: number) => Math.round(a + (b - a) * amount);
  return `#${[mix(from.r, to.r), mix(from.g, to.g), mix(from.b, to.b)].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
};

const rgbChannels = (hex: string) => {
  const { r, g, b } = hexToRgbParts(hex);
  return `${r} ${g} ${b}`;
};

const getBranchList = (settings: Record<string, any>) => {
  const candidates = [
    settings.branches,
    settings.branch_settings,
    settings.locations,
    settings.homepage_settings?.branches,
  ];
  return candidates.find((value) => Array.isArray(value)) || [];
};

const resolveBranch = (settings: Record<string, any>, branchId?: string | number | null) => {
  const branches = getBranchList(settings);
  if (!branches.length) return {};
  if (branchId == null)
    return (
      branches.find((branch: any) => branch?.is_default || branch?.default) || branches[0] || {}
    );
  const key = String(branchId);
  return (
    branches.find(
      (branch: any) =>
        String(branch?.id ?? branch?.branch_id ?? branch?.code ?? branch?.name) === key,
    ) ||
    branches[0] ||
    {}
  );
};

const resolveWorkingHours = (branch: Record<string, any>, settings: Record<string, any>) => {
  const hours = branch.working_hours || settings.working_hours || settings.opening_hours || "";
  if (typeof hours === "string") return hours;
  if (Array.isArray(hours) && hours[0]) {
    const first = hours[0];
    return [first.day, [first.open, first.close].filter(Boolean).join(" - ")]
      .filter(Boolean)
      .join(": ");
  }
  if (hours && typeof hours === "object") {
    const start = hours.start ?? hours.open ?? 6;
    const end = hours.end ?? hours.close ?? 22;
    return `${String(start).padStart(2, "0")}:00 - ${String(end).padStart(2, "0")}:00`;
  }
  return "";
};

const normalizeModalities = (branch: Record<string, any>) => {
  const values =
    branch.modalities ||
    branch.supported_modalities ||
    branch.services ||
    branch.service_names ||
    [];
  if (!Array.isArray(values)) return [];
  return values
    .map((value: any) =>
      typeof value === "string" ? value : safeString(value?.name, value?.title, value?.label),
    )
    .filter(Boolean)
    .slice(0, 5);
};

export const resolvePortalBranches = ({
  settings = {},
  language = "en",
}: PortalIdentityInput): PortalBranchSummary[] => {
  const source = settings || {};
  const ar = isArabic(language);
  const branches = getBranchList(source);
  const centerIdentity = resolvePortalIdentity({ settings: source, language });
  const fallbackTag = ar ? "الفرع الرئيسي" : "Main location";

  const summaries = branches
    .map((branch: any, index: number) => {
      const address = safeString(
        ar && branch.address_ar,
        branch.address,
        source.address,
        source.main_address,
      );
      const mapsUrl =
        safeString(branch.google_maps_url, branch.maps_url) ||
        (address
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
          : "");
      return {
        id: String(branch.id ?? branch.branch_id ?? branch.code ?? index),
        name: safeString(
          ar && branch.branch_name_ar,
          ar && branch.name_ar,
          branch.branch_name,
          branch.name,
          `${centerIdentity.center.name} ${index + 1}`,
        ),
        tag: safeString(
          ar && branch.tag_ar,
          ar && branch.region_ar,
          branch.tag,
          branch.region,
          branch.type,
          fallbackTag,
        ),
        address,
        phone: safeString(
          branch.hotline,
          branch.phone,
          branch.contact_phone,
          source.hotline,
          source.phone,
          source.contact_phone,
        ),
        hours: resolveWorkingHours(branch, source),
        modalities: normalizeModalities(branch),
        position: `${Math.min(82, 8 + index * 18)}%`,
        mapsUrl,
      };
    })
    .filter((branch) => branch.name);

  if (summaries.length) return summaries;

  if (
    !centerIdentity.contacts.address &&
    !centerIdentity.contacts.phone &&
    !centerIdentity.contacts.workingHours
  )
    return [];
  return [
    {
      id: centerIdentity.branch.id || "main",
      name: centerIdentity.branch.name || centerIdentity.center.name,
      tag: fallbackTag,
      address: centerIdentity.contacts.address,
      phone: centerIdentity.contacts.hotline || centerIdentity.contacts.phone,
      hours: centerIdentity.contacts.workingHours,
      modalities: [],
      position: "45%",
      mapsUrl: centerIdentity.contacts.mapsUrl,
    },
  ];
};

export const resolvePortalIdentity = ({
  settings = {},
  branchId,
  language = "en",
  theme = "light",
}: PortalIdentityInput): PortalIdentity => {
  const source = settings || {};
  const branch = resolveBranch(source, branchId);
  const ar = isArabic(language);

  const centerName = safeString(
    ar && source.center_name_ar,
    ar && source.legal_name_ar,
    source.center_name,
    source.name,
    source.legal_name,
    "Radiology Center",
  );
  const branchName = safeString(
    ar && branch.branch_name_ar,
    ar && branch.name_ar,
    ar && source.branch_name_ar,
    branch.branch_name,
    branch.name,
    source.branch_name,
  );
  const address = safeString(
    ar && branch.address_ar,
    ar && source.address_ar,
    branch.address,
    source.address,
    source.main_address,
  );
  const phone = safeString(branch.phone, branch.contact_phone, source.phone, source.contact_phone);
  const hotline = safeString(branch.hotline, source.hotline, phone);
  const whatsapp = safeString(branch.whatsapp, source.whatsapp, hotline, phone);
  const email = safeString(branch.email, source.email);
  const supportEmail = safeString(source.support_email, email);
  const website = safeString(source.website, source.website_url);
  const welcomeMessage = safeString(
    ar && branch.portal_welcome_message_ar,
    ar && source.portal_welcome_message_ar,
    branch.portal_welcome_message,
    source.portal_welcome_message,
    source.homepage_settings?.heroSubtitle,
  );
  const footerText = safeString(
    ar && source.portal_footer_ar,
    source.portal_footer,
    ar && source.report_footer_ar,
    source.report_footer,
  );
  const logoUrl = safeString(
    theme === "dark" && branch.logo_dark_url,
    theme === "dark" && source.logo_dark_url,
    theme === "dark" && source.dark_logo_url,
    branch.logo_light_url,
    branch.logo_url,
    source.logo_light_url,
    source.light_logo_url,
    source.logo_url,
    source.logo,
  );
  const workingHours = resolveWorkingHours(branch, source);
  const mapsQuery = safeString(branch.google_maps_url, branch.maps_url);
  const mapsUrl =
    mapsQuery ||
    (address
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
      : "");
  const brand = safeBrandColor(
    safeString(
      source.homepage_settings?.theme?.accentColor,
      source.center_primary_color,
      source.primary_brand_color,
      source.brand_color,
      source.print_settings?.themeColor,
      source.primary_color,
    ),
  );
  const brandScale = {
    50: mixWith(brand, "#ffffff", 0.92),
    100: mixWith(brand, "#ffffff", 0.84),
    200: mixWith(brand, "#ffffff", 0.68),
    300: mixWith(brand, "#ffffff", 0.5),
    400: mixWith(brand, "#ffffff", 0.26),
    500: mixWith(brand, "#ffffff", 0.1),
    600: brand,
    700: mixWith(brand, "#000000", 0.16),
    800: mixWith(brand, "#000000", 0.28),
    900: mixWith(brand, "#000000", 0.4),
  };
  const contrastCandidates = ["#ffffff", "#172326", "#000000"];
  const brandContrast =
    contrastCandidates.find((candidate) => contrastRatio(brand, candidate) >= 4.5) || "#000000";
  const darkAccentSteps = [600, 500, 400, 300, 200, 100, 50] as const;
  const brandAccent =
    theme === "dark"
      ? darkAccentSteps
          .map((step) => brandScale[step])
          .find((color) => contrastRatio(color, "#171d20") >= 4.5) || "#ffffff"
      : brand;
  const brandAccentContrast =
    contrastCandidates.find((candidate) => contrastRatio(brandAccent, candidate) >= 4.5) ||
    "#000000";
  const brandAccentHover =
    theme === "dark"
      ? [300, 200, 100, 50, 400, 500, 600]
          .map((step) => brandScale[step as keyof typeof brandScale])
          .find(
            (color) => color !== brandAccent && contrastRatio(color, brandAccentContrast) >= 4.5,
          ) || brandAccent
      : brandScale[700];
  const hoverCandidate = mixWith(brand, "#000000", 0.16);
  const strongCandidate = mixWith(brand, "#000000", 0.28);
  const brandHover = contrastRatio(hoverCandidate, brandContrast) >= 4.5 ? hoverCandidate : brand;
  const brandStrong =
    contrastRatio(strongCandidate, brandContrast) >= 4.5 ? strongCandidate : brandHover;
  const brandSoft = mixWith(
    brand,
    theme === "dark" ? "#101518" : "#ffffff",
    theme === "dark" ? 0.78 : 0.88,
  );
  const brandFaint = mixWith(
    brand,
    theme === "dark" ? "#101518" : "#ffffff",
    theme === "dark" ? 0.9 : 0.94,
  );
  const initials =
    centerName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part: string) => part[0]?.toUpperCase())
      .join("") || "RC";

  return {
    isLoading: false,
    center: {
      name: centerName,
      legalName: safeString(source.legal_name, centerName),
      logoUrl,
      initials,
      website,
      footerText,
      welcomeMessage,
    },
    branch: {
      id: String(branch.id ?? branch.branch_id ?? ""),
      name: branchName,
      address,
      phone,
      hotline,
      whatsapp,
      email,
      workingHours,
      mapsUrl,
    },
    contacts: {
      phone,
      hotline,
      whatsapp,
      email,
      supportEmail,
      address,
      website,
      workingHours,
      mapsUrl,
    },
    branding: {
      brand,
      brandHover,
      brandStrong,
      brandSoft,
      brandFaint,
      brandContrast,
      cssVars: {
        "--portal-identity-brand": brand,
        "--portal-identity-brand-hover": brandHover,
        "--portal-identity-brand-strong": brandStrong,
        "--portal-identity-brand-soft": brandSoft,
        "--portal-identity-brand-faint": brandFaint,
        "--portal-identity-brand-contrast": brandContrast,
        "--portal-brand": brand,
        "--portal-brand-hover": brandHover,
        "--portal-brand-strong": brandStrong,
        "--portal-brand-soft": brandSoft,
        "--portal-brand-faint": brandFaint,
        "--portal-brand-contrast": brandContrast,
        "--primary-foreground": brandAccentContrast,
        "--primary-dark": brandAccentHover,
        "--primary-soft": brandSoft,
        "--ring": brandAccent,
        "--VIARA-accent": brandAccent,
        "--VIARA-accent-text": brandAccent,
        "--VIARA-accent-dark": brandAccentHover,
        "--VIARA-accent-soft": brandSoft,
        ...Object.fromEntries(
          Object.entries(brandScale).map(([step, color]) => [
            `--primary-${step}-rgb`,
            rgbChannels(color),
          ]),
        ),
      } as React.CSSProperties,
    },
    platform: {
      name: "VIARA",
      attribution: "Powered by VIARA",
    },
  };
};

const PortalIdentityContext = createContext<PortalIdentity | null>(null);

export const PortalIdentityProvider = ({
  children,
  authenticated = false,
  branchId,
}: {
  children: React.ReactNode;
  authenticated?: boolean;
  branchId?: string | number | null;
}) => {
  const { i18n } = useTranslation();
  const themePreference = useAppSelector(selectTheme);
  const [theme, setTheme] = useState<ThemeMode>(() => resolveTheme(themePreference));
  const language = (i18n.resolvedLanguage || i18n.language || "en").split("-")[0];
  const publicSettings = useGetPublicCenterSettingsQuery(undefined);
  const privateSettings = useGetCenterSettingsQuery(undefined, { skip: !authenticated });
  const rawSettings = authenticated
    ? privateSettings.data || publicSettings.data
    : publicSettings.data;
  const isLoading = authenticated
    ? publicSettings.isLoading || privateSettings.isLoading
    : publicSettings.isLoading;

  useEffect(() => {
    const syncTheme = () => setTheme(resolveTheme(themePreference));
    syncTheme();

    if (themePreference !== "system" || typeof window.matchMedia !== "function") return undefined;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener?.("change", syncTheme);
    return () => media.removeEventListener?.("change", syncTheme);
  }, [themePreference]);

  const identity = useMemo(
    () => ({
      ...resolvePortalIdentity({
        settings: rawSettings || {},
        branchId,
        language,
        theme,
      }),
      isLoading,
    }),
    [branchId, isLoading, language, rawSettings, theme],
  );

  return (
    <PortalIdentityContext.Provider value={identity}>
      <div style={identity.branding.cssVars}>{children}</div>
    </PortalIdentityContext.Provider>
  );
};

export const usePortalIdentity = () => {
  const identity = useContext(PortalIdentityContext);
  if (!identity) return resolvePortalIdentity({});
  return identity;
};
