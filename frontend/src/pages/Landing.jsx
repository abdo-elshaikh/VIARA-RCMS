import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import {
    Activity,
    ArrowLeft,
    ArrowRight,
    CalendarCheck,
    CalendarDays,
    Check,
    ChevronDown,
    FileText,
    Info,
    Globe,
    LayoutDashboard,
    Link2,
    Lock,
    MoreHorizontal,
    Moon,
    ScanLine,
    Search,
    Send,
    Settings,
    ShieldCheck,
    Stethoscope,
    Sun,
    UserRound,
    Users,
    Zap,
} from 'lucide-react';
import {
    AnimatePresence,
    animate,
    motion,
    useInView,
    useMotionValue,
    useReducedMotion,
    useScroll,
    useSpring,
    useTransform,
} from 'framer-motion';
import { selectPreferences, setLanguage, setTheme } from '../store/preferencesSlice';
import { VIARA_BRAND } from '../config/brand';
import LandingServiceHealthModal from './LandingServiceHealthModal';
import './LandingIllustrative.css';

const EASE = [0.22, 0.68, 0.2, 1];

/* ─────────────────────────── Content ─────────────────────────── */

const WORKLIST_ROWS = [
    {
        id: 'VR-240421',
        patientAr: 'مريض 001', patientEn: 'Patient 001',
        modalityAr: 'CT\nأشعة مقطعية', modalityEn: 'CT\nComputed Tomography',
        date: '2024/04/21 - 10:30',
        statusAr: 'مكتمل', statusEn: 'Completed', statusType: 'done',
        thumb: '/images/suite-ct.jpg',
    },
    {
        id: 'VR-240422',
        patientAr: 'مريض 002', patientEn: 'Patient 002',
        modalityAr: 'MR\nرنين مغناطيسي', modalityEn: 'MR\nMagnetic Resonance',
        date: '2024/04/21 - 14:15',
        statusAr: 'قيد التنفيذ', statusEn: 'In Progress', statusType: 'progress',
        thumb: '/images/suite-mri.jpg',
    },
    {
        id: 'VR-240423',
        patientAr: 'مريض 003', patientEn: 'Patient 003',
        modalityAr: 'US\nموجات فوق صوتية', modalityEn: 'US\nUltrasound',
        date: '2024/04/22 - 09:00',
        statusAr: 'مجدول', statusEn: 'Scheduled', statusType: 'scheduled',
        thumb: '/images/ultrasound-suite.jpg',
    },
];

const MODALITIES = [
    { code: 'CT', ar: 'أشعة مقطعية', en: 'Computed Tomography', planeAr: 'مقطع محوري', planeEn: 'Axial' },
    { code: 'MR', ar: 'رنين مغناطيسي', en: 'Magnetic Resonance', planeAr: 'مقطع سهمي', planeEn: 'Sagittal' },
    { code: 'US', ar: 'موجات فوق صوتية', en: 'Ultrasound', planeAr: 'بث مباشر', planeEn: 'Live' },
    { code: 'DX', ar: 'أشعة سينية', en: 'Digital X-Ray', planeAr: 'إسقاط أمامي', planeEn: 'AP view' },
    { code: 'MG', ar: 'تصوير الثدي', en: 'Mammography', planeAr: 'إسقاط علوي', planeEn: 'CC view' },
];

const FEATURES = [
    {
        id: 'patient-journey', Icon: Link2, visual: 'journey', tone: 'teal',
        titleAr: 'رحلة مريض مترابطة', titleEn: 'Connected Patient Journey',
        descAr: 'تجربة متكاملة من الحجز والاستقبال إلى التصوير وتسليم التقرير.',
        descEn: 'End-to-end experience from booking and reception to imaging and report delivery.',
    },
    {
        id: 'workspace', Icon: Users, visual: 'roles', tone: 'violet',
        titleAr: 'مساحة عمل لكل تخصص', titleEn: 'Workspace for Every Role',
        descAr: 'أدوات مصممة لاحتياجات أطباء الأشعة والفنيين والإداريين.',
        descEn: 'Purpose-built tools for radiologists, technicians, and administrators.',
    },
    {
        id: 'reporting', Icon: FileText, visual: 'report', tone: 'cyan',
        titleAr: 'متابعة واضحة للتقارير', titleEn: 'Clear Report Tracking',
        descAr: 'من التصوير إلى اعتماد التقرير، بكل شفافية وفي مكان واحد.',
        descEn: 'From imaging to report approval, with full transparency in one place.',
    },
];

const FLOW_STEPS = [
    {
        id: 'booking', Icon: CalendarCheck,
        titleAr: 'الحجز والاستقبال', titleEn: 'Booking & Reception',
        descAr: 'حجز المواعيد وتسجيل بيانات المريض في خطوة واحدة.',
        descEn: 'Schedule appointments and register patients in one step.',
    },
    {
        id: 'imaging', Icon: ScanLine,
        titleAr: 'التصوير', titleEn: 'Imaging',
        descAr: 'استلام صور DICOM من الأجهزة وربطها بطلب الفحص.',
        descEn: 'Receive DICOM images from the modality and tie them to the order.',
    },
    {
        id: 'reporting', Icon: Stethoscope,
        titleAr: 'قراءة وكتابة التقرير', titleEn: 'Reading & Reporting',
        descAr: 'يقرأ الطبيب الصور ويكتب التقرير ويعتمده من الشاشة نفسها.',
        descEn: 'The radiologist reads the study, writes and signs the report in one view.',
    },
    {
        id: 'delivery', Icon: Send,
        titleAr: 'التسليم', titleEn: 'Delivery',
        descAr: 'يصل التقرير والصور إلى المريض والطبيب المُحيل.',
        descEn: 'Reports and images reach the patient and the referring physician.',
    },
];

