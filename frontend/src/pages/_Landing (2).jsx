import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    Activity,
    ArrowRight,
    BarChart3,
    CalendarCheck2,
    CheckCircle2,
    CreditCard,
    Database,
    FileText,
    Fingerprint,
    Globe2,
    LockKeyhole,
    Menu,
    Moon,
    Radio,
    ScanLine,
    Settings2,
    ShieldCheck,
    Sun,
    Workflow,
    X,
} from 'lucide-react';
import { useGetPublicCenterSettingsQuery } from '../store/api';
import { normalizeCenterSettings } from '../utils/centerSettings';
import loginRadiologyBackground from '../assets/login-radiology-background.png';

// ---------------------------------------------------------------------------
// Static content. Keys map to the existing `landing` i18n namespace so the
// page keeps working with any translations already in place; fallback copy
// renders whenever a key hasn't been translated yet.
// ---------------------------------------------------------------------------

const SECTION_IDS = ['overview', 'modules', 'workflow', 'governance'];

const NAV_FALLBACKS = {
    overview: 'Overview',
    modules: 'Modules',
    workflow: 'Workflow',
    governance: 'Governance',
};

const TRUST_SIGNALS = [
    { key: 'roleAccess', fallback: 'Role-based staff access' },
    { key: 'bilingual', fallback: 'Arabic and English UI' },
    { key: 'printReady', fallback: 'Print-ready reports' },
];

const QUICK_ACCESS = [
    { key: 'dashboard', icon: Activity, fallback: 'Dashboard' },
    { key: 'worklist', icon: Radio, fallback: 'PACS worklist' },
    { key: 'reports', icon: FileText, fallback: 'Reports' },
    { key: 'settings', icon: Settings2, fallback: 'Settings' },
];

const MODULES = [
    {
        key: 'reception',
        icon: CalendarCheck2,
        fallbackTitle: 'Reception and scheduling',
        fallbackDescription: 'Register visits, manage slots, track arrivals, and keep front-desk queues moving without switching systems.',
    },
    {
        key: 'pacs',
        icon: Radio,
        fallbackTitle: 'PACS worklists',
        fallbackDescription: 'Give modality teams a live view of assigned studies, status, priority, and image availability.',
    },
    {
        key: 'reporting',
        icon: FileText,
        fallbackTitle: 'Reporting workspace',
        fallbackDescription: 'Centralize dictation, templates, review, reconciliation, printing, and report delivery.',
    },
    {
        key: 'billing',
        icon: CreditCard,
        fallbackTitle: 'Billing and revenue',
        fallbackDescription: 'Connect orders, invoices, receipts, insurance, and payment follow-up to the clinical workflow.',
    },
    {
        key: 'analytics',
        icon: BarChart3,
        fallbackTitle: 'Executive analytics',
        fallbackDescription: 'Monitor throughput, turnaround time, modality utilization, workload, and revenue trends.',
    },
    {
        key: 'settings',
        icon: Settings2,
        fallbackTitle: 'Center configuration',
        fallbackDescription: 'Manage branches, departments, roles, report formats, printing defaults, and system-wide preferences.',
    },
];

// A real, ordered clinical sequence — this is the one place a numbered
// timeline is earned, since the order itself carries information.
const WORKFLOW_STEPS = [
    {
        key: 'intake',
        icon: CalendarCheck2,
        number: '01',
        fallbackTitle: 'Referral intake',
        fallbackText: 'Capture patient, doctor, branch, modality, payer, and required documents.',
    },
    {
        key: 'imaging',
        icon: ScanLine,
        number: '02',
        fallbackTitle: 'Imaging workflow',
        fallbackText: 'Track scheduled, arrived, in-room, completed, uploaded, and exception states.',
    },
    {
        key: 'reporting',
        icon: Workflow,
        number: '03',
        fallbackTitle: 'Clinical reporting',
        fallbackText: 'Route cases to radiologists with templates, prior studies, and reconciliation context.',
    },
    {
        key: 'delivery',
        icon: ShieldCheck,
        number: '04',
        fallbackTitle: 'Delivery and audit',
        fallbackText: 'Finalize, print, export, share, and audit every action from one secure record.',
    },
];

const GOVERNANCE_ITEMS = [
    {
        key: 'access',
        icon: LockKeyhole,
        fallbackTitle: 'Role-based access',
        fallbackText: 'Separate permissions for reception, technicians, radiologists, billing, managers, and administrators.',
    },
    {
        key: 'audit',
        icon: Fingerprint,
        fallbackTitle: 'Traceable activity',
        fallbackText: 'Every report change, login, and sensitive data access is logged and reviewable.',
    },
    {
        key: 'data',
        icon: Database,
        fallbackTitle: 'Connected data',
        fallbackText: 'Patients, studies, payments, reports, and documents stay aligned across departments.',
    },
    {
        key: 'control',
        icon: ShieldCheck,
        fallbackTitle: 'Operational control',
        fallbackText: 'Standardize center policies, printing, report branding, and clinical handoffs.',
    },
];

const METRICS = [
    { value: '148', key: 'studiesToday', fallback: 'Studies today' },
    { value: '27', key: 'reportsPending', fallback: 'Reports pending' },
    { value: '08', key: 'activeModalities', fallback: 'Active modalities' },
    { value: '96%', key: 'slaCompliance', fallback: 'SLA compliance' },
];

const prefersReducedMotion = () =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

// ---------------------------------------------------------------------------
// Small shared hooks
// ---------------------------------------------------------------------------

/** Reveals content once, the first time it scrolls into view. */
const useInView = (rootMargin = '0px 0px -10% 0px') => {
    const ref = useRef(null);
    const [inView, setInView] = useState(false);

    useEffect(() => {
        if (prefersReducedMotion()) {
            setInView(true);
            return undefined;
        }
        const node = ref.current;
        if (!node || !('IntersectionObserver' in window)) {
            setInView(true);
            return undefined;
        }
        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setInView(true);
                    observer.disconnect();
                }
            },
            { threshold: 0.15, rootMargin },
        );
        observer.observe(node);
        return () => observer.disconnect();
    }, [rootMargin]);

    return [ref, inView];
};

