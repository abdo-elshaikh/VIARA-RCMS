import React, { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { QRCodeSVG } from 'qrcode.react';
import {
    Activity,
    AlertTriangle,
    CalendarDays,
    CheckCircle2,
    Clock3,
    CreditCard,
    Edit3,
    FileCheck2,
    FileSpreadsheet,
    HeartPulse,
    Contact,
    Loader2,
    MapPin,
    Phone,
    RadioTower,
    RotateCcw,
    ShieldAlert,
    ShieldCheck,
    Stethoscope,
    Syringe,
    UserRound,
    UsersRound
} from 'lucide-react';
import { useGetAppointmentByIdQuery, useGetCenterSettingsQuery } from '../../store/api';
import { normalizeCenterSettings, resolveDocumentIdentity } from '../../utils/centerSettings';
import { getSheetPreviewVariables, printWhenReady } from '../../utils/printDocument';
import {
    PRINT_ACCENTS,
    PRINT_FONTS,
    buildPrintStyles,
    getDocScaleClasses,
    getPageDimensions,
    getFontStack,
    printCopy,
    printOptionLabels,
    resolvePageRule,
} from './printTheme';
import { PrintSidebar, PrintStage, PrintField, PrintSection, PrintSegmented, PrintSelectField, PrintToggle } from './PrintControls';
import { DocMetaCell, DocPill, DocWritingLines } from './PrintDocument';
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
    <div
        className="pd-section-head"
        style={{ borderBottom: '1px solid var(--pd-line)', paddingBottom: '0.25rem' }}
    >
        <div className="flex min-w-0 items-center gap-1.5">
            <span
                className="grid h-[1.35rem] w-[1.35rem] shrink-0 place-items-center rounded-md text-white"
                style={{ background: 'var(--print-accent)' }}
            >
                <Icon size={11} strokeWidth={2.4} />
            </span>
            <h3 className="pd-label truncate font-black text-slate-950">{title}</h3>
        </div>
        {hint ? <span className="pd-micro hidden font-semibold text-slate-400 sm:block">{hint}</span> : null}
    </div>
);

const SignOff = ({ label, person, signatureLabel }) => (
    <div className="mt-1.5 grid grid-cols-[1fr_auto] items-end gap-2 border-t border-slate-200 pt-1 pd-micro text-slate-500">
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
        <section className="pd-card flex min-h-0 flex-col bg-white p-2 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className={cx('mb-1.5 flex items-center justify-between gap-2 rounded-md border px-1.5 py-1', palette.ring, palette.bg)}>
                <div className="flex min-w-0 items-center gap-1.5">
                    <span className={cx('grid h-5 w-5 shrink-0 place-items-center rounded-md pd-micro font-black', palette.badge)}>{number}</span>
                    <Icon size={12} className={cx('shrink-0', palette.text)} strokeWidth={2.4} />
                    <div className="min-w-0">
                        <div className={cx('pd-body truncate font-black leading-tight', palette.text)}>{title}</div>
                        <div className="pd-micro font-bold uppercase text-slate-400" style={{ letterSpacing: '0.09em' }}>{tag}</div>
                    </div>
                </div>
                {meta ? <span className="pd-micro max-w-[42%] truncate font-bold text-slate-500">{meta}</span> : null}
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
            'w-full rounded border border-slate-200 bg-white px-1.5 py-1 pd-micro font-semibold text-slate-900 outline-none transition',
            className
        )}
        style={{ borderColor: 'var(--pd-line)' }}
    />
);

