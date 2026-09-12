import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import {
    Activity,
    AlertTriangle,
    CalendarDays,
    CheckCircle2,
    ChevronDown,
    Clock3,
    CreditCard,
    Edit3,
    FileCheck2,
    FileSpreadsheet,
    HeartPulse,
    Contact,
    Layers3,
    Loader2,
    MapPin,
    Phone,
    Printer,
    RadioTower,
    RotateCcw,
    ShieldAlert,
    ShieldCheck,
    Stethoscope,
    Syringe,
    UserRound,
    UsersRound,
    X
} from 'lucide-react';
import { useGetAppointmentByIdQuery, useGetCenterSettingsQuery } from '../../store/api';
import { normalizeCenterSettings, resolveDocumentIdentity } from '../../utils/centerSettings';
import { getSheetPreviewVariables, printWhenReady } from '../../utils/printDocument';
import '../../styles/printDocuments.css';

const COPY = {
    ar: {
        documentTitle: 'شيت المريض والتوجيه السريري',
        documentSubtitle: 'Radiology Clinical Routing & Examination Handover',
        centerDepartment: 'قسم الأشعة والتصوير التشخيصي الطبي',
        workspaceTitle: 'استوديو مستند الزيارة',
        workspaceSubtitle: 'مراجعة وتعبئة وطباعة الشيت السريري',
        onePage: 'ملائم لصفحة واحدة',
        patientDetails: 'هوية المريض والزيارة',
        examDetails: 'الفحص والموعد',
        safetyDetails: 'السلامة والتحضير',
        financialDetails: 'البيانات المالية',
        careTeam: 'فريق الرعاية',
        handoverSections: 'مسار التوجيه السريري ومحطات العمل',
        handoverHint: 'توثيق موحّد بين الاستقبال والتمريض والفني والأخصائي',
        patientName: 'اسم المريض',
        mrn: 'الرقم الطبي',
        ageGender: 'العمر / الجنس',
        phone: 'الهاتف',
        examName: 'الفحص المطلوب',
        modalityRoom: 'الجهاز / الغرفة',
        date: 'تاريخ الموعد',
        timeWindow: 'الوقت',
        duration: 'المدة',
        priority: 'الأولوية',
        bodyPart: 'موضع الفحص',
        clinicalIndication: 'الدلالة السريرية',
        followUpNote: 'متابعة مرتبطة بالفحص رقم',
        contrastStatus: 'الصبغة',
        contrastRequired: 'يتطلب صبغة وريدية',
        contrastNone: 'بدون صبغة',
        contrastWarning: 'يلزم مراجعة الصيام ووظائف الكلى وتاريخ الحساسية قبل حقن الصبغة.',
        prepStatus: 'حالة التحضير',
        pregnancy: 'الحمل',
        implant: 'الغرسات / المنظم',
        renal: 'وظائف الكلى',
        paymentMethod: 'طريقة الدفع',
        amount: 'الإجمالي',
        insuranceProvider: 'شركة التأمين',
        approvalNumber: 'رقم الموافقة',
        referringDoctor: 'الطبيب المحيل',
        radiologist: 'أخصائي الأشعة',
        technician: 'فني الأشعة',
        nurse: 'التمريض',
        orderNumber: 'رقم الطلب',
        generatedAt: 'تاريخ الإنشاء',
        printAction: 'طباعة الشيت',
        closeAction: 'إغلاق',
        resetAction: 'مسح الإدخالات',
        options: 'خيارات العرض',
        showFinancialsOpt: 'البيانات المالية',
        showSafetyOpt: 'السلامة والتحضير',
        showCareTeamOpt: 'فريق الرعاية',
        digitalModeOpt: 'تعبئة رقمية',
        manualModeOpt: 'تدوين يدوي',
        manualModeHint: 'ستظهر أسطر مهيأة للكتابة بالقلم بعد الطباعة.',
        digitalModeHint: 'اكتب الملاحظات الآن وسيتم تضمينها في النسخة المطبوعة.',
        receptionStation: 'الاستقبال والتسجيل',
        nursingStation: 'التمريض والتحضير',
        technicianStation: 'الفني والبروتوكول',
        radiologistStation: 'مراجعة الأخصائي',
        receptionTag: 'Reception',
        nursingTag: 'Nursing',
        technicianTag: 'Technologist',
        radiologistTag: 'Radiologist',
        arrivalTime: 'وقت الحضور',
        roomLabel: 'الغرفة',
        clinicalReview: 'المراجعة السريرية',
        receptionChecklist: 'الهوية ☐  مطابقة الطلب ☐  السداد/التأمين ☐  الفحوصات السابقة ☐',
        nursingChecklist: 'صيام ☐  حساسية ☐  كانيولا G18 ☐ G20 ☐ G22 ☐',
        techChecklist: 'Protocol: ........................  |  KV/mAs: ................  |  Series: ................',
        radChecklist: 'جودة الصور:  Optimal ☐  Diagnostic ☐  Repeat ☐',
        criticalFindingAlert: 'نتيجة حرجة: Routine ☐  تم إبلاغ الطبيب ☐  الوقت: ....:....  الاسم: ................',
        contrastInjection: 'الصبغة: النوع ............... | الكمية .... mL | المعدل .... mL/s | Lot ........ | Reaction: None ☐ Mild ☐',
        notesLabel: 'الملاحظات',
        protocolLabel: 'البروتوكول المنفذ',
        preliminaryImpression: 'الانطباع المبدئي / التوصيات',
        vitals: 'العلامات الحيوية',
        bp: 'BP',
        hr: 'HR',
        rbs: 'RBS',
        wt: 'Wt',
        temp: 'Temp',
        signature: 'التوقيع والوقت',
        receivedBy: 'المستلم',
        staffNurse: 'الممرض',
        radiographer: 'فني الأشعة',
        consultant: 'الأخصائي/الاستشاري',
        footerDisclaimer: 'وثيقة سريرية داخلية — تحفظ ضمن سجل المريض بعد اكتمال الفحص.',
        egp: 'ج.م',
        minutes: 'دقيقة',
        male: 'ذكر',
        female: 'أنثى',
        selfReferred: 'حضور مباشر',
        unknown: 'غير محدد',
        notRequired: 'غير مطلوب',
        pending: 'قيد المراجعة',
        pageLabel: 'صفحة 1 من 1',
        systemName: 'VIARA RIS'
    },
    en: {
        documentTitle: 'Patient Clinical Routing Slip',
        documentSubtitle: 'Radiology Clinical Routing & Examination Handover',
        centerDepartment: 'Department of Radiology & Diagnostic Imaging',
        workspaceTitle: 'Visit Document Studio',
        workspaceSubtitle: 'Review, pre-fill and print the clinical sheet',
        onePage: 'Single-page optimized',
        patientDetails: 'Patient & Visit Identity',
        examDetails: 'Examination & Schedule',
        safetyDetails: 'Safety & Preparation',
        financialDetails: 'Financial Summary',
        careTeam: 'Care Team',
        handoverSections: 'Clinical Routing & Workstations',
        handoverHint: 'One standardized handover across reception, nursing, technologist and radiologist',
        patientName: 'Patient Name',
        mrn: 'MRN',
        ageGender: 'Age / Gender',
        phone: 'Phone',
        examName: 'Requested Examination',
        modalityRoom: 'Room / Machine',
        date: 'Appointment Date',
        timeWindow: 'Time',
        duration: 'Duration',
        priority: 'Priority',
        bodyPart: 'Body Part',
        clinicalIndication: 'Clinical Indication',
        followUpNote: 'Follow-up linked to study #',
        contrastStatus: 'Contrast',
        contrastRequired: 'IV Contrast Required',
        contrastNone: 'Non-Contrast',
        contrastWarning: 'Verify fasting, renal function and allergy history before IV contrast administration.',
        prepStatus: 'Preparation',
        pregnancy: 'Pregnancy',
        implant: 'Implant / Pacemaker',
        renal: 'Renal Function',
        paymentMethod: 'Payment',
        amount: 'Total',
        insuranceProvider: 'Insurance',
        approvalNumber: 'Approval #',
        referringDoctor: 'Referring Doctor',
        radiologist: 'Radiologist',
        technician: 'Technologist',
        nurse: 'Nurse',
        orderNumber: 'Order #',
        generatedAt: 'Generated',
        printAction: 'Print Sheet',
        closeAction: 'Close',
        resetAction: 'Clear entries',
        options: 'Display options',
        showFinancialsOpt: 'Financials',
        showSafetyOpt: 'Safety & prep',
        showCareTeamOpt: 'Care team',
        digitalModeOpt: 'Digital pre-fill',
        manualModeOpt: 'Manual charting',
        manualModeHint: 'Printable writing lines will be shown for pen charting.',
        digitalModeHint: 'Enter notes now and they will be included in the printed sheet.',
        receptionStation: 'Reception & Admission',
        nursingStation: 'Nursing & Preparation',
        technicianStation: 'Technologist & Protocol',
        radiologistStation: 'Radiologist Review',
        receptionTag: 'Reception',
        nursingTag: 'Nursing',
        technicianTag: 'Technologist',
        radiologistTag: 'Radiologist',
        arrivalTime: 'Arrival',
        roomLabel: 'Room',
        clinicalReview: 'Clinical Review',
        receptionChecklist: 'ID verified ☐  Order matched ☐  Financial clearance ☐  Prior study ☐',
        nursingChecklist: 'Fasting ☐  Allergy ☐  Cannula G18 ☐ G20 ☐ G22 ☐',
        techChecklist: 'Protocol: ........................  |  KV/mAs: ................  |  Series: ................',
        radChecklist: 'Image quality:  Optimal ☐  Diagnostic ☐  Repeat ☐',
        criticalFindingAlert: 'Critical result: Routine ☐  Physician notified ☐  Time: ....:....  Name: ................',
        contrastInjection: 'Contrast: Agent ............... | Vol .... mL | Rate .... mL/s | Lot ........ | Reaction: None ☐ Mild ☐',
        notesLabel: 'Notes',
        protocolLabel: 'Performed Protocol',
        preliminaryImpression: 'Preliminary Impression / Recommendations',
        vitals: 'Vital Signs',
        bp: 'BP',
        hr: 'HR',
        rbs: 'RBS',
        wt: 'Wt',
        temp: 'Temp',
        signature: 'Signature & Time',
        receivedBy: 'Received by',
        staffNurse: 'Nurse',
        radiographer: 'Technologist',
        consultant: 'Radiologist',
        footerDisclaimer: 'Internal clinical document — archive in the patient record after examination completion.',
        egp: 'EGP',
        minutes: 'min',
        male: 'Male',
        female: 'Female',
        selfReferred: 'Self-referred',
        unknown: 'Unknown',
        notRequired: 'Not Required',
        pending: 'Pending review',
        pageLabel: 'Page 1 of 1',
        systemName: 'VIARA RIS'
    }
};

