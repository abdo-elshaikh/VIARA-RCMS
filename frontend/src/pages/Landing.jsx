import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
    Activity,
    ArrowRight,
    BarChart3,
    Clock3,
    Database,
    HeartPulse,
    KeyRound,
    Languages,
    Layers,
    Moon,
    Pause,
    Play,
    Radio,
    Shield,
    ShieldCheck,
    Sparkles,
    Stethoscope,
    Sun,
    User,
    UserCheck,
    Users,
    Workflow,
    Zap,
} from 'lucide-react';
import { useGetPublicLandingOverviewQuery } from '../store/api';
import { selectPreferences, setLanguage, setTheme } from '../store/preferencesSlice';
import { VIARA_BRAND } from '../config/brand';

import './LandingIllustrative.css';

const SLIDE_DURATION_MS = 14000;

const SLIDE_ARTWORK = Object.freeze({
    operations: '/images/landing/viara-slide-operations-vector-v3.png',
    intelligence: '/images/landing/viara-slide-intelligence-vector-v3.png',
    workflow: '/images/landing/viara-slide-workflow-vector-v3.png',
    gateway: '/images/landing/viara-slide-gateway-vector-v3.png',
});

const SLIDE_EASE = [0.16, 1, 0.3, 1];

const narrativeVariants = {
    enter: (slideDirection) => ({
        opacity: 0,
        x: slideDirection * 38,
        scale: 0.992,
    }),
    center: {
        opacity: 1,
        x: 0,
        scale: 1,
        transition: {
            duration: 0.72,
            ease: SLIDE_EASE,
            staggerChildren: 0.085,
            delayChildren: 0.08,
        },
    },
    exit: (slideDirection) => ({
        opacity: 0,
        x: slideDirection * -24,
        scale: 0.996,
        transition: {
            duration: 0.36,
            ease: [0.4, 0, 1, 1],
            staggerChildren: 0.04,
            staggerDirection: -1,
        },
    }),
};

const narrativeItemVariants = {
    enter: (slideDirection) => ({ opacity: 0, x: slideDirection * 10, y: 14 }),
    center: { opacity: 1, x: 0, y: 0, transition: { duration: 0.54, ease: SLIDE_EASE } },
    exit: (slideDirection) => ({
        opacity: 0,
        x: slideDirection * -7,
        y: -7,
        transition: { duration: 0.26, ease: 'easeIn' },
    }),
};

const hudVariants = {
    enter: (slideDirection) => ({ opacity: 0, x: slideDirection * 12, y: 18, scale: 0.985 }),
    center: {
        opacity: 1,
        x: 0,
        y: 0,
        scale: 1,
        transition: { duration: 0.64, ease: SLIDE_EASE, staggerChildren: 0.075, delayChildren: 0.12 },
    },
    exit: (slideDirection) => ({
        opacity: 0,
        x: slideDirection * -8,
        y: -8,
        transition: { duration: 0.28, ease: 'easeIn' },
    }),
};

const hudPartVariants = {
    enter: { opacity: 0, y: 9 },
    center: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.46, ease: SLIDE_EASE, staggerChildren: 0.06, delayChildren: 0.04 },
    },
    exit: { opacity: 0, y: -5, transition: { duration: 0.22 } },
};

const artworkVariants = {
    enter: (slideDirection) => ({
        opacity: 0,
        x: slideDirection * 48,
        scale: 0.955,
        rotate: slideDirection * 0.6,
    }),
    center: {
        opacity: 1,
        x: 0,
        scale: 1,
        rotate: 0,
        transition: { duration: 0.82, ease: SLIDE_EASE },
    },
    exit: (slideDirection) => ({
        opacity: 0,
        x: slideDirection * -34,
        scale: 0.975,
        rotate: slideDirection * -0.35,
        transition: { duration: 0.38, ease: [0.4, 0, 1, 1] },
    }),
};

const CURTAIN_EASE = [0.22, 1, 0.36, 1];