const METRICS = [
    { Icon: Activity, value: 'RIS + PACS', labelAr: 'مساحة عمل مترابطة', labelEn: 'Connected Workspace', subAr: 'من التسجيل إلى التقارير', subEn: 'From registration to reporting' },
    { Icon: Zap, value: 'DICOM', labelAr: 'تكامل التصوير الطبي', labelEn: 'Imaging Integration', subAr: 'وفق إعدادات المركز والأجهزة', subEn: 'Based on center and modality configuration' },
    { Icon: ShieldCheck, value: 'RBAC', labelAr: 'صلاحيات حسب الدور', labelEn: 'Role-Based Access', subAr: 'إدارة وصول مهيأة للمؤسسة', subEn: 'Access configured for your organization' },
    { Icon: Lock, value: 'Audit Trail', labelAr: 'تتبّع العمليات', labelEn: 'Activity Traceability', subAr: 'سجل للأحداث المهمة في النظام', subEn: 'Key events recorded in the system' }
];

const FAQ_ITEMS = [
    {
        qAr: 'كيف يضمن VIARA عدم تشوه الأسماء العربية على أجهزة الأشعة؟',
        qEn: 'How does VIARA prevent Arabic patient names from corrupting on scanners?',
        aAr: 'يمكن للنظام إنشاء اسم لاتيني للاستخدام مع أجهزة الأشعة التي لا تعرض العربية بصورة سليمة، مع الاحتفاظ بالاسم العربي الأصلي في بيانات المركز. تعتمد النتيجة على إعدادات التكامل وطريقة تعامل الجهاز مع حقول DICOM.',
        aEn: 'VIARA can provide a Latin alias for modalities that do not display Arabic reliably while retaining the original Arabic name in center records. Results depend on the integration configuration and how each modality handles DICOM fields.'
    },
    {
        qAr: 'هل يدعم النظام الربط المباشر مع أجهزة الأشعة عبر قائمة العمل (Modality Worklist)؟',
        qEn: 'Does VIARA support direct integration with scanners via Modality Worklist (MWL)?',
        aAr: 'تتوفر إمكانات لقوائم عمل DICOM بحسب تكامل المركز وإعداد الأجهزة. يلزم التحقق من توافق كل جهاز وإعداد الاتصال قبل الاعتماد على إرسال بيانات المواعيد دون إدخال يدوي.',
        aEn: 'DICOM worklist capabilities are available according to the center integration and modality configuration. Each device and connection should be validated before relying on worklist delivery to avoid manual re-entry.'
    },
    {
        qAr: 'كيف يتم تسليم التقارير والصور إلى المرضى والأطباء المحولين؟',
        qEn: 'How are reports and diagnostic images delivered to patients and referring doctors?',
        aAr: 'تتيح بوابة النتائج متابعة حالة الفحص والتقرير بحسب صلاحيات المستخدم. ويمكن تفعيل قنوات الإشعار وعرض الصور المتاحة وفق إعدادات المركز والتكاملات المنشورة.',
        aEn: 'The results portal provides access to study and report status according to user permissions. Notification channels and image viewing are available based on the center configuration and enabled integrations.'
    },
    {
        qAr: 'ما هي معايير الأمان وحماية البيانات المطبقة في النظام؟',
        qEn: 'What security standards and data protection measures are in place?',
        aAr: 'يوفر النظام أدوات لإدارة الصلاحيات وتسجيل أحداث مهمة وحماية البيانات. أما الامتثال التنظيمي فيعتمد على إعداد النشر والسياسات والإجراءات التشغيلية، ويجب تقييمه لدى الجهة المشغّلة قبل تقديم أي ضمان امتثال.',
        aEn: 'The platform provides access-control and audit capabilities alongside data-protection controls. Regulatory compliance also depends on deployment configuration and operational policies, and must be assessed by the operating organization before making a compliance claim.'
    }
];

/* ─────────────────────────── Motion variants ─────────────────────────── */

const staggerContainer = {
    hidden: {},
    visible: { transition: { staggerChildren: 0.12, delayChildren: 0.1 } },
};

const riseIn = {
    hidden: { opacity: 0, y: 26 },
    visible: (delay = 0) => ({
        opacity: 1, y: 0,
        transition: { duration: 0.7, ease: EASE, delay },
    }),
};

const rowVariant = {
    hidden: { opacity: 0, x: 16 },
    visible: { opacity: 1, x: 0, transition: { duration: 0.42, ease: 'easeOut' } },
};

const featureVariant = {
    hidden: { opacity: 0, y: 34, scale: 0.98 },
    visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.6, ease: EASE } },
};

const stepVariant = {
    hidden: { opacity: 0, y: 24 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.55, ease: EASE } },
};

/* ─────────────────────────── Small reusable pieces ─────────────────────────── */

