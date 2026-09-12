import { FormEvent, useState } from "react";
import { Calendar, Phone, User, Clock, CheckCircle2, Home, MessageCircle, ShieldCheck, Loader2 } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import toast from "react-hot-toast";
import { useLandingContent } from "../../../hooks/use-landing-content";
import { useCreatePublicAppointmentRequestMutation } from "../../../store/api";

interface QuickBookingCardProps { initialService?: string; onSuccess?: () => void; }
type BookingMode = "center" | "home" | "consult";
const today = () => new Date().toISOString().slice(0, 10);

const apiErrorMessage = (error: unknown): string | null => {
  if (!error || typeof error !== "object" || !("data" in error)) return null;
  const data = (error as { data?: unknown }).data;
  if (!data || typeof data !== "object") return null;
  const message = (data as { error?: unknown }).error;
  return typeof message === "string" ? message : null;
};

export const QuickBookingCard = ({ initialService = "", onSuccess }: QuickBookingCardProps) => {
  const { i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith("ar");
  const reduceMotion = useReducedMotion();
  const { activeModalityNames, isLoading: isContentLoading } = useLandingContent();
  const [createRequest, { isLoading: isSubmitting }] = useCreatePublicAppointmentRequestMutation();
  const [mode, setMode] = useState<BookingMode>("center");
  const [requestNumber, setRequestNumber] = useState<string | null>(null);
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [formData, setFormData] = useState({ name: "", phone: "", service: initialService, preferredDate: "" });

  const modes = [
    { id: "center" as const, icon: Calendar, ar: "زيارة المركز", en: "Center visit" },
    { id: "home" as const, icon: Home, ar: "زيارة منزلية", en: "Home visit" },
    { id: "consult" as const, icon: MessageCircle, ar: "استشارة", en: "Consultation" },
  ];

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!formData.name.trim() || !formData.phone.trim() || !formData.service.trim()) {
      toast.error(isRtl ? "أكمل الاسم والهاتف والخدمة المطلوبة" : "Complete the name, phone and requested service");
      return;
    }
    if (!consent) {
      toast.error(isRtl ? "يلزم الموافقة على استخدام البيانات للتواصل" : "Consent is required so the team may contact you");
      return;
    }
    try {
      const response = await createRequest({
        name: formData.name.trim(), phone: formData.phone.trim(), mode,
        service: formData.service.trim(), preferredDate: formData.preferredDate || null,
        consent: true, website,
      }).unwrap();
      setRequestNumber(response.requestNumber);
    } catch (error) {
      toast.error(apiErrorMessage(error) || (isRtl ? "تعذر إرسال الطلب الآن. حاول مرة أخرى." : "The request could not be sent. Please try again."));
    }
  };

  if (requestNumber) {
    return (
      <motion.div initial={reduceMotion ? false : { opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-2xl">
        <div className="h-1.5 bg-primary" />
        <div className="flex min-h-[390px] flex-col items-center justify-center p-7 text-center sm:p-10">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary"><CheckCircle2 className="h-8 w-8" /></div>
          <h3 className="mt-5 text-2xl font-bold text-foreground">{isRtl ? "تم استلام طلبك" : "Your request was received"}</h3>
          <p className="mt-3 max-w-sm text-sm leading-7 text-muted-foreground">{isRtl ? "سيتواصل فريق المركز معك لتأكيد الموعد والتحضيرات." : "The center team will contact you to confirm the appointment and preparation."}</p>
          <div className="mt-5 rounded-xl border border-primary/20 bg-primary/5 px-5 py-3">
            <span className="block text-xs text-muted-foreground">{isRtl ? "رقم الطلب" : "Request number"}</span>
            <strong className="mt-1 block font-mono text-base text-primary" dir="ltr">{requestNumber}</strong>
          </div>
          <button type="button" onClick={onSuccess} className="mt-6 min-h-11 rounded-xl bg-primary px-8 text-sm font-bold text-white transition hover:bg-primary-dark">{isRtl ? "تم" : "Done"}</button>
        </div>
      </motion.div>
    );
  }

  return (
    <div className="overflow-hidden rounded-[24px] border border-border bg-surface shadow-2xl">
      <div className="border-b border-border bg-primary/5 px-5 pb-5 pt-6 sm:px-7 sm:pt-7">
        <span className="inline-flex items-center gap-2 text-xs font-semibold text-primary"><ShieldCheck className="h-4 w-4" />{isRtl ? "طلب موعد آمن" : "Secure appointment request"}</span>
        <h3 className="mt-2 text-xl font-bold text-foreground sm:text-2xl">{isRtl ? "أرسل طلبك وسنتواصل للتأكيد" : "Send a request and we will confirm it"}</h3>
        <div className="mt-5 grid grid-cols-3 gap-1 rounded-xl bg-background/80 p-1" role="tablist" aria-label={isRtl ? "نوع الطلب" : "Appointment type"}>
          {modes.map((item) => {
            const Icon = item.icon;
            const active = mode === item.id;
            return <button key={item.id} type="button" role="tab" aria-selected={active} onClick={() => setMode(item.id)} className={`flex min-h-10 items-center justify-center gap-1.5 rounded-lg px-2 text-xs font-bold transition ${active ? "bg-primary text-white shadow-sm" : "text-muted-foreground hover:text-primary"}`}><Icon className="h-3.5 w-3.5" /><span>{isRtl ? item.ar : item.en}</span></button>;
          })}
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 p-5 sm:p-7">
        <div className="absolute -start-[10000px]" aria-hidden="true"><label htmlFor="booking-website">Website</label><input id="booking-website" tabIndex={-1} autoComplete="off" value={website} onChange={(event) => setWebsite(event.target.value)} /></div>
        <div>
          <label htmlFor="booking-name" className="mb-1.5 block text-xs font-bold text-foreground">{isRtl ? "اسم المريض" : "Patient name"}</label>
          <div className="relative"><User className="pointer-events-none absolute inset-y-0 start-3.5 my-auto h-4 w-4 text-muted-foreground" /><input id="booking-name" required autoComplete="name" maxLength={120} value={formData.name} onChange={(event) => setFormData({ ...formData, name: event.target.value })} className="w-full rounded-xl border border-border bg-background py-2.5 pe-4 ps-10 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></div>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label htmlFor="booking-phone" className="mb-1.5 block text-xs font-bold text-foreground">{isRtl ? "رقم الهاتف" : "Phone number"}</label>
            <div className="relative"><Phone className="pointer-events-none absolute inset-y-0 start-3.5 my-auto h-4 w-4 text-muted-foreground" /><input id="booking-phone" type="tel" required dir="ltr" autoComplete="tel" inputMode="tel" maxLength={30} value={formData.phone} onChange={(event) => setFormData({ ...formData, phone: event.target.value })} className="w-full rounded-xl border border-border bg-background py-2.5 pe-4 ps-10 text-start text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></div>
          </div>
          <div>
            <label htmlFor="booking-service" className="mb-1.5 block text-xs font-bold text-foreground">{isRtl ? "الفحص أو الخدمة" : "Exam or service"}</label>
            <div className="relative"><Calendar className="pointer-events-none absolute inset-y-0 start-3.5 my-auto h-4 w-4 text-muted-foreground" /><input id="booking-service" required list="booking-service-options" maxLength={180} value={formData.service} onChange={(event) => setFormData({ ...formData, service: event.target.value })} className="w-full rounded-xl border border-border bg-background py-2.5 pe-4 ps-10 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /><datalist id="booking-service-options">{activeModalityNames.map((name) => <option key={name} value={name} />)}</datalist></div>
          </div>
        </div>
        <div>
          <label htmlFor="booking-date" className="mb-1.5 block text-xs font-bold text-foreground">{isRtl ? "التاريخ المفضل (اختياري)" : "Preferred date (optional)"}</label>
          <div className="relative"><Clock className="pointer-events-none absolute inset-y-0 start-3.5 my-auto h-4 w-4 text-muted-foreground" /><input id="booking-date" type="date" min={today()} value={formData.preferredDate} onChange={(event) => setFormData({ ...formData, preferredDate: event.target.value })} className="w-full rounded-xl border border-border bg-background py-2.5 pe-4 ps-10 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/15" /></div>
        </div>
        <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-border bg-background p-3 text-xs leading-5 text-muted-foreground"><input type="checkbox" required checked={consent} onChange={(event) => setConsent(event.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" /><span>{isRtl ? "أوافق على استخدام هذه البيانات للتواصل معي بخصوص هذا الطلب فقط." : "I agree that these details may be used only to contact me about this request."}</span></label>
        <button type="submit" disabled={isSubmitting || isContentLoading} className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-bold text-white shadow-md shadow-primary/20 transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60">{isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}{isSubmitting ? (isRtl ? "جاري الإرسال..." : "Sending...") : (isRtl ? "إرسال طلب الحجز" : "Send appointment request")}</button>
        <p className="flex items-center justify-center gap-1.5 text-center text-xs text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5 text-primary" />{isRtl ? "تُشفّر بيانات التواصل وتظهر للفريق المختص فقط." : "Contact details are encrypted and available only to the responsible team."}</p>
      </form>
    </div>
  );
};

export default QuickBookingCard;