function CurtainIdentity({ brandName, title, logoUrl, phase, index, total }) {
    const isVisible = phase === 'cover' || phase === 'hold';
    return (
        <motion.div
            className="viara-curtain-identity"
            initial={{ opacity: 0, y: 14, scale: 0.96 }}
            animate={isVisible
                ? { opacity: 1, y: 0, scale: 1 }
                : { opacity: 0, y: -12, scale: 0.98 }}
            transition={{
                duration: isVisible ? 0.65 : 0.45,
                delay: isVisible ? 0.22 : 0,
                ease: CURTAIN_EASE,
            }}
        >
            <span className="viara-curtain-identity__index" aria-hidden="true">
                {String(index + 1).padStart(2, '0')}
            </span>
            <span className="viara-curtain-identity__logo">
                <img src={logoUrl} alt="" aria-hidden="true" />
            </span>
            <span className="viara-curtain-identity__copy">
                <small dir="ltr">{brandName} · {String(index + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}</small>
                <strong>{title}</strong>
                <i aria-hidden="true"><b /></i>
            </span>
        </motion.div>
    );
}

function SlideCurtain({ curtain, brandName, logoUrl, onCovered, onComplete }) {
    const [phase, setPhase] = useState('cover'); // 'cover' -> 'hold' -> 'reveal'
    const { direction: curtainDirection, title, targetIndex, index, total } = curtain;
    const startSide = curtainDirection > 0 ? '-102%' : '102%';
    const endSide = curtainDirection > 0 ? '102%' : '-102%';
    const holdTimerRef = useRef(null);
    const hasCoveredRef = useRef(false);

    const isCovering = phase === 'cover';
    const isHolding = phase === 'hold';
    const isRevealing = phase === 'reveal';

    const handleCoverComplete = useCallback(() => {
        if (!hasCoveredRef.current) {
            hasCoveredRef.current = true;
            // Slide content changes ONLY here when the screen is completely covered
            if (typeof onCovered === 'function') {
                onCovered(targetIndex);
            }
        }
        setPhase('hold');
        holdTimerRef.current = setTimeout(() => {
            setPhase('reveal');
        }, 550); // Pause for 550ms so user can enjoy the slide identity title clearly
    }, [onCovered, targetIndex]);

    const handleRevealComplete = useCallback(() => {
        onComplete(curtain.id);
    }, [curtain.id, onComplete]);

    useEffect(() => {
        return () => {
            if (holdTimerRef.current) clearTimeout(holdTimerRef.current);
        };
    }, []);

    const identity = (
        <CurtainIdentity
            brandName={brandName}
            title={title}
            logoUrl={logoUrl}
            phase={phase}
            index={index}
            total={total}
        />
    );

    return (
        <div className="viara-curtain-layer viara-curtain-layer--wipe" aria-hidden="true">
            <motion.div
                className="viara-curtain-panel"
                data-direction={curtainDirection > 0 ? 'forward' : 'backward'}
                data-phase={phase}
                initial={{ x: startSide }}
                animate={{
                    x: isCovering || isHolding ? '0%' : endSide,
                }}
                transition={{
                    duration: isCovering ? 1.15 : 1.25, // Silky slow transition
                    ease: CURTAIN_EASE,
                }}
                onAnimationComplete={() => {
                    if (isCovering) {
                        handleCoverComplete();
                    } else if (isRevealing) {
                        handleRevealComplete();
                    }
                }}
            >
                <span className="viara-curtain-panel__grid" aria-hidden="true" />
                <span className="viara-curtain-panel__glow-orb" aria-hidden="true" />
                {identity}
            </motion.div>
        </div>
    );
}

export default function Landing() {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const preferences = useSelector(selectPreferences);
    const { t, i18n } = useTranslation(['landing', 'common', 'auth']);
    const prefersReducedMotion = useReducedMotion();

    const isRtl = (typeof i18n.dir === 'function' ? i18n.dir() === 'rtl' : i18n.language === 'ar')
        || preferences.language === 'ar';
    const dark = preferences.theme === 'dark';
    const brandName = VIARA_BRAND.name || 'VIARA';
    const { data: landingData } = useGetPublicLandingOverviewQuery(undefined, {
        pollingInterval: 30000,
        refetchOnFocus: false,
    });

    // Main Slide States
    const [activeSceneIndex, setActiveSceneIndex] = useState(0);
    const [isAutoPlaying, setIsAutoPlaying] = useState(true);
    const [progressPercent, setProgressPercent] = useState(0);
    const [direction, setDirection] = useState(1);
    const [curtainTransition, setCurtainTransition] = useState(null);

    const progressTimerRef = useRef(null);
    const progressStartTimeRef = useRef(Date.now());
    const curtainSequenceRef = useRef(0);

    // Helper to sanitize workflow times
    const sanitizeMinutes = (val, fallback) => {
        const num = Number(val);
        if (!num || isNaN(num) || num > 60) return fallback;
        return Math.round(num);
    };

    // Live Metrics directly connected to backend overview API with clean fallbacks
    const liveMetrics = useMemo(() => {
        const baseStudies = Number(landingData?.metrics?.studiesToday) || 148;
        const basePending = Number(landingData?.metrics?.pendingReports) || 27;
        const baseModalities = Number(landingData?.metrics?.activeModalities) || 8;
        const baseCompletion = Number(landingData?.metrics?.completionRate) || 96;

        const waitingCount = landingData?.pipeline?.find((p) => p.code === 'waiting')?.count ?? 5;
        const imagingCount = landingData?.pipeline?.find((p) => p.code === 'imaging')?.count ?? 12;
        const reportingCount = landingData?.pipeline?.find((p) => p.code === 'reporting')?.count ?? 27;
        const deliveredCount = landingData?.pipeline?.find((p) => p.code === 'delivered')?.count ?? baseStudies;

        return {
            studiesToday: Math.max(1, Math.round(baseStudies)),
            pendingReports: Math.max(2, Math.round(basePending)),
            activeModalities: baseModalities,
            completionRate: baseCompletion,
            pressureScore: landingData?.workload?.pressureScore ?? 34,
            studiesThisWeek: Math.round(landingData?.services?.studiesThisWeek ?? 421),
            pipeline: {
                waiting: Math.round(waitingCount),
                imaging: Math.round(imagingCount),
                reporting: Math.round(reportingCount),
                delivered: Math.round(deliveredCount),
            },
            workflow: {
                registration: sanitizeMinutes(landingData?.workflow?.registrationMinutes, 2),
                imaging: sanitizeMinutes(landingData?.workflow?.imagingMinutes, 12),
                reporting: sanitizeMinutes(landingData?.workflow?.reportingMinutes, 5),
                delivery: sanitizeMinutes(landingData?.workflow?.deliveryMinutes, 1),
            },
        };
    }, [landingData]);

    const scenes = useMemo(() => [
        {
            id: 'center',
            badge: isRtl ? 'المركز التشغيلي الموحد' : 'Unified Clinical Operations',
            navLabel: isRtl ? 'المركز التشغيلي' : 'Operations',
            shortKey: '1',
            titleLead: isRtl ? 'شغّل مركز الأشعة بالكامل' : 'Run Every Radiology Workflow',
            titleAccent: isRtl ? 'من مساحة واحدة أكثر ذكاءً.' : 'From One Connected Workspace.',
            kicker: isRtl ? 'نظام تشغيل موحّد لمراكز الأشعة' : 'UNIFIED RADIOLOGY OPERATING SYSTEM',
            description: isRtl
                ? 'وحّد الاستقبال والتصوير وPACS والتقارير والفوترة في تدفق تشغيلي واحد؛ واضح للفريق ومتصل لحظة بلحظة.'
                : 'Unify intake, imaging, PACS, reporting, and billing in one live workflow that keeps every team aligned.',
            icon: Layers,
            highlightPills: [
                { icon: Users, label: isRtl ? 'استقبال ذكي واستيعاب فوري' : 'Automated Intake' },
                { icon: Radio, label: isRtl ? 'تنسيق أجهزة الفحص المتزامنة' : 'Multi-Modality Orchestration' },
                { icon: Database, label: isRtl ? 'مزامنة سحابية مع PACS' : 'Real-time PACS Bridge' },
            ],
            type: 'operations',
            artwork: SLIDE_ARTWORK.operations,
            artworkWidth: 1536,
            artworkHeight: 1024,
            artworkAlt: isRtl
                ? 'فريق سريري يتعاون داخل مساحة عمليات VIARA الموحّدة'
                : 'Clinical team collaborating in the unified VIARA operations studio',
            artworkCaption: isRtl ? 'مركز العمليات السريرية الموحّد' : 'Unified Clinical Operations Studio',
        },
        {
            id: 'intelligence',
            badge: isRtl ? 'المساعد التشخيصي الذكي' : 'Radiology AI Diagnostic Copilot',
            navLabel: isRtl ? 'المساعد الذكي' : 'AI Copilot',
            shortKey: '2',
            titleLead: isRtl ? 'حوّل صور الأشعة والبيانات' : 'Turn Imaging and Data',
            titleAccent: isRtl ? 'إلى قرار سريري أسرع.' : 'Into Faster Clinical Decisions.',
            kicker: isRtl ? 'مساعد تشخيصي وفرز ذكي' : 'AI DIAGNOSTIC COPILOT & TRIAGE',
            description: isRtl
                ? 'رتّب الحالات الحرجة، وتوقّع ضغط العمل، وساعد طبيب الأشعة في القياسات ومسودة التقرير دون تعطيل أسلوبه السريري.'
                : 'Prioritize urgent cases, forecast workload, and assist radiologists with measurements and report drafts without disrupting clinical judgment.',
            icon: BarChart3,
            highlightPills: [
                { icon: Activity, label: isRtl ? 'تنبؤ ذكي بمعدل التدفق' : 'Throughput Forecasting' },
                { icon: Clock3, label: isRtl ? 'تقليل زمن التقرير 45%' : '45% Faster Turnaround' },
                { icon: Sparkles, label: isRtl ? 'مسودات تقارير بالذكاء الاصطناعي' : 'AI-Assisted Drafts' },
            ],
            type: 'intelligence',
            artwork: SLIDE_ARTWORK.intelligence,
            artworkWidth: 1448,
            artworkHeight: 1086,
            artworkAlt: isRtl
                ? 'طبيبة أشعة ومختص بيانات يراجعان مؤشرات VIARA الذكية'
                : 'Radiologist and data specialist reviewing VIARA intelligence',
            artworkCaption: isRtl ? 'مختبر الذكاء الاصطناعي والتشخيص' : 'Radiology AI Diagnostic Studio',
        },
        {
            id: 'workflow',
            badge: isRtl ? 'المسار السريري الشامل' : 'Connected Clinical Workflow',
            navLabel: isRtl ? 'مسار الفحوصات' : 'Clinical Flow',
            shortKey: '3',
            titleLead: isRtl ? 'اربط رحلة كل فحص' : 'Connect Every Patient Journey',
            titleAccent: isRtl ? 'من الإحالة حتى النتيجة.' : 'From Referral to Result.',
            kicker: isRtl ? 'مسار سريري متصل من البداية للنهاية' : 'CONNECTED END-TO-END CLINICAL FLOW',
            description: isRtl
                ? 'حافظ على سياق المريض بين التسجيل والتصوير والمراجعة والتسليم، مع وصول آمن وتنبيهات فورية في كل محطة.'
                : 'Keep patient context moving across registration, imaging, review, and delivery with secure access and timely notifications.',
            icon: Workflow,
            highlightPills: [
                { icon: Stethoscope, label: isRtl ? 'بوابة الأطباء المحيلين' : 'Referring Doctor Portal' },
                { icon: HeartPulse, label: isRtl ? 'بوابة المرضى المباشرة' : 'Secure Patient Portal' },
                { icon: ShieldCheck, label: isRtl ? 'تشفير وحماية فائقة' : 'Zero-Trust RBAC' },
            ],
            type: 'workflow',
            artwork: SLIDE_ARTWORK.workflow,
            artworkWidth: 1672,
            artworkHeight: 941,
            artworkAlt: isRtl
                ? 'رحلة المريض المتصلة من الاستقبال إلى التصوير والتقرير عبر VIARA'
                : 'Connected VIARA patient journey from intake to imaging and reporting',
            artworkCaption: isRtl ? 'المسار السريري الشامل للمريض' : 'Connected Patient Journey',
        },
        {
            id: 'gateway',
            badge: isRtl ? 'بوابة الكوادر السريرية' : 'Staff Command Gateway',
            navLabel: isRtl ? 'دخول الكوادر' : 'Staff Gateway',
            shortKey: '4',
            titleLead: isRtl ? 'امنح كل موظف مساحته' : 'Give Every Staff Member',
            titleAccent: isRtl ? 'بأمان وسرعة.' : 'The Right Secure Workspace.',
            kicker: isRtl ? 'وصول آمن يتكيّف مع الدور الوظيفي' : 'ROLE-AWARE SECURE ACCESS',
            description: isRtl
                ? 'وجّه الأطباء والفنيين والاستقبال والإدارة مباشرة إلى أدواتهم، مع تسجيل سريع ومفاتيح مرور بيومترية.'
                : 'Route radiologists, technologists, receptionists, and administrators directly to their tools with fast, biometric-ready sign-in.',
            icon: KeyRound,
            highlightPills: [
                { icon: Shield, label: isRtl ? 'معايير HIPAA & DICOM 3.0' : 'HIPAA & DICOM 3.0 Ready' },
                { icon: Zap, label: isRtl ? 'تسجيل سريع بنقرة واحدة' : '1-Click Role Presets' },
                { icon: UserCheck, label: isRtl ? 'لوحة تحكم فورية' : 'Live Operations Hub' },
            ],
            type: 'gateway',
            artwork: SLIDE_ARTWORK.gateway,
            artworkWidth: 1448,
            artworkHeight: 1086,
            artworkAlt: isRtl
                ? 'موظفة سريرية تستخدم بوابة VIARA الآمنة حسب الدور'
                : 'Clinical professional using the secure role-aware VIARA gateway',
            artworkCaption: isRtl ? 'بوابة التحكم والوصول السريري' : 'Clinical Staff Command Gateway',
        },
    ], [isRtl]);

    const currentScene = scenes[activeSceneIndex] || scenes[0];
    const SceneIcon = currentScene.icon;
    const transitionDirection = direction * (isRtl ? -1 : 1);

    useEffect(() => {
        scenes.forEach(({ artwork }) => {
            const preload = new Image();
            preload.src = artwork;
        });
    }, [scenes]);

    const [targetNavIndex, setTargetNavIndex] = useState(0);

    const handleCurtainCovered = useCallback((newIndex) => {
        setActiveSceneIndex(newIndex);
    }, []);

    const changeSlide = useCallback((newIndex, newDirection = 1) => {
        const normalizedIndex = ((newIndex % scenes.length) + scenes.length) % scenes.length;
        if (normalizedIndex === activeSceneIndex && !curtainTransition) return;

        setDirection(newDirection);
        setTargetNavIndex(normalizedIndex);
        setProgressPercent(0);
        progressStartTimeRef.current = Date.now();

        if (prefersReducedMotion) {
            setActiveSceneIndex(normalizedIndex);
        } else {
            curtainSequenceRef.current += 1;
            setCurtainTransition({
                id: curtainSequenceRef.current,
                direction: newDirection * (isRtl ? -1 : 1),
                title: scenes[normalizedIndex].navLabel,
                index: normalizedIndex,
                targetIndex: normalizedIndex,
                total: scenes.length,
            });
        }
    }, [activeSceneIndex, curtainTransition, isRtl, prefersReducedMotion, scenes]);

    const handleCurtainComplete = useCallback((transitionId) => {
        setCurtainTransition((current) => (current?.id === transitionId ? null : current));
    }, []);

    const nextSlide = useCallback(() => {
        const nextIdx = (activeSceneIndex + 1) % scenes.length;
        changeSlide(nextIdx, 1);
    }, [activeSceneIndex, scenes.length, changeSlide]);

    const prevSlide = useCallback(() => {
        const prevIdx = (activeSceneIndex - 1 + scenes.length) % scenes.length;
        changeSlide(prevIdx, -1);
    }, [activeSceneIndex, scenes.length, changeSlide]);

    // Slide autoplay ticker
    useEffect(() => {
        if (!isAutoPlaying || prefersReducedMotion) return undefined;

        const interval = 50;
        progressStartTimeRef.current = Date.now();

        progressTimerRef.current = setInterval(() => {
            const elapsed = Date.now() - progressStartTimeRef.current;
            const pct = Math.min(100, (elapsed / SLIDE_DURATION_MS) * 100);
            setProgressPercent(pct);

            if (elapsed >= SLIDE_DURATION_MS) {
                nextSlide();
            }
        }, interval);

        return () => {
            if (progressTimerRef.current) clearInterval(progressTimerRef.current);
        };
    }, [isAutoPlaying, activeSceneIndex, prefersReducedMotion, nextSlide]);

    // Keyboard navigation for the slide deck
    useEffect(() => {
        const handleKeyDown = (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            if (e.key === 'ArrowRight') {
                if (isRtl) prevSlide();
                else nextSlide();
            } else if (e.key === 'ArrowLeft') {
                if (isRtl) nextSlide();
                else prevSlide();
            } else if ((e.key === ' ' || e.code === 'Space') && !['BUTTON', 'A', 'SELECT', 'TEXTAREA', 'INPUT'].includes(e.target.tagName) && !e.target.isContentEditable) {
                // Never preventDefault while an interactive element has focus:
                // Space must keep activating focused buttons/links for keyboard users.
                e.preventDefault();
                setIsAutoPlaying((prev) => !prev);
            } else if (e.key >= '1' && e.key <= '4') {
                const idx = parseInt(e.key, 10) - 1;
                if (idx >= 0 && idx < scenes.length) {
                    changeSlide(idx, idx > activeSceneIndex ? 1 : -1);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isRtl, nextSlide, prevSlide, changeSlide, scenes.length, activeSceneIndex]);

    const toggleTheme = () => {
        dispatch(setTheme(dark ? 'light' : 'dark'));
    };

    const toggleLanguage = async () => {
        const next = isRtl ? 'en' : 'ar';
        try {
            await i18n.changeLanguage(next);
        } catch {
            return;
        }
        dispatch(setLanguage(next));
        try {
            localStorage.setItem('VIARA_lang', next);
        } catch {
            // Optional
        }
    };

    const currentDisplayNavIndex = curtainTransition ? targetNavIndex : activeSceneIndex;

    return (
        <main
            className={`viara-landing-slide-os ${dark ? 'is-dark' : 'is-light'}`}
            dir={isRtl ? 'rtl' : 'ltr'}
            lang={isRtl ? 'ar' : 'en'}
        >
            {curtainTransition && (
                <SlideCurtain
                    key={curtainTransition.id}
                    curtain={curtainTransition}
                    brandName={brandName}
                    logoUrl={VIARA_BRAND.iconUrl || '/logo.png'}
                    onCovered={handleCurtainCovered}
                    onComplete={handleCurtainComplete}
                />
            )}
            <div className="viara-slide-master-frame">
                {/* MINIMAL COMPACT MOTION-DRIVEN HEADER */}
                <motion.header
                    className="viara-editorial-navbar"
                    role="banner"
                    initial={prefersReducedMotion ? false : { opacity: 0, y: -16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.58, ease: SLIDE_EASE }}
                >
                    {/* Brand Logo Lockup with Framer Motion hover */}
                    <Link to="/" className="viara-editorial-logo-link" aria-label="VIARA Home">
                        <motion.div
                            className="viara-header-logo-shell"
                            whileHover={{ scale: 1.05, rotate: 2 }}
                            whileTap={{ scale: 0.95 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 25 }}
                        >
                            <img
                                src={VIARA_BRAND.iconUrl || '/logo.png'}
                                alt={brandName}
                                className="viara-header-logo-img"
                                onError={(e) => { e.currentTarget.src = '/logo.png'; }}
                            />
                        </motion.div>
                        <div className="viara-logo-text-wrap">
                            <span className="viara-logo-name">{brandName}</span>
                            <span className="viara-logo-tagline">{VIARA_BRAND.tagline || (isRtl ? 'نظام الأشعة السحابي الموحد' : 'Unified Clinical OS')}</span>
                        </div>
                    </Link>

                    {/* Minimal Compact Floating Scene Navigation Island (Center) */}
                    <motion.nav
                        className="viara-editorial-nav-island"
                        aria-label={isRtl ? 'مشاهد مركز القيادة' : 'Command center scenes'}
                        initial={prefersReducedMotion ? false : { opacity: 0, y: -8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.5, delay: 0.08, ease: SLIDE_EASE }}
                    >
                        {scenes.map((scene, index) => {
                            const NavIcon = scene.icon;
                            const isActive = currentDisplayNavIndex === index;
                            return (
                                <motion.button
                                    key={scene.id}
                                    type="button"
                                    className={`viara-editorial-nav-item ${isActive ? 'is-active' : ''}`}
                                    aria-label={scene.navLabel}
                                    aria-current={isActive ? 'true' : undefined}
                                    onClick={() => changeSlide(index, index >= activeSceneIndex ? 1 : -1)}
                                    whileHover={prefersReducedMotion ? undefined : { y: -1 }}
                                    whileTap={prefersReducedMotion ? undefined : { scale: 0.97 }}
                                    transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                                >
                                    <motion.span
                                        className="viara-nav-item-icon"
                                        animate={isActive ? { scale: [1, 1.15, 1] } : { scale: 1 }}
                                        transition={{ duration: 0.3 }}
                                    >
                                        <NavIcon size={12.5} strokeWidth={2.4} />
                                    </motion.span>
                                    <span className="viara-nav-item-label">{scene.navLabel}</span>
                                    {isActive && (
                                        <motion.span
                                            layoutId="minimalNavPill"
                                            className="viara-nav-active-glow"
                                            transition={{ type: 'spring', stiffness: 500, damping: 36 }}
                                        />
                                    )}
                                </motion.button>
                            );
                        })}
                    </motion.nav>

                    {/* Compact Right Action Hub */}
                    <motion.div
                        className="viara-editorial-nav-actions"
                        initial={prefersReducedMotion ? false : { opacity: 0, x: isRtl ? -10 : 10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.5, delay: 0.14, ease: SLIDE_EASE }}
                    >
                        {/* Language Switch Pill with micro motion */}
                        <motion.button
                            type="button"
                            className="viara-util-circle-btn"
                            onClick={toggleLanguage}
                            aria-label={isRtl ? 'Switch to English' : 'Switch to Arabic'}
                            title={isRtl ? 'Switch to English' : 'التبديل إلى العربية'}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.92 }}
                        >
                            <Languages size={13} />
                            <span className="viara-util-btn-lang-code" dir="ltr">{isRtl ? 'EN' : 'عربي'}</span>
                        </motion.button>

                        {/* Theme Switch Circle with rotate motion */}
                        <motion.button
                            type="button"
                            className="viara-util-circle-btn"
                            onClick={toggleTheme}
                            aria-label={dark ? 'Light mode' : 'Dark mode'}
                            title={dark ? (isRtl ? 'الوضع الفاتح' : 'Light mode') : (isRtl ? 'الوضع الداكن' : 'Dark mode')}
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.92, rotate: 180 }}
                        >
                            <motion.span
                                key={dark ? 'dark' : 'light'}
                                initial={{ rotate: -90, opacity: 0 }}
                                animate={{ rotate: 0, opacity: 1 }}
                                transition={{ duration: 0.25 }}
                            >
                                {dark ? <Sun size={13} /> : <Moon size={13} />}
                            </motion.span>
                        </motion.button>

                        {/* Direct Staff Sign In CTA Pill */}
                        <motion.div
                            whileHover={{ scale: 1.03 }}
                            whileTap={{ scale: 0.96 }}
                            transition={{ type: 'spring', stiffness: 450, damping: 28 }}
                        >
                            <Link to="/login" className="viara-pill-signin-btn">
                                <User size={13} />
                                <span>{t('actions.signIn', { ns: 'common', defaultValue: isRtl ? 'دخول الكوادر' : 'Sign In' })}</span>
                            </Link>
                        </motion.div>
                    </motion.div>
                </motion.header>

                {/*SPLIT HERO WORKSPACE */}
                <div className="viara-split-hero-container">
                    {/* ─── Column 1: Left Narrative Content + Interactive Clinical HUD ─── */}
                    <section className="viara-split-left-pane" aria-label="Clinical Overview Narrative">
                        <AnimatePresence mode="popLayout" initial={false} custom={transitionDirection}>
                            <motion.div
                                key={currentScene.id}
                                className="viara-slide-narrative"
                                custom={transitionDirection}
                                variants={narrativeVariants}
                                initial={prefersReducedMotion ? false : 'enter'}
                                animate="center"
                                exit={prefersReducedMotion ? undefined : 'exit'}
                            >
                                {/* Eyebrow Pill Badge + Live Status + Scene Mini Switcher */}
                                <motion.div className="viara-eyebrow-container" custom={transitionDirection} variants={narrativeItemVariants}>
                                    <div className="viara-eyebrow-left-group">
                                        <span className="viara-pill-badge">
                                            <SceneIcon size={13} strokeWidth={2.2} />
                                            <span>{currentScene.badge}</span>
                                        </span>
                                        <span className="viara-live-pulse-badge">
                                            <span className="viara-pulse-dot" aria-hidden="true" />
                                            <span className="viara-pulse-label">{isRtl ? 'نظام حي' : 'Live System'}</span>
                                        </span>
                                    </div>

                                    {/* Mini Interactive Controls */}
                                    <div className="viara-scene-quick-ctrls">
                                        <button
                                            type="button"
                                            className="viara-autoplay-toggle-btn"
                                            onClick={() => setIsAutoPlaying((prev) => !prev)}
                                            title={isAutoPlaying ? (isRtl ? 'إيقاف مؤقت' : 'Pause Autoplay') : (isRtl ? 'تشغيل تلقائي' : 'Start Autoplay')}
                                            aria-label={isAutoPlaying ? 'Pause slide autoplay' : 'Start slide autoplay'}
                                        >
                                            {isAutoPlaying ? <Pause size={11} /> : <Play size={11} />}
                                        </button>
                                        <div className="viara-scene-mini-dots" role="tablist" aria-label="Slide Dots">
                                            {scenes.map((s, idx) => (
                                                <button
                                                    key={s.id}
                                                    type="button"
                                                    role="tab"
                                                    aria-selected={activeSceneIndex === idx}
                                                    aria-label={s.navLabel}
                                                    className={`viara-mini-dot ${activeSceneIndex === idx ? 'is-active' : ''}`}
                                                    onClick={() => changeSlide(idx, idx >= activeSceneIndex ? 1 : -1)}
                                                />
                                            ))}
                                        </div>
                                        <span className="viara-slide-counter-badge" dir="ltr">
                                            0{activeSceneIndex + 1} / 0{scenes.length}
                                        </span>
                                    </div>
                                </motion.div>

                                {/* Main Display Title */}
                                <motion.h1
                                    className="viara-editorial-hero-title"
                                    aria-label={`${currentScene.titleLead} ${currentScene.titleAccent}`}
                                    custom={transitionDirection}
                                    variants={narrativeItemVariants}
                                >
                                    <span>{currentScene.titleLead} </span>
                                    <span className="viara-editorial-hero-title-accent">{currentScene.titleAccent}</span>
                                </motion.h1>

                                {/* Tracked Uppercase Kicker */}
                                <motion.div className="viara-tracked-kicker" custom={transitionDirection} variants={narrativeItemVariants}>
                                    <span className="viara-kicker-bar" aria-hidden="true" />
                                    <span>{currentScene.kicker}</span>
                                </motion.div>

                                {/* Editorial Description */}
                                <motion.p className="viara-editorial-hero-desc" custom={transitionDirection} variants={narrativeItemVariants}>
                                    {currentScene.description}
                                </motion.p>

                                {/* Feature Highlight Pills Cluster */}
                                <motion.div className="viara-feature-pills-cluster" custom={transitionDirection} variants={narrativeItemVariants}>
                                    {currentScene.highlightPills?.map((pill, pIdx) => {
                                        const PillIcon = pill.icon;
                                        return (
                                            <div key={pIdx} className="viara-feature-pill-chip">
                                                <span className="viara-feature-pill-icon">
                                                    <PillIcon size={13} strokeWidth={2.4} />
                                                </span>
                                                <span className="viara-feature-pill-label">{pill.label}</span>
                                            </div>
                                        );
                                    })}
                                </motion.div>

                                {/* Dual Pill Action Cluster */}
                                <motion.div className="viara-pill-cta-cluster" custom={transitionDirection} variants={narrativeItemVariants}>
                                    <Link to="/login" className="viara-cta-pill-primary">
                                        <ShieldCheck size={16} />
                                        <span>{isRtl ? 'فتح مساحة عمل الكوادر' : 'Launch Staff Console'}</span>
                                        <ArrowRight size={15} className={isRtl ? 'rotate-180' : ''} />
                                    </Link>

                                    <button
                                        type="button"
                                        className="viara-cta-pill-outline"
                                        onClick={nextSlide}
                                    >
                                        <span>{isRtl ? 'استعراض المسارات السريرية' : 'Explore Workflows'}</span>
                                        <ArrowRight size={14} className={isRtl ? 'rotate-180' : ''} />
                                    </button>
                                </motion.div>

                                {/* Enhanced Live Clinical Telemetry HUD Strip */}
                                <motion.div
                                    className="viara-number-counter-strip"
                                    variants={hudVariants}
                                    style={{ '--scene-progress': `${progressPercent}%` }}
                                >
                                    <div className="viara-counter-progress-rail" aria-hidden="true">
                                        <div className="viara-counter-progress-fill" style={{ width: `${progressPercent}%` }} />
                                    </div>
                                    <div className="viara-number-counter-items">
                                        <motion.div className="viara-number-counter" variants={hudPartVariants}>
                                            <dt>
                                                <span className="viara-dt-dot is-emerald" />
                                                {isRtl ? 'فحوص اليوم' : 'Studies today'}
                                            </dt>
                                            <dd>{liveMetrics.studiesToday}</dd>
                                        </motion.div>
                                        <motion.div className="viara-number-counter" variants={hudPartVariants}>
                                            <dt>
                                                <span className="viara-dt-dot is-amber" />
                                                {isRtl ? 'قيد المراجعة' : 'Pending'}
                                            </dt>
                                            <dd className="is-terracotta">{liveMetrics.pendingReports}</dd>
                                        </motion.div>
                                        <motion.div className="viara-number-counter" variants={hudPartVariants}>
                                            <dt>
                                                <span className="viara-dt-dot is-mint" />
                                                {isRtl ? 'أجهزة نشطة' : 'Modalities'}
                                            </dt>
                                            <dd className="is-mint">{liveMetrics.activeModalities}</dd>
                                        </motion.div>
                                        <motion.div className="viara-number-counter viara-number-counter--rate" variants={hudPartVariants}>
                                            <dt>
                                                <span className="viara-dt-dot is-cyan" />
                                                {isRtl ? 'نسبة الإنجاز' : 'Completion'}
                                            </dt>
                                            <dd className="is-cyan">{liveMetrics.completionRate}%</dd>
                                        </motion.div>
                                    </div>
                                </motion.div>
                            </motion.div>
                        </AnimatePresence>
                    </section>

                    {/* ─── Column 2: Brand illustration studio ─── */}
                    <section
                        className="viara-split-right-pane"
                        aria-label={isRtl ? 'رسومات توضيحية لمنصة VIARA' : 'VIARA platform illustrations'}
                    >
                        <div className="viara-workstation-scene-stage">
                            <AnimatePresence mode="popLayout" initial={false} custom={transitionDirection}>
                                <motion.figure
                                    key={currentScene.id}
                                    className="viara-slide-illustration"
                                    data-scene={currentScene.type}
                                    custom={transitionDirection}
                                    variants={artworkVariants}
                                    initial={prefersReducedMotion ? false : 'enter'}
                                    animate="center"
                                    exit={prefersReducedMotion ? undefined : 'exit'}
                                >
                                    <div className="viara-slide-illustration__canvas">
                                        <span className="viara-slide-illustration__wash" aria-hidden="true" />
                                        <span className="viara-slide-illustration__orbit" aria-hidden="true" />
                                        <img
                                            className="viara-slide-illustration__image"
                                            src={currentScene.artwork}
                                            alt={currentScene.artworkAlt}
                                            width={currentScene.artworkWidth}
                                            height={currentScene.artworkHeight}
                                            loading={activeSceneIndex === 0 ? 'eager' : 'lazy'}
                                            decoding="async"
                                        />
                                    </div>
                                    {/* <figcaption className="viara-slide-illustration__caption">
                                        <span className="viara-slide-illustration__brand">
                                            <span className="viara-slide-illustration__logo-shell">
                                                <img src={VIARA_BRAND.iconUrl || '/logo.png'} alt="" aria-hidden="true" />
                                            </span>
                                            <span>
                                                <small>{brandName}</small>
                                                <strong>{currentScene.artworkCaption}</strong>
                                            </span>
                                        </span>
                                        <span className="viara-slide-illustration__counter" dir="ltr" aria-hidden="true">
                                            {String(activeSceneIndex + 1).padStart(2, '0')}
                                            <i />
                                            {String(scenes.length).padStart(2, '0')}
                                        </span>
                                    </figcaption> */}
                                </motion.figure>
                            </AnimatePresence>
                        </div>
                    </section>
                </div>

                {/* SEAMLESS INTEGRATED FOOTER DOCK */}
                <motion.footer
                    className="viara-editorial-bottom-dock"
                    role="contentinfo"
                    initial={prefersReducedMotion ? false : { opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.58, delay: 0.16, ease: SLIDE_EASE }}
                >
                    <div className="viara-dock-left-group">
                        <div className="viara-dock-brand-pill">
                            <span className="viara-dock-copyright-note" dir="ltr">
                                © {new Date().getFullYear()} {brandName}
                            </span>
                            <span className="viara-dock-sep" aria-hidden="true">•</span>
                            <span className="viara-dock-edition-badge">{isRtl ? 'نظام الأشعة السحابي' : 'Cloud Radiology OS'}</span>
                        </div>
                    </div>

                    {/* Center Integrated Scene Breadcrumb & Progress */}
                    <div className="viara-dock-center-scene-pill">
                        <span className="viara-dock-scene-counter" dir="ltr">0{activeSceneIndex + 1} / 0{scenes.length}</span>
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.span
                                key={currentScene.id}
                                className="viara-dock-scene-name"
                                initial={prefersReducedMotion ? false : { opacity: 0, y: 5 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={prefersReducedMotion ? undefined : { opacity: 0, y: -4 }}
                                transition={{ duration: 0.24, ease: SLIDE_EASE }}
                            >
                                {currentScene.badge}
                            </motion.span>
                        </AnimatePresence>
                        <div className="viara-dock-progress-track" aria-hidden="true">
                            <motion.div
                                className="viara-dock-progress-bar"
                                animate={{ width: `${progressPercent}%` }}
                                transition={{ duration: 0.12, ease: 'linear' }}
                            />
                        </div>
                    </div>

                    <div className="viara-dock-right-group">
                        <div className="viara-dock-status-pill" role="status">
                            <motion.span
                                className="viara-dock-pulse-dot"
                                aria-hidden="true"
                                animate={prefersReducedMotion ? undefined : { opacity: [0.72, 1, 0.72], scale: [0.9, 1.08, 0.9] }}
                                transition={{ duration: 2.4, repeat: Infinity, ease: 'easeInOut' }}
                            />
                            <span className="viara-dock-status-text">{isRtl ? 'جميع الأنظمة تعمل' : 'All systems operational'}</span>
                        </div>
                    </div>
                </motion.footer>
            </div>
        </main>
    );
}
