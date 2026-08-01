import { Link } from 'react-router-dom';
import {
    ArrowLeft,
    ArrowRight,
    Check,
    Clock3,
    FileCheck2,
    LockKeyhole,
    ShieldCheck,
    Award,
    Activity,
    Stethoscope,
    Sparkles,
} from 'lucide-react';
import LanguageToggle from '../../ui/LanguageToggle';
import ThemeToggle from '../../ui/ThemeToggle';
import { PortalLayout } from './PortalLayout';

interface PortalAuthShellProps {
    role: 'patient' | 'doctor';
    language?: 'en' | 'ar' | string;
    centerName: string;
    centerLogo?: string | null;
    centerInitials?: string;
    title: React.ReactNode;
    subtitle: React.ReactNode;
    benefits?: string[];
    children: React.ReactNode;
}

const roleCopy = {
    en: {
        patient: {
            badge: 'Patient Portal Sign In',
            visualTitle: 'Access your scan results & signed reports securely.',
            visualBody: 'View high-field 3.0T MRI & CT DICOM studies, download consultant-signed PDF reports, check appointment prep, and pay invoices.',
            switchLead: 'Are you a referring physician?',
            switchLabel: 'Doctor Portal Sign In',
            bgImage: '/images/scans/mri_device_3d.png',
        },
        doctor: {
            badge: 'Referring Doctor Portal',
            visualTitle: 'Direct Web PACS access & real-time referral tracking.',
            visualBody: 'Track patient case progress, view full DICOM series, submit digital referral orders, and communicate directly with radiologists.',
            switchLead: 'Looking for your patient records?',
            switchLabel: 'Patient Portal Sign In',
            bgImage: '/images/scans/petct_device_3d.png',
        },
        secure: 'HIPAA & ISO 9001 Encrypted Access',
        home: 'Back to Diagnostics Homepage',
        session: 'Protected Medical Session',
        sessionBody: 'Your portal session encrypts clinical records with 256-bit SSL.',
        steps: ['Reception Verified', 'Board Certified Review', '256-Bit Encrypted'],
    },
    ar: {
        patient: {
            badge: 'بوابة دخول المرضى',
            visualTitle: 'نتائج الأشعة والتقارير المعتمدة بين يديك بدقة.',
            visualBody: 'معاينة صور الرنين والأشعة المقطعية عالية الدقة ثلاثية الأبعاد، تحميل التقارير المعتمدة، معرفة تعليمات الفحص والمتابعة.',
            switchLead: 'هل أنت طبيب محول؟',
            switchLabel: 'دخول بوابة الأطباء المحولين',
            bgImage: '/images/scans/mri_device_3d.png',
        },
        doctor: {
            badge: 'بوابة الأطباء المحولين',
            visualTitle: 'معاينة مباشرة لصور PACS ومتابعة فورية للحالات.',
            visualBody: 'متابعة وصول وتصوير المرضى، معاينة الصور المباشرة، إرسال طلبات الإحالة الرقمية والتواصل مع الاستشاريين.',
            switchLead: 'تبحث عن نتائج فحوصاتك الشخصية؟',
            switchLabel: 'دخول بوابة المرضى',
            bgImage: '/images/scans/petct_device_3d.png',
        },
        secure: 'وصول طبّي مشفر ومطابق لمعايير ISO 9001',
        home: 'العودة للصفحة الرئيسية',
        session: 'جلسة آمنة ومحمية',
        sessionBody: 'تحمي البوابة جميع بيانات الفحوصات والتقارير بأعلى معايير الأمان.',
        steps: ['هوية معتمدة', 'تقارير استشاريين', 'تشفير كامل للبيانات'],
    },
};

