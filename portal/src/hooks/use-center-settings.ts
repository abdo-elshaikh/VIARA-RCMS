import { useEffect, useMemo, useState } from "react";
import { fetchPublicCenterSettings } from "@/lib/api";

export type CenterWorkingHour =
  | {
      day?: string;
      open?: string;
      close?: string;
    }
  | {
      start?: number;
      end?: number;
    };

export type PublicCenterSettings = {
  center_name?: string;
  branch_name?: string;
  logo_url?: string;
  phone?: string;
  contact_phone?: string;
  email?: string;
  address?: string;
  working_hours?: CenterWorkingHour[] | { start?: number; end?: number } | string;
  opening_time?: string;
  closing_time?: string;
};

export function getCenterName(settings?: PublicCenterSettings | null) {
  return settings?.center_name || settings?.branch_name || "Radiology Center";
}

export function getCenterPhone(settings?: PublicCenterSettings | null) {
  return settings?.phone || settings?.contact_phone || "";
}

export function getCenterHours(settings?: PublicCenterSettings | null) {
  const hours = settings?.working_hours;

  if (typeof hours === "string") return hours;

  if (Array.isArray(hours) && hours[0] && "day" in hours[0]) {
    const first = hours[0];
    return [first.day, [first.open, first.close].filter(Boolean).join(" - ")]
      .filter(Boolean)
      .join(": ");
  }

  if (Array.isArray(hours) && hours[0] && "start" in hours[0]) {
    const first = hours[0];
    const start = first.start ?? 6;
    const end = first.end ?? 22;
    return `${start}:00 - ${end}:00`;
  }

  if (hours && !Array.isArray(hours) && "start" in hours) {
    const start = hours.start ?? 6;
    const end = hours.end ?? 22;
    return `${start}:00 - ${end}:00`;
  }

  if (settings?.opening_time || settings?.closing_time) {
    return [settings.opening_time, settings.closing_time].filter(Boolean).join(" - ");
  }

  return "";
}

export function useCenterSettings() {
  const [settings, setSettings] = useState<PublicCenterSettings | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetchPublicCenterSettings().then((data) => {
      if (!cancelled && data) setSettings(data as PublicCenterSettings);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return useMemo(
    () => ({
      settings,
      centerName: getCenterName(settings),
      phone: getCenterPhone(settings),
      hours: getCenterHours(settings),
      email: settings?.email || "",
      address: settings?.address || "",
      logoUrl: settings?.logo_url || "/favicon.svg",
    }),
    [settings],
  );
}