export const CountUp = ({ value, className = '' }) => {
    const [ref, inView] = useInView();
    return (
        <span ref={ref} className={className}>
            {inView ? value : '00'}
        </span>
    );
};

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

const Landing = () => {
    const { t, i18n } = useTranslation('landing');
    const isRtl = i18n.dir() === 'rtl';
    const [dark, setDark] = useState(
        () => typeof document !== 'undefined' && document.documentElement.classList.contains('dark'),
    );
    const [mobileOpen, setMobileOpen] = useState(false);
    const [activeSection, setActiveSection] = useState('overview');
    const menuButtonRef = useRef(null);
    const menuRef = useRef(null);
    const { data: publicSettings } = useGetPublicCenterSettingsQuery();

    const centerSettings = useMemo(() => normalizeCenterSettings(publicSettings || {}), [publicSettings]);
    const centerName =
        [centerSettings.center_name, centerSettings.branch_name].filter(Boolean).join(' - ') ||
        'RCMS Radiology Center';
    const centerInitials = String(centerSettings.center_name || 'RCMS')
        .trim()
        .slice(0, 4)
        .toUpperCase();

    const navItems = useMemo(
        () =>
            SECTION_IDS.map((id) => ({
                id,
                label: t(`managementLanding.nav.${id}`, { defaultValue: NAV_FALLBACKS[id] }),
            })),
        [t],
    );

    // Document title / meta description while this page is mounted.
    useEffect(() => {
        const previousTitle = document.title;
        const description = document.querySelector('meta[name="description"]');
        const previousDescription = description?.getAttribute('content');

        document.title = `${centerName} | ${t('managementLanding.metaTitle', {
            defaultValue: 'Radiology management system',
        })}`;
        description?.setAttribute(
            'content',
            t('managementLanding.metaDescription', {
                defaultValue:
                    'A professional command center for radiology reception, PACS worklists, reporting, billing, settings, analytics, and governance.',
            }),
        );

        return () => {
            document.title = previousTitle;
            if (description && previousDescription !== null) {
                description.setAttribute('content', previousDescription);
            }
        };
    }, [centerName, t, i18n.resolvedLanguage]);

    // Keep local `dark` state in sync if the theme is toggled elsewhere.
    useEffect(() => {
        const observer = new MutationObserver(() => {
            setDark(document.documentElement.classList.contains('dark'));
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    // Scroll-spy: highlight the nav item for whichever section is on screen.
    useEffect(() => {
        const sections = SECTION_IDS.map((id) => document.getElementById(id)).filter(Boolean);
        if (!sections.length || !('IntersectionObserver' in window)) return undefined;

        const observer = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((entry) => entry.isIntersecting)
                    .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
                if (visible) setActiveSection(visible.target.id);
            },
            { threshold: [0.25, 0.5, 0.75], rootMargin: '-15% 0px -55% 0px' },
        );
        sections.forEach((section) => observer.observe(section));
        return () => observer.disconnect();
    }, []);

    // Mobile menu: lock scroll, trap focus, close on escape.
    useEffect(() => {
        if (!mobileOpen) {
            document.body.style.overflow = '';
            return undefined;
        }

        const focusable = Array.from(
            menuRef.current?.querySelectorAll('a[href], button:not([disabled])') || [],
        );
        document.body.style.overflow = 'hidden';
        focusable[0]?.focus();

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') {
                setMobileOpen(false);
                requestAnimationFrame(() => menuButtonRef.current?.focus());
                return;
            }
            if (event.key !== 'Tab' || focusable.length === 0) return;
            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (event.shiftKey && document.activeElement === first) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
                event.preventDefault();
                first.focus();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            document.body.style.overflow = '';
        };
    }, [mobileOpen]);

    const toggleTheme = useCallback(() => {
        setDark((current) => {
            const next = !current;
            document.documentElement.classList.toggle('dark', next);
            document.documentElement.dataset.resolvedTheme = next ? 'dark' : 'light';
            document.documentElement.style.colorScheme = next ? 'dark' : 'light';
            try {
                const saved = JSON.parse(localStorage.getItem('rcms_preferences') || '{}');
                localStorage.setItem(
                    'rcms_preferences',
                    JSON.stringify({ ...saved, theme: next ? 'dark' : 'light' }),
                );
            } catch (_) {
                // Public preferences are best-effort.
            }
            return next;
        });
    }, []);

    const changeLanguage = () => i18n.changeLanguage(i18n.language.startsWith('ar') ? 'en' : 'ar');

    const scrollToSection = (id) => {
        const node = document.getElementById(id);
        node?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' });
    };

    return (
        <div
            dir={isRtl ? 'rtl' : 'ltr'}
            lang={isRtl ? 'ar' : 'en'}
            className={`landing-page min-h-screen selection:bg-cyan-300/30 ${
                dark ? 'landing-night' : 'landing-day'
            } ${isRtl ? 'font-arabic' : 'font-sans'}`}
        >
            <LandingStyles />

            <a
                href="#overview"
                className="fixed start-3 top-3 z-[80] -translate-y-24 rounded-lg bg-cyan-500 px-4 py-2.5 text-sm font-bold text-white shadow-lg transition focus:translate-y-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/50"
            >
                {t('nav.skipContent', { defaultValue: 'Skip to content' })}
            </a>

            <SiteHeader
                t={t}
                isRtl={isRtl}
                dark={dark}
                centerName={centerName}
                centerInitials={centerInitials}
                logoUrl={centerSettings.logo_url}
                navItems={navItems}
                activeSection={activeSection}
                scrollToSection={scrollToSection}
                mobileOpen={mobileOpen}
                setMobileOpen={setMobileOpen}
                menuButtonRef={menuButtonRef}
                toggleTheme={toggleTheme}
                changeLanguage={changeLanguage}
                language={i18n.language}
            />

            {mobileOpen && (
                <MobileMenu
                    t={t}
                    menuRef={menuRef}
                    navItems={navItems}
                    scrollToSection={scrollToSection}
                    close={() => setMobileOpen(false)}
                />
            )}

            <main id="overview" className="landing-scroll-mt">
                <Hero t={t} isRtl={isRtl} />
                <StatsStrip t={t} />
                <ModulesSection t={t} />
                <WorkflowSection t={t} isRtl={isRtl} />
                <GovernanceSection t={t} isRtl={isRtl} />
                <FinalCta t={t} isRtl={isRtl} />
            </main>

            <SiteFooter t={t} centerName={centerName} />
        </div>
    );
};

