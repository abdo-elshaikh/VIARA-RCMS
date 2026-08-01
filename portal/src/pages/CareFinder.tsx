import { useState, useMemo } from 'react';
import { Bone, HeartPulse, Cigarette, PersonStanding, Activity, ArrowRight } from 'lucide-react';
import { SectionHeading } from '../components/portal/ui/SectionHeading';

// Content pattern borrowed from CairoScan / TechnoScan's symptom-routed
// screening menus ("Back Pain → MRI Spine", "Chest Pain on Exertion →
// Echo / Cardiac CT / ECG"), rebuilt with the portal's teal clinical
// design system instead of their dated icon-grid template.
const CARE_PATHS = {
    en: [
        {
            key: 'back',
            icon: Bone,
            symptom: 'Back or Neck Pain',
            services: ['Spine MRI', 'X-Ray — Back', 'X-Ray — Neck'],
        },
        {
            key: 'chest',
            icon: HeartPulse,
            symptom: 'Chest Pain on Exertion',
            services: ['Echocardiography', 'Cardiac CT (Calcium Scoring)', 'Exercise ECG'],
        },
        {
            key: 'smoker',
            icon: Cigarette,
            symptom: 'Smoker / Lung Screening',
            services: ['Low-Dose Chest CT', 'Chest X-Ray', 'ECG'],
        },
        {
            key: 'joint',
            icon: PersonStanding,
            symptom: 'Joint or Knee Pain',
            services: ['Knee MRI', 'Shoulder MRI', 'Joint X-Ray'],
        },
    ],
    ar: [
        {
            key: 'back',
            icon: Bone,
            symptom: 'ألم الظهر أو الرقبة',
            services: ['رنين العمود الفقري', 'أشعة الظهر', 'أشعة الرقبة'],
        },
        {
            key: 'chest',
            icon: HeartPulse,
            symptom: 'ألم الصدر عند المجهود',
            services: ['إيكو القلب', 'أشعة مقطعية للشرايين التاجية', 'رسم قلب بالمجهود'],
        },
        {
            key: 'smoker',
            icon: Cigarette,
            symptom: 'الكشف المبكر للمدخنين',
            services: ['أشعة مقطعية للصدر منخفضة الجرعة', 'أشعة الصدر', 'رسم القلب'],
        },
        {
            key: 'joint',
            icon: PersonStanding,
            symptom: 'ألم المفاصل أو الركبة',
            services: ['رنين الركبة', 'رنين الكتف', 'أشعة المفاصل'],
        },
    ],
};

const COPY = {
    en: {
        eyebrow: 'Not Sure What You Need?',
        title: 'Find the Right Scan for Your Symptom',
        sub: 'Tell us what you\'re experiencing and we\'ll point you to the diagnostic pathway our radiologists recommend most often.',
        cta: 'Book This Pathway',
    },
    ar: {
        eyebrow: 'لا تعرف الفحص المناسب؟',
        title: 'اعثر على الفحص المناسب لحالتك',
        sub: 'أخبرنا بما تشعر به وسنوجهك إلى المسار التشخيصي الذي ينصح به أطباؤنا غالباً لهذه الحالة.',
        cta: 'احجز هذا المسار',
    },
};

export const CareFinder = ({ isRtl = false }) => {
    const lang = isRtl ? 'ar' : 'en';
    const text = COPY[lang];
    const paths = useMemo(() => CARE_PATHS[lang], [lang]);
    const [activeKey, setActiveKey] = useState(paths[0].key);
    const active = paths.find((p) => p.key === activeKey) || paths[0];

    return (
        <section id="care-finder" className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
            <SectionHeading align="center" eyebrow={text.eyebrow} title={text.title} sub={text.sub} />

            <div className="mt-10 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
                {/* Symptom picker */}
                <div className="flex flex-col gap-3">
                    {paths.map((path) => {
                        const Icon = path.icon;
                        const isActive = path.key === activeKey;
                        return (
                            <button
                                key={path.key}
                                type="button"
                                onClick={() => setActiveKey(path.key)}
                                className={`group flex items-center gap-4 rounded-2xl border p-4 text-start transition-all duration-300 ${
                                    isActive
                                        ? 'border-primary-600 bg-primary-600/10 shadow-md shadow-primary-900/10 ring-1 ring-primary-600/40 dark:border-primary-500/50 dark:bg-primary-900/40'
                                        : 'border-border bg-surface/60 hover:border-primary-300 hover:bg-surface'
                                }`}
                            >
                                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl transition-colors ${
                                    isActive ? 'bg-primary-600 text-white shadow-sm' : 'bg-primary-600/10 text-primary-700 dark:bg-primary-400/10 dark:text-primary-300 group-hover:bg-primary-600/20'
                                }`}>
                                    <Icon className="h-5 w-5" aria-hidden="true" />
                                </span>
                                <span className={`text-sm font-bold ${isActive ? 'text-primary-700 dark:text-primary-300' : 'text-foreground'}`}>
                                    {path.symptom}
                                </span>
                            </button>
                        );
                    })}
                </div>

                {/* Recommended pathway */}
                <div className="relative overflow-hidden rounded-3xl border border-slate-800 bg-gradient-to-br from-[#04111D] via-[#061B2E] to-[#0A2540] p-8 text-white shadow-xl dark:border-slate-800">
                    <div className="absolute top-0 right-0 h-56 w-56 -translate-y-24 translate-x-24 rounded-full bg-primary-500/20 blur-[70px]" aria-hidden="true" />
                    <div className="relative z-10">
                        <span className="inline-flex items-center gap-2 rounded-xl border border-primary-400/30 bg-primary-400/15 px-3.5 py-1.5 text-[11px] font-bold uppercase tracking-wider text-primary-200">
                            <Activity className="h-3.5 w-3.5" aria-hidden="true" />
                            {active.symptom}
                        </span>
                        <ul className="mt-6 flex flex-col gap-3">
                            {active.services.map((service) => (
                                <li key={service} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-sm font-semibold text-slate-100 backdrop-blur-sm">
                                    <span className="h-2 w-2 shrink-0 rounded-full bg-primary-400 shadow-sm shadow-primary-400/50" />
                                    {service}
                                </li>
                            ))}
                        </ul>
                        <a
                            href="#book"
                            className="mt-7 inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-primary-600 to-primary-900 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-primary-900/25 transition-all duration-200 hover:-translate-y-0.5 hover:from-primary-500 hover:to-primary-800 hover:shadow-xl"
                        >
                            {text.cta}
                            <ArrowRight className={`h-4 w-4 ${isRtl ? 'rotate-180' : ''}`} aria-hidden="true" />
                        </a>
                    </div>
                </div>
            </div>
        </section>
    );
};

export default CareFinder;
