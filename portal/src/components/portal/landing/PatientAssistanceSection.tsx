import { PhoneCall, MapPin, Home, ArrowRight, ShieldCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface PatientAssistanceSectionProps {
  onHomeServiceRequest?: () => void;
}

export const PatientAssistanceSection = ({ onHomeServiceRequest }: PatientAssistanceSectionProps) => {
  const { i18n } = useTranslation();
  const isRtl = i18n.language?.startsWith('ar');

  return (
    <section className="relative mx-auto max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
      <div className="relative overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-surface via-surface to-primary-soft/40 p-8 sm:p-12 shadow-card-elevated">
        <div className="grid gap-8 lg:grid-cols-12 lg:items-center">
          {/* Left / Main Text Column */}
          <div className="lg:col-span-7 space-y-6">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-primary">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>{isRtl ? 'خدمة المرضى والمساعدة الفورية' : 'Patient Assistance & Support'}</span>
            </span>

            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold text-foreground tracking-tight leading-tight">
              {isRtl
                ? 'هل تحتاج إلى مساعدة في ترتيب فحصك الطبي؟'
                : 'Need Help Arranging Your Diagnostic Examination?'}
            </h2>

            <p className="text-sm sm:text-base text-muted-foreground leading-relaxed max-w-xl">
              {isRtl
                ? 'فريق الدعم الإكلينيكي وخدمة العملاء جاهز للإجابة على كافة استفساراتك حول الفحوصات والتحضيرات وترتيب الزيارات المنزلية أو حجز الفروع على مدار الساعة.'
                : 'Our concierge desk is available 24/7 to guide you through scan preparations, health insurance coverage, nearest branches, or mobile home imaging.'}
            </p>

            {/* 3 Compact Action Buttons */}
            <div className="flex flex-wrap items-center gap-3 pt-2">
              {/* Action 1: Call Hotline */}
              <a
                href="tel:19999"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 text-xs sm:text-sm font-bold text-white shadow-md shadow-primary/20 hover:bg-primary-dark transition cursor-pointer"
              >
                <PhoneCall className="h-4 w-4" />
                <span>{isRtl ? 'اتصل بالخط الساخن: 19999' : 'Call Hotline: 19999'}</span>
              </a>

              {/* Action 2: Find Branch */}
              <a
                href="#locations"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-5 py-3 text-xs sm:text-sm font-bold text-foreground hover:border-primary hover:text-primary transition cursor-pointer"
              >
                <MapPin className="h-4 w-4 text-primary" />
                <span>{isRtl ? 'ابحث عن أقرب فرع' : 'Find Nearest Branch'}</span>
              </a>

              {/* Action 3: Home Service */}
              <button
                type="button"
                onClick={onHomeServiceRequest}
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-5 py-3 text-xs sm:text-sm font-bold text-foreground hover:border-primary hover:text-primary transition cursor-pointer"
              >
                <Home className="h-4 w-4 text-primary" />
                <span>{isRtl ? 'اطلب خدمة منزلية' : 'Request Home Visit'}</span>
              </button>
            </div>
          </div>

          {/* Right Image Column */}
          <div className="lg:col-span-5 relative flex justify-center">
            <div className="rounded-2xl overflow-hidden shadow-md border border-border/80 max-h-[300px] w-full">
              <img
                src="/images/viara-support-agent.jpg"
                alt="VIARA Patient Support Team"
                className="h-full w-full object-cover object-center"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PatientAssistanceSection;