const cx = (...classes) => classes.filter(Boolean).join(' ');

const calculateAge = (dateOfBirth) => {
    if (!dateOfBirth) return null;
    const birth = new Date(dateOfBirth);
    if (Number.isNaN(birth.getTime())) return null;

    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const monthDiff = today.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age -= 1;
    return Math.max(0, age);
};

const SectionEyebrow = ({ icon: Icon, title, hint }) => (
    <div className="flex items-end justify-between gap-3 border-b border-slate-200 pb-1.5">
        <div className="flex items-center gap-2 min-w-0">
            <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-slate-950 text-white">
                <Icon size={12} strokeWidth={2.4} />
            </span>
            <h3 className="truncate text-[10px] font-black tracking-[0.04em] text-slate-950">{title}</h3>
        </div>
        {hint ? <span className="hidden text-[7.5px] font-semibold text-slate-400 sm:block">{hint}</span> : null}
    </div>
);

const MetaCell = ({ label, value, icon: Icon, valueClassName, dir = 'auto', mono = false, children }) => (
    <div className="min-w-0 rounded-md border border-slate-200/90 bg-white px-2 py-1.5 shadow-[0_1px_0_rgba(15,23,42,0.03)]">
        <div className="mb-0.5 flex items-center gap-1 text-[7.5px] font-bold uppercase tracking-[0.06em] text-slate-400">
            {Icon ? <Icon size={9.5} strokeWidth={2.2} className="shrink-0" /> : null}
            <span className="truncate">{label}</span>
        </div>
        {children || (
            <div
                className={cx(
                    'truncate text-[9.5px] font-extrabold leading-tight text-slate-900',
                    mono && 'font-mono tracking-tight',
                    valueClassName
                )}
                dir={dir}
                title={typeof value === 'string' ? value : undefined}
            >
                {value || '—'}
            </div>
        )}
    </div>
);