// ---------------------------------------------------------------------------
// Header + navigation
// ---------------------------------------------------------------------------

const SiteHeader = ({
    t,
    isRtl,
    dark,
    centerName,
    centerInitials,
    logoUrl,
    navItems,
    activeSection,
    scrollToSection,
    mobileOpen,
    setMobileOpen,
    menuButtonRef,
    toggleTheme,
    changeLanguage,
    language,
}) => (
    <header className="landing-header sticky top-0 z-40 border-b backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
            <BrandLink centerName={centerName} centerInitials={centerInitials} logoUrl={logoUrl} />

            <nav
                className="hidden items-center gap-1 lg:flex"
                aria-label={t('nav.primaryLabel', { defaultValue: 'Primary navigation' })}
            >
                {navItems.map((item) => {
                    const active = activeSection === item.id;
                    return (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => scrollToSection(item.id)}
                            aria-current={active ? 'true' : undefined}
                            className={`landing-nav-link rounded-lg px-3.5 py-2 text-[13px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/35 ${
                                active ? 'landing-nav-link--active' : ''
                            }`}
                        >
                            {item.label}
                        </button>
                    );
                })}
            </nav>

            <div className="flex items-center gap-1.5">
                <IconTextButton
                    onClick={changeLanguage}
                    label={t('nav.changeLanguage', { defaultValue: 'Change language' })}
                    className="hidden sm:flex"
                >
                    <Globe2 size={14} strokeWidth={2} />
                    <span className="tabular-nums">{language.startsWith('ar') ? 'EN' : 'AR'}</span>
                </IconTextButton>

                <IconButton
                    onClick={toggleTheme}
                    label={t(dark ? 'nav.lightMode' : 'nav.darkMode', {
                        defaultValue: dark ? 'Switch to light mode' : 'Switch to dark mode',
                    })}
                >
                    {dark ? <Sun size={15} strokeWidth={2} /> : <Moon size={15} strokeWidth={2} />}
                </IconButton>

                <Link
                    to="/login"
                    className="landing-primary-action hidden min-h-9 items-center justify-center gap-1.5 rounded-lg px-4 text-[13px] font-bold shadow-sm transition hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/50 sm:inline-flex"
                >
                    {t('managementLanding.signIn', { defaultValue: 'Staff sign in' })}
                    <ArrowRight size={14} strokeWidth={2.5} className={isRtl ? 'rotate-180' : ''} />
                </Link>

                <button
                    ref={menuButtonRef}
                    type="button"
                    aria-label={t(mobileOpen ? 'nav.closeMenu' : 'nav.openMenu', {
                        defaultValue: mobileOpen ? 'Close navigation' : 'Open navigation',
                    })}
                    aria-expanded={mobileOpen}
                    aria-controls="landing-mobile-menu"
                    onClick={() => setMobileOpen((open) => !open)}
                    className="landing-menu-btn flex h-9 w-9 items-center justify-center rounded-lg border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/35 lg:hidden"
                >
                    {mobileOpen ? <X size={17} strokeWidth={2} /> : <Menu size={17} strokeWidth={2} />}
                </button>
            </div>
        </div>
    </header>
);

const MobileMenu = ({ t, menuRef, navItems, scrollToSection, close }) => (
    <div
        className="landing-menu-overlay fixed inset-0 z-30 pt-16 lg:hidden"
        role="dialog"
        aria-modal="true"
        aria-label={t('nav.primaryLabel', { defaultValue: 'Primary navigation' })}
        onClick={close}
    >
        <div
            id="landing-mobile-menu"
            ref={menuRef}
            onClick={(event) => event.stopPropagation()}
            className="landing-menu-in landing-mobile-panel border-b p-3"
        >
            <nav className="grid gap-1">
                {navItems.map((item) => (
                    <button
                        key={item.id}
                        type="button"
                        onClick={() => {
                            scrollToSection(item.id);
                            close();
                        }}
                        className="landing-mobile-nav-item flex min-h-11 items-center rounded-lg px-3.5 text-start text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/35"
                    >
                        {item.label}
                    </button>
                ))}
            </nav>
            <Link
                to="/login"
                onClick={close}
                className="landing-primary-action mt-2 flex min-h-11 items-center justify-center rounded-lg px-4 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/40"
            >
                {t('managementLanding.openWorkspace', { defaultValue: 'Open staff workspace' })}
            </Link>
        </div>
    </div>
);

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