/* Headline: words rise out of a mask. Word-level (never letter-level) so Arabic joining stays intact. */
function WordLine({ text, delay = 0, gradient = false, reduce }) {
    const words = text.split(' ');
    return (
        <span className="vlp__line" aria-hidden="true">
            {words.map((word, i) => (
                <span className="vlp__word" key={`${word}-${i}`}>
                    <motion.span
                        className={`vlp__word-in${gradient ? ' vlp__word-in--grad' : ''}`}
                        initial={reduce ? false : { y: '118%', opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                        transition={{ duration: 0.85, ease: EASE, delay: delay + i * 0.1 }}
                    >
                        {word}
                    </motion.span>
                </span>
            ))}
        </span>
    );
}

/* Section headings: words rise out of a mask on scroll (word-level keeps Arabic joining intact) */
function WordReveal({ text, className, delay = 0 }) {
    const reduce = useReducedMotion();
    const ref = useRef(null);
    const inView = useInView(ref, { once: true, margin: '0px 0px -12% 0px' });
    return (
        <h2 ref={ref} className={className} aria-label={text}>
            {text.split(' ').map((word, i) => (
                <React.Fragment key={`${word}-${i}`}>
                    <span className="vlp__word" aria-hidden="true">
                        <motion.span
                            className="vlp__word-in"
                            initial={reduce ? false : { y: '110%', opacity: 0 }}
                            animate={inView || reduce ? { y: 0, opacity: 1 } : undefined}
                            transition={{ duration: 0.7, ease: EASE, delay: delay + i * 0.06 }}
                        >
                            {word}
                        </motion.span>
                    </span>{' '}
                </React.Fragment>
            ))}
        </h2>
    );
}

/* Blur-in on scroll — used for section headings and short copy */
function Reveal({ children, className, delay = 0, as = 'div' }) {
    const reduce = useReducedMotion();
    const ref = useRef(null);
    const inView = useInView(ref, { once: true, margin: '0px 0px -12% 0px' });
    const Tag = motion[as] || motion.div;
    return (
        <Tag
            ref={ref}
            className={className}
            initial={reduce ? false : { opacity: 0, y: 26, filter: 'blur(8px)' }}
            animate={inView || reduce ? { opacity: 1, y: 0, filter: 'blur(0px)' } : undefined}
            transition={{ duration: 0.75, ease: EASE, delay }}
        >
            {children}
        </Tag>
    );
}

/* ─────────────────────────── Hero visual ─────────────────────────── */

function ScanHud({ t, reduce }) {
    const [index, setIndex] = useState(0);
    const slice = useMotionValue(1);
    const sliceText = useTransform(slice, (v) => String(Math.round(v)).padStart(3, '0'));

    useEffect(() => {
        if (reduce) return undefined;
        const id = setInterval(() => setIndex((v) => (v + 1) % MODALITIES.length), 3800);
        return () => clearInterval(id);
    }, [reduce]);

    useEffect(() => {
        if (reduce) return undefined;
        const controls = animate(slice, 320, { duration: 20, ease: 'linear', repeat: Infinity, repeatType: 'loop' });
        return () => controls.stop();
    }, [reduce, slice]);

    const m = MODALITIES[index];

    return (
        <>
            <div className="vlp__hud vlp__hud--modality">
                <span className="vlp__hud-live" aria-hidden="true" />
                <AnimatePresence mode="wait" initial={false}>
                    <motion.span
                        key={m.code}
                        className="vlp__hud-text"
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -8 }}
                        transition={{ duration: 0.28 }}
                    >
                        <b dir="ltr">{m.code}</b>
                        <span>{t(m.ar, m.en)}</span>
                        <em>{t(m.planeAr, m.planeEn)}</em>
                    </motion.span>
                </AnimatePresence>
            </div>

            <div className="vlp__hud vlp__hud--slice" dir="ltr" aria-hidden="true">
                <span>Slice</span>
                <motion.b>{sliceText}</motion.b>
                <span>/ 320</span>
            </div>
        </>
    );
}

function WorklistCard({ isRtl, t }) {
    const railIcons = [LayoutDashboard, Users, CalendarDays, FileText, Settings];
    return (
        <motion.div
            className="vlp__worklist-card"
            initial={{ opacity: 0, y: 40, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ duration: 0.9, ease: EASE, delay: 0.75 }}
        >
            <div className="vlp__wl-rail" aria-hidden="true">
                <b>V</b>
                {railIcons.map((Icon, i) => (
                    <span key={i} className={`vlp__wl-rail-icon${i === 0 ? ' vlp__wl-rail-icon--active' : ''}`}>
                        <Icon size={15} strokeWidth={1.9} />
                    </span>
                ))}
            </div>

            <div className="vlp__wl-body">
                <div className="vlp__wl-topbar">
                    <div className="vlp__wl-heading">
                        <span className="vlp__wl-caption">{t('مساحة عمل موحدة', 'One connected workspace')}</span>
                        <strong className="vlp__wl-title">{t('قائمة الفحوصات', 'Examination List')} <span className="vlp__wl-count">03</span></strong>
                    </div>
                    <div className="vlp__wl-search">
                        <Search size={13} strokeWidth={2.4} aria-hidden="true" />
                        <span>{t('ابحث عن مريض أو رقم طلب...', 'Search patient or order...')}</span>
                    </div>
                </div>

                <div className="vlp__wl-cols">
                    <span>{t('المريض', 'Patient')}</span>
                    <span>{t('نوع الفحص', 'Exam Type')}</span>
                    <span>{t('تاريخ الموعد', 'Date')}</span>
                    <span>{t('الحالة', 'Status')}</span>
                    <span>{t('الإجراءات', 'Actions')}</span>
                </div>

                <motion.div
                    variants={staggerContainer}
                    initial="hidden"
                    animate="visible"
                    transition={{ delayChildren: 1.15 }}
                    style={{ display: 'contents' }}
                >
                    {WORKLIST_ROWS.map((row) => (
                        <motion.div className="vlp__wl-row" key={row.id} variants={rowVariant}>
                            <span className="vlp__wl-patient">
                                <img
                                    className="vlp__wl-thumb"
                                    src={row.thumb}
                                    alt=""
                                    onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
                                />
                                <span>
                                    <b>{isRtl ? row.patientAr : row.patientEn}</b>
                                    <small dir="ltr">#{row.id}</small>
                                </span>
                            </span>
                            <span className="vlp__wl-modality">
                                {(isRtl ? row.modalityAr : row.modalityEn).split('\n').map((line, i) => (
                                    <span key={i}>{line}</span>
                                ))}
                            </span>
                            <span className="vlp__wl-date" dir="ltr">{row.date}</span>
                            <span className={`vlp__wl-status vlp__wl-status--${row.statusType}`}>
                                {row.statusType === 'done'
                                    ? <Check size={11} strokeWidth={3} aria-hidden="true" />
                                    : <span className="vlp__wl-dot" aria-hidden="true" />}
                                {isRtl ? row.statusAr : row.statusEn}
                            </span>
                            <span className="vlp__wl-actions" aria-hidden="true">
                                <MoreHorizontal size={16} />
                            </span>
                        </motion.div>
                    ))}
                </motion.div>

                <div className="vlp__wl-footer">
                    <Info size={13} aria-hidden="true" />
                    <span>{t('بيانات توضيحية', 'Demo data')}</span>
                </div>
            </div>
        </motion.div>
    );
}

