import { FormEvent, useEffect, useState } from "react";
import {
  Calendar,
  Phone,
  User,
  Clock,
  CheckCircle2,
  Loader2,
  Home,
  MessageCircle,
  ShieldCheck,
} from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";

interface QuickBookingCardProps {
  initialService?: string;
  onSuccess?: () => void;
}

type BookingMode = "center" | "home" | "consult";

export const QuickBookingCard = ({ initialService = "MRI", onSuccess }: QuickBookingCardProps) => {
  const { i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith("ar");
  const reduceMotion = useReducedMotion();
  const [mode, setMode] = useState<BookingMode>("center");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    phone: "",
    service: initialService,
    preferredDate: "",
  });

  useEffect(() => {
    setFormData((current) => ({ ...current, service: initialService }));
  }, [initialService]);

  const modes = [
    { id: "center" as const, icon: Calendar, ar: "زيارة المركز", en: "Center visit" },
    { id: "home" as const, icon: Home, ar: "زيارة منزلية", en: "Home visit" },
    { id: "consult" as const, icon: MessageCircle, ar: "استشارة", en: "Consultation" },
  ];

  const titles: Record<BookingMode, { ar: string; en: string; descAr: string; descEn: string }> = {
    center: {
      ar: "احجز فحصك في المركز",
      en: "Request a diagnostic appointment",
      descAr: "أرسل الوقت المناسب وسيتواصل الفريق لتأكيد التفاصيل.",
      descEn: "Share your preferred timing and the team will confirm the details.",
    },
    home: {
      ar: "اطلب خدمة منزلية",
      en: "Request a mobile home visit",
      descAr: "يؤكد الفريق توفر الخدمة والتغطية في منطقتك.",
      descEn: "The team will confirm service availability in your area.",
    },
    consult: {
      ar: "اطلب استشارة تقرير",
      en: "Request a report consultation",
      descAr: "اطلب مراجعة تقرير أو مساعدة في اختيار الفحص المناسب.",
      descEn: "Ask for report review or help selecting the appropriate exam.",
    },
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!formData.name.trim() || !formData.phone.trim()) {
      toast.error(
        isRtl ? "يرجى إدخال الاسم ورقم الهاتف" : "Please provide your name and phone number",
      );
      return;
    }

    setIsSubmitting(true);
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    setIsSubmitting(false);
    setSubmitted(true);
    toast.success(isRtl ? "تم استلام طلب الحجز" : "Appointment request received");
  };

  const resetForm = () => {
    setSubmitted(false);
    setMode("center");
    setFormData({ name: "", phone: "", service: initialService, preferredDate: "" });
  };

  if (submitted) {
    return (
      <motion.div
        initial={reduceMotion ? false : { opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-2xl"
      >
        <div className="h-1.5 bg-primary" />
        <div className="flex min-h-[430px] flex-col items-center justify-center p-7 text-center sm:p-10">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-[#E4F5EF] text-primary dark:bg-primary-soft">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <p className="mt-5 text-xs font-bold text-primary">
            {isRtl ? "تم إرسال الطلب" : "Request submitted"}
          </p>
          <h3 className="mt-2 text-2xl font-bold text-[#0B2348] dark:text-white">
            {isRtl ? "سنتواصل معك لتأكيد الموعد" : "We will contact you to confirm"}
          </h3>
          <p className="mt-3 max-w-sm text-sm leading-7 text-muted-foreground">
            {isRtl
              ? "استلم الفريق بياناتك وسيؤكد الفرع والوقت وتعليمات التحضير عبر رقم الهاتف المسجل."
              : "The team has received your details and will confirm the center, timing, and preparation instructions using your phone number."}
          </p>
          <div className="mt-7 flex w-full max-w-sm flex-col gap-2.5 sm:flex-row">
            <button
              type="button"
              onClick={resetForm}
              className="min-h-11 flex-1 rounded-xl border border-border px-4 text-sm font-bold text-foreground transition hover:border-primary/40 hover:text-primary"
            >
              {isRtl ? "طلب آخر" : "Another request"}
            </button>
            <button
              type="button"
              onClick={onSuccess}
              className="min-h-11 flex-1 rounded-xl bg-primary px-4 text-sm font-bold text-white transition hover:bg-primary-dark"
            >
              {isRtl ? "تم" : "Done"}
            </button>
          </div>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-2xl">
      <div className="border-b border-border bg-[#F3F9F7] px-5 pb-5 pt-6 dark:bg-primary-soft/15 sm:px-7 sm:pt-7">
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-primary">
          <ShieldCheck className="h-4 w-4" />
          {isRtl ? "طلب موعد آمن" : "Secure appointment request"}
        </span>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={mode}
            initial={reduceMotion ? false : { opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
            transition={{ duration: 0.22 }}
          >
            <h3 className="mt-2 text-xl font-bold text-[#0B2348] dark:text-white sm:text-2xl">
              {isRtl ? titles[mode].ar : titles[mode].en}
            </h3>
            <p className="mt-1.5 text-xs leading-6 text-muted-foreground">
              {isRtl ? titles[mode].descAr : titles[mode].descEn}
            </p>
          </motion.div>
        </AnimatePresence>

        <div
          className="mt-5 grid grid-cols-3 gap-1 rounded-xl bg-white/75 p-1 dark:bg-background/70"
          role="tablist"
          aria-label={isRtl ? "نوع الطلب" : "Appointment type"}
        >
          {modes.map((item) => {
            const Icon = item.icon;
            const active = mode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setMode(item.id)}
                className={`flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-2 text-[11px] font-bold transition sm:text-xs ${active ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-primary"}`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{isRtl ? item.ar : item.en}</span>
              </button>
            );
          })}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 p-5 sm:p-7">
        <div>
          <label htmlFor="booking-name" className="mb-1.5 block text-xs font-bold text-foreground">
            {isRtl ? "اسم المريض" : "Patient name"}
          </label>
          <div className="relative">
            <User className="pointer-events-none absolute inset-y-0 start-3.5 my-auto h-4 w-4 text-muted-foreground" />
            <input
              id="booking-name"
              type="text"
              required
              autoComplete="name"
              value={formData.name}
              onChange={(event) => setFormData({ ...formData, name: event.target.value })}
              placeholder={isRtl ? "الاسم بالكامل" : "Full name"}
              className="w-full rounded-xl border border-border bg-background py-2.5 pe-4 ps-10 text-sm font-medium text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label
              htmlFor="booking-phone"
              className="mb-1.5 block text-xs font-bold text-foreground"
            >
              {isRtl ? "رقم الهاتف" : "Phone number"}
            </label>
            <div className="relative">
              <Phone className="pointer-events-none absolute inset-y-0 start-3.5 my-auto h-4 w-4 text-muted-foreground" />
              <input
                id="booking-phone"
                type="tel"
                required
                dir="ltr"
                autoComplete="tel"
                inputMode="tel"
                value={formData.phone}
                onChange={(event) => setFormData({ ...formData, phone: event.target.value })}
                placeholder="010 0000 0000"
                className="w-full rounded-xl border border-border bg-background py-2.5 pe-4 ps-10 text-start text-sm font-medium text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="booking-service"
              className="mb-1.5 block text-xs font-bold text-foreground"
            >
              {isRtl ? "الفحص أو الخدمة" : "Exam or service"}
            </label>
            <select
              id="booking-service"
              value={formData.service}
              onChange={(event) => setFormData({ ...formData, service: event.target.value })}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm font-medium text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
            >
              <option value="MRI">{isRtl ? "رنين مغناطيسي" : "MRI scan"}</option>
              <option value="CT">{isRtl ? "أشعة مقطعية" : "CT scan"}</option>
              <option value="X-Ray">{isRtl ? "أشعة سينية رقمية" : "Digital X-Ray"}</option>
              <option value="Ultrasound">{isRtl ? "سونار ودوبلر" : "Ultrasound / Doppler"}</option>
              <option value="Mammography">
                {isRtl ? "ماموجرام ثلاثي الأبعاد" : "3D mammography"}
              </option>
              <option value="PET/CT">{isRtl ? "مسح بوزيتروني وأشعة مقطعية" : "PET / CT"}</option>
              <option value="DEXA">{isRtl ? "قياس كثافة العظام" : "DEXA bone density"}</option>
              <option value="Dental Panoramic">
                {isRtl ? "أشعة بانورامية للأسنان" : "Dental panoramic X-Ray"}
              </option>
              <option value="Nuclear Medicine">
                {isRtl ? "مسح ذري" : "Nuclear medicine scan"}
              </option>
              <option value="SPECT/CT">{isRtl ? "مسح ذري مقطعي" : "SPECT / CT"}</option>
              <option value="Echocardiography">{isRtl ? "إيكو القلب" : "Echocardiography"}</option>
              <option value="Fluoroscopy">{isRtl ? "تصوير تألقي" : "Fluoroscopy"}</option>
              <option value="Cardiac">{isRtl ? "فحوصات القلب" : "Cardiac imaging"}</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor="booking-date" className="mb-1.5 block text-xs font-bold text-foreground">
            {isRtl ? "التاريخ المفضل" : "Preferred date"}{" "}
            <span className="font-normal text-muted-foreground">
              ({isRtl ? "اختياري" : "optional"})
            </span>
          </label>
          <div className="relative">
            <Clock className="pointer-events-none absolute inset-y-0 start-3.5 my-auto h-4 w-4 text-muted-foreground" />
            <input
              id="booking-date"
              type="date"
              value={formData.preferredDate}
              onChange={(event) => setFormData({ ...formData, preferredDate: event.target.value })}
              className="w-full rounded-xl border border-border bg-background py-2.5 pe-4 ps-10 text-sm font-medium text-foreground outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white shadow-md shadow-primary/20 transition hover:bg-primary-dark active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {isRtl ? "جاري إرسال الطلب..." : "Sending request..."}
            </>
          ) : (
            <>
              <Calendar className="h-4 w-4" />
              {isRtl ? "إرسال طلب الحجز" : "Send appointment request"}
            </>
          )}
        </button>

        <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-primary" />
          {isRtl
            ? "تُستخدم بياناتك للتواصل بشأن هذا الطلب."
            : "Your details are used to contact you about this request."}
        </p>
      </form>
    </div>
  );
};

export default QuickBookingCard;
