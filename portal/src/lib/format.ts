import type { Lang } from "./i18n";

const localeFor = (lang: Lang) => (lang === "ar" ? "ar-EG" : "en-GB");

export function formatDate(input: string | number | Date | null | undefined, lang: Lang): string {
  if (!input) return "";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(localeFor(lang), { year: "numeric", month: "short", day: "2-digit" });
}

export function formatTime(input: string | number | Date | null | undefined, lang: Lang): string {
  if (!input) return "";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString(localeFor(lang), { hour: "2-digit", minute: "2-digit" });
}

export function formatDateTime(input: string | number | Date | null | undefined, lang: Lang): string {
  if (!input) return "";
  const d = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(d.getTime())) return "";
  return `${formatDate(d, lang)} · ${formatTime(d, lang)}`;
}

export function formatCurrency(
  amount: number | string | null | undefined,
  lang: Lang,
  currency: string = "EGP"
): string {
  const n = typeof amount === "string" ? Number(amount) : amount ?? 0;
  if (!Number.isFinite(n)) return "";
  try {
    return new Intl.NumberFormat(lang === "ar" ? "ar-EG" : "en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: 2,
    }).format(n);
  } catch {
    return `${n} ${currency}`;
  }
}

export function formatBytes(bytes: number | null | undefined): string {
  if (!bytes || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = bytes;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 || i === 0 ? 0 : 1)} ${units[i]}`;
}

export function initialsFromName(name: string | null | undefined, fallback = "NA"): string {
  if (!name) return fallback;
  const parts = name.trim().split(/\s+/).slice(0, 2);
  const s = parts.map((p) => p[0]).filter(Boolean).join("").toUpperCase();
  return s || fallback;
}