function ScanStage({ isRtl, t, reduce }) {
    const stageRef = useRef(null);
    const { scrollYProgress } = useScroll({ target: stageRef, offset: ['start end', 'end start'] });
    const imgY = useTransform(scrollYProgress, [0, 1], ['-5%', '5%']);

    const floatLoop = (offset) => (reduce
        ? undefined
        : { y: [0, -9, 0], transition: { duration: 5.5, ease: 'easeInOut', repeat: Infinity, delay: offset } });

    return (
        <div className="vlp__stage" ref={stageRef}>
            <motion.div
                className="vlp__monitor"
                initial={reduce ? false : { opacity: 0, scale: 1.04, clipPath: 'inset(8% 8% 8% 8% round 28px)' }}
                animate={{ opacity: 1, scale: 1, clipPath: 'inset(0% 0% 0% 0% round 28px)' }}
                transition={{ duration: 1.15, ease: EASE, delay: 0.25 }}
            >
                <motion.div className="vlp__monitor-img" style={reduce ? undefined : { y: imgY }} aria-hidden="true" />
                <div className="vlp__monitor-tint" aria-hidden="true" />
                <div className="vlp__monitor-grid" aria-hidden="true" />
                <span className="vlp__reticle vlp__reticle--tl" aria-hidden="true" />
                <span className="vlp__reticle vlp__reticle--tr" aria-hidden="true" />
                <span className="vlp__reticle vlp__reticle--bl" aria-hidden="true" />
                <span className="vlp__reticle vlp__reticle--br" aria-hidden="true" />
                {!reduce && <div className="vlp__sweep" aria-hidden="true" />}
                <ScanHud t={t} reduce={reduce} />
            </motion.div>

            <motion.div
                className="vlp__chip vlp__chip--a"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1, ...(floatLoop(0) || {}) }}
                transition={{ duration: 0.6, ease: EASE, delay: 1.4 }}
            >
                <span className="vlp__chip-icon"><ScanLine size={15} aria-hidden="true" /></span>
                <span>
                    <b>{t('تم استلام DICOM', 'DICOM received')}</b>
                    <small>{t('CT - 320 مقطع', 'CT - 320 slices')}</small>
                </span>
            </motion.div>

            <motion.div
                className="vlp__chip vlp__chip--b"
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1, ...(floatLoop(1.6) || {}) }}
                transition={{ duration: 0.6, ease: EASE, delay: 1.7 }}
            >
                <span className="vlp__chip-icon vlp__chip-icon--ok"><Check size={15} strokeWidth={3} aria-hidden="true" /></span>
                <span>
                    <b>{t('تم اعتماد التقرير', 'Report signed')}</b>
                    <small>{t('جاهز للتسليم', 'Ready for delivery')}</small>
                </span>
            </motion.div>

            <WorklistCard isRtl={isRtl} t={t} />
        </div>
    );
}

/* ─────────────────────────── Modality marquee ─────────────────────────── */

function ModalityMarquee({ t }) {
    const group = (suffix) => (
        <div className="vlp__marquee-group" aria-hidden={suffix === 'b' ? 'true' : undefined} key={suffix}>
            {MODALITIES.map((m) => (
                <span className="vlp__modality" key={`${suffix}-${m.code}`}>
                    <b dir="ltr">{m.code}</b>
                    <span>{t(m.ar, m.en)}</span>
                </span>
            ))}
        </div>
    );
    return (
        <section className="vlp__marquee-wrap" aria-label={t('أنواع الفحوصات المدعومة', 'Supported modalities')}>
            <p className="vlp__marquee-caption">
                {t('يدعم جميع أنواع الفحوصات التصويرية', 'Built for every imaging modality')}
            </p>
            <div className="vlp__marquee">
                <div className="vlp__marquee-track">
                    {group('a')}
                    {group('b')}
                </div>
            </div>
        </section>
    );
}

/* ─────────────────────────── Features ─────────────────────────── */

