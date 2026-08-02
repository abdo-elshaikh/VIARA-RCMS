import { useState, useEffect } from 'react';
import { PortalHeader } from './PortalHeader';
import { PortalFooter } from './PortalFooter';
import { useTranslation } from 'react-i18next';
import { Phone, MessageCircle, ArrowUp, ShieldCheck } from 'lucide-react';
import { useGetPublicCenterSettingsQuery } from '../../../store/api';
import { normalizeCenterSettings } from '../../../utils/centerSettings';

interface PortalLayoutProps {
  children: React.ReactNode;
  navLinks?: Array<{ label: string; href: string }>;
  showFooter?: boolean;
  showHeader?: boolean;
  showContactActions?: boolean;
  portalType?: string;
  copy?: Record<string, any>;
}

export const PortalLayout = ({ children, navLinks = [], showFooter = true, showHeader = true, showContactActions = true, portalType = 'public', copy }: PortalLayoutProps) => {
  const { i18n } = useTranslation();
  const language = (i18n.resolvedLanguage || i18n.language || 'en').split('-')[0];
  const isRtl = language === 'ar';
  const [showScrollTop, setShowScrollTop] = useState(false);

  const { data: rawSettings } = useGetPublicCenterSettingsQuery(undefined);
  const centerSettings = normalizeCenterSettings(rawSettings, language);

  const text = copy ? copy[language] || copy['en'] : {};
  const hotline = centerSettings?.phone || '19144';
  const whatsappNum = (centerSettings?.phone || '2019144').replace(/[^\d]/g, '');

  useEffect(() => {
    const handleScroll = () => setShowScrollTop(window.scrollY > 400);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="portal-site min-h-screen bg-surface text-foreground selection:bg-primary-600/20 dark:selection:bg-primary-300/25" dir={isRtl ? 'rtl' : 'ltr'}>
      <a href="#main" className="portal-skip-link">
        {text?.skip || (isRtl ? 'الانتقال إلى المحتوى' : 'Skip to content')}
      </a>
      {showHeader && <PortalHeader navLinks={navLinks} portalType={portalType} center={centerSettings} text={text} isRtl={isRtl} />}
      <main id="main">{children}</main>
      {showFooter && <PortalFooter center={centerSettings} text={text} isRtl={isRtl} />}

      {/* CairoScan & TechnoScan Floating Contact Action Bar */}
      {showContactActions && <div className="fixed bottom-6 end-6 z-50 flex flex-col items-end gap-3">
        {/* WhatsApp Button */}
        <a
          href={`https://wa.me/${whatsappNum}?text=${encodeURIComponent(isRtl ? 'السلام عليكم، أريد الاستفسار عن فحوصات الأشعة ومواعيد العمل.' : 'Hello, I would like to inquire about diagnostic radiology scans.')}`}
          target="_blank"
          rel="noreferrer"
          className="group flex items-center gap-2.5 rounded-full bg-[#25D366] px-4 py-3 text-xs font-bold text-white shadow-xl shadow-[#25D366]/30 transition-all hover:scale-105 hover:bg-[#20ba5a]"
          title={isRtl ? 'تواصل معنا عبر الواتساب' : 'Chat on WhatsApp'}
        >
          <MessageCircle className="h-5 w-5 fill-current animate-pulse" />
          <span className="hidden sm:inline-block">{isRtl ? 'واتساب المساعدة' : 'WhatsApp'}</span>
        </a>

        {/* Hotline Quick Call Pill */}
        <a
          href={`tel:${hotline}`}
          className="group flex items-center gap-2.5 rounded-full border border-primary-400/30 bg-gradient-to-r from-primary-900 to-[#061f4e] px-4 py-2.5 text-xs font-bold text-primary-200 shadow-xl shadow-primary-900/30 transition-all hover:scale-105 hover:border-primary-300"
        >
          <Phone className="h-4 w-4 text-primary-300 group-hover:animate-bounce" />
          <span className="font-mono text-sm tracking-wider dir-ltr">{hotline}</span>
        </a>

        {/* Back To Top Button */}
        {showScrollTop && (
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-foreground shadow-lg transition hover:border-primary-600 hover:bg-primary-600 hover:text-white dark:border-white/10"
            aria-label={isRtl ? 'العودة للأعلى' : 'Scroll to top'}
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        )}
      </div>}
    </div>
  );
};