const TextArea = ({ value, onChange, placeholder }) => (
    <textarea
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        rows={2}
        className="w-full resize-none rounded-md border bg-white px-1.5 py-1 pd-micro font-semibold leading-[1.35] text-slate-900 outline-none transition"
        style={{ borderColor: 'var(--pd-line)' }}
    />
);

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
    const [themeColor, setThemeColor] = useState('#087F5B');
    const [fontFamily, setFontFamily] = useState('Inter');

    const [receptionCustomNotes, setReceptionCustomNotes] = useState('');
    const [nursingVitals, setNursingVitals] = useState({ bp: '', hr: '', rbs: '', wt: '', temp: '' });
    const [nursingCustomNotes, setNursingCustomNotes] = useState('');
    const [techCustomProtocol, setTechCustomProtocol] = useState('');
    const [techCustomNotes, setTechCustomNotes] = useState('');
    const [radCustomImpression, setRadCustomImpression] = useState('');

    const isRtl = slipLanguage === 'ar';
    const copy = COPY[slipLanguage] || COPY.ar;
    const isArabic = i18n.language.startsWith('ar');
    const ui = printCopy(isArabic);

    const centerSettings = normalizeCenterSettings(settings);

    useEffect(() => {
        const requestedLanguage = searchParams.get('lang');
        if (requestedLanguage === 'ar' || requestedLanguage === 'en') {
            setSlipLanguage(requestedLanguage);
        } else if (i18n?.language?.startsWith('en')) {
            setSlipLanguage('en');
        }
    }, [i18n?.language, searchParams]);

    useEffect(() => {
        if (settings) {
            const ps = normalizeCenterSettings(settings).print_settings;
            if (ps?.themeColor) setThemeColor(ps.themeColor);
            if (ps?.fontFamily) setFontFamily(ps.fontFamily);
        }
    }, [settings]);

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
    const priorityTone = priority === 'Emergency' ? 'danger' : priority === 'Urgent' ? 'warn' : 'info';

    const paperDimensions = getPageDimensions(paperSize, 'portrait');
    const previewVariables = getSheetPreviewVariables(paperDimensions);
    const fontStack = getFontStack(fontFamily);

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
        <div dir={isArabic ? 'rtl' : 'ltr'} className="print-workspace min-h-screen bg-slate-100 flex flex-col lg:flex-row print:block print:bg-white" style={{ '--print-accent': themeColor }}>
            <style>{buildPrintStyles({ pageRule: resolvePageRule({ size: paperSize, orientation: 'portrait' }) })}</style>

            <PrintSidebar
                title={ui.customize}
                subtitle={copy.workspaceSubtitle}
                onPrint={handlePrint}
                printLabel={copy.printAction}
                onSave={resetEntries}
                saveLabel={copy.resetAction}
                saveIcon={RotateCcw}
                onClose={() => window.close()}
                closeLabel={copy.closeAction}
            >
                <PrintField label={ui.docLanguage}>
                    <PrintSegmented
                        options={[
                            { value: 'ar', label: 'العربية' },
                            { value: 'en', label: 'English' },
                        ]}
                        value={slipLanguage}
                        onChange={setSlipLanguage}
                        columns={2}
                        ariaLabel={ui.docLanguage}
                    />
                </PrintField>

                <PrintField label={ui.paper}>
                    <PrintSegmented
                        options={printOptionLabels([
                            { value: 'A4', en: 'A4 · 210 × 297 mm', ar: 'A4 · 210 × 297 مم' },
                            { value: 'A5', en: 'A5 · 148 × 210 mm', ar: 'A5 · 148 × 210 مم' },
                        ], isArabic)}
                        value={paperSize}
                        onChange={setPaperSize}
                        columns={1}
                        ariaLabel={ui.paper}
                    />
                </PrintField>

                <PrintSelectField
                    label={ui.accent}
                    value={themeColor}
                    onChange={setThemeColor}
                    options={printOptionLabels(PRINT_ACCENTS, isArabic)}
                />

                <PrintSelectField
                    label={ui.typography}
                    value={fontFamily}
                    onChange={setFontFamily}
                    options={printOptionLabels(PRINT_FONTS, isArabic)}
                />

                <PrintField label={ui.options}>
                    <PrintSegmented
                        options={[
                            { value: 'manual', label: copy.manualModeOpt, icon: Edit3, title: copy.manualModeHint },
                            { value: 'digital', label: copy.digitalModeOpt, icon: FileSpreadsheet, title: copy.digitalModeHint },
                        ]}
                        value={digitalEntryMode ? 'digital' : 'manual'}
                        onChange={(mode) => setDigitalEntryMode(mode === 'digital')}
                        columns={2}
                        ariaLabel={ui.options}
                    />
                </PrintField>

                <PrintSection title={ui.sections}>
                    <PrintToggle checked={showSafety} onChange={setShowSafety} label={copy.showSafetyOpt} />
                    <PrintToggle checked={showFinancials} onChange={setShowFinancials} label={copy.showFinancialsOpt} />
                    <PrintToggle checked={showCareTeam} onChange={setShowCareTeam} label={copy.showCareTeamOpt} />
                </PrintSection>
            </PrintSidebar>

            <PrintStage>
                <article
                    dir={isRtl ? 'rtl' : 'ltr'}
                    className={cx(getDocScaleClasses({ sheet: false }), 'print-document print-sheet booking-slip-container relative flex flex-col overflow-hidden rounded-xl border border-slate-300 bg-white shadow-[0_28px_90px_rgba(15,23,42,0.22)]')}
                    style={{
                        ...previewVariables,
                        width: paperDimensions.width,
                        height: paperDimensions.height,
                        padding: 'calc(var(--pd-pad) * 1.15)',
                        gap: 'calc(var(--pd-gap) * 0.9)',
                        direction: isRtl ? 'rtl' : 'ltr',
                        boxSizing: 'border-box',
                        fontFamily: fontStack,
                        color: 'var(--pd-ink)'
                    }}
                >
                    <span className="pd-accent-edge" aria-hidden="true" />

                    <header className="print-keep-together shrink-0 pb-2" style={{ borderBottom: '1px solid var(--pd-line-strong)' }}>
                        <div className="grid grid-cols-[1fr_auto] items-start gap-3">
                            <div className="flex min-w-0 items-center gap-2.5">
                                {logoUrl ? (
                                    <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                                        <img src={logoUrl} alt={centerName} className="max-h-full max-w-full object-contain" />
                                    </div>
                                ) : (
                                    <div
                                        className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-white shadow-sm"
                                        style={{ background: 'var(--print-accent)' }}
                                    >
                                        <Stethoscope size={19} />
                                    </div>
                                )}

                                <div className="min-w-0">
                                    <h1 className="pd-title truncate font-black leading-tight tracking-tight">{centerName}</h1>
                                    <div className="pd-micro mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-semibold text-slate-500">
                                        {branchName ? <span className="pd-kicker">{branchName}</span> : null}
                                        <span>{copy.centerDepartment}</span>
                                    </div>
                                    <div className="pd-micro mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 font-semibold text-slate-400">
                                        {phone ? <span className="inline-flex items-center gap-0.5" dir="ltr"><Phone size={7.5} />{phone}</span> : null}
                                        {address ? <span className="inline-flex max-w-[330px] items-center gap-0.5 truncate"><MapPin size={7.5} />{address}</span> : null}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-start gap-2" dir="ltr">
                                <div className="text-right">
                                    <div className="pd-card bg-slate-50 px-2 py-1" style={{ borderRadius: 'calc(var(--pd-radius) * 0.8)' }}>
                                        <div className="pd-micro font-bold uppercase text-slate-400" style={{ letterSpacing: '0.08em' }}>{copy.orderNumber}</div>
                                        <div className="pd-value font-mono font-black text-slate-950">{orderRef}</div>
                                    </div>
                                    <div className="pd-micro mt-1 font-semibold text-slate-400">
                                        {copy.generatedAt}: {new Date().toLocaleString(isRtl ? 'ar-EG' : 'en-GB')}
                                    </div>
                                </div>
                                <div className="pd-card rounded-lg bg-white p-1 shadow-sm">
                                    <QRCodeSVG value={qrValue} size={44} level="M" />
                                </div>
                            </div>
                        </div>

                        <div
                            className="mt-2 flex items-center justify-between gap-3 rounded-lg px-2.5 py-1.5 text-white"
                            style={{ background: `linear-gradient(90deg, var(--print-accent), color-mix(in srgb, var(--print-accent) 55%, #134e4a))` }}
                        >
                            <div className="min-w-0">
                                <div className="pd-value truncate font-black leading-snug">{copy.documentTitle}</div>
                                <div className="pd-micro truncate font-semibold opacity-80">{copy.documentSubtitle}</div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5" dir="ltr">
                                <span
                                    className="pd-pill"
                                    style={{ borderColor: 'rgba(255,255,255,0.45)', background: 'rgba(255,255,255,0.15)', color: '#fff' }}
                                >
                                    {appointment.modality_name || appointment.modality_type || 'Radiology'}
                                </span>
                                <DocPill tone={priorityTone}>{priority}</DocPill>
                            </div>
                        </div>
                    </header>

                    <section className="print-keep-together shrink-0">
                        <SectionEyebrow icon={Contact} title={copy.patientDetails} />
                        <div className="grid grid-cols-4 gap-1.5">
                            <DocMetaCell label={copy.patientName} value={appointment.patient_name} icon={UserRound} valueSize="title" />
                            <DocMetaCell label={copy.mrn} value={appointment.mrn} icon={Contact} mono dir="ltr" />
                            <DocMetaCell label={copy.ageGender} value={ageGender} icon={UsersRound} />
                            <DocMetaCell label={copy.phone} value={appointment.phone || '—'} icon={Phone} dir="ltr" />
                        </div>
                    </section>

                    <section className="print-keep-together shrink-0">
                        <SectionEyebrow icon={CalendarDays} title={copy.examDetails} />
                        <div className="grid grid-cols-6 gap-1.5">
                            <DocMetaCell label={copy.examName} value={appointment.exam_type_name || '—'} icon={Stethoscope} wrap />
                            <DocMetaCell label={copy.bodyPart} value={appointment.body_part || appointment.exam_type_body_part || '—'} icon={Activity} wrap />
                            <DocMetaCell label={copy.modalityRoom} value={appointment.machine_name || appointment.modality_type || '—'} icon={RadioTower} wrap />
                            <DocMetaCell label={copy.date} value={formattedDate} icon={CalendarDays} />
                            <DocMetaCell label={copy.timeWindow} icon={Clock3}>
                                <div className="pd-meta-value pd-body font-black" dir="ltr">{formattedTimeWindow}</div>
                                <div className="pd-micro mt-0.5 font-bold text-slate-400">{durationMinutes} {copy.minutes}</div>
                            </DocMetaCell>
                            <DocMetaCell label={copy.contrastStatus} icon={Syringe}>
                                <div className="mt-0.5">
                                    <DocPill tone={hasContrast ? 'warn' : 'neutral'} icon={hasContrast ? ShieldAlert : CheckCircle2}>
                                        {hasContrast ? copy.contrastRequired : copy.contrastNone}
                                    </DocPill>
                                </div>
                            </DocMetaCell>
                        </div>

                        {(appointment.clinical_indication || appointment.is_follow_up || hasContrast) ? (
                            <div className="mt-1.5 grid grid-cols-[1fr_auto] gap-1.5">
                                <div className="pd-card pd-micro min-w-0 bg-slate-50 px-2 py-1 leading-snug">
                                    <span className="font-black text-slate-500">{copy.clinicalIndication}: </span>
                                    <span className="font-bold text-slate-900">{appointment.clinical_indication || copy.unknown}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    {appointment.is_follow_up ? (
                                        <DocPill tone="info" icon={RotateCcw}>
                                            {copy.followUpNote} {appointment.prior_order_number || appointment.prior_exam_id || '—'}
                                        </DocPill>
                                    ) : null}
                                    {hasContrast ? (
                                        <DocPill tone="warn" icon={AlertTriangle}>{copy.contrastWarning}</DocPill>
                                    ) : null}
                                </div>
                            </div>
                        ) : null}
                    </section>

                    {(showSafety || showFinancials || showCareTeam) ? (
                        <section className="print-keep-together shrink-0 grid grid-cols-12 gap-1.5">
                            {showSafety ? (
                                <div className={cx('pd-card pd-soft rounded-lg p-1.5', safetySpanClass)}>
                                    <div className="mb-1 flex items-center gap-1 pd-micro font-black text-slate-700">
                                        <ShieldCheck size={9.5} style={{ color: 'var(--print-accent)' }} />
                                        {copy.safetyDetails}
                                    </div>
                                    <div className="grid grid-cols-4 gap-1">
                                        {safetyItems.map((item) => (
                                            <div key={item.label} className="rounded border border-slate-200 bg-white px-1.5 py-1">
                                                <div className="pd-micro flex items-center gap-0.5 font-bold text-slate-400">
                                                    <item.icon size={7.5} />
                                                    <span className="truncate">{item.label}</span>
                                                </div>
                                                <div className="pd-micro mt-0.5 truncate font-black text-slate-800" title={String(item.value)}>{item.value}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : null}

                            {showFinancials ? (
                                <div className={cx('pd-card pd-soft rounded-lg p-1.5', secondarySpanClass)}>
                                    <div className="mb-1 flex items-center gap-1 pd-micro font-black text-slate-700">
                                        <CreditCard size={9.5} className="text-emerald-700" />
                                        {copy.financialDetails}
                                    </div>
                                    <div className="pd-micro grid grid-cols-2 gap-x-2 gap-y-0.5">
                                        <span className="text-slate-400">{copy.paymentMethod}</span>
                                        <span className="truncate text-end font-black text-slate-800">{appointment.payment_method || 'Cash'}</span>
                                        <span className="text-slate-400">{copy.amount}</span>
                                        <span className="text-end font-black text-emerald-800" dir="ltr">
                                            {appointment.payment_amount != null ? `${Number(appointment.payment_amount).toLocaleString()} ${copy.egp}` : '—'}
                                        </span>
                                        {appointment.insurance_provider ? <>
                                            <span className="text-slate-400">{copy.insuranceProvider}</span>
                                            <span className="truncate text-end font-black text-slate-800">{appointment.insurance_provider}</span>
                                            {appointment.insurance_approval_number ? <>
                                                <span className="text-slate-400">{copy.approvalNumber}</span>
                                                <span className="truncate text-end font-black font-mono text-slate-800" dir="ltr">{appointment.insurance_approval_number}</span>
                                            </> : null}
                                        </> : null}
                                    </div>
                                </div>
                            ) : null}

                            {showCareTeam ? (
                                <div className={cx('pd-card pd-soft rounded-lg p-1.5', secondarySpanClass)}>
                                    <div className="mb-1 flex items-center gap-1 pd-micro font-black text-slate-700">
                                        <UsersRound size={9.5} className="text-violet-700" />
                                        {copy.careTeam}
                                    </div>
                                    <div className="space-y-0.5">
                                        {careTeam.map((member) => (
                                            <div key={member.label} className="pd-micro grid grid-cols-[auto_1fr] items-center gap-1">
                                                <span className="text-slate-400">{member.label}</span>
                                                <span className="truncate text-end font-black text-slate-800" title={member.value}>{member.value}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            ) : null}
                        </section>
                    ) : null}

                    <section className="flex min-h-0 flex-1 flex-col">
                        <SectionEyebrow icon={FileCheck2} title={copy.handoverSections} hint={copy.handoverHint} />

                        <div className="grid min-h-0 flex-1 grid-cols-2 gap-1.5 pt-1.5">
                            <StationCard
                                number="01"
                                title={copy.receptionStation}
                                tag={copy.receptionTag}
                                icon={UserRound}
                                tone="teal"
                                meta={`${copy.arrivalTime}: .... : ....`}
                                signOff={<SignOff label={copy.receivedBy} person={appointment.created_by_name} signatureLabel={copy.signature} />}
                            >
                                <div className="pd-micro mb-1 rounded-md border border-teal-100 bg-teal-50/60 px-1.5 py-1 font-bold text-teal-950">
                                    {copy.receptionChecklist}
                                </div>
                                <div className="pd-micro font-black uppercase text-slate-400" style={{ letterSpacing: '0.04em' }}>{copy.notesLabel}</div>
                                <div className="mt-1">
                                    {digitalEntryMode ? (
                                        <TextArea
                                            value={receptionCustomNotes}
                                            onChange={(e) => setReceptionCustomNotes(e.target.value)}
                                            placeholder={isRtl ? 'اكتب ملاحظات الاستقبال والتوجيه...' : 'Enter reception and routing notes...'}
                                        />
                                    ) : (
                                        <DocWritingLines value={receptionCustomNotes || appointment.notes || ''} lines={3} />
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
                                <div className="pd-micro mb-1 rounded-md border border-rose-100 bg-rose-50/60 px-1.5 py-1">
                                    <div className="mb-1 font-black uppercase text-rose-800" style={{ letterSpacing: '0.05em' }}>{copy.vitals}</div>
                                    {digitalEntryMode ? (
                                        <div className="grid grid-cols-5 gap-1" dir="ltr">
                                            {[
                                                ['bp', copy.bp, '120/80'],
                                                ['hr', copy.hr, '75'],
                                                ['rbs', copy.rbs, '110'],
                                                ['wt', copy.wt, '70'],
                                                ['temp', copy.temp, '37']
                                            ].map(([key, label, placeholder]) => (
                                                <label key={key} className="font-bold text-slate-500">
                                                    <span>{label}</span>
                                                    <FieldInput
                                                        value={nursingVitals[key]}
                                                        onChange={(e) => setNursingVitals((current) => ({ ...current, [key]: e.target.value }))}
                                                        placeholder={placeholder}
                                                        className="mt-0.5 px-1 py-0.5"
                                                    />
                                                </label>
                                            ))}
                                        </div>
                                    ) : (
                                        <div className="font-bold text-slate-800" dir="ltr">
                                            BP: {nursingVitals.bp || '....../......'} | HR: {nursingVitals.hr || '......'} | RBS: {nursingVitals.rbs || '......'} | Wt: {nursingVitals.wt || '......'} | Temp: {nursingVitals.temp || '......'}
                                        </div>
                                    )}
                                </div>
                                <div className="pd-micro mb-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-1 font-bold text-slate-800">
                                    {copy.nursingChecklist}
                                </div>
                                {digitalEntryMode ? (
                                    <TextArea
                                        value={nursingCustomNotes}
                                        onChange={(e) => setNursingCustomNotes(e.target.value)}
                                        placeholder={isRtl ? 'ملاحظات التمريض والتحضير...' : 'Nursing and preparation notes...'}
                                    />
                                ) : (
                                    <DocWritingLines value={nursingCustomNotes} lines={2} />
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
                                    <div className="pd-micro mb-0.5 font-black uppercase text-violet-800" style={{ letterSpacing: '0.05em' }}>{copy.protocolLabel}</div>
                                    {digitalEntryMode ? (
                                        <FieldInput
                                            value={techCustomProtocol}
                                            onChange={(e) => setTechCustomProtocol(e.target.value)}
                                            placeholder={isRtl ? 'Protocol / KV / mAs / Series' : 'Protocol / KV / mAs / Series'}
                                        />
                                    ) : (
                                        <div className="pd-micro font-bold text-slate-800" dir="ltr">{techCustomProtocol || copy.techChecklist}</div>
                                    )}
                                </div>
                                <div className={cx(
                                    'pd-micro mb-1 rounded-md border px-1.5 py-1 font-bold',
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
                                    />
                                ) : (
                                    <DocWritingLines value={techCustomNotes} lines={2} />
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
                                <div className="pd-micro mb-1 rounded-md border border-cyan-100 bg-cyan-50/60 px-1.5 py-1 font-bold text-cyan-950">
                                    {copy.radChecklist}
                                </div>
                                <div className="pd-micro mb-1 rounded-md border border-slate-200 bg-slate-50 px-1.5 py-1 font-bold text-slate-800">
                                    {copy.criticalFindingAlert}
                                </div>
                                <div className="pd-micro mb-0.5 font-black uppercase text-slate-400" style={{ letterSpacing: '0.05em' }}>{copy.preliminaryImpression}</div>
                                {digitalEntryMode ? (
                                    <TextArea
                                        value={radCustomImpression}
                                        onChange={(e) => setRadCustomImpression(e.target.value)}
                                        placeholder={isRtl ? 'اكتب الانطباع المبدئي والتوصيات...' : 'Enter preliminary impression and recommendations...'}
                                    />
                                ) : (
                                    <DocWritingLines value={radCustomImpression} lines={2} />
                                )}
                            </StationCard>
                        </div>
                    </section>

                    <footer className="pd-micro shrink-0 text-slate-400" style={{ borderTop: '1px solid var(--pd-line-strong)', paddingTop: '0.3rem' }}>
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
                </article>
            </PrintStage>
        </div>
    );
};

export default PrintBookingSlip;