function FeatureVisual({ type, t }) {
    if (type === 'journey') {
        return (
            <div className="vlp__mini vlp__mini--journey" aria-hidden="true">
                <span className="vlp__mini-line" />
                <span className="vlp__mini-pulse" />
                {[0, 1, 2, 3].map((i) => (
                    <span key={i} className="vlp__mini-node" style={{ '--i': i }} />
                ))}
            </div>
        );
    }
    if (type === 'roles') {
        const roles = [
            { Icon: Stethoscope, ar: 'طبيب الأشعة', en: 'Radiologist' },
            { Icon: ScanLine, ar: 'فني الأشعة', en: 'Technician' },
            { Icon: LayoutDashboard, ar: 'الإدارة', en: 'Admin' },
        ];
        return (
            <div className="vlp__mini vlp__mini--roles" aria-hidden="true">
                {roles.map(({ Icon, ar, en }) => (
                    <span key={en} className="vlp__role">
                        <Icon size={14} strokeWidth={2} />
                        {t(ar, en)}
                    </span>
                ))}
            </div>
        );
    }
    return (
        <div className="vlp__mini vlp__mini--report" aria-hidden="true">
            <div className="vlp__mini-bar"><i /></div>
            <div className="vlp__mini-pills">
                <span className="vlp__pill vlp__pill--done"><Check size={11} strokeWidth={3} />{t('تم التصوير', 'Imaged')}</span>
                <span className="vlp__pill vlp__pill--done"><Check size={11} strokeWidth={3} />{t('تمت القراءة', 'Read')}</span>
                <span className="vlp__pill vlp__pill--wait"><span className="vlp__wl-dot" />{t('بانتظار الاعتماد', 'Awaiting sign-off')}</span>
            </div>
        </div>
    );
}

function FeatureCard({ feature, t }) {
    const { Icon, titleAr, titleEn, descAr, descEn, visual, tone } = feature;
    const ref = useRef(null);

    const onMove = (e) => {
        const el = ref.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        el.style.setProperty('--mx', `${e.clientX - r.left}px`);
        el.style.setProperty('--my', `${e.clientY - r.top}px`);
    };

    return (
        <motion.article
            ref={ref}
            className="vlp__feature-card"
            data-tone={tone}
            variants={featureVariant}
            onMouseMove={onMove}
            whileHover={{ y: -6, transition: { duration: 0.25, ease: 'easeOut' } }}
        >
            <motion.span
                className="vlp__feature-icon"
                whileHover={{ scale: 1.1, rotate: -6 }}
                transition={{ type: 'spring', stiffness: 300, damping: 16 }}
            >
                <Icon size={26} strokeWidth={1.7} aria-hidden="true" />
            </motion.span>
            <div className="vlp__feature-text">
                <h3>{t(titleAr, titleEn)}</h3>
                <p>{t(descAr, descEn)}</p>
            </div>
            <FeatureVisual type={visual} t={t} />
        </motion.article>
    );
}

function FeaturesSection({ t }) {
    const ref = useRef(null);
    const inView = useInView(ref, { once: true, margin: '0px 0px -10% 0px' });
    return (
        <section id="vlp-features" className="vlp__section" aria-label={t('المميزات', 'Features')}>
            <div className="vlp__section-head">
                <WordReveal text={t('أدوات واضحة لكل فريق المركز', 'Clear tools for your whole team')} />
                <Reveal as="p" delay={0.1}>
                    {t(
                        'استقبال وتصوير وتقارير في نظام واحد مترابط، دون تنقل بين برامج مختلفة.',
                        'Reception, imaging and reports in one connected system, with no switching between tools.',
                    )}
                </Reveal>
            </div>
            <motion.div
                ref={ref}
                className="vlp__features-grid"
                variants={staggerContainer}
                initial="hidden"
                animate={inView ? 'visible' : 'hidden'}
            >
                {FEATURES.map((feature) => (
                    <FeatureCard key={feature.id} feature={feature} t={t} />
                ))}
            </motion.div>
        </section>
    );
}

/* ─────────────────────────── Workflow ─────────────────────────── */

function FlowSection({ t, reduce }) {
    const sectionRef = useRef(null);
    const inView = useInView(sectionRef, { once: true, margin: '0px 0px -15% 0px' });
    const { scrollYProgress } = useScroll({ target: sectionRef, offset: ['start 78%', 'end 62%'] });
    const progress = useSpring(scrollYProgress, { stiffness: 110, damping: 26, restDelta: 0.001 });

    return (
        <section id="vlp-workflow" className="vlp__section" aria-label={t('مسار العمل', 'Workflow')}>
            <div className="vlp__section-head">
                <WordReveal text={t('من الحجز حتى التسليم', 'From booking to delivery')} />
                <Reveal as="p" delay={0.1}>
                    {t(
                        'كل مرحلة تنتقل تلقائيًا إلى التي بعدها، ويعرف الفريق دائمًا أين وصل الفحص.',
                        'Every stage hands off to the next, so the team always knows where a study stands.',
                    )}
                </Reveal>
            </div>

            <motion.ol
                ref={sectionRef}
                className="vlp__flow"
                variants={staggerContainer}
                initial="hidden"
                animate={inView || reduce ? 'visible' : 'hidden'}
            >
                <li className="vlp__flow-track" aria-hidden="true">
                    <motion.i className="vlp__flow-fill vlp__flow-fill--x" style={{ scaleX: progress }} />
                    <motion.i className="vlp__flow-fill vlp__flow-fill--y" style={{ scaleY: progress }} />
                </li>
                {FLOW_STEPS.map(({ id, Icon, titleAr, titleEn, descAr, descEn }, i) => (
                    <motion.li className="vlp__step" key={id} variants={stepVariant}>
                        <span className="vlp__step-node">
                            <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
                            <em aria-hidden="true">{i + 1}</em>
                        </span>
                        <div className="vlp__step-text">
                            <h3>{t(titleAr, titleEn)}</h3>
                            <p>{t(descAr, descEn)}</p>
                        </div>
                    </motion.li>
                ))}
            </motion.ol>
        </section>
    );
}

