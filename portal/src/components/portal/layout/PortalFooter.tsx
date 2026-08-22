import { ArrowUp, Clock3, Mail, MapPin, Phone } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePortalIdentity } from '../../../lib/portal-identity';
import { PortalBrand } from '../ui/PortalBrand';

export interface PortalFooterProps {
  isRtl?: boolean;
}

export const PortalFooter = ({ isRtl }: PortalFooterProps) => {
  const { i18n } = useTranslation();
  const identity = usePortalIdentity();
  const isArabic = isRtl ?? i18n.language?.startsWith('ar');
  const centerName = identity.center.name || (isArabic ? 'مركز الأشعة' : 'Radiology Center');
  const phone = identity.contacts.hotline || identity.contacts.phone || '19999';

  const groups = [
    {
      title: isArabic ? 'الخدمات' : 'Services',
      items: [
        [isArabic ? 'الرنين المغناطيسي' : 'MRI', '#services-section'],
        [isArabic ? 'الأشعة المقطعية' : 'CT', '#services-section'],
        [isArabic ? 'الأشعة الرقمية' : 'Digital X-Ray', '#services-section'],
        [isArabic ? 'السونار والدوبلر' : 'Ultrasound', '#services-section'],
      ],
    },
    {
      title: isArabic ? 'المرضى' : 'Patients',
      items: [
        [isArabic ? 'النتائج والتقارير' : 'Results & reports', '/patient/login'],
        [isArabic ? 'احجز موعداً' : 'Book an appointment', '#main-content'],
        [isArabic ? 'التحضير للفحص' : 'Exam preparation', '#faq'],
        [isArabic ? 'الأسئلة الشائعة' : 'FAQ', '#faq'],
      ],
    },
    {
      title: centerName,
      items: [
        [isArabic ? 'عن المركز' : 'About us', '#why-viara'],
        [isArabic ? 'الفروع' : 'Locations', '#locations'],
        [isArabic ? 'التقنيات' : 'Technology', '#equipment-section'],
        [isArabic ? 'بوابة الطبيب' : 'Doctor portal', '/doctor/login'],
      ],
    },
  ];

  return (
    <footer id="page-footer" className="scroll-mt-24 border-t border-white/10 bg-[#063B35] pb-24 pt-11 text-white md:pb-8 sm:pt-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 lg:grid-cols-[1.15fr_2.85fr] lg:gap-14">
          <div className="text-center lg:text-start">
          <Link to="/" className="inline-flex">
            <PortalBrand
              isRtl={isArabic}
              variant="dark"
              logoClassName="h-14 w-14 border-white/20 text-xl"
              textClassName="max-w-[13rem] text-start"
              nameClassName="text-lg sm:text-xl"
              subtitleClassName="text-[10px]"
            />
          </Link>
          <p className="mx-auto mt-4 max-w-sm text-xs font-normal leading-6 text-emerald-50/70 lg:mx-0">
            {isArabic ? 'تصوير تشخيصي أكثر وضوحاً وراحة، بخبرة طبية وتقنيات تدعم القرار الصحيح.' : 'Clearer, more comfortable diagnostic imaging supported by medical expertise and purposeful technology.'}
          </p>
          <a href={`tel:${phone.replace(/\s/g, '')}`} className="mt-5 inline-flex items-center gap-2 text-sm font-bold text-white transition hover:text-emerald-200"><Phone className="h-4 w-4 text-emerald-300" /><span dir="ltr">{phone}</span></a>
          </div>

          <div className="grid grid-cols-2 gap-x-7 gap-y-9 sm:grid-cols-4">
            {groups.map((group) => (
              <div key={group.title}>
                <h3 className="text-xs font-bold text-white">{group.title}</h3>
                <span className="mt-2 block h-px w-7 bg-emerald-300/65" />
                <ul className="mt-4 space-y-2.5">
                  {group.items.map(([label, href]) => (
                    <li key={`${group.title}-${label}`}><a href={href} className="text-xs font-normal text-emerald-50/65 transition hover:text-white">{label}</a></li>
                  ))}
                </ul>
              </div>
            ))}

            <div>
              <h3 className="text-xs font-bold text-white">{isArabic ? 'تواصل' : 'Contact'}</h3>
              <span className="mt-2 block h-px w-7 bg-emerald-300/65" />
              <div className="mt-4 space-y-2.5 text-xs text-emerald-50/70">
                {identity.contacts.email && <a href={`mailto:${identity.contacts.email}`} className="flex items-start gap-2 break-all transition hover:text-white"><Mail className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />{identity.contacts.email}</a>}
                {identity.contacts.workingHours && <span className="flex items-start gap-2"><Clock3 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />{identity.contacts.workingHours}</span>}
                <a href="#locations" className="flex items-start gap-2 transition hover:text-white"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-300" />{isArabic ? 'الفروع والاتجاهات' : 'Locations & directions'}</a>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-5 text-[11px] text-emerald-50/50 sm:flex-row">
          <p>© {new Date().getFullYear()} {centerName}. {isArabic ? 'جميع الحقوق محفوظة.' : 'All rights reserved.'}</p>
          <div className="flex items-center gap-4">
            <span>{isArabic ? 'الخصوصية' : 'Privacy'}</span>
            <span>{isArabic ? 'الشروط' : 'Terms'}</span>
            <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/15 text-emerald-100 transition hover:border-emerald-300/50 hover:text-white" aria-label={isArabic ? 'العودة إلى أعلى الصفحة' : 'Back to top'} title={isArabic ? 'العودة إلى أعلى الصفحة' : 'Back to top'}><ArrowUp className="h-3.5 w-3.5" /></button>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default PortalFooter;