const StatusPill = ({ tone = 'slate', children, icon: Icon }) => {
    const tones = {
        slate: 'border-slate-200 bg-slate-100 text-slate-700',
        teal: 'border-teal-200 bg-teal-50 text-teal-800',
        emerald: 'border-emerald-200 bg-emerald-50 text-emerald-800',
        amber: 'border-amber-300 bg-amber-50 text-amber-900',
        rose: 'border-rose-300 bg-rose-50 text-rose-900',
        sky: 'border-sky-200 bg-sky-50 text-sky-800',
        violet: 'border-violet-200 bg-violet-50 text-violet-800'
    };

    return (
        <span className={cx('inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[7.5px] font-black leading-none', tones[tone] || tones.slate)}>
            {Icon ? <Icon size={8.5} strokeWidth={2.5} /> : null}
            {children}
        </span>
    );
};

const ControlToggle = ({ checked, onChange, label }) => (
    <label className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] font-bold text-slate-700 transition hover:bg-slate-50 dark:text-slate-200 dark:hover:bg-slate-800">
        <span
            className={cx(
                'relative h-4 w-7 shrink-0 rounded-full transition',
                checked ? 'bg-teal-600' : 'bg-slate-300 dark:bg-slate-600'
            )}
        >
            <input type="checkbox" checked={checked} onChange={onChange} className="sr-only" />
            <span
                className={cx(
                    'absolute top-0.5 h-3 w-3 rounded-full bg-white shadow-sm transition-all',
                    checked ? 'start-[13px]' : 'start-0.5'
                )}
            />
        </span>
        <span className="whitespace-nowrap">{label}</span>
    </label>
);

const WritingLines = ({ value, lines = 2 }) => (
    <div className="space-y-1">
        {Array.from({ length: lines }).map((_, index) => (
            <div
                key={index}
                className="min-h-[15px] border-b border-dotted border-slate-300 text-[8.5px] font-semibold leading-[14px] text-slate-800"
            >
                {index === 0 ? value : ''}
            </div>
        ))}
    </div>
);

const SignOff = ({ label, person, signatureLabel }) => (
    <div className="mt-1.5 grid grid-cols-[1fr_auto] items-end gap-2 border-t border-slate-200 pt-1 text-[7.8px] text-slate-500">
        <span className="truncate font-bold text-slate-700">{label}: {person || '........................'}</span>
        <span className="whitespace-nowrap">{signatureLabel}: ........................</span>
    </div>
);

const StationCard = ({
    number,
    title,
    tag,
    icon: Icon,
    tone,
    meta,
    children,
    signOff
}) => {
    const palette = {
        teal: {
            ring: 'border-teal-200',
            bg: 'bg-teal-50/55',
            text: 'text-teal-950',
            badge: 'bg-teal-900 text-white'
        },
        rose: {
            ring: 'border-rose-200',
            bg: 'bg-rose-50/55',
            text: 'text-rose-950',
            badge: 'bg-rose-900 text-white'
        },
        violet: {
            ring: 'border-violet-200',
            bg: 'bg-violet-50/55',
            text: 'text-violet-950',
            badge: 'bg-violet-900 text-white'
        },
        cyan: {
            ring: 'border-cyan-200',
            bg: 'bg-cyan-50/55',
            text: 'text-cyan-950',
            badge: 'bg-cyan-900 text-white'
        }
    }[tone];

    return (
        <section className="flex min-h-0 flex-col rounded-lg border border-slate-300 bg-white p-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className={cx('mb-1.5 flex items-center justify-between gap-2 rounded-md border px-1.5 py-1', palette.ring, palette.bg)}>
                <div className="flex min-w-0 items-center gap-1.5">
                    <span className={cx('grid h-5 w-5 shrink-0 place-items-center rounded-md text-[8px] font-black', palette.badge)}>{number}</span>
                    <Icon size={12} className={cx('shrink-0', palette.text)} strokeWidth={2.4} />
                    <div className="min-w-0">
                        <div className={cx('truncate text-[9px] font-black leading-tight', palette.text)}>{title}</div>
                        <div className="text-[6.8px] font-bold uppercase tracking-[0.09em] text-slate-400">{tag}</div>
                    </div>
                </div>
                {meta ? <span className="max-w-[42%] truncate text-[7.5px] font-bold text-slate-500">{meta}</span> : null}
            </div>

            <div className="min-h-0 flex-1">{children}</div>
            {signOff}
        </section>
    );
};

const FieldInput = ({ value, onChange, placeholder, className }) => (
    <input
        type="text"
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className={cx(
            'w-full rounded border border-slate-200 bg-white px-1.5 py-1 text-[8px] font-semibold text-slate-900 outline-none transition focus:border-teal-400 focus:ring-1 focus:ring-teal-100',
            className
        )}
    />
);

const TextArea = ({ value, onChange, placeholder, tone = 'teal' }) => {
    const focusTone = {
        teal: 'focus:border-teal-400 focus:ring-teal-100',
        rose: 'focus:border-rose-400 focus:ring-rose-100',
        violet: 'focus:border-violet-400 focus:ring-violet-100',
        cyan: 'focus:border-cyan-400 focus:ring-cyan-100'
    }[tone];

    return (
        <textarea
            value={value}
            onChange={onChange}
            placeholder={placeholder}
            rows={2}
            className={cx(
                'w-full resize-none rounded-md border border-slate-200 bg-white px-1.5 py-1 text-[8.5px] font-semibold leading-[1.35] text-slate-900 outline-none transition focus:ring-1',
                focusTone
            )}
        />
    );
};