/* ─────────────────────────── Live Metrics Strip ─────────────────────────── */

function MetricsSection({ t, isRtl }) {
    return (
        <section className="vlp__metrics-strip" aria-label={t('مؤشرات الأداء', 'Key Metrics')}>
            <div className="vlp__metrics-grid">
                {METRICS.map((m, i) => (
                    <motion.div
                        key={i}
                        className="vlp__metric-card"
                        initial={{ opacity: 0, y: 20 }}
                        whileInView={{ opacity: 1, y: 0 }}
                        viewport={{ once: true, margin: '-40px' }}
                        transition={{ duration: 0.5, delay: i * 0.1 }}
                        whileHover={{ y: -5, transition: { duration: 0.22 } }}
                    >
                        <div className="vlp__metric-header">
                            <span className="vlp__metric-icon" aria-hidden="true">
                                <m.Icon size={18} strokeWidth={2.2} />
                            </span>
                        </div>
                        <strong className="vlp__metric-val" dir="ltr">{m.value}</strong>
                        <span className="vlp__metric-label">{isRtl ? m.labelAr : m.labelEn}</span>
                        <small className="vlp__metric-sub">{isRtl ? m.subAr : m.subEn}</small>
                    </motion.div>
                ))}
            </div>
        </section>
    );
}

/* ─────────────────────────── Interactive FAQ Accordion ─────────────────────────── */

