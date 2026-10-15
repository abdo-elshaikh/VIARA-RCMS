import { z } from "zod";
export const inquirySchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().min(7).max(25)
    .transform(value => value.replace(/[٠-٩]/g, digit => String(digit.charCodeAt(0) - 1632)).replace(/[۰-۹]/g, digit => String(digit.charCodeAt(0) - 1776)))
    .refine(value => /^[+\d\s()-]+$/.test(value) && value.replace(/\D/g, "").length >= 7),
  organization: z.string().trim().min(2).max(150),
  facility: z.enum(["مركز أشعة", "مركز طبي", "عيادات تخصصية", "مجموعة فروع"]),
  branches: z.enum(["فرع واحد", "2–5 فروع", "أكثر من 5 فروع"]),
  interest: z.enum(["RIS", "PACS", "CMS", "SUITE", "CONSULT"]),
  plan: z.enum(["أساس", "نمو", "مؤسسات", "لم أحدد بعد"]),
  message: z.string().trim().max(2000).default(""),
  consent: z.literal(true),
  website: z.string().max(0).optional(),
  locale: z.enum(["ar", "en"]).default("ar"),
  offer: z.string().trim().max(3000).default(""),
});
export const interestNames: Record<string, string> = {
  RIS: "إدارة مراكز الأشعة", PACS: "أرشفة الصور الطبية", CMS: "إدارة المراكز الطبية",
  SUITE: "الحل المتكامل", CONSULT: "استشارة لاختيار النظام",
};