const Hero = ({ t, isRtl }) => {
    const [ref, inView] = useInView('0px');
    return (
        <section
            ref={ref}
            className="landing-hero relative overflow-hidden border-b"
            aria-label={t('managementLanding.nav.overview', { defaultValue: 'Overview' })}
        >
            <img
                src={loginRadiologyBackground}
                alt=""
                aria-hidden="true"
                className="landing-hero-bg absolute inset-0 h-full w-full object-cover object-[58%_center] lg:object-center"
            />
            <div className="landing-hero-overlay absolute inset-0" aria-hidden="true" />
            <span className="landing-hero-scan pointer-events-none absolute inset-x-0 top-0 h-32" aria-hidden="true" />

            <div className="relative mx-auto grid max-w-7xl gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:py-28 lg:px-8">
                <div className={`min-w-0 ${inView ? 'landing-reveal landing-reveal--in' : 'landing-reveal'}`}>
                    <span className="landing-eyebrow inline-flex items-center gap-2 rounded-full border px-3 py-1 text-[11px] font-bold uppercase tracking-wide">
                        <span className="landing-dot h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden="true" />
                        {t('managementLanding.eyebrow', { defaultValue: 'Management system only' })}
                    </span>

                    <h1 className="landing-title mt-5 text-[2.1rem] font-black leading-[1.08] sm:text-[2.65rem] lg:text-[3.1rem]">
                        {t('managementLanding.heroTitleLead', {
                            defaultValue: 'Operate the entire radiology center',
                        })}{' '}
                        <span className="landing-title-accent">
                            {t('managementLanding.heroTitleAccent', { defaultValue: 'from one command system.' })}
                        </span>
                    </h1>

                    <p className="landing-description mt-5 max-w-xl text-[15px] font-medium leading-7 sm:text-base">
                        {t('managementLanding.heroDescription', {
                            defaultValue:
                                'RCMS brings reception, scheduling, PACS worklists, reporting, billing, printing, analytics, and governance into one focused internal workspace for radiology teams.',
                        })}
                    </p>

                    <div className="mt-8 flex flex-wrap items-center gap-3">
                        <Link
                            to="/login"
                            className="landing-cta landing-primary-action group inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-6 text-sm font-bold shadow-lg transition hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/50"
                        >
                            {t('managementLanding.openWorkspace', { defaultValue: 'Open staff workspace' })}
                            <ArrowRight
                                size={16}
                                strokeWidth={2.5}
                                className={`transition-transform duration-200 ${
                                    isRtl ? 'rotate-180 group-hover:-translate-x-0.5' : 'group-hover:translate-x-0.5'
                                }`}
                            />
                        </Link>
                        <button
                            type="button"
                            onClick={() => document.getElementById('workflow')?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth' })}
                            className="landing-secondary-action inline-flex min-h-12 items-center justify-center rounded-xl border px-5 text-sm font-bold transition hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/30"
                        >
                            {t('managementLanding.seeWorkflow', { defaultValue: 'See how it works' })}
                        </button>
                    </div>

                    <ul className="landing-trust mt-8 flex flex-wrap gap-2 list-none p-0">
                        {TRUST_SIGNALS.map((item) => (
                            <li
                                key={item.key}
                                className="landing-trust-item inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium"
                            >
                                <CheckCircle2 size={13} className="shrink-0 text-emerald-400" strokeWidth={2.25} />
                                {t(`managementLanding.trust.${item.key}`, { defaultValue: item.fallback })}
                            </li>
                        ))}
                    </ul>
                </div>

                <div className={`min-w-0 ${inView ? 'landing-reveal landing-reveal--in landing-reveal--delay-2' : 'landing-reveal'}`}>
                    <HeroScanPanel t={t} isRtl={isRtl} />
                </div>
            </div>
        </section>
    );
};

/**
 * Signature visual: a schematic "live session" tracking the same four
 * clinical stages featured in the Workflow section, swept by an animated
 * scan line — the one place the page spends its visual boldness.
 */
const HeroScanPanel = ({ t, isRtl }) => {
    const [activeStep, setActiveStep] = useState(0);

    useEffect(() => {
        if (prefersReducedMotion()) return undefined;
        const id = setInterval(() => {
            setActiveStep((step) => (step + 1) % WORKFLOW_STEPS.length);
        }, 2600);
        return () => clearInterval(id);
    }, []);

    return (
        <div className="landing-scan-panel relative rounded-2xl border p-5 sm:p-6" role="img" aria-label={t('managementLanding.scanPanelLabel', { defaultValue: 'Live study moving through reception, imaging, reporting, and delivery' })}>
            <div className="flex items-center justify-between gap-2">
                <span className="landing-scan-panel-kicker font-mono text-[10px] font-bold uppercase tracking-wider">
                    {t('managementLanding.scanPanelKicker', { defaultValue: 'Live study — Room 3' })}
                </span>
                <span className="landing-scan-panel-pulse inline-flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider">
                    <span className="landing-dot h-1.5 w-1.5 rounded-full bg-cyan-400" aria-hidden="true" />
                    {t('managementLanding.scanPanelStatus', { defaultValue: 'In progress' })}
                </span>
            </div>

            <div className="landing-scan-track relative mt-8 mb-3">
                <div className="landing-scan-track-line absolute inset-x-0 top-4 h-[2px]" aria-hidden="true" />
                <div
                    className="landing-scan-track-fill absolute top-4 h-[2px] transition-[width] duration-[900ms] ease-out"
                    style={
                        isRtl
                            ? { right: 0, width: `${(activeStep / (WORKFLOW_STEPS.length - 1)) * 100}%` }
                            : { left: 0, width: `${(activeStep / (WORKFLOW_STEPS.length - 1)) * 100}%` }
                    }
                    aria-hidden="true"
                />
                <ol className="relative grid grid-cols-4 gap-2 list-none p-0">
                    {WORKFLOW_STEPS.map((step, index) => {
                        const Icon = step.icon;
                        const status = index < activeStep ? 'done' : index === activeStep ? 'active' : 'pending';
                        return (
                            <li key={step.key} className="flex flex-col items-center gap-2 text-center">
                                <span
                                    className={`landing-scan-node flex h-8 w-8 shrink-0 items-center justify-center rounded-full border transition-all duration-500 sm:h-9 sm:w-9 landing-scan-node--${status}`}
                                >
                                    <Icon size={14} strokeWidth={2.25} />
                                </span>
                                <span className={`landing-scan-node-label text-[10px] font-semibold leading-tight sm:text-[11px] landing-scan-node-label--${status}`}>
                                    {t(`managementLanding.workflowSteps.${step.key}.title`, { defaultValue: step.fallbackTitle }).split(' ')[0]}
                                </span>
                            </li>
                        );
                    })}
                </ol>
            </div>

            <p className="landing-scan-readout mt-5 min-h-[2.5rem] font-mono text-[12px] leading-5">
                {t(`managementLanding.workflowSteps.${WORKFLOW_STEPS[activeStep].key}.text`, {
                    defaultValue: WORKFLOW_STEPS[activeStep].fallbackText,
                })}
            </p>

            <div className="landing-scan-metrics mt-5 grid grid-cols-4 gap-1.5 border-t pt-4">
                {METRICS.map((metric) => (
                    <div key={metric.key} className="text-center">
                        <CountUp value={metric.value} className="landing-metric-value block text-sm font-black tabular-nums sm:text-base" />
                        <span className="landing-metric-label mt-0.5 block truncate text-[8.5px] font-medium leading-tight sm:text-[9px]">
                            {t(`managementLanding.metrics.${metric.key}`, { defaultValue: metric.fallback })}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
};

// ---------------------------------------------------------------------------
// Stats strip (quick-access shortcuts, echoing the hero CTA)
// ---------------------------------------------------------------------------

const StatsStrip = ({ t }) => {
    const [ref, inView] = useInView();
    return (
        <section ref={ref} className="landing-strip border-b">
            <div
                className={`mx-auto grid max-w-7xl grid-cols-2 gap-3 px-4 py-6 sm:px-6 sm:py-7 md:grid-cols-4 lg:px-8 ${
                    inView ? 'landing-reveal landing-reveal--in' : 'landing-reveal'
                }`}
            >
                {QUICK_ACCESS.map(({ key, icon: Icon, fallback }) => (
                    <Link
                        key={key}
                        to="/login"
                        className="landing-quick-item group flex items-center gap-2.5 rounded-xl border px-3.5 py-3 transition hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/30"
                    >
                        <span className="landing-quick-icon flex h-8 w-8 shrink-0 items-center justify-center rounded-lg">
                            <Icon size={14} strokeWidth={2} />
                        </span>
                        <span className="landing-quick-title truncate text-[13px] font-semibold">
                            {t(`managementLanding.quickAccess.${key}.title`, { defaultValue: fallback })}
                        </span>
                    </Link>
                ))}
            </div>
        </section>
    );
};

// ---------------------------------------------------------------------------
// Modules
// ---------------------------------------------------------------------------

const ModulesSection = ({ t }) => {
    const [ref, inView] = useInView();
    return (
        <section id="modules" className="landing-scroll-mt border-b py-16 sm:py-20 lg:py-24">
            <div ref={ref} className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <SectionHeading
                    eyebrow={t('managementLanding.modulesEyebrow', { defaultValue: 'Operational command center' })}
                    title={t('managementLanding.modulesTitle', {
                        defaultValue: 'Everything the management team needs is visible, connected, and actionable.',
                    })}
                    inView={inView}
                />
                <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {MODULES.map((module, index) => (
                        <ModuleCard key={module.key} module={module} index={index} t={t} inView={inView} />
                    ))}
                </div>
            </div>
        </section>
    );
};

const ModuleCard = ({ module, index, t, inView }) => {
    const Icon = module.icon;
    return (
        <article
            className={`landing-tile group relative rounded-2xl border p-5 transition duration-200 hover:-translate-y-1 ${
                inView ? 'landing-reveal landing-reveal--in' : 'landing-reveal'
            }`}
            style={{ transitionDelay: inView ? `${index * 60}ms` : '0ms' }}
        >
            <span className="landing-tile-icon flex h-10 w-10 items-center justify-center rounded-xl border transition duration-200">
                <Icon size={17} strokeWidth={2} />
            </span>
            <h3 className="landing-tile-title mt-4 text-[15px] font-bold">
                {t(`managementLanding.modules.${module.key}.title`, { defaultValue: module.fallbackTitle })}
            </h3>
            <p className="landing-tile-desc mt-1.5 text-[13px] leading-5">
                {t(`managementLanding.modules.${module.key}.description`, {
                    defaultValue: module.fallbackDescription,
                })}
            </p>
        </article>
    );
};

// ---------------------------------------------------------------------------
// Workflow
// ---------------------------------------------------------------------------

const WorkflowSection = ({ t, isRtl }) => {
    const [ref, inView] = useInView();
    return (
        <section id="workflow" className="landing-scroll-mt landing-alt-surface border-b py-16 sm:py-20 lg:py-24">
            <div ref={ref} className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
                <SectionHeading
                    eyebrow={t('managementLanding.workflowEyebrow', { defaultValue: 'Workflow intelligence' })}
                    title={t('managementLanding.workflowTitle', {
                        defaultValue: 'From referral intake to final delivery, without losing context.',
                    })}
                    description={t('managementLanding.workflowDescription', {
                        defaultValue:
                            'Reception, modality teams, radiologists, billing, and leadership work from the same source of truth, at every step.',
                    })}
                    inView={inView}
                />

                <ol className="landing-workflow-rail relative mt-12 grid list-none gap-6 p-0 sm:grid-cols-2 lg:grid-cols-4 lg:gap-4">
                    <span className="landing-workflow-line pointer-events-none absolute inset-x-0 top-6 hidden h-[2px] lg:block" aria-hidden="true" />
                    {WORKFLOW_STEPS.map((step, index) => (
                        <WorkflowStep key={step.key} step={step} index={index} t={t} isRtl={isRtl} inView={inView} />
                    ))}
                </ol>
            </div>
        </section>
    );
};

const WorkflowStep = ({ step, index, t, isRtl, inView }) => {
    const Icon = step.icon;
    return (
        <li
            className={`relative min-w-0 ${inView ? 'landing-reveal landing-reveal--in' : 'landing-reveal'}`}
            style={{ transitionDelay: inView ? `${index * 90}ms` : '0ms' }}
        >
            <div className="landing-workflow-card relative rounded-2xl border p-5">
                <div className="flex items-center justify-between">
                    <span className="landing-workflow-icon flex h-10 w-10 items-center justify-center rounded-xl">
                        <Icon size={17} strokeWidth={2} />
                    </span>
                    <span className="landing-workflow-number font-mono text-xs font-bold">{step.number}</span>
                </div>
                <h3 className="landing-workflow-title mt-4 text-[14px] font-bold leading-snug">
                    {t(`managementLanding.workflowSteps.${step.key}.title`, { defaultValue: step.fallbackTitle })}
                </h3>
                <p className="landing-workflow-text mt-1.5 text-[12.5px] leading-5">
                    {t(`managementLanding.workflowSteps.${step.key}.text`, { defaultValue: step.fallbackText })}
                </p>
            </div>
            {index < WORKFLOW_STEPS.length - 1 && (
                <ArrowRight
                    size={14}
                    strokeWidth={2}
                    className={`landing-workflow-arrow absolute -end-2.5 top-9 z-10 hidden text-cyan-500/60 lg:block ${
                        isRtl ? 'rotate-180' : ''
                    }`}
                    aria-hidden="true"
                />
            )}
        </li>
    );
};

// ---------------------------------------------------------------------------
// Governance
// ---------------------------------------------------------------------------

const GovernanceSection = ({ t, isRtl }) => {
    const [ref, inView] = useInView();
    return (
        <section id="governance" className="landing-scroll-mt border-b py-16 sm:py-20 lg:py-24">
            <div ref={ref} className="mx-auto grid max-w-7xl gap-10 px-4 sm:px-6 lg:grid-cols-[.85fr_1.15fr] lg:items-start lg:gap-14 lg:px-8">
                <div className={inView ? 'landing-reveal landing-reveal--in' : 'landing-reveal'}>
                    <SectionHeading
                        eyebrow={t('managementLanding.governanceEyebrow', { defaultValue: 'Governance and customization' })}
                        title={t('managementLanding.governanceTitle', {
                            defaultValue: 'Professional control over the whole app, reports, printing, and users.',
                        })}
                        inView
                        as="div"
                    />
                    <Link
                        to="/login"
                        className="landing-secondary-action mt-6 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border px-5 text-sm font-bold transition hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/30"
                    >
                        {t('managementLanding.signIn', { defaultValue: 'Staff sign in' })}
                        <ArrowRight size={14} strokeWidth={2.5} className={isRtl ? 'rotate-180' : ''} />
                    </Link>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                    {GOVERNANCE_ITEMS.map((item, index) => {
                        const Icon = item.icon;
                        return (
                            <article
                                key={item.key}
                                className={`landing-governance-item group rounded-2xl border p-4 transition hover:-translate-y-px ${
                                    inView ? 'landing-reveal landing-reveal--in' : 'landing-reveal'
                                }`}
                                style={{ transitionDelay: inView ? `${index * 70}ms` : '0ms' }}
                            >
                                <span className="landing-governance-icon flex h-9 w-9 items-center justify-center rounded-xl transition">
                                    <Icon size={15} strokeWidth={2} />
                                </span>
                                <h3 className="landing-governance-title mt-3 text-[13.5px] font-bold">
                                    {t(`managementLanding.governanceItems.${item.key}.title`, { defaultValue: item.fallbackTitle })}
                                </h3>
                                <p className="landing-governance-text mt-1 text-[12px] leading-5">
                                    {t(`managementLanding.governanceItems.${item.key}.text`, { defaultValue: item.fallbackText })}
                                </p>
                            </article>
                        );
                    })}
                </div>
            </div>
        </section>
    );
};

// ---------------------------------------------------------------------------
// Final CTA + footer
// ---------------------------------------------------------------------------

const FinalCta = ({ t, isRtl }) => {
    const [ref, inView] = useInView();
    return (
        <section ref={ref} className="landing-alt-surface py-16 sm:py-20">
            <div
                className={`mx-auto max-w-3xl px-4 text-center sm:px-6 ${
                    inView ? 'landing-reveal landing-reveal--in' : 'landing-reveal'
                }`}
            >
                <h2 className="landing-title text-2xl font-black leading-snug sm:text-3xl">
                    {t('managementLanding.finalCtaTitle', {
                        defaultValue: 'Ready to run your center from one workspace?',
                    })}
                </h2>
                <p className="landing-description mx-auto mt-3 max-w-lg text-sm font-medium leading-6 sm:text-[15px]">
                    {t('managementLanding.finalCtaDescription', {
                        defaultValue: 'Sign in with your staff account to pick up right where your team left off.',
                    })}
                </p>
                <Link
                    to="/login"
                    className="landing-primary-action group mt-7 inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-7 text-sm font-bold shadow-lg transition hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-300/50"
                >
                    {t('managementLanding.openWorkspace', { defaultValue: 'Open staff workspace' })}
                    <ArrowRight
                        size={16}
                        strokeWidth={2.5}
                        className={`transition-transform duration-200 ${
                            isRtl ? 'rotate-180 group-hover:-translate-x-0.5' : 'group-hover:translate-x-0.5'
                        }`}
                    />
                </Link>
            </div>
        </section>
    );
};

const SiteFooter = ({ t, centerName }) => (
    <footer className="landing-footer border-t py-6">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 text-center sm:flex-row sm:px-6 sm:text-start lg:px-8">
            <span className="landing-footer-text text-xs font-medium">
                © {new Date().getFullYear()} {centerName}
            </span>
            <span className="landing-footer-text text-xs font-medium">
                {t('managementLanding.footerNote', { defaultValue: 'Internal staff system — authorized access only' })}
            </span>
        </div>
    </footer>
);

// ---------------------------------------------------------------------------
// Shared bits
// ---------------------------------------------------------------------------

const SectionHeading = ({ eyebrow, title, description, inView, as: Tag = 'div' }) => (
    <Tag className={inView ? 'landing-reveal landing-reveal--in' : 'landing-reveal'}>
        <p className="landing-eyebrow inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-wide">
            <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" aria-hidden="true" />
            {eyebrow}
        </p>
        <h2 className="landing-pane-title mt-3 max-w-2xl text-xl font-black leading-snug sm:text-2xl lg:text-[1.75rem]">
            {title}
        </h2>
        {description && (
            <p className="landing-description mt-3 max-w-xl text-sm font-medium leading-6 sm:text-[15px]">
                {description}
            </p>
        )}
    </Tag>
);

const BrandLink = ({ centerName, centerInitials, logoUrl, onClick }) => (
    <Link to="/" onClick={onClick} aria-label={centerName} className="group inline-flex min-w-0 items-center gap-2.5">
        <span className="landing-brand-logo relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border bg-white text-slate-950 shadow-sm sm:h-10 sm:w-10">
            {logoUrl ? (
                <img src={logoUrl} alt="" className="h-6 w-6 rounded-md object-contain sm:h-7 sm:w-7" />
            ) : (
                <span className="font-mono text-[9px] font-black sm:text-[10px]">{centerInitials}</span>
            )}
            <span className="landing-brand-status absolute -end-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-400" aria-hidden="true" />
        </span>
        <span className="min-w-0">
            <span className="landing-brand-name block max-w-[42vw] truncate text-sm font-black leading-tight sm:max-w-[240px] sm:text-[15px]">
                {centerName}
            </span>
            <span className="landing-brand-line block truncate text-[9px] font-black uppercase tracking-wide">
                Radiology management system
            </span>
        </span>
    </Link>
);

const IconButton = ({ children, label, onClick }) => (
    <button
        type="button"
        onClick={onClick}
        aria-label={label}
        title={label}
        className="landing-icon-btn flex h-9 w-9 items-center justify-center rounded-lg border transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/35"
    >
        {children}
    </button>
);

const IconTextButton = ({ children, label, onClick, className = '' }) => (
    <button
        type="button"
        onClick={onClick}
        aria-label={label}
        title={label}
        className={`landing-icon-btn h-9 items-center gap-1.5 rounded-lg border px-2.5 text-[11px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/35 ${className}`}
    >
        {children}
    </button>
);

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const LandingStyles = () => (
    <style>{`
        @keyframes landing-reveal-in {
            from { opacity: 0; transform: translateY(14px); }
            to { opacity: 1; transform: translateY(0); }
        }
        @keyframes landing-dot-pulse {
            0%, 100% { box-shadow: 0 0 0 0 rgba(52,211,153,.45); }
            55% { box-shadow: 0 0 0 5px rgba(52,211,153,0); }
        }
        @keyframes landing-scan-sweep {
            0% { transform: translateY(-100%); opacity: 0; }
            10% { opacity: .55; }
            90% { opacity: .12; }
            100% { transform: translateY(420%); opacity: 0; }
        }
        @keyframes landing-menu-in {
            from { opacity: 0; transform: translateY(-6px); }
            to { opacity: 1; transform: translateY(0); }
        }

        .landing-page {
            --lp-bg: #f6f8fa;
            --lp-surface: #ffffff;
            --lp-surface-alt: #f0f4f7;
            --lp-border: rgba(15,23,42,.09);
            --lp-ink: #0f172a;
            --lp-muted: #55677a;
            --lp-soft: #7c8ba0;
            --lp-accent: #0891b2;
            --lp-accent-strong: #0f766e;
            --lp-accent-soft: rgba(6,182,212,.08);
            --lp-control-bg: #ffffff;
            --lp-control-hover: #ecfeff;
            background: var(--lp-bg);
            color: var(--lp-ink);
        }
        .landing-night {
            --lp-bg: #060b14;
            --lp-surface: #0d1520;
            --lp-surface-alt: #0a121d;
            --lp-border: rgba(148,163,184,.14);
            --lp-ink: #f1f5f9;
            --lp-muted: #93a4b8;
            --lp-soft: #64748b;
            --lp-accent: #22d3ee;
            --lp-accent-strong: #2dd4bf;
            --lp-accent-soft: rgba(34,211,238,.09);
            --lp-control-bg: #0d1520;
            --lp-control-hover: #131f2e;
        }

        .landing-scroll-mt { scroll-margin-top: 4.5rem; }

        .landing-header { background: color-mix(in srgb, var(--lp-bg) 82%, transparent); border-color: var(--lp-border); }
        .landing-brand-name { color: var(--lp-ink); }
        .landing-brand-line { color: var(--lp-accent-strong); }
        .landing-brand-logo { border-color: var(--lp-border); }
        .landing-brand-status { box-shadow: 0 0 0 2px var(--lp-control-bg); }

        .landing-nav-link { color: var(--lp-muted); }
        .landing-nav-link:hover { color: var(--lp-ink); background: var(--lp-accent-soft); }
        .landing-nav-link--active { color: var(--lp-ink); background: var(--lp-accent-soft); }

        .landing-icon-btn, .landing-menu-btn {
            color: var(--lp-muted);
            background: var(--lp-control-bg);
            border-color: var(--lp-border);
        }
        .landing-icon-btn:hover, .landing-menu-btn:hover { color: var(--lp-ink); background: var(--lp-control-hover); }

        .landing-menu-overlay { background: color-mix(in srgb, var(--lp-bg) 55%, transparent); backdrop-filter: blur(6px); animation: landing-menu-in .18s ease both; }
        .landing-mobile-panel { background: var(--lp-surface); border-color: var(--lp-border); }
        .landing-mobile-nav-item { color: var(--lp-muted); }
        .landing-mobile-nav-item:hover { background: var(--lp-accent-soft); color: var(--lp-ink); }

        .landing-eyebrow { color: var(--lp-accent-strong); border-color: rgba(6,182,212,.2); background: var(--lp-accent-soft); }
        .landing-title, .landing-pane-title, .landing-tile-title, .landing-workflow-title, .landing-governance-title, .landing-metric-value, .landing-quick-title, .landing-brand-name {
            color: var(--lp-ink);
        }
        .landing-title-accent {
            background-image: linear-gradient(135deg, var(--lp-accent-strong), var(--lp-accent));
            background-clip: text; -webkit-background-clip: text; -webkit-text-fill-color: transparent; color: var(--lp-accent-strong);
        }
        .landing-description, .landing-tile-desc, .landing-governance-text, .landing-workflow-text, .landing-metric-label, .landing-footer-text {
            color: var(--lp-muted);
        }

        .landing-dot { animation: landing-dot-pulse 2s ease-in-out infinite; }

        /* Hero */
        .landing-hero { background: var(--lp-surface); border-color: var(--lp-border); }
        .landing-hero-bg { opacity: .5; filter: saturate(.85) contrast(1.02); }
        .landing-night .landing-hero-bg { opacity: .38; }
        .landing-hero-overlay {
            background: linear-gradient(115deg, var(--lp-bg) 8%, color-mix(in srgb, var(--lp-bg) 78%, transparent) 46%, color-mix(in srgb, var(--lp-bg) 32%, transparent) 100%);
        }
        [dir="rtl"] .landing-hero-overlay {
            background: linear-gradient(245deg, var(--lp-bg) 8%, color-mix(in srgb, var(--lp-bg) 78%, transparent) 46%, color-mix(in srgb, var(--lp-bg) 32%, transparent) 100%);
        }
        .landing-hero-scan { background: linear-gradient(180deg, transparent, rgba(34,211,238,.35), transparent); animation: landing-scan-sweep 7s ease-in-out infinite; }

        .landing-primary-action { color: #ffffff; background: linear-gradient(180deg, #14b8a6, #0f766e); }
        .landing-primary-action:hover { background: linear-gradient(180deg, #2dd4bf, #0d9488); }
        .landing-secondary-action { color: var(--lp-ink); border-color: var(--lp-border); background: var(--lp-surface); }
        .landing-secondary-action:hover { background: var(--lp-accent-soft); border-color: rgba(6,182,212,.3); }

        .landing-trust-item { color: var(--lp-muted); border-color: var(--lp-border); background: var(--lp-surface); }

        /* Hero scan panel (signature element) */
        .landing-scan-panel { background: var(--lp-surface); border-color: var(--lp-border); box-shadow: 0 24px 60px -36px rgba(15,23,42,.35); }
        .landing-scan-panel-kicker { color: var(--lp-soft); }
        .landing-scan-panel-pulse { color: var(--lp-accent-strong); }
        .landing-scan-track-line { background: var(--lp-border); }
        .landing-scan-track-fill { background: linear-gradient(90deg, var(--lp-accent-strong), var(--lp-accent)); }
        .landing-scan-node { background: var(--lp-surface); border-color: var(--lp-border); color: var(--lp-soft); }
        .landing-scan-node--active { background: var(--lp-accent-strong); border-color: transparent; color: #fff; box-shadow: 0 0 0 4px var(--lp-accent-soft); }
        .landing-scan-node--done { background: var(--lp-accent-soft); border-color: rgba(6,182,212,.3); color: var(--lp-accent-strong); }
        .landing-scan-node-label { color: var(--lp-soft); }
        .landing-scan-node-label--active, .landing-scan-node-label--done { color: var(--lp-ink); }
        .landing-scan-readout { color: var(--lp-muted); }
        .landing-scan-metrics { border-color: var(--lp-border); }

        /* Stats strip */
        .landing-strip { background: var(--lp-surface); border-color: var(--lp-border); }
        .landing-quick-item { border-color: var(--lp-border); background: var(--lp-surface); }
        .landing-quick-item:hover { background: var(--lp-accent-soft); border-color: rgba(6,182,212,.28); }
        .landing-quick-icon { background: var(--lp-accent-soft); color: var(--lp-accent-strong); }
        .landing-quick-title { color: var(--lp-ink); }

        /* Alternate surface bands */
        .landing-alt-surface { background: var(--lp-surface-alt); }
        section.border-b { border-color: var(--lp-border); }

        /* Module tiles */
        .landing-tile { background: var(--lp-surface); border-color: var(--lp-border); }
        .landing-tile:hover { border-color: rgba(6,182,212,.3); box-shadow: 0 18px 40px -30px rgba(8,145,178,.35); }
        .landing-tile-icon { background: var(--lp-accent-soft); border-color: rgba(6,182,212,.16); color: var(--lp-accent-strong); }
        .landing-tile:hover .landing-tile-icon { background: var(--lp-accent-strong); color: #fff; border-color: transparent; }

        /* Workflow */
        .landing-workflow-line { background: linear-gradient(90deg, transparent, var(--lp-border) 12%, var(--lp-border) 88%, transparent); }
        .landing-workflow-card { background: var(--lp-surface); border-color: var(--lp-border); }
        .landing-workflow-card:hover { border-color: rgba(6,182,212,.3); }
        .landing-workflow-icon { background: var(--lp-accent-soft); color: var(--lp-accent-strong); }
        .landing-workflow-number { color: var(--lp-soft); }
        .landing-workflow-arrow { color: var(--lp-accent); }

        /* Governance */
        .landing-governance-item { background: var(--lp-surface); border-color: var(--lp-border); }
        .landing-governance-item:hover { border-color: rgba(6,182,212,.28); }
        .landing-governance-icon { background: var(--lp-accent-soft); color: var(--lp-accent-strong); }

        .landing-footer { background: var(--lp-surface); border-color: var(--lp-border); }

        /* Scroll reveal */
        .landing-reveal { opacity: 0; transform: translateY(14px); transition: opacity .6s cubic-bezier(.16,1,.3,1), transform .6s cubic-bezier(.16,1,.3,1); }
        .landing-reveal--in { opacity: 1; transform: translateY(0); }
        .landing-reveal--delay-2 { transition-delay: .1s; }

        @media (prefers-reduced-motion: reduce) {
            .landing-dot, .landing-hero-scan, .landing-menu-overlay { animation: none !important; }
            .landing-reveal, .landing-tile, .landing-quick-item, .landing-governance-item, .landing-workflow-card, .landing-scan-track-fill { transition: none !important; }
        }
    `}</style>
);

export default Landing;