function FaqSection({ t, isRtl }) {
    const [openIndex, setOpenIndex] = useState(0);

    return (
        <section id="vlp-faq" className="vlp__section" aria-label={t('الأسئلة الشائعة', 'Frequently Asked Questions')}>
            <div className="vlp__section-head">
                <WordReveal text={t('كل ما يهمك معرفته عن VIARA', 'Frequently Asked Questions')} />
                <Reveal as="p" delay={0.1}>
                    {t(
                        'إجابات شاملة عن معايير الربط، الأمان، وتكامل خدمات مركز الأشعة.',
                        'Detailed answers on imaging integration, security, and center workflow.',
                    )}
                </Reveal>
            </div>

            <div className="vlp__faq-list">
                {FAQ_ITEMS.map((item, i) => {
                    const isOpen = openIndex === i;
                    const num = String(i + 1).padStart(2, '0');
                    return (
                        <div key={i} className={`vlp__faq-item ${isOpen ? 'vlp__faq-item--open' : ''}`}>
                            <button
                                id={`vlp-faq-trigger-${i}`}
                                type="button"
                                className="vlp__faq-trigger"
                                onClick={() => setOpenIndex(isOpen ? -1 : i)}
                                aria-expanded={isOpen}
                                aria-controls={`vlp-faq-answer-${i}`}
                            >
                                <span className="vlp__faq-trigger-content">
                                    <span className="vlp__faq-num" aria-hidden="true">{num}</span>
                                    <span>{isRtl ? item.qAr : item.qEn}</span>
                                </span>
                                <span className="vlp__faq-icon" aria-hidden="true">
                                    <ChevronDown
                                        size={18}
                                        style={{
                                            transform: isOpen ? 'rotate(180deg)' : 'none',
                                            transition: 'transform 0.25s ease',
                                        }}
                                    />
                                </span>
                            </button>
                            <AnimatePresence>
                                {isOpen && (
                                    <motion.div
                                        id={`vlp-faq-answer-${i}`}
                                        role="region"
                                        aria-labelledby={`vlp-faq-trigger-${i}`}
                                        className="vlp__faq-answer"
                                        initial={{ opacity: 0, height: 0 }}
                                        animate={{ opacity: 1, height: 'auto' }}
                                        exit={{ opacity: 0, height: 0 }}
                                        transition={{ duration: 0.28, ease: 'easeInOut' }}
                                    >
                                        <p>{isRtl ? item.aAr : item.aEn}</p>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    );
                })}
            </div>
        </section>
    );
}

/* ─────────────────────────── Closing CTA ─────────────────────────── */

function CtaBand({ t, DirectionArrow, onOpenServices }) {
    return (
        <section className="vlp__cta" aria-label={t('ابدأ الآن', 'Get started')}>
            <Reveal className="vlp__cta-panel">
                <span className="vlp__cta-aurora" aria-hidden="true" />
                <span className="vlp__cta-grid" aria-hidden="true" />
                <div className="vlp__cta-copy">
                    <h2>{t('أدِر مركزك من مكان واحد', 'Run your center from one place')}</h2>
                    <p>
                        {t(
                            'سجّل الدخول وابدأ متابعة الفحوصات والتقارير الآن.',
                            'Sign in to start tracking studies and reports right away.',
                        )}
                    </p>
                </div>
                <div className="vlp__cta-actions">
                    <motion.div whileHover={{ y: -3 }} whileTap={{ scale: 0.97 }}>
                        <Link to="/login" className="vlp__button vlp__button--light vlp__button--large">
                            {t('الدخول إلى النظام', 'Open the System')}
                            <DirectionArrow size={20} aria-hidden="true" />
                        </Link>
                    </motion.div>
                    <button type="button" className="vlp__ghost" onClick={onOpenServices}>
                        <Activity size={16} aria-hidden="true" />
                        {t('حالة الخدمات', 'Service health')}
                    </button>
                </div>
            </Reveal>
        </section>
    );
}

/* ─────────────────────────── Page ─────────────────────────── */

export default function Landing() {
    const dispatch = useDispatch();
    const preferences = useSelector(selectPreferences);
    const { i18n } = useTranslation();
    const reduce = useReducedMotion();
    const isRtl = i18n.dir() === 'rtl';
    const [systemDark] = useState(
        () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
    );
    const dark = preferences.theme === 'dark' || (preferences.theme === 'system' && systemDark);
    const [languageBusy, setLanguageBusy] = useState(false);
    const [brandFailed, setBrandFailed] = useState(false);
    const [serviceModalOpen, setServiceModalOpen] = useState(false);
    const [stuck, setStuck] = useState(false);
    const brandName = VIARA_BRAND.name || 'VIARA';
    const DirectionArrow = isRtl ? ArrowLeft : ArrowRight;
    const t = (ar, en) => (isRtl ? ar : en);

    const { scrollYProgress: pageProgress } = useScroll();
    const progressX = useSpring(pageProgress, { stiffness: 120, damping: 30, restDelta: 0.001 });

    useEffect(() => {
        const onScroll = () => setStuck((prev) => {
            const next = window.scrollY > 12;
            return prev === next ? prev : next;
        });
        onScroll();
        window.addEventListener('scroll', onScroll, { passive: true });
        return () => window.removeEventListener('scroll', onScroll);
    }, []);

    const goTo = (id) => (e) => {
        e.preventDefault();
        document.getElementById(id)?.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    };

    const toggleLanguage = async () => {
        if (languageBusy) return;
        const next = isRtl ? 'en' : 'ar';
        setLanguageBusy(true);
        try {
            await i18n.changeLanguage(next);
            dispatch(setLanguage(next));
            try { localStorage.setItem('VIARA_lang', next); } catch { /* noop */ }
        } catch { /* noop */ } finally { setLanguageBusy(false); }
    };

    const line1 = t('رؤية أوضح.', 'Clearer Vision.');
    const line2 = t('إدارة أكثر سلاسة.', 'Smoother Management.');
    const line1Words = line1.split(' ').length;

    return (
        <div
            className={`vlp ${dark ? 'vlp--dark' : ''}`}
            dir={isRtl ? 'rtl' : 'ltr'}
            lang={isRtl ? 'ar' : 'en'}
        >
            <motion.div className="vlp__progress" style={{ scaleX: progressX }} aria-hidden="true" />

            <div className="vlp__backdrop" aria-hidden="true">
                <span className="vlp__grid" />
                <span className="vlp__aurora vlp__aurora--a" />
                <span className="vlp__aurora vlp__aurora--b" />
            </div>

            {/* ── Header ── */}
            <motion.header
                className={`vlp__header${stuck ? ' vlp__header--stuck' : ''}`}
                initial={{ y: -80, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ duration: 0.65, ease: EASE }}
            >
                <motion.div
                    className="vlp__brand-wrap"
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    transition={{ type: 'spring', stiffness: 320, damping: 22 }}
                >
                    <Link to="/" className="vlp__brand" aria-label={brandName}>
                        {!brandFailed ? (
                            <img
                                src={VIARA_BRAND.iconUrl || VIARA_BRAND.logoUrl || '/logo.png'}
                                alt=""
                                width="40"
                                height="40"
                                onError={() => setBrandFailed(true)}
                            />
                        ) : (
                            <span className="vlp__brand-fallback" aria-hidden="true">V</span>
                        )}
                        <strong dir="ltr">{brandName}</strong>
                    </Link>
                </motion.div>

                <nav className="vlp__nav" aria-label={t('التنقل', 'Navigation')}>
                    <a href="#vlp-features" onClick={goTo('vlp-features')}>{t('المميزات', 'Features')}</a>
                    <a href="#vlp-workflow" onClick={goTo('vlp-workflow')}>{t('مسار العمل', 'Workflow')}</a>
                    <a href="#vlp-faq" onClick={goTo('vlp-faq')}>{t('الأسئلة الشائعة', 'FAQ')}</a>
                    <Link to="/portal" className="vlp__nav-portal">{t('بوابة النتائج', 'Results Portal')}</Link>
                </nav>

                <div className="vlp__actions">
                    <motion.button
                        className="vlp__util-service"
                        type="button"
                        onClick={() => setServiceModalOpen(true)}
                        aria-label={t('حالة الخدمات', 'Service health')}
                        whileHover={{ y: -1 }}
                        whileTap={{ scale: 0.96 }}
                    >
                        <Activity size={16} aria-hidden="true" />
                        <span>{t('الخدمات', 'Services')}</span>
                        <i aria-hidden="true" />
                    </motion.button>

                    <motion.button
                        className="vlp__util-icon"
                        type="button"
                        onClick={() => dispatch(setTheme(dark ? 'light' : 'dark'))}
                        aria-label={dark ? t('المظهر الفاتح', 'Light mode') : t('المظهر الداكن', 'Dark mode')}
                        whileHover={{ rotate: 14 }}
                        whileTap={{ scale: 0.9 }}
                        transition={{ type: 'spring', stiffness: 300, damping: 18 }}
                    >
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.span
                                key={dark ? 'sun' : 'moon'}
                                initial={{ rotate: -90, opacity: 0, scale: 0.7 }}
                                animate={{ rotate: 0, opacity: 1, scale: 1 }}
                                exit={{ rotate: 90, opacity: 0, scale: 0.7 }}
                                transition={{ duration: 0.24 }}
                                style={{ display: 'flex' }}
                            >
                                {dark ? <Sun size={18} /> : <Moon size={18} />}
                            </motion.span>
                        </AnimatePresence>
                    </motion.button>

                    <motion.button
                        className="vlp__util-lang"
                        type="button"
                        onClick={toggleLanguage}
                        disabled={languageBusy}
                        aria-label={isRtl
                            ? t('التبديل إلى الإنجليزية', 'Switch to English')
                            : t('التبديل إلى العربية', 'Switch to Arabic')}
                        whileTap={{ scale: 0.96 }}
                    >
                        <Globe size={19} aria-hidden="true" />
                        <span>{isRtl ? 'EN' : 'عربي'}</span>
                    </motion.button>

                    <span className="vlp__util-sep" aria-hidden="true" />

                    <motion.div whileHover={{ y: -2 }} whileTap={{ scale: 0.97 }}>
                        <Link className="vlp__button vlp__header-signin" to="/login">
                            <UserRound size={15} aria-hidden="true" />
                            {t('تسجيل الدخول', 'Sign In')}
                        </Link>
                    </motion.div>
                </div>
            </motion.header>

            {/* ── Hero ── */}
            <section className="vlp__hero" aria-label={t('نظرة عامة', 'Overview')}>
                <div className="vlp__copy">
                    <motion.p
                        className="vlp__eyebrow"
                        variants={riseIn}
                        custom={0}
                        initial={reduce ? false : 'hidden'}
                        animate="visible"
                    >
                        <span className="vlp__eyebrow-dot" aria-hidden="true" />
                        {t('نظام متكامل لإدارة مراكز الأشعة', 'Integrated Radiology Center Management')}
                    </motion.p>

                    <h1 className="vlp__title" aria-label={`${line1} ${line2}`}>
                        <WordLine text={line1} delay={0.15} reduce={reduce} />
                        <WordLine text={line2} delay={0.15 + line1Words * 0.1 + 0.08} gradient reduce={reduce} />
                    </h1>

                    <motion.p
                        className="vlp__description"
                        variants={riseIn}
                        custom={0.75}
                        initial={reduce ? false : 'hidden'}
                        animate="visible"
                    >
                        {t(
                            'من استقبال المريض إلى تسليم التقرير، تجربة عمل واحدة تجمع فريقك وخدمات مركزك.',
                            'From patient reception to report delivery, one unified workspace for your team and center.',
                        )}
                    </motion.p>

                    <motion.div
                        className="vlp__cta-row"
                        variants={riseIn}
                        custom={0.9}
                        initial={reduce ? false : 'hidden'}
                        animate="visible"
                    >
                        <motion.div
                            whileHover={{ y: -3 }}
                            whileTap={{ scale: 0.97 }}
                            transition={{ type: 'spring', stiffness: 340, damping: 22 }}
                        >
                            <Link to="/login" className="vlp__button vlp__button--large">
                                {t('الدخول إلى النظام', 'Open the System')}
                                <DirectionArrow size={20} aria-hidden="true" />
                            </Link>
                        </motion.div>
                        <a href="#vlp-features" className="vlp__explore" onClick={goTo('vlp-features')}>
                            {t('استكشف المنصة', 'Explore Platform')}
                            <DirectionArrow size={17} aria-hidden="true" />
                        </a>
                    </motion.div>

                    <motion.ul
                        className="vlp__trust"
                        variants={riseIn}
                        custom={1.05}
                        initial={reduce ? false : 'hidden'}
                        animate="visible"
                        aria-label={t('الأمان والمعايير', 'Security and standards')}
                    >
                        <li><ShieldCheck size={15} aria-hidden="true" /><span dir="ltr">RBAC</span></li>
                        <li><Lock size={15} aria-hidden="true" /><span dir="ltr">Audit Trail</span></li>
                        <li><ScanLine size={15} aria-hidden="true" /><span dir="ltr">DICOM</span></li>
                    </motion.ul>
                </div>

                <ScanStage isRtl={isRtl} t={t} reduce={reduce} />
            </section>

            <ModalityMarquee t={t} />
            <MetricsSection t={t} isRtl={isRtl} />
            <FeaturesSection t={t} />
            <FlowSection t={t} reduce={reduce} />
            <FaqSection t={t} isRtl={isRtl} />
            <CtaBand t={t} DirectionArrow={DirectionArrow} onOpenServices={() => setServiceModalOpen(true)} />

            {/* ── Footer ── */}
            <footer className="vlp__footer" id="vlp-platform">
                <span className="vlp__footer-copy">
                    {t(
                        `© ${new Date().getFullYear()} VIARA. جميع الحقوق محفوظة.`,
                        `© ${new Date().getFullYear()} VIARA. All rights reserved.`,
                    )}
                </span>
                <div className="vlp__footer-links">
                    <a href="/login">{t('الدعم الفني', 'Technical Support')}</a>
                    <span aria-hidden="true">|</span>
                    <a href="/login">{t('اتصل بنا', 'Contact Us')}</a>
                </div>
            </footer>

            {serviceModalOpen && (
                <LandingServiceHealthModal
                    isRtl={isRtl}
                    onClose={() => setServiceModalOpen(false)}
                />
            )}
        </div>
    );
}