const PrintBookingSlip = () => {
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    const { t, i18n } = useTranslation('common');

    const { data: appointment, isLoading: apptLoading, isError: apptError } = useGetAppointmentByIdQuery(id);
    const { data: settings, isLoading: settingsLoading } = useGetCenterSettingsQuery();

    const [paperSize, setPaperSize] = useState('A4');
    const [slipLanguage, setSlipLanguage] = useState('ar');
    const [showFinancials, setShowFinancials] = useState(true);
    const [showSafety, setShowSafety] = useState(true);
    const [showCareTeam, setShowCareTeam] = useState(true);
    const [digitalEntryMode, setDigitalEntryMode] = useState(false);
    const [showOptions, setShowOptions] = useState(false);

    const [receptionCustomNotes, setReceptionCustomNotes] = useState('');
    const [nursingVitals, setNursingVitals] = useState({ bp: '', hr: '', rbs: '', wt: '', temp: '' });
    const [nursingCustomNotes, setNursingCustomNotes] = useState('');
    const [techCustomProtocol, setTechCustomProtocol] = useState('');
    const [techCustomNotes, setTechCustomNotes] = useState('');
    const [radCustomImpression, setRadCustomImpression] = useState('');

    const isRtl = slipLanguage === 'ar';
    const copy = COPY[slipLanguage] || COPY.ar;

    useEffect(() => {
        const requestedLanguage = searchParams.get('lang');
        if (requestedLanguage === 'ar' || requestedLanguage === 'en') {
            setSlipLanguage(requestedLanguage);
        } else if (i18n?.language?.startsWith('en')) {
            setSlipLanguage('en');
        }
    }, [i18n?.language, searchParams]);

    const resetEntries = () => {
        setReceptionCustomNotes('');
        setNursingVitals({ bp: '', hr: '', rbs: '', wt: '', temp: '' });
        setNursingCustomNotes('');
        setTechCustomProtocol('');
        setTechCustomNotes('');
        setRadCustomImpression('');
    };

    if (apptLoading || settingsLoading) {
        return (
            <div className="grid min-h-screen place-items-center bg-slate-100 px-4 dark:bg-slate-950">
                <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-xl dark:border-slate-800 dark:bg-slate-900">
                    <span className="grid h-10 w-10 place-items-center rounded-xl bg-teal-50 text-teal-700 dark:bg-teal-950/50 dark:text-teal-300">
                        <Loader2 className="animate-spin" size={20} />
                    </span>
                    <div>
                        <p className="text-sm font-black text-slate-900 dark:text-white">{COPY.ar.workspaceTitle}</p>
                        <p className="text-[11px] font-medium text-slate-500">Loading clinical document...</p>
                    </div>
                </div>
            </div>
        );
    }

    if (apptError || !appointment) {
        return (
            <div className="grid min-h-screen place-items-center bg-slate-100 p-5 dark:bg-slate-950">
                <div className="max-w-md rounded-2xl border border-rose-200 bg-white p-6 text-center shadow-xl dark:border-rose-900/40 dark:bg-slate-900">
                    <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300">
                        <AlertTriangle size={21} />
                    </span>
                    <p className="font-black text-slate-900 dark:text-white">
                        {t('errors.loadFailed', { defaultValue: 'Failed to load appointment details' })}
                    </p>
                </div>
            </div>
        );
    }

    const centerSettings = normalizeCenterSettings(settings);
    const documentIdentity = resolveDocumentIdentity(centerSettings, appointment, {
        language: slipLanguage,
        kind: 'receipt'
    });

    const logoUrl = documentIdentity.logoUrl;
    const centerName = documentIdentity.centerName || 'VIARA Radiology Center';
    const branchName = documentIdentity.branchName || '';
    const phone = documentIdentity.phone || centerSettings.phone || '';
    const address = documentIdentity.address || centerSettings.address || '';

    const startTime = appointment.start_time ? new Date(appointment.start_time) : null;
    const endTime = appointment.end_time ? new Date(appointment.end_time) : null;
    const durationMinutes = startTime && endTime
        ? Math.max(10, Math.round((endTime.getTime() - startTime.getTime()) / 60000))
        : 30;

    const formattedDate = startTime
        ? startTime.toLocaleDateString(isRtl ? 'ar-EG' : 'en-GB', {
            weekday: 'short',
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        })
        : '—';

    const formattedTimeWindow = startTime && endTime
        ? `${startTime.toLocaleTimeString(isRtl ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' })} – ${endTime.toLocaleTimeString(isRtl ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' })}`
        : '—';

    const patientAge = calculateAge(appointment.date_of_birth);
    const ageGender = `${patientAge ?? '—'}${patientAge != null ? (isRtl ? ' سنة' : ' yrs') : ''} · ${appointment.gender === 'Male'
            ? copy.male
            : appointment.gender === 'Female'
                ? copy.female
                : appointment.gender || '—'
        }`;

    const orderRef = appointment.order_number || appointment.appointment_id?.slice(0, 8) || '—';
    const hasContrast = Boolean(appointment.contrast_required || appointment.exam_type_contrast_required);
    const priority = appointment.priority || 'Routine';
    const priorityTone = priority === 'Emergency' ? 'rose' : priority === 'Urgent' ? 'amber' : 'sky';

    const paperDimensions = paperSize === 'A5'
        ? { width: '148mm', height: '210mm' }
        : { width: '210mm', height: '297mm' };
    const previewVariables = getSheetPreviewVariables(paperDimensions);

    const qrValue = JSON.stringify({
        appt: appointment.appointment_id,
        mrn: appointment.mrn,
        exam: appointment.exam_type_name || appointment.exam_type_id,
        time: appointment.start_time
    });

    const safetyItems = [
        {
            label: copy.pregnancy,
            value: appointment.pregnancy_status || appointment.pregnancy_clearance || copy.pending,
            icon: ShieldCheck
        },
        {
            label: copy.implant,
            value: appointment.implant_status || appointment.pacemaker_status || copy.notRequired,
            icon: Activity
        },
        {
            label: copy.renal,
            value: appointment.renal_status || appointment.creatinine || appointment.egfr || (hasContrast ? copy.pending : copy.notRequired),
            icon: HeartPulse
        },
        {
            label: copy.prepStatus,
            value: appointment.preparation_status || copy.notRequired,
            icon: CheckCircle2
        }
    ];

    const careTeam = [
        { label: copy.referringDoctor, value: appointment.referring_doctor_name || appointment.referring_doctor || copy.selfReferred },
        { label: copy.nurse, value: appointment.nurse_name || '—' },
        { label: copy.technician, value: appointment.technician_name || '—' },
        { label: copy.radiologist, value: appointment.radiologist_name || '—' }
    ];

    const secondarySummaryCount = Number(showFinancials) + Number(showCareTeam);
    const safetySpanClass = secondarySummaryCount === 0 ? 'col-span-12' : secondarySummaryCount === 1 ? 'col-span-8' : 'col-span-6';
    const secondarySpanClass = !showSafety
        ? (secondarySummaryCount === 1 ? 'col-span-12' : 'col-span-6')
        : (secondarySummaryCount === 1 ? 'col-span-4' : 'col-span-3');

    const handlePrint = () => printWhenReady(window);

    return (
        <div className="print-workspace min-h-screen bg-[radial-gradient(circle_at_top,#e2e8f0_0,#f8fafc_32%,#e2e8f0_100%)] px-2 py-3 dark:bg-[radial-gradient(circle_at_top,#172033_0,#0f172a_45%,#020617_100%)] sm:px-4">
            <header className="print-controls no-print sticky top-3 z-30 mx-auto mb-4 max-w-6xl">
                <div className="rounded-2xl border border-white/80 bg-white/90 p-2.5 shadow-[0_18px_60px_rgba(15,23,42,0.16)] backdrop-blur-xl dark:border-slate-800/90 dark:bg-slate-900/90">
                    <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center xl:justify-between">
                        <div className="flex min-w-0 items-center gap-3">
                            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-slate-950 via-teal-900 to-emerald-700 text-white shadow-lg shadow-teal-900/15">
                                <FileSpreadsheet size={19} />
                            </span>
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-1.5">
                                    <h2 className="truncate text-sm font-black text-slate-950 dark:text-white">{copy.workspaceTitle}</h2>
                                    <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[9px] font-black text-teal-800 dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-300">
                                        {copy.onePage}
                                    </span>
                                </div>
                                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                                    <span className="max-w-[250px] truncate">{appointment.patient_name}</span>
                                    <span className="text-slate-300 dark:text-slate-700">•</span>
                                    <span className="font-mono">MRN {appointment.mrn || '—'}</span>
                                    <span className="text-slate-300 dark:text-slate-700">•</span>
                                    <span>{copy.workspaceSubtitle}</span>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                            <div className="flex rounded-xl border border-slate-200 bg-slate-100 p-0.5 dark:border-slate-700 dark:bg-slate-800">
                                {['ar', 'en'].map((lang) => (
                                    <button
                                        key={lang}
                                        type="button"
                                        onClick={() => setSlipLanguage(lang)}
                                        className={cx(
                                            'rounded-[9px] px-2.5 py-1.5 text-[10px] font-black transition',
                                            slipLanguage === lang
                                                ? 'bg-white text-teal-800 shadow-sm dark:bg-slate-950 dark:text-teal-300'
                                                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'
                                        )}
                                    >
                                        {lang === 'ar' ? 'العربية' : 'English'}
                                    </button>
                                ))}
                            </div>

                            <select
                                value={paperSize}
                                onChange={(e) => setPaperSize(e.target.value)}
                                className="h-[31px] rounded-xl border border-slate-200 bg-white px-2.5 text-[10px] font-black text-slate-700 outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                            >
                                <option value="A4">A4 · 210 × 297 mm</option>
                                <option value="A5">A5 · 148 × 210 mm</option>
                            </select>

                            <button
                                type="button"
                                onClick={() => setDigitalEntryMode((value) => !value)}
                                className={cx(
                                    'inline-flex h-[31px] items-center gap-1.5 rounded-xl border px-2.5 text-[10px] font-black transition',
                                    digitalEntryMode
                                        ? 'border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-300'
                                        : 'border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                )}
                                title={digitalEntryMode ? copy.digitalModeHint : copy.manualModeHint}
                            >
                                <Edit3 size={12} />
                                {digitalEntryMode ? copy.digitalModeOpt : copy.manualModeOpt}
                            </button>

                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setShowOptions((value) => !value)}
                                    className="inline-flex h-[31px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 text-[10px] font-black text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                                >
                                    <Layers3 size={12} />
                                    {copy.options}
                                    <ChevronDown size={11} className={cx('transition', showOptions && 'rotate-180')} />
                                </button>

                                {showOptions ? (
                                    <div className="absolute end-0 top-[36px] z-50 w-48 rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl dark:border-slate-700 dark:bg-slate-900">
                                        <ControlToggle checked={showSafety} onChange={(e) => setShowSafety(e.target.checked)} label={copy.showSafetyOpt} />
                                        <ControlToggle checked={showFinancials} onChange={(e) => setShowFinancials(e.target.checked)} label={copy.showFinancialsOpt} />
                                        <ControlToggle checked={showCareTeam} onChange={(e) => setShowCareTeam(e.target.checked)} label={copy.showCareTeamOpt} />
                                    </div>
                                ) : null}
                            </div>

                            <button
                                type="button"
                                onClick={resetEntries}
                                className="inline-flex h-[31px] items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 text-[10px] font-black text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            >
                                <RotateCcw size={12} />
                                <span className="hidden sm:inline">{copy.resetAction}</span>
                            </button>

                            <button
                                type="button"
                                onClick={handlePrint}
                                className="inline-flex h-[31px] items-center gap-1.5 rounded-xl bg-gradient-to-r from-teal-700 to-emerald-600 px-3.5 text-[10px] font-black text-white shadow-lg shadow-teal-700/20 transition hover:-translate-y-px hover:brightness-105 active:translate-y-0"
                            >
                                <Printer size={13} />
                                {copy.printAction}
                            </button>

                            <button
                                type="button"
                                onClick={() => window.close()}
                                className="grid h-[31px] w-[31px] place-items-center rounded-xl border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400"
                                title={copy.closeAction}
                            >
                                <X size={14} />
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            <main className="print-preview-stage flex justify-center overflow-x-auto pb-6">
                <article
                    className="print-document print-sheet relative overflow-hidden rounded-xl border border-slate-300 bg-white font-sans text-[9px] leading-snug text-slate-900 shadow-[0_28px_90px_rgba(15,23,42,0.22)]"
                    style={{
                        ...previewVariables,
                        width: paperDimensions.width,
                        height: paperDimensions.height,
                        direction: isRtl ? 'rtl' : 'ltr',
                        boxSizing: 'border-box'
                    }}
                >
                    <div className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-teal-800 via-cyan-700 to-emerald-700" />
                    <div className="flex h-full flex-col gap-2 p-4 sm:p-[17px]">
                        <header className="shrink-0 border-b border-slate-300 pb-2">
                            <div className="grid grid-cols-[1fr_auto] items-start gap-3">
                                <div className="flex min-w-0 items-center gap-2.5">
                                    {logoUrl ? (
                                        <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                                            <img src={logoUrl} alt={centerName} className="max-h-full max-w-full object-contain" />
                                        </div>
                                    ) : (
                                        <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-slate-950 to-teal-800 text-white shadow-sm">
                                            <Stethoscope size={19} />
                                        </div>
                                    )}

                                    <div className="min-w-0">
                                        <h1 className="truncate text-[14px] font-black leading-tight tracking-tight text-slate-950">{centerName}</h1>
                                        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[7.7px] font-semibold text-slate-500">
                                            {branchName ? <span className="font-black text-teal-800">{branchName}</span> : null}
                                            <span>{copy.centerDepartment}</span>
                                        </div>
                                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[7.3px] font-semibold text-slate-400">
                                            {phone ? <span className="inline-flex items-center gap-0.5" dir="ltr"><Phone size={7.5} />{phone}</span> : null}
                                            {address ? <span className="inline-flex max-w-[330px] items-center gap-0.5 truncate"><MapPin size={7.5} />{address}</span> : null}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex items-start gap-2" dir="ltr">
                                    <div className="text-right">
                                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
                                            <div className="text-[6.8px] font-bold uppercase tracking-[0.08em] text-slate-400">{copy.orderNumber}</div>
                                            <div className="font-mono text-[10px] font-black text-slate-950">{orderRef}</div>
                                        </div>
                                        <div className="mt-1 text-[6.8px] font-semibold text-slate-400">
                                            {copy.generatedAt}: {new Date().toLocaleString(isRtl ? 'ar-EG' : 'en-GB')}
                                        </div>
                                    </div>
                                    <div className="rounded-lg border border-slate-200 bg-white p-1 shadow-sm">
                                        <QRCodeSVG value={qrValue} size={44} level="M" />
                                    </div>
                                </div>
                            </div>

                            <div className="mt-2 flex items-center justify-between gap-3 rounded-lg bg-slate-950 px-2.5 py-1.5 text-white">
                                <div className="min-w-0">
                                    <div className="truncate text-[10.5px] font-black tracking-[0.01em]">{copy.documentTitle}</div>
                                    <div className="truncate text-[6.8px] font-semibold text-slate-300">{copy.documentSubtitle}</div>
                                </div>
                                <div className="flex shrink-0 items-center gap-1.5" dir="ltr">
                                    <StatusPill tone="teal" icon={RadioTower}>{appointment.modality_name || appointment.modality_type || 'Radiology'}</StatusPill>
                                    <StatusPill tone={priorityTone}>{priority}</StatusPill>
                                </div>
                            </div>
                        </header>

                        <section className="shrink-0 space-y-1.5">
                            <SectionEyebrow icon={Contact} title={copy.patientDetails} />
                            <div className="grid grid-cols-4 gap-1.5">
                                <MetaCell label={copy.patientName} value={appointment.patient_name} icon={UserRound} valueClassName="text-[10px]" />
                                <MetaCell label={copy.mrn} value={appointment.mrn} icon={Contact} mono dir="ltr" valueClassName="text-teal-900" />
                                <MetaCell label={copy.ageGender} value={ageGender} icon={UsersRound} />
                                <MetaCell label={copy.phone} value={appointment.phone || '—'} icon={Phone} dir="ltr" />
                            </div>
                        </section>

                        <section className="shrink-0 space-y-1.5">
                            <SectionEyebrow icon={CalendarDays} title={copy.examDetails} />
                            <div className="grid grid-cols-6 gap-1.5">
                                <MetaCell label={copy.examName} value={appointment.exam_type_name || '—'} icon={Stethoscope} valueClassName="text-violet-950" />
                                <MetaCell label={copy.bodyPart} value={appointment.body_part || appointment.exam_type_body_part || '—'} icon={Activity} />
                                <MetaCell label={copy.modalityRoom} value={appointment.machine_name || appointment.modality_type || '—'} icon={RadioTower} />
                                <MetaCell label={copy.date} value={formattedDate} icon={CalendarDays} />
                                <MetaCell label={copy.timeWindow} icon={Clock3}>
                                    <div className="text-[8.8px] font-black text-teal-900" dir="ltr">{formattedTimeWindow}</div>
                                    <div className="mt-0.5 text-[6.8px] font-bold text-slate-400">{durationMinutes} {copy.minutes}</div>
                                </MetaCell>
                                <MetaCell label={copy.contrastStatus} icon={Syringe}>
                                    <StatusPill tone={hasContrast ? 'amber' : 'slate'} icon={hasContrast ? ShieldAlert : CheckCircle2}>
                                        {hasContrast ? copy.contrastRequired : copy.contrastNone}
                                    </StatusPill>
                                </MetaCell>
                            </div>

                            {(appointment.clinical_indication || appointment.is_follow_up || hasContrast) ? (
                                <div className="grid grid-cols-[1fr_auto] gap-1.5">
                                    <div className="min-w-0 rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[7.8px] leading-snug">
                                        <span className="font-black text-slate-500">{copy.clinicalIndication}: </span>
                                        <span className="font-bold text-slate-900">{appointment.clinical_indication || copy.unknown}</span>
                                    </div>
                                    <div className="flex items-center gap-1">
                                        {appointment.is_follow_up ? (
                                            <StatusPill tone="sky" icon={RotateCcw}>
                                                {copy.followUpNote} {appointment.prior_order_number || appointment.prior_exam_id || '—'}
                                            </StatusPill>
                                        ) : null}
                                        {hasContrast ? (
                                            <StatusPill tone="amber" icon={AlertTriangle}>{copy.contrastWarning}</StatusPill>
                                        ) : null}
                                    </div>
                                </div>
                            ) : null}
                        </section>

                        {(showSafety || showFinancials || showCareTeam) ? (
                            <section className="shrink-0 grid grid-cols-12 gap-1.5">
                                {showSafety ? (
                                    <div className={cx('rounded-lg border border-slate-200 bg-slate-50/70 p-1.5', safetySpanClass)}>
                                        <div className="mb-1 flex items-center gap-1 text-[7.8px] font-black text-slate-700">
                                            <ShieldCheck size={9.5} className="text-teal-700" />
                                            {copy.safetyDetails}
                                        </div>
                                        <div className="grid grid-cols-4 gap-1">
                                            {safetyItems.map((item) => (
                                                <div key={item.label} className="rounded border border-slate-200 bg-white px-1.5 py-1">
                                                    <div className="flex items-center gap-0.5 text-[6.5px] font-bold text-slate-400">
                                                        <item.icon size={7.5} />
                                                        <span className="truncate">{item.label}</span>
                                                    </div>
                                                    <div className="mt-0.5 truncate text-[7.5px] font-black text-slate-800" title={String(item.value)}>{item.value}</div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}

                                {showFinancials ? (
                                    <div className={cx('rounded-lg border border-slate-200 bg-slate-50/70 p-1.5', secondarySpanClass)}>
                                        <div className="mb-1 flex items-center gap-1 text-[7.8px] font-black text-slate-700">
                                            <CreditCard size={9.5} className="text-emerald-700" />
                                            {copy.financialDetails}
                                        </div>
                                        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[7px]">
                                            <span className="text-slate-400">{copy.paymentMethod}</span>
                                            <span className="truncate text-end font-black text-slate-800">{appointment.payment_method || 'Cash'}</span>
                                            <span className="text-slate-400">{copy.amount}</span>
                                            <span className="text-end font-black text-emerald-800" dir="ltr">
                                                {appointment.payment_amount != null ? `${Number(appointment.payment_amount).toLocaleString()} ${copy.egp}` : '—'}
                                            </span>
                                            {appointment.insurance_provider ? <>
                                                <span className="text-slate-400">{copy.insuranceProvider}</span>
                                                <span className="truncate text-end font-black text-slate-800">{appointment.insurance_provider}</span>
                                            </> : null}
                                        </div>
                                    </div>
                                ) : null}

                                {showCareTeam ? (
                                    <div className={cx('rounded-lg border border-slate-200 bg-slate-50/70 p-1.5', secondarySpanClass)}>
                                        <div className="mb-1 flex items-center gap-1 text-[7.8px] font-black text-slate-700">
                                            <UsersRound size={9.5} className="text-violet-700" />
                                            {copy.careTeam}
                                        </div>
                                        <div className="space-y-0.5">
                                            {careTeam.map((member) => (
                                                <div key={member.label} className="grid grid-cols-[auto_1fr] items-center gap-1 text-[6.8px]">
                                                    <span className="text-slate-400">{member.label}</span>
                                                    <span className="truncate text-end font-black text-slate-800" title={member.value}>{member.value}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ) : null}
                            </section>
                        ) : null}

                        <section className="flex min-h-0 flex-1 flex-col gap-1.5">
                            <SectionEyebrow icon={FileCheck2} title={copy.handoverSections} hint={copy.handoverHint} />

                            <div className="grid min-h-0 flex-1 grid-cols-2 gap-1.5">
                                <StationCard
                                    number="01"
                                    title={copy.receptionStation}
                                    tag={copy.receptionTag}
                                    icon={UserRound}
                                    tone="teal"
                                    meta={`${copy.arrivalTime}: .... : ....`}
                                    signOff={<SignOff label={copy.receivedBy} person={appointment.created_by_name} signatureLabel={copy.signature} />}
                                >
                                    <div className="mb-1 rounded-md border border-teal-100 bg-teal-50/60 px-1.5 py-1 text-[7.4px] font-bold text-teal-950">
                                        {copy.receptionChecklist}
                                    </div>
                                    <div className="text-[7px] font-black uppercase tracking-[0.04em] text-slate-400">{copy.notesLabel}</div>
                                    <div className="mt-1">
                                        {digitalEntryMode ? (
                                            <TextArea
                                                value={receptionCustomNotes}
                                                onChange={(e) => setReceptionCustomNotes(e.target.value)}
                                                placeholder={isRtl ? 'اكتب ملاحظات الاستقبال والتوجيه...' : 'Enter reception and routing notes...'}
                                                tone="teal"
                                            />
                                        ) : (
                                            <WritingLines value={receptionCustomNotes || appointment.notes || ''} lines={3} />
                                        )}
                                    </div>
                                </StationCard>

                                <StationCard
                                    number="02"
                                    title={copy.nursingStation}
                                    tag={copy.nursingTag}
                                    icon={HeartPulse}
                                    tone="rose"
                                    meta={`${copy.prepStatus}: ${appointment.preparation_status || copy.notRequired}`}
                                    signOff={<SignOff label={copy.staffNurse} person={appointment.nurse_name} signatureLabel={copy.signature} />}
                                >
                                    <div className="mb-1 rounded-md border border-rose-100 bg-rose-50/60 px-1.5 py-1">
                                        <div className="mb-1 text-[6.8px] font-black uppercase tracking-[0.05em] text-rose-800">{copy.vitals}</div>
                                        {digitalEntryMode ? (
                                            <div className="grid grid-cols-5 gap-1" dir="ltr">
                                                {[
                                                    ['bp', copy.bp, '120/80'],
                                                    ['hr', copy.hr, '75'],
                                                    ['rbs', copy.rbs, '110'],
                                                    ['wt', copy.wt, '70'],
                                                    ['temp', copy.temp, '37']
                                                ].map(([key, label, placeholder]) => (
                                                    <label key={key} className="text-[6.5px] font-bold text-slate-500">
                                                        <span>{label}</span>
                                                        <FieldInput
                                                            value={nursingVitals[key]}
                                                            onChange={(e) => setNursingVitals((current) => ({ ...current, [key]: e.target.value }))}
                                                            placeholder={placeholder}
                                                            className="mt-0.5 px-1 py-0.5 text-[7px]"
                                                        />
                                                    </label>
                                                ))}
                                            </div>
                                        ) : (
                                            <div className="text-[7.4px] font-bold text-slate-800" dir="ltr">
                                                BP: {nursingVitals.bp || '....../......'} | HR: {nursingVitals.hr || '......'} | RBS: {nursingVitals.rbs || '......'} | Wt: {nursingVitals.wt || '......'} | Temp: {nursingVitals.temp || '......'}
                                            </div>
                                        )}
                                    </div>
                                    <div className="mb-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-1 text-[7.2px] font-bold text-slate-800">
                                        {copy.nursingChecklist}
                                    </div>
                                    {digitalEntryMode ? (
                                        <TextArea
                                            value={nursingCustomNotes}
                                            onChange={(e) => setNursingCustomNotes(e.target.value)}
                                            placeholder={isRtl ? 'ملاحظات التمريض والتحضير...' : 'Nursing and preparation notes...'}
                                            tone="rose"
                                        />
                                    ) : (
                                        <WritingLines value={nursingCustomNotes} lines={2} />
                                    )}
                                </StationCard>

                                <StationCard
                                    number="03"
                                    title={copy.technicianStation}
                                    tag={copy.technicianTag}
                                    icon={RadioTower}
                                    tone="violet"
                                    meta={`${copy.roomLabel}: ${appointment.machine_name || appointment.modality_type || '—'}`}
                                    signOff={<SignOff label={copy.radiographer} person={appointment.technician_name} signatureLabel={copy.signature} />}
                                >
                                    <div className="mb-1 rounded-md border border-violet-100 bg-violet-50/60 px-1.5 py-1">
                                        <div className="mb-0.5 text-[6.8px] font-black uppercase tracking-[0.05em] text-violet-800">{copy.protocolLabel}</div>
                                        {digitalEntryMode ? (
                                            <FieldInput
                                                value={techCustomProtocol}
                                                onChange={(e) => setTechCustomProtocol(e.target.value)}
                                                placeholder={isRtl ? 'Protocol / KV / mAs / Series' : 'Protocol / KV / mAs / Series'}
                                            />
                                        ) : (
                                            <div className="text-[7.2px] font-bold text-slate-800" dir="ltr">{techCustomProtocol || copy.techChecklist}</div>
                                        )}
                                    </div>
                                    <div className={cx(
                                        'mb-1 rounded-md border px-1.5 py-1 text-[7px] font-bold',
                                        hasContrast
                                            ? 'border-amber-200 bg-amber-50 text-amber-950'
                                            : 'border-slate-200 bg-slate-50 text-slate-700'
                                    )}>
                                        {copy.contrastInjection}
                                    </div>
                                    {digitalEntryMode ? (
                                        <TextArea
                                            value={techCustomNotes}
                                            onChange={(e) => setTechCustomNotes(e.target.value)}
                                            placeholder={isRtl ? 'ملاحظات الفني وسلامة التصوير...' : 'Technologist notes and imaging safety...'}
                                            tone="violet"
                                        />
                                    ) : (
                                        <WritingLines value={techCustomNotes} lines={2} />
                                    )}
                                </StationCard>

                                <StationCard
                                    number="04"
                                    title={copy.radiologistStation}
                                    tag={copy.radiologistTag}
                                    icon={Stethoscope}
                                    tone="cyan"
                                    meta={copy.clinicalReview}
                                    signOff={<SignOff label={copy.consultant} person={appointment.radiologist_name} signatureLabel={copy.signature} />}
                                >
                                    <div className="mb-1 rounded-md border border-cyan-100 bg-cyan-50/60 px-1.5 py-1 text-[7.3px] font-bold text-cyan-950">
                                        {copy.radChecklist}
                                    </div>
                                    <div className="mb-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-1 text-[7px] font-bold text-slate-800">
                                        {copy.criticalFindingAlert}
                                    </div>
                                    <div className="mb-0.5 text-[6.8px] font-black uppercase tracking-[0.05em] text-slate-400">{copy.preliminaryImpression}</div>
                                    {digitalEntryMode ? (
                                        <TextArea
                                            value={radCustomImpression}
                                            onChange={(e) => setRadCustomImpression(e.target.value)}
                                            placeholder={isRtl ? 'اكتب الانطباع المبدئي والتوصيات...' : 'Enter preliminary impression and recommendations...'}
                                            tone="cyan"
                                        />
                                    ) : (
                                        <WritingLines value={radCustomImpression} lines={2} />
                                    )}
                                </StationCard>
                            </div>
                        </section>

                        <footer className="shrink-0 border-t border-slate-300 pt-1.5 text-[6.8px] text-slate-400">
                            <div className="flex items-end justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="truncate font-bold text-slate-600">
                                        {centerName}{branchName ? ` · ${branchName}` : ''}{phone ? ` · ${phone}` : ''}
                                    </div>
                                    <div className="mt-0.5 truncate">{copy.footerDisclaimer}</div>
                                </div>
                                <div className="shrink-0 text-end font-mono font-bold" dir="ltr">
                                    <div>{copy.pageLabel}</div>
                                    <div>{copy.systemName} · {orderRef}</div>
                                </div>
                            </div>
                        </footer>
                    </div>
                </article>
            </main>
        </div>
    );
};

export default PrintBookingSlip;