export const PortalAuthShell = ({
    role,
    language = 'en',
    centerName,
    centerLogo,
    centerInitials,
    title,
    subtitle,
    benefits = [],
    children,
}: PortalAuthShellProps) => {
    const copy = (roleCopy as any)[language] || roleCopy.en;
    const roleText = copy[role] || copy.patient;
    const isRtl = language === 'ar';
    const switchTo = role === 'patient' ? '/doctor/login' : '/patient/login';
    const RoleIcon = role === 'patient' ? FileCheck2 : ShieldCheck;

    return (
        <PortalLayout showFooter={false} showHeader={false} showContactActions={false} portalType={role}>
            <div className="portal-theme portal-auth-page min-h-screen text-slate-900 antialiased dark:bg-[#07111f] dark:text-slate-100">
                <div className="mx-auto grid min-h-screen max-w-[100rem] lg:grid-cols-[minmax(0,1.1fr)_minmax(480px,.9fr)]">
                    {/* Visual Side Banner with 3D Medical Device Visual */}
                    <aside className="portal-auth-visual relative hidden overflow-hidden bg-[#07111f] px-10 py-12 text-white border-e border-slate-800/80 lg:flex lg:flex-col lg:justify-between xl:px-16 xl:py-14 group">
                        <div className="absolute inset-0 z-0">
                            <img src={roleText.bgImage} alt="" className="h-full w-full object-cover opacity-30 transition-transform duration-1000 group-hover:scale-105" />
                            <div className="absolute inset-0 bg-gradient-to-t from-[#07111f] via-[#07111f]/80 to-[#07111f]/40" />
                        </div>

                        <div className="relative z-10 flex items-center justify-between gap-4 border-b border-white/10 pb-6">
                            <Link to="/" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/15 bg-slate-950/60 px-4 text-xs font-bold text-white backdrop-blur-md transition hover:border-primary-400 hover:bg-primary-600">
                                {isRtl ? <ArrowRight className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
                                {copy.home}
                            </Link>
                            <span className="inline-flex items-center gap-2 text-xs font-bold text-primary-200">
                                <LockKeyhole className="h-4 w-4 text-primary-300" />
                                {copy.secure}
                            </span>
                        </div>

                        <div className="relative z-10 max-w-2xl py-10">
                            <div className="mb-8 flex items-center gap-4">
                                <span className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-primary-500 to-primary-900 shadow-lg shadow-primary-900/30 ring-1 ring-white/20">
                                    {centerLogo ? <img src={centerLogo} alt="" className="h-full w-full object-contain p-2" /> : <span className="text-xs font-black text-white">{centerInitials || 'RCMS'}</span>}
                                </span>
                                <div>
                                    <p className="font-sans text-xl font-extrabold text-white">{centerName}</p>
                                    <p className="text-xs font-bold tracking-wider text-primary-200 uppercase">{roleText.badge}</p>
                                </div>
                            </div>

                            <span className="inline-flex items-center gap-2 rounded-full border border-primary-300/30 bg-primary-400/10 px-4 py-1.5 text-xs font-bold text-primary-200 backdrop-blur-md">
                                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                                {roleText.badge}
                            </span>

                            <h2 className="font-sans mt-6 max-w-xl text-3xl font-black leading-tight text-white xl:text-4xl">
                                {roleText.visualTitle}
                            </h2>
                            <p className="mt-4 max-w-lg text-sm leading-relaxed text-slate-300">{roleText.visualBody}</p>

                            <div className="mt-8 grid max-w-xl gap-3 sm:grid-cols-3">
                                {copy.steps.map((step: string, index: number) => (
                                    <div key={step} className="rounded-2xl border border-white/10 bg-slate-950/60 p-4 backdrop-blur-md">
                                        <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-primary-400/15 text-primary-200">
                                            {index === 0 ? <Check className="h-4 w-4" /> : index === 1 ? <RoleIcon className="h-4 w-4" /> : <Award className="h-4 w-4 text-amber-400" />}
                                        </span>
                                        <p className="font-sans mt-3 text-xs font-bold text-slate-200">{step}</p>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div className="relative z-10 flex items-center justify-between border-t border-white/10 pt-6 text-xs text-slate-400">
                            <p>© {new Date().getFullYear()} {centerName}</p>
                            <span className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                                <ShieldCheck className="h-4 w-4" /> ISO 9001 & HIPAA Verified
                            </span>
                        </div>
                    </aside>

                    {/* Auth Form Container */}
                    <section aria-labelledby={`auth-title-${role}`} className="portal-auth-form-panel relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-50 dark:bg-[#07111f] px-4 py-8 sm:px-8 sm:py-12 lg:px-10 xl:px-16">
                        <div className="absolute end-4 top-4 z-20 flex items-center gap-2.5 sm:end-6 sm:top-6">
                            <Link to="/" className="inline-flex h-10 items-center gap-2 rounded-xl border border-border bg-surface px-3.5 text-xs font-bold text-foreground shadow-sm transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-800 lg:hidden">
                                {isRtl ? <ArrowRight className="h-4 w-4" /> : <ArrowLeft className="h-4 w-4" />}
                                <span className="hidden sm:inline">{copy.home}</span>
                            </Link>
                            <ThemeToggle />
                            <LanguageToggle variant="compact" />
                        </div>

                        <div className="portal-auth-card relative w-full max-w-[32rem] rounded-3xl border border-slate-200/80 bg-white/90 p-8 shadow-2xl shadow-slate-950/5 dark:border-slate-800/80 dark:bg-slate-900/80 backdrop-blur-xl sm:p-10">
                            <div className="flex items-center gap-3.5 lg:hidden">
                                <span className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-primary-500 to-primary-900 text-white shadow-md shadow-primary-900/20">
                                    {centerLogo ? <img src={centerLogo} alt="" className="h-full w-full object-contain p-1.5" /> : <span className="text-xs font-black">{centerInitials || 'RCMS'}</span>}
                                </span>
                                <div className="min-w-0">
                                    <p className="font-sans truncate text-base font-extrabold text-slate-900 dark:text-white">{centerName}</p>
                                    <p className="text-xs font-bold text-primary-700 dark:text-primary-300">{roleText.badge}</p>
                                </div>
                            </div>

                            <div className="mt-6 lg:mt-0">
                                <span className="inline-flex items-center gap-2 text-xs font-bold text-primary-700 dark:text-primary-300">
                                    <Activity className="h-4 w-4 text-primary-600" />
                                    {roleText.badge}
                                </span>
                                <h1 id={`auth-title-${role}`} className="font-sans mt-2 text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">{title}</h1>
                                <p className="mt-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">{subtitle}</p>
                            </div>

                            {benefits.length > 0 && (
                                <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 border-y border-slate-100 py-3.5 dark:border-slate-800/80 lg:hidden">
                                    {benefits.slice(0, 2).map((benefit) => (
                                        <span key={benefit} className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                                            <Check className="h-3.5 w-3.5 text-primary-600 dark:text-primary-300" />
                                            {benefit}
                                        </span>
                                    ))}
                                </div>
                            )}

                            <div className="mt-6">{children}</div>

                            <div className="mt-8 grid gap-5 border-t border-slate-100 pt-6 dark:border-slate-800/80">
                                <div className="flex items-start gap-2.5">
                                    <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary-600 dark:text-primary-300" />
                                    <div>
                                        <p className="font-sans text-xs font-bold text-slate-900 dark:text-slate-100">{copy.session}</p>
                                        <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{copy.sessionBody}</p>
                                    </div>
                                </div>
                                <p className="text-xs font-medium leading-relaxed text-slate-600 dark:text-slate-400">
                                    {roleText.switchLead}{' '}
                                    <Link to={switchTo} className="font-bold text-primary-700 hover:underline dark:text-primary-300">{roleText.switchLabel}</Link>
                                </p>
                            </div>
                        </div>
                    </section>
                </div>
            </div>
        </PortalLayout>
    );
};
