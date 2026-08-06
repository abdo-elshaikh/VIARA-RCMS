import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarCheck,
  ChevronUp,
  Clock3,
  FileText,
  Globe,
  HelpCircle,
  LockKeyhole,
  Mail,
  MapPin,
  Phone,
  ShieldCheck,
  Sparkles,
  Stethoscope,
  UserRound,
} from 'lucide-react';

export interface PortalFooterProps {
  center?: any;
  text?: any;
  isRtl?: boolean;
}

export const PortalFooter = ({ center, text, isRtl }: PortalFooterProps) => {
  const centerName = [center?.center_name, center?.branch_name].filter(Boolean).join(' - ') || center?.name || 'RCMS Radiology Center';
  const logo = center?.logo_url || center?.logoUrl;
  const initials = String(center?.center_name || center?.initials || 'RCMS').trim().slice(0, 4).toUpperCase();
  const hotline = center?.phone || '19144';
  const email = center?.email || '';
  const address = center?.address || '';
  const hoursStart = Number.isFinite(Number(center?.working_hours?.start)) ? Number(center.working_hours.start) : 6;
  const hoursEnd = Number.isFinite(Number(center?.working_hours?.end)) ? Number(center.working_hours.end) : 22;
  const workingHours = `${String(hoursStart).padStart(2, '0')}:00 – ${String(hoursEnd).padStart(2, '0')}:00`;

  const serviceLinks = isRtl
    ? ['الرنين المغناطيسي', 'الأشعة المقطعية', 'السونار والدوبلر', 'الماموجرام 3D', 'الأشعة الرقمية', 'PET-CT', 'كثافة العظام DEXA', 'أشعة الأسنان والبانوراما']
    : ['MRI 3.0T', 'CT 128-Slice', 'Ultrasound & Doppler', '3D Mammography', 'Digital X-Ray', 'PET-CT', 'Bone Density (DEXA)', 'Dental & Panoramic'];

  const visitLinks = [
    { href: '/#book', icon: CalendarCheck, en: 'Request an appointment', ar: 'اطلب موعداً' },
    { href: '/#locations', icon: MapPin, en: 'Locations and directions', ar: 'الفروع والاتجاهات' },
    { href: '/#patient-guide', icon: UserRound, en: 'Patient preparation guide', ar: 'دليل تحضير المريض' },
    { href: '/#patient-journey', icon: FileText, en: 'What to expect', ar: 'ماذا تتوقع' },
    { href: '/#faq', icon: HelpCircle, en: 'Frequently asked questions', ar: 'الأسئلة الشائعة' },
  ];

  return (
    <footer className="portal-footer relative overflow-hidden border-t border-[#17426b] bg-[#051a33] text-white" dir={isRtl ? 'rtl' : 'ltr'}>
      {/* Ambient glow effects */}
      <div className="pointer-events-none absolute -end-32 top-20 h-80 w-80 rounded-full border-[52px] border-sky-300/[.025]" aria-hidden="true" />
      <div className="pointer-events-none absolute -start-28 bottom-0 h-64 w-64 rounded-full bg-primary-400/[.045] blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute end-1/4 top-1/2 h-40 w-40 rounded-full bg-sky-500/[.02] blur-2xl" aria-hidden="true" />

      <div className="relative mx-auto w-full max-w-7xl px-4 pb-24 pt-6 sm:px-6 sm:pb-8 lg:px-8">
        {/* Portal access banner */}
        <section aria-label={isRtl ? 'الوصول إلى البوابات' : 'Portal access'} className="portal-footer-banner group relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r from-[#0a3971] via-[#0a4b80] to-[#087c8f] p-5 shadow-2xl shadow-black/10 transition-all duration-500 hover:shadow-[0_24px_60px_-20px_rgba(8,115,143,.3)] sm:p-6">
          <div className="absolute -end-14 -top-20 h-48 w-48 rounded-full border-[30px] border-white/[.06] transition-transform duration-700 group-hover:scale-110" aria-hidden="true" />
          <div className="absolute -start-10 -bottom-10 h-32 w-32 rounded-full bg-white/[.03] transition-transform duration-700 group-hover:translate-x-2 group-hover:translate-y--2" aria-hidden="true" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex max-w-2xl items-start gap-4">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/10 text-primary-100 transition-transform duration-300 group-hover:scale-105"><LockKeyhole className="h-6 w-6" /></span>
              <div>
                <p className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-[.14em] text-primary-200"><Sparkles className="h-3 w-3" />{isRtl ? 'وصول رقمي محمي' : 'Protected digital access'}</p>
                <h2 className="mt-1 text-lg font-black sm:text-xl">{isRtl ? 'تقاريرك ورعايتك في مكان آمن واحد' : 'Your reports and care in one secure place'}</h2>
                <p className="mt-1.5 text-[10.5px] leading-5 text-blue-100">{isRtl ? 'يمكن للمرضى والأطباء المصرح لهم الوصول إلى المعلومات الطبية المتاحة لهم عبر البوابات المخصصة.' : 'Patients and authorized referring doctors can access the medical information made available to them through dedicated portals.'}</p>
              </div>
            </div>
            <div className="grid shrink-0 gap-2 min-[430px]:grid-cols-3">
              <Link to="/patient/login" className="group/btn inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-white px-4 text-[10.5px] font-extrabold text-[#082761] shadow-md transition-all hover:-translate-y-0.5 hover:bg-sky-50 hover:shadow-lg"><UserRound className="h-4 w-4 transition-transform group-hover/btn:scale-110" />{isRtl ? 'بوابة المرضى' : 'Patient portal'}</Link>
              <Link to="/doctor/login" className="group/btn inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 text-[10.5px] font-extrabold text-white transition-all hover:-translate-y-0.5 hover:bg-white/15 hover:shadow-md"><Stethoscope className="h-4 w-4 transition-transform group-hover/btn:scale-110" />{isRtl ? 'بوابة الأطباء' : 'Doctor portal'}</Link>
              <a href="/#book" className="group/btn inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/10 px-4 text-[10.5px] font-extrabold text-white transition-all hover:-translate-y-0.5 hover:bg-white/15 hover:shadow-md"><CalendarCheck className="h-4 w-4 transition-transform group-hover/btn:scale-110" />{isRtl ? 'حجز موعد' : 'Book a visit'}</a>
            </div>
          </div>
        </section>

        {/* Main footer grid */}
        <div className="grid gap-8 py-9 sm:grid-cols-2 lg:grid-cols-[1.25fr_1fr_.9fr_1fr] lg:gap-10 lg:py-11">
          {/* Brand column */}
          <section aria-label={isRtl ? 'عن المركز' : 'About the center'}>
            <Link to="/" className="group inline-flex max-w-full items-center gap-3">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-white/15 bg-white text-[11px] font-black text-[#082761] shadow-lg transition-all duration-300 group-hover:-translate-y-0.5 group-hover:shadow-xl group-hover:shadow-sky-900/20">
                {logo ? <img src={logo} alt="" className="h-full w-full object-contain p-1" /> : initials}
              </span>
              <span className="min-w-0"><strong className="block truncate text-sm font-black text-white transition-colors group-hover:text-sky-100"><bdi>{centerName}</bdi></strong><small className="mt-1 block text-[8.5px] font-black uppercase tracking-[.12em] text-primary-300">{text?.brandSuffix || (isRtl ? 'مركز الأشعة التشخيصية' : 'Diagnostic Imaging Center')}</small></span>
            </Link>
            <p className="mt-4 max-w-sm text-[10.5px] leading-5 text-slate-300">{text?.footer?.desc || (isRtl ? 'رعاية تشخيصية حديثة ووصول آمن للنتائج.' : 'Modern diagnostic care with secure online results.')}</p>
            <div className="mt-5 flex flex-wrap gap-2">
              <span className="portal-footer-badge inline-flex items-center gap-1.5 rounded-full border border-emerald-300/15 bg-emerald-300/[.07] px-3 py-1.5 text-[8.5px] font-bold text-emerald-200 transition-colors hover:bg-emerald-300/[.12]"><ShieldCheck className="h-3.5 w-3.5" />{isRtl ? 'وصول آمن' : 'Secure access'}</span>
              <span className="portal-footer-badge inline-flex items-center gap-1.5 rounded-full border border-sky-300/15 bg-sky-300/[.07] px-3 py-1.5 text-[8.5px] font-bold text-sky-200 transition-colors hover:bg-sky-300/[.12]"><FileText className="h-3.5 w-3.5" />{isRtl ? 'تقارير رقمية' : 'Digital reports'}</span>
              <span className="portal-footer-badge inline-flex items-center gap-1.5 rounded-full border border-violet-300/15 bg-violet-300/[.07] px-3 py-1.5 text-[8.5px] font-bold text-violet-200 transition-colors hover:bg-violet-300/[.12]"><Globe className="h-3.5 w-3.5" />{isRtl ? 'بوابة إلكترونية' : 'Online portal'}</span>
            </div>
            <a href={`tel:${hotline}`} className="group/hotline mt-5 inline-flex min-h-11 items-center gap-3 rounded-xl border border-primary-300/20 bg-primary-300/[.07] px-4 transition-all hover:-translate-y-0.5 hover:border-primary-300/40 hover:bg-primary-300/[.1] hover:shadow-lg hover:shadow-sky-900/10"><span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-300/10 text-primary-300 transition-transform group-hover/hotline:scale-110"><Phone className="h-4 w-4" /></span><span><small className="block text-[8px] font-bold uppercase tracking-wider text-slate-400">{isRtl ? 'الخط الساخن' : 'Hotline'}</small><b dir="ltr" className="mt-0.5 block text-sm text-white">{hotline}</b></span></a>
          </section>

          {/* Services column */}
          <nav aria-label={isRtl ? 'خدمات الأشعة' : 'Imaging services'}>
            <h3 className="text-[10px] font-black uppercase tracking-[.14em] text-white">{text?.footer?.services || (isRtl ? 'خدماتنا' : 'Our services')}</h3>
            <div className="mt-4 h-px w-10 bg-gradient-to-r from-primary-400 to-transparent" />
            <ul className="mt-4 grid grid-cols-2 gap-x-3 gap-y-2.5">
              {serviceLinks.map((service) => <li key={service}><a href="/#services" className="group inline-flex items-start gap-1.5 text-[9.5px] leading-4 text-slate-300 transition-all hover:text-primary-200 hover:translate-x-0.5 rtl:hover:-translate-x-0.5"><ArrowRight className="mt-0.5 h-3 w-3 shrink-0 text-primary-400 transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" /><span>{service}</span></a></li>)}
            </ul>
          </nav>

          {/* Plan your visit column */}
          <nav aria-label={isRtl ? 'خطط لزيارتك' : 'Plan your visit'}>
            <h3 className="text-[10px] font-black uppercase tracking-[.14em] text-white">{isRtl ? 'خطط لزيارتك' : 'Plan your visit'}</h3>
            <div className="mt-4 h-px w-10 bg-gradient-to-r from-primary-400 to-transparent" />
            <ul className="mt-4 space-y-3">
              {visitLinks.map(({ href, icon: Icon, en, ar }) => <li key={href}><a href={href} className="group inline-flex items-center gap-2 text-[9.5px] text-slate-300 transition-all hover:text-primary-200 hover:translate-x-0.5 rtl:hover:-translate-x-0.5"><Icon className="h-3.5 w-3.5 shrink-0 text-primary-400 transition-transform group-hover:scale-110" /><span>{isRtl ? ar : en}</span></a></li>)}
            </ul>
          </nav>

          {/* Contact column */}
          <section aria-label={isRtl ? 'بيانات التواصل' : 'Contact details'}>
            <h3 className="text-[10px] font-black uppercase tracking-[.14em] text-white">{isRtl ? 'تواصل معنا' : 'Contact us'}</h3>
            <div className="mt-4 h-px w-10 bg-gradient-to-r from-primary-400 to-transparent" />
            <div className="mt-4 space-y-3.5">
              {address && <a href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`} target="_blank" rel="noreferrer" className="group flex items-start gap-2.5 text-[9.5px] leading-4 text-slate-300 transition-all hover:text-primary-200"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary-400 transition-transform group-hover:scale-110" /><span>{address}</span></a>}
              {email && <a href={`mailto:${email}`} className="group flex items-center gap-2.5 text-[9.5px] text-slate-300 transition-all hover:text-primary-200"><Mail className="h-4 w-4 shrink-0 text-primary-400 transition-transform group-hover:scale-110" /><span className="break-all" dir="ltr">{email}</span></a>}
              <p className="flex items-start gap-2.5 text-[9.5px] leading-4 text-slate-300"><Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-primary-400" /><span><b className="block text-[9px] text-white">{isRtl ? 'ساعات العمل اليومية' : 'Daily opening hours'}</b><span dir="ltr" className="mt-0.5 block text-slate-300">{workingHours}</span></span></p>
              {!address && !email && <p className="flex items-start gap-2.5 text-[9.5px] leading-4 text-slate-300"><Phone className="mt-0.5 h-4 w-4 shrink-0 text-primary-400" /><span>{isRtl ? 'للمساعدة اتصل بالخط الساخن' : 'For assistance, call our hotline'} <b dir="ltr" className="block text-white">{hotline}</b></span></p>}
            </div>
          </section>
        </div>

        {/* Bottom bar */}
        <div className="flex flex-col gap-3 border-t border-white/10 pt-5 text-[8.5px] text-slate-400 sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} <bdi>{centerName}</bdi>. {text?.footer?.rights || (isRtl ? 'جميع الحقوق محفوظة.' : 'All rights reserved.')}</p>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <span className="inline-flex items-center gap-1.5 text-emerald-200"><span className="relative flex h-1.5 w-1.5"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-300 opacity-50 motion-reduce:animate-none" /><span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-400" /></span><ShieldCheck className="h-3.5 w-3.5" />{text?.footer?.secure || (isRtl ? 'وصول آمن للبيانات الطبية' : 'Secure medical data access')}</span>
            <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="group inline-flex items-center gap-1.5 font-bold text-slate-300 transition-all hover:text-primary-200"><ChevronUp className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5" />{isRtl ? 'العودة للأعلى' : 'Back to top'}</button>
          </div>
        </div>
      </div>
    </footer>
  );
};
