import React, { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGetAppointmentByIdQuery, useGetCenterSettingsQuery } from '../../store/api';
import { QRCodeSVG } from 'qrcode.react';
import {
    AlignCenter,
    AlignLeft,
    AlignRight,
    Lock,
    Loader2,
} from 'lucide-react';
import LanguageToggle from '../../components/ui/LanguageToggle';
import { buildReceiptFooter, buildReceiptHeader, normalizeCenterSettings, resolveDocumentIdentity } from '../../utils/centerSettings';
import { getPatientPortalLoginUrl } from '../../utils/portalUrls';
import { getSheetPreviewVariables, printWhenReady } from '../../utils/printDocument';
import { useTrialWatermark } from '../../hooks/useTrialWatermark';
import {
    PRINT_ACCENTS,
    PRINT_FONTS,
    getPageDimensions,
    buildPrintStyles,
    printCopy,
    printOptionLabels,
    resolvePageRule,
    getFontStack,
    ROLL_WIDTHS,
    formatMoney,
} from './printTheme';
import {
    PrintSidebar,
    PrintStage,
    PrintField,
    PrintSection,
    PrintSegmented,
    PrintSelectField,
    PrintTextInput,
    PrintTextArea,
    PrintToggle,
} from './PrintControls';
import {
    PrintDocument,
    DocIdentityHeader,
    DocSectionHead,
    DocMetaCell,
    DocPill,
    DocTear,
    DocFooter,
} from './PrintDocument';
import '../../styles/printDocuments.css';

// ─── Code 39 Barcode Patterns & Renderer ─────────────────────────────────────
const CODE39_PATTERNS = {
    '0': '000110100', '1': '100100001', '2': '001100001', '3': '101100000',
    '4': '000110001', '5': '100110000', '6': '001110000', '7': '000100101',
    '8': '100100100', '9': '001100100', 'A': '100001001', 'B': '001001001',
    'C': '101001000', 'D': '000011001', 'E': '100011000', 'F': '001011000',
    'G': '000001101', 'H': '100001100', 'I': '001001100', 'J': '000011100',
    'K': '100000011', 'L': '001000011', 'M': '101000010', 'N': '000010011',
    'O': '100010010', 'P': '001010010', 'Q': '000000111', 'R': '100000110',
    'S': '001000110', 'T': '000010110', 'U': '110000001', 'V': '011000001',
    'W': '111000000', 'X': '010010001', 'Y': '110010000', 'Z': '011010000',
    '-': '010000101', '.': '110000100', ' ': '011000100', '$': '010101000',
    '/': '010100010', '+': '010001010', '%': '000101010', '*': '010010100'
};

const renderCode39Elements = (text, barWidth = 1.15, narrowSpace = 1.15, wideMultiplier = 2.4) => {
    const sanitized = `*${String(text || '').toUpperCase().replace(/[^0-9A-Z\-.$/+% ]/g, '')}*`;
    let currentX = 0;
    const bars = [];

    for (let i = 0; i < sanitized.length; i++) {
        const char = sanitized[i];
        const pattern = CODE39_PATTERNS[char] || CODE39_PATTERNS['-'];
        for (let j = 0; j < 9; j++) {
            const isBar = j % 2 === 0;
            const isWide = pattern[j] === '1';
            const width = isWide ? barWidth * wideMultiplier : barWidth;
            if (isBar) {
                bars.push({ x: Number(currentX.toFixed(2)), width: Number(width.toFixed(2)) });
            }
            currentX += width;
        }
        currentX += narrowSpace;
    }

    return { totalWidth: Number(currentX.toFixed(2)), bars };
};

const BarcodeSVG = ({ value, height = 28, className = '' }) => {
    const sanitized = String(value || '').trim();
    if (!sanitized) return null;
    const { totalWidth, bars } = renderCode39Elements(sanitized);

    return (
        <div className={`flex flex-col items-center justify-center ${className}`}>
            <svg
                viewBox={`0 0 ${totalWidth} ${height}`}
                className="w-full max-w-[210px] object-contain"
                style={{ height, shapeRendering: 'crispEdges' }}
                aria-label={`Barcode: ${sanitized}`}
            >
                {bars.map((bar, idx) => (
                    <rect key={idx} x={bar.x} y={0} width={bar.width} height={height} fill="#1e293b" />
                ))}
            </svg>
            <span className="pd-micro mt-0.5 font-mono font-black tracking-widest text-slate-600 ltr-embed">
                *{sanitized}*
            </span>
        </div>
    );
};

// ─── Helpers ─────────────────────────────────────────────────────────────────
const calculateAge = (dobString, isArabic) => {
    if (!dobString) return null;
    const dob = new Date(dobString);
    if (isNaN(dob.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const m = now.getMonth() - dob.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < dob.getDate())) {
        age--;
    }
    if (age <= 0) {
        const months = Math.max(1, Math.floor((now - dob) / (1000 * 60 * 60 * 24 * 30)));
        return isArabic ? `${months} شهر` : `${months} mo`;
    }
    return isArabic ? `${age} سنة` : `${age} yrs`;
};

const getModalityBadgeStyle = (type) => {
    const t = String(type || '').toUpperCase();
    if (t.includes('MRI') || t.includes('MR')) return { bg: 'bg-indigo-50 border-indigo-200 text-indigo-800', label: 'MRI' };
    if (t.includes('CT')) return { bg: 'bg-amber-50 border-amber-200 text-amber-800', label: 'CT' };
    if (t.includes('US') || t.includes('ULTRA') || t.includes('SONO')) return { bg: 'bg-emerald-50 border-emerald-200 text-emerald-800', label: 'US' };
    if (t.includes('X-RAY') || t.includes('XR') || t.includes('RAD') || t.includes('CR') || t.includes('DX')) return { bg: 'bg-sky-50 border-sky-200 text-sky-800', label: 'X-RAY' };
    if (t.includes('MAMMO') || t.includes('MG')) return { bg: 'bg-pink-50 border-pink-200 text-pink-800', label: 'MAMMO' };
    if (t.includes('DEXA') || t.includes('BMD')) return { bg: 'bg-purple-50 border-purple-200 text-purple-800', label: 'DEXA' };
    return { bg: 'bg-slate-100 border-slate-200 text-slate-700', label: type || 'SCAN' };
};

const formatPaymentMethod = (method, isArabic) => {
    const m = String(method || '').trim();
    if (/card|visa|master|pos/i.test(m)) return isArabic ? 'بطاقة بنكية / فيزا (POS)' : 'Card / POS';
    if (/wallet|vodafone|orange|etisalat|we/i.test(m)) return isArabic ? 'محفظة إلكترونية' : 'Digital Wallet';
    if (/bank|transfer|instapay/i.test(m)) return isArabic ? 'تحويل بنكي / انستاباي' : 'Bank Transfer / InstaPay';
    if (/cash/i.test(m)) return isArabic ? 'نقدي (كاش)' : 'Cash';
    if (/insurance/i.test(m)) return isArabic ? 'تأمين طبي' : 'Insurance';
    return m || (isArabic ? 'سداد مباشر' : 'Direct Payment');
};

const formatSignedEgp = (value) => `+${formatMoney(value)} EGP`;
const formatEgp = (value) => `${formatMoney(value)} EGP`;

const sumPayments = (payments) => (Array.isArray(payments) ? payments : [])
    .reduce((acc, p) => acc + Number(p?.amount || 0), 0);

const RECEIPT_EXTRA_COPY = {
    en: {
        customize: 'Receipt print settings',
        docLanguage: 'Receipt language',
        paper: 'Paper and layout',
        theme: 'Accent theme',
        header: 'Header layout',
        headerAlign: 'Header alignment',
        logoMode: 'Logo mode',
        logoFull: 'Full logo',
        logoCompact: 'Compact',
        logoHidden: 'Hidden',
        qrSize: 'QR code size',
        small: 'Small',
        medium: 'Medium',
        large: 'Large',
        waitMessage: 'Wait time message',
        portalAccess: 'Portal access',
        displayPortal: 'Display portal credentials block',
        printPassword: 'Print temporary password',
        temporaryPassword: 'Temporary password',
        passwordPlaceholder: 'Paste one-time portal password',
        includeHeader: 'Include receipt header',
        displayDob: 'Display patient DOB & Age',
        displayExam: 'Display exam details',
        displayDoctor: 'Display referring doctor',
        displayResults: 'Display anticipated results banner',
        displayQr: 'Display access QR code',
        displayBarcode: 'Display order barcode',
        displayPayment: 'Display payment & collection',
        displayPrep: 'Display preparation instructions',
        showWatermark: 'Show PAID watermark stamp',
        displayItems: 'Display invoice line items',
        print: 'Print receipt',
        date: 'Date',
        time: 'Time',
        orderNo: 'Order #',
        patientInfo: 'Patient information',
        mrn: 'MRN',
        dob: 'DOB',
        age: 'Age',
        gender: 'Gender',
        male: 'Male',
        female: 'Female',
        refDoctor: 'Referring doctor',
        selfReferred: 'Self-referred',
        examDetails: 'Examination details',
        scheduled: 'Scheduled',
        anticipatedResults: 'Anticipated results delivery',
        portalCredentials: 'Patient portal access pass',
        loginUrl: 'Portal URL',
        loginId: 'MRN / Login ID',
        issuedSeparately: 'Issued separately',
        scanOrVisit: 'Scan the QR code to view your report and images',
        keepSafe: 'Keep these credentials confidential. Contact reception for assistance.',
        resultWait: 'Your verified report will be ready in approximately 24-48 hours after your scan.',
        radiologyExam: 'Radiology examination',
        receiptBadge: 'Official Medical Receipt',
        patientCopy: 'Patient Copy',
        paymentDetails: 'Payment & Collection',
        amountPaid: 'Amount Paid',
        paymentMethod: 'Payment Method',
        paymentRef: 'Reference #',
        invoiceNumber: 'Invoice #',
        statusPaid: 'PAID IN FULL',
        serviceStation: 'Suite / Room',
        equipment: 'Equipment',
        modality: 'Modality',
        cashier: 'Issued by',
        tearLine: 'Cut along line',
        verifiedDocument: 'Certified Electronic Medical Document · VIARA Health System',
        contrastAlert: 'IV Contrast: Please present recent renal function test and fast 4-6 hours.',
        smsNotification: 'You will receive an SMS / WhatsApp notification when your report is ready.',
        years: 'yrs',
        months: 'mo',
        item: 'Item',
        qty: 'Qty',
        unitPrice: 'Unit',
        lineTotal: 'Total',
        coveredItems: 'Procedures & services covered by this receipt',
        paymentHistory: 'Payment history',
        totalDue: 'Total due',
        balanceDue: 'Remaining balance',
        relatedAppointments: 'Other appointments for this patient today',
        partialPayment: 'Partial payment',
        voided: 'Voided'
    },
    ar: {
        customize: 'إعدادات طباعة الإيصال',
        docLanguage: 'لغة الإيصال',
        paper: 'المقاس والتخطيط',
        theme: 'لون الإيصال',
        header: 'تخطيط الترويسة',
        headerAlign: 'محاذاة الترويسة',
        logoMode: 'عرض الشعار',
        logoFull: 'شعار كامل',
        logoCompact: 'مختصر',
        logoHidden: 'إخفاء',
        qrSize: 'حجم رمز QR',
        small: 'صغير',
        medium: 'متوسط',
        large: 'كبير',
        waitMessage: 'رسالة انتظار النتيجة',
        portalAccess: 'بيانات البوابة',
        displayPortal: 'إظهار بيانات دخول البوابة',
        printPassword: 'طباعة كلمة المرور المؤقتة',
        temporaryPassword: 'كلمة المرور المؤقتة',
        passwordPlaceholder: 'أدخل كلمة المرور المؤقتة',
        includeHeader: 'إظهار ترويسة الإيصال',
        displayDob: 'إظهار تاريخ الميلاد والعمر',
        displayExam: 'إظهار بيانات الفحص',
        displayDoctor: 'إظهار الطبيب المحول',
        displayResults: 'إظهار موعد النتيجة المتوقع',
        displayQr: 'إظهار رمز الدخول QR',
        displayBarcode: 'إظهار باركود الطلب',
        displayPayment: 'إظهار تفاصيل السداد والتحصيل',
        displayPrep: 'إظهار تعليمات التحضير',
        showWatermark: 'إظهار ختم مدفوع بالكامل',
        displayItems: 'إظهار بنود الفاتورة',
        print: 'طباعة الإيصال',
        date: 'التاريخ',
        time: 'الوقت',
        orderNo: 'رقم الطلب',
        patientInfo: 'بيانات المريض',
        mrn: 'رقم الملف',
        dob: 'تاريخ الميلاد',
        age: 'العمر',
        gender: 'الجنس',
        male: 'ذكر',
        female: 'أنثى',
        refDoctor: 'الطبيب المحول',
        selfReferred: 'بدون إحالة (حضور مباشر)',
        examDetails: 'بيانات الفحص والخدمة',
        scheduled: 'الموعد المحدد',
        anticipatedResults: 'موعد صدور التقرير والنتيجة',
        portalCredentials: 'تصريح بوابة المريض الرقمية',
        loginUrl: 'رابط البوابة',
        loginId: 'رقم الملف / اسم الدخول',
        issuedSeparately: 'تم تسليمها منفصلة',
        scanOrVisit: 'امسح رمز QR بكاميرا الهاتف لعرض التقرير وصور الأشعة',
        keepSafe: 'احتفظ بهذه البيانات بسرية تامة. راجع الاستقبال للمساعدة.',
        resultWait: 'سيكون التقرير المعتمد متاحاً خلال 24-48 ساعة تقريباً بعد انتهاء الفحص.',
        radiologyExam: 'فحص أشعة تشخيصية',
        receiptBadge: 'إيصال استلام وسداد معتمد',
        patientCopy: 'نسخة المريض',
        paymentDetails: 'بيانات التحصيل والسداد',
        amountPaid: 'المبلغ المسدد',
        paymentMethod: 'طريقة الدفع',
        paymentRef: 'المرجع / كود العملية',
        invoiceNumber: 'رقم الفاتورة',
        statusPaid: 'تم السداد بالكامل',
        serviceStation: 'جناح / غرفة الفحص',
        equipment: 'جهاز الفحص',
        modality: 'نوع الفحص',
        cashier: 'المستلم / موظف الاستقبال',
        tearLine: 'خط القص',
        verifiedDocument: 'مستند طبي إلكتروني معتمد · منظومة فيارا للتصوير الطبي',
        contrastAlert: 'فحص يتطلب صبغة وريدية: يلزم إحضار تحليل وظائف كلى والصيام 4-6 ساعات.',
        smsNotification: 'سيصلك إشعار بالرسائل القصيرة / واتساب فور اعتماد التقرير من الطبيب الاستشاري.',
        years: 'سنة',
        months: 'شهر',
        item: 'البند',
        qty: 'الكمية',
        unitPrice: 'سعر الوحدة',
        lineTotal: 'الإجمالي',
        coveredItems: 'الفحوصات والخدمات المشمولة بالإيصال',
        paymentHistory: 'سجل الدفعات والتحصيل',
        totalDue: 'إجمالي المستحق',
        balanceDue: 'الرصيد المتبقي',
        relatedAppointments: 'مواعيد وفحوصات أخرى للمريض اليوم',
        partialPayment: 'سداد جزئي',
        voided: 'ملغاة'
    }
};

const DENSITY_CLASS = {
    compact: 'compact',
    normal: 'normal',
    cozy: 'cozy'
};

const getReceiptLanguage = (mode, isArabic) => {
    if (mode === 'auto') return isArabic ? 'ar' : 'en';
    return mode;
};

const receiptLabel = (mode, key) => {
    if (mode === 'both') return `${RECEIPT_EXTRA_COPY.en[key]} / ${RECEIPT_EXTRA_COPY.ar[key]}`;
    return RECEIPT_EXTRA_COPY[mode]?.[key] || RECEIPT_EXTRA_COPY.en[key] || key;
};

const receiptLocale = (mode, fallbackLanguage) => {
    if (mode === 'ar') return 'ar-EG';
    if (mode === 'en') return 'en-GB';
    return fallbackLanguage;
};

const PrintReceipt = () => {
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    const { t, i18n } = useTranslation('common');
    const { data: appointment, isLoading: apptLoading, isError: apptError } = useGetAppointmentByIdQuery(id);
    const { data: settings, isLoading: settingsLoading } = useGetCenterSettingsQuery();

    const [paperSize, setPaperSize] = useState('80mm');
    const [customPaperWidth, setCustomPaperWidth] = useState('80mm');
    const [orientation, setOrientation] = useState('portrait');
    const [receiptLanguage, setReceiptLanguage] = useState('auto');
    const [density, setDensity] = useState('normal');
    const [headerAlign, setHeaderAlign] = useState('center');
    const [logoMode, setLogoMode] = useState('full');
    const [showQR, setShowQR] = useState(true);
    const [showBarcode, setShowBarcode] = useState(true);
    const [showHeader, setShowHeader] = useState(true);
    const [showAnticipatedResults, setShowAnticipatedResults] = useState(true);
    const [showPortalAccess, setShowPortalAccess] = useState(true);
    const [showPortalPassword, setShowPortalPassword] = useState(Boolean(searchParams.get('portalPassword') || searchParams.get('password')));
    const [portalPassword, setPortalPassword] = useState(() => searchParams.get('portalPassword') || searchParams.get('password') || '');
    const [showPaymentDetails, setShowPaymentDetails] = useState(true);
    const [showPreparationAlert, setShowPreparationAlert] = useState(true);
    const [showWatermark, setShowWatermark] = useState(false);
    const [showItems, setShowItems] = useState(true);
    const appliedPrintDefaults = useRef(false);
    const trialWatermark = useTrialWatermark();

    const [themeColor, setThemeColor] = useState('#087F5B');
    const [fontFamily, setFontFamily] = useState('Inter');
    const [showDob, setShowDob] = useState(true);
    const [showModality, setShowModality] = useState(true);
    const [showRefDoctor, setShowRefDoctor] = useState(true);
    const [qrSize, setQrSize] = useState(105);
    const [anticipatedText, setAnticipatedText] = useState('');

    const isArabic = i18n.language.startsWith('ar');
    const copy = { ...printCopy(isArabic), ...(isArabic ? RECEIPT_EXTRA_COPY.ar : RECEIPT_EXTRA_COPY.en) };
    const activeReceiptLanguage = getReceiptLanguage(receiptLanguage, isArabic);
    const isReceiptArabic = activeReceiptLanguage === 'ar';
    const receiptDirection = isReceiptArabic ? 'rtl' : 'ltr';
    const receiptCopy = RECEIPT_EXTRA_COPY[activeReceiptLanguage === 'both' ? (isArabic ? 'ar' : 'en') : activeReceiptLanguage] || RECEIPT_EXTRA_COPY.en;
    const label = key => receiptLabel(activeReceiptLanguage, key);
    const dateLocale = receiptLocale(activeReceiptLanguage, i18n.language);

    const centerSettings = normalizeCenterSettings(settings);

    useEffect(() => {
        if (appliedPrintDefaults.current) return;
        if (centerSettings) {
            appliedPrintDefaults.current = true;
            if (centerSettings.print_settings) {
                const ps = centerSettings.print_settings;
                if (ps.receiptWidth) {
                    if (['80mm', '58mm', 'A4', 'A5'].includes(ps.receiptWidth)) {
                        setPaperSize(ps.receiptWidth);
                    } else {
                        setPaperSize('custom');
                        setCustomPaperWidth(ps.receiptWidth);
                    }
                }
                if (ps.showQR !== undefined) setShowQR(ps.showQR);
                if (ps.themeColor) setThemeColor(ps.themeColor);
                if (ps.fontFamily) setFontFamily(ps.fontFamily);
            }
            setAnticipatedText(t('common.resultsWaitTime', { defaultValue: receiptCopy.resultWait }));
        }
    }, [centerSettings, receiptCopy.resultWait, t]);

    if (apptLoading || settingsLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-slate-400" size={32} /></div>;
    if (apptError || !appointment) return <div className="p-8 text-center font-bold text-red-500">{t('errors.loadFailed', { defaultValue: 'Failed to load details' })}</div>;

    const portalLoginId = appointment.mrn || appointment.patient_mrn || '';
    const portalUrl = portalLoginId
        ? `${getPatientPortalLoginUrl()}?mrn=${encodeURIComponent(portalLoginId)}`
        : getPatientPortalLoginUrl();
    const receiptQrUrl = new URL(portalUrl, window.location.origin);
    if (appointment.order_number) {
        receiptQrUrl.searchParams.set('orderNumber', appointment.order_number);
    }

    const documentIdentity = resolveDocumentIdentity(centerSettings, appointment, { language: activeReceiptLanguage, kind: 'receipt' });
    const headerLines = buildReceiptHeader(documentIdentity).split('\n');
    const footerText = buildReceiptFooter(documentIdentity);

    const pageDimensions = getPageDimensions(paperSize, orientation, customPaperWidth);
    const fontStack = getFontStack(fontFamily);
    const isSheetPaper = !ROLL_WIDTHS[paperSize] && paperSize !== 'custom';
    const is58mm = paperSize === '58mm';

    const patientAge = calculateAge(appointment.date_of_birth, isReceiptArabic);
    const modalityStyle = getModalityBadgeStyle(appointment.modality_type);
    const invoiceItems = Array.isArray(appointment.items) ? appointment.items : [];
    const paymentList = Array.isArray(appointment.payments) ? appointment.payments : [];
    const hasPayment = Boolean((appointment.payment && (Number(appointment.payment.amount) > 0 || appointment.payment.method)) || paymentList.length > 0);
    const invoiceRecord = appointment.invoice || null;
    const payableTotal = Number(invoiceRecord?.patient_payable_amount ?? invoiceRecord?.total_amount ?? appointment.payment?.amount ?? 0);
    const paidTotal = paymentList.length > 0 ? sumPayments(paymentList) : Number(appointment.payment?.amount || 0);
    const balanceDue = Math.max(0, payableTotal - paidTotal);
    const invoiceNumberDisplay = invoiceRecord?.invoice_number || appointment.payment?.invoice_number || '';
    const invoiceStatusRaw = String(invoiceRecord?.invoice_status || '').toLowerCase();
    const statusText = invoiceStatusRaw === 'partial' ? label('partialPayment') : invoiceStatusRaw === 'voided' ? label('voided') : label('statusPaid');
    const statusTone = invoiceStatusRaw === 'partial' ? 'warn' : invoiceStatusRaw === 'voided' ? 'danger' : 'solid';
    const relatedAppointments = (Array.isArray(appointment.related_appointments) ? appointment.related_appointments : [])
        .filter(row => row && row.appointment_id && row.appointment_id !== appointment.appointment_id);
    const serviceStation = [appointment.room_name || (appointment.room_number ? `${isReceiptArabic ? 'غرفة' : 'Room'} ${appointment.room_number}` : null), appointment.machine_name].filter(Boolean).join(' · ');
    const requiresContrast = Boolean(
        appointment.exam_type_contrast_required ||
        /contrast|صبغة/i.test(appointment.exam_type_name || '') ||
        /contrast|صبغة/i.test(appointment.preparation_instructions || '')
    );
    const receiptDateTime = new Date(appointment.start_time || new Date());

    return (
        <div className="print-workspace min-h-screen bg-slate-100 flex flex-col lg:flex-row print:block print:bg-white" dir={isArabic ? 'rtl' : 'ltr'} style={{ '--print-accent': themeColor }}>
            <style>
                {buildPrintStyles({
                    pageRule: resolvePageRule({ size: paperSize, orientation, customWidth: customPaperWidth }),
                    extraCss: `
                        .receipt-container {
                            box-shadow: none !important;
                            margin: 0 !important;
                            width: ${isSheetPaper ? 'auto' : '100%'} !important;
                            min-height: 0 !important;
                            max-width: none !important;
                            border: 0 !important;
                            border-radius: 0 !important;
                        }
                    `,
                })}
            </style>

            <PrintSidebar
                title={copy.customize}
                onPrint={() => printWhenReady()}
                printLabel={copy.print}
                onClose={() => window.close()}
                closeLabel={copy.close}
            >
                <PrintField label={copy.language}>
                    <LanguageToggle variant="default" className="w-full justify-center" />
                    <select value={receiptLanguage} onChange={event => setReceiptLanguage(event.target.value)} className="print-select mt-2">
                        <option value="auto">{copy.languageAuto}</option>
                        <option value="en">{copy.english}</option>
                        <option value="ar">{copy.arabic}</option>
                        <option value="both">{copy.bilingual}</option>
                    </select>
                </PrintField>

                <PrintField label={copy.paper}>
                    <PrintSegmented
                        options={printOptionLabels(['80mm', '58mm', 'A4', 'A5'].map(size => ({ value: size, en: size, ar: size })), isArabic)}
                        value={paperSize}
                        onChange={setPaperSize}
                        columns={4}
                        ariaLabel={copy.paper}
                    />
                    <button
                        type="button"
                        onClick={() => setPaperSize('custom')}
                        aria-pressed={paperSize === 'custom'}
                        className="print-option w-full"
                    >
                        {copy.customWidth}
                    </button>
                    {paperSize === 'custom' && (
                        <PrintTextInput
                            label={copy.paperWidth}
                            value={customPaperWidth}
                            onChange={setCustomPaperWidth}
                            placeholder="80mm"
                        />
                    )}
                    {isSheetPaper && (
                        <PrintSegmented
                            options={printOptionLabels([
                                { value: 'portrait', en: copy.portrait, ar: copy.portrait },
                                { value: 'landscape', en: copy.landscape, ar: copy.landscape },
                            ], isArabic)}
                            value={orientation}
                            onChange={setOrientation}
                            columns={2}
                            ariaLabel={copy.orientation}
                        />
                    )}
                </PrintField>

                <PrintSelectField
                    label={copy.accent}
                    value={themeColor}
                    onChange={setThemeColor}
                    options={printOptionLabels(PRINT_ACCENTS, isArabic)}
                />

                <PrintSelectField
                    label={copy.typography}
                    value={fontFamily}
                    onChange={setFontFamily}
                    options={printOptionLabels(PRINT_FONTS, isArabic)}
                />

                <PrintField label={copy.density}>
                    <PrintSegmented
                        options={printOptionLabels([
                            { value: 'compact', en: copy.compact, ar: copy.compact },
                            { value: 'normal', en: copy.normal, ar: copy.normal },
                            { value: 'cozy', en: copy.cozy, ar: copy.cozy },
                        ], isArabic)}
                        value={density}
                        onChange={setDensity}
                        ariaLabel={copy.density}
                    />
                </PrintField>

                <PrintSection title={copy.header}>
                    <div className="print-segmented" style={{ '--print-segmented-columns': 3 }} role="group" aria-label={copy.headerAlign}>
                        {[
                            { key: 'start', icon: AlignLeft },
                            { key: 'center', icon: AlignCenter },
                            { key: 'end', icon: AlignRight }
                        ].map(({ key, icon: Icon }) => (
                            <button
                                key={key}
                                type="button"
                                onClick={() => setHeaderAlign(key)}
                                aria-pressed={headerAlign === key}
                                className="print-option"
                                aria-label={`${copy.headerAlign}: ${key}`}
                            >
                                <Icon size={15} />
                            </button>
                        ))}
                    </div>
                    <select value={logoMode} onChange={event => setLogoMode(event.target.value)} className="print-select">
                        <option value="full">{receiptCopy.logoFull}</option>
                        <option value="compact">{receiptCopy.logoCompact}</option>
                        <option value="hidden">{receiptCopy.logoHidden}</option>
                    </select>
                </PrintSection>

                <PrintSelectField
                    label={copy.qrSize}
                    value={qrSize}
                    onChange={value => setQrSize(Number(value))}
                    options={printOptionLabels([
                        { value: 80, en: `${receiptCopy.small} (80px)`, ar: `${receiptCopy.small} (80px)` },
                        { value: 105, en: `${receiptCopy.medium} (105px)`, ar: `${receiptCopy.medium} (105px)` },
                        { value: 135, en: `${receiptCopy.large} (135px)`, ar: `${receiptCopy.large} (135px)` },
                    ], isArabic)}
                />

                <PrintTextArea
                    label={copy.waitMessage}
                    value={anticipatedText}
                    onChange={setAnticipatedText}
                />

                <PrintSection title={copy.portalAccess}>
                    <PrintToggle checked={showPortalAccess} onChange={setShowPortalAccess} label={receiptCopy.displayPortal} />
                    <PrintToggle checked={showPortalPassword} onChange={setShowPortalPassword} label={receiptCopy.printPassword} disabled={!showPortalAccess} />
                    {showPortalPassword && (
                        <PrintTextInput
                            label={copy.temporaryPassword}
                            value={portalPassword}
                            onChange={setPortalPassword}
                            placeholder={receiptCopy.passwordPlaceholder}
                            autoComplete="off"
                            dir="ltr"
                        />
                    )}
                </PrintSection>

                <PrintField label={copy.sections}>
                    <PrintToggle checked={showHeader} onChange={setShowHeader} label={receiptCopy.includeHeader} />
                    <PrintToggle checked={showBarcode} onChange={setShowBarcode} label={receiptCopy.displayBarcode} />
                    <PrintToggle checked={showPaymentDetails} onChange={setShowPaymentDetails} label={receiptCopy.displayPayment} />
                    <PrintToggle checked={showItems} onChange={setShowItems} label={receiptCopy.displayItems} disabled={invoiceItems.length === 0} />
                    <PrintToggle checked={showDob} onChange={setShowDob} label={receiptCopy.displayDob} />
                    <PrintToggle checked={showModality} onChange={setShowModality} label={receiptCopy.displayExam} />
                    <PrintToggle checked={showRefDoctor} onChange={setShowRefDoctor} label={receiptCopy.displayDoctor} />
                    <PrintToggle checked={showPreparationAlert} onChange={setShowPreparationAlert} label={receiptCopy.displayPrep} />
                    <PrintToggle checked={showAnticipatedResults} onChange={setShowAnticipatedResults} label={receiptCopy.displayResults} />
                    <PrintToggle checked={showQR} onChange={setShowQR} label={receiptCopy.displayQr} />
                    <PrintToggle checked={showWatermark} onChange={setShowWatermark} label={receiptCopy.showWatermark} />
                </PrintField>
            </PrintSidebar>

            <PrintStage>
                <PrintDocument
                    className={`receipt-container ${isSheetPaper ? 'print-sheet' : 'print-roll'} shadow-xl border border-slate-200/90 rounded-2xl`}
                    scale={{
                        sheet: isSheetPaper,
                        density: DENSITY_CLASS[density] || 'normal',
                        narrow: is58mm && density === 'cozy'
                    }}
                    style={{
                        width: pageDimensions.width,
                        minHeight: pageDimensions.height,
                        maxWidth: isSheetPaper ? '420px' : 'none',
                        marginInline: isSheetPaper ? 'auto' : undefined,
                        ...getSheetPreviewVariables({ width: pageDimensions.width, height: pageDimensions.height === 'auto' ? pageDimensions.width : pageDimensions.height }),
                        fontFamily: fontStack
                    }}
                    dir={receiptDirection}
                    watermark={trialWatermark || (showWatermark ? label('statusPaid') : null)}
                >
                    {/* ─── 1. Brand Identity Header ──────────────────────────── */}
                    {showHeader && (
                        <DocIdentityHeader
                            align={headerAlign}
                            logoUrl={logoMode === 'hidden' ? null : documentIdentity.logoUrl}
                            centerName={documentIdentity.centerName}
                            branchName={documentIdentity.branchName}
                            tagline={headerLines.slice(1).filter(Boolean).join(' · ')}
                            statusSlot={
                                <DocPill tone="accent" className="mt-1">
                                    {label('receiptBadge')}
                                    <span className="opacity-40" aria-hidden="true">|</span>
                                    <span className="opacity-80">{label('patientCopy')}</span>
                                </DocPill>
                            }
                        />
                    )}

                    {/* ─── 2. Document Meta + Barcode ────────────────────────── */}
                    <section className="pd-block print-keep-together relative z-10">
                        {showBarcode && (
                            <div className="mb-1.5">
                                <BarcodeSVG value={appointment.order_number || appointment.mrn} height={is58mm ? 24 : 30} />
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-x-2 gap-y-1.5">
                            <DocMetaCell label={label('orderNo')} value={appointment.order_number} mono />
                            <DocMetaCell
                                label={`${label('date')} · ${label('time')}`}
                                value={`${receiptDateTime.toLocaleDateString(dateLocale)} | ${receiptDateTime.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })}`}
                                align="end"
                                dir="ltr"
                            />
                        </div>
                        {(appointment.receptionist_name || appointment.created_by_name) && (
                            <div className="pd-micro mt-1 flex items-center justify-between border-t border-dashed border-slate-200 pt-1 font-semibold text-slate-500">
                                <span>{label('cashier')}</span>
                                <span className="font-bold text-slate-700">{appointment.receptionist_name || appointment.created_by_name}</span>
                            </div>
                        )}
                    </section>

                    {/* ─── 3. Patient Identity ───────────────────────────────── */}
                    <section className="pd-block print-keep-together relative z-10 pd-card p-2.5">
                        <DocSectionHead
                            label={label('patientInfo')}
                            trailing={<span className="rounded-md bg-slate-900 px-1.5 py-px font-mono font-black text-white pd-micro ltr-embed">{appointment.mrn || '—'}</span>}
                        />
                        <p className="pd-title font-black leading-tight tracking-tight text-slate-900">
                            {appointment.patient_name}
                        </p>
                        <div className="pd-micro mt-1.5 grid grid-cols-2 gap-y-1 border-t border-slate-100 pt-1.5 font-semibold text-slate-600">
                            {showDob && (
                                <>
                                    <span className="block">
                                        <span className="text-slate-400">{label('dob')}: </span>
                                        <span className="font-bold text-slate-800 ltr-embed">
                                            {appointment.date_of_birth ? new Date(appointment.date_of_birth).toLocaleDateString(dateLocale) : '—'}
                                        </span>
                                    </span>
                                    <span className="block text-end">
                                        <span className="text-slate-400">{label('age')}: </span>
                                        <span className="font-bold text-slate-800">
                                            {patientAge || '—'}
                                            {appointment.gender ? ` · ${appointment.gender.toLowerCase() === 'female' ? label('female') : label('male')}` : ''}
                                        </span>
                                    </span>
                                </>
                            )}
                            {showRefDoctor && (
                                <span className="col-span-2 block truncate">
                                    <span className="text-slate-400">{label('refDoctor')}: </span>
                                    <span className="font-bold text-slate-800">
                                        {appointment.referring_doctor_name || label('selfReferred')}
                                    </span>
                                </span>
                            )}
                        </div>
                    </section>

                    {/* ─── 4. Examination ────────────────────────────────────── */}
                    {showModality && (
                        <section className="pd-block print-keep-together relative z-10 pd-card pd-soft p-2.5">
                            <DocSectionHead
                                label={label('examDetails')}
                                trailing={<span className={`rounded-md border px-1.5 py-px font-black uppercase tracking-wider pd-micro ${modalityStyle.bg}`}>{modalityStyle.label}</span>}
                            />
                            <p className="pd-value font-black leading-snug text-slate-900">
                                {appointment.exam_type_name || label('radiologyExam')}
                            </p>
                            <div className="pd-micro mt-1.5 space-y-1 border-t border-slate-200/70 pt-1.5 font-semibold text-slate-600">
                                {serviceStation && (
                                    <div className="pd-row">
                                        <span className="pd-label shrink-0">{label('serviceStation')}</span>
                                        <span className="font-bold text-slate-800">{serviceStation}</span>
                                    </div>
                                )}
                                <div className="pd-row">
                                    <span className="pd-label shrink-0">{label('scheduled')}</span>
                                    <span className="font-bold text-slate-800 ltr-embed">
                                        {receiptDateTime.toLocaleDateString(dateLocale, { weekday: 'short', month: 'short', day: 'numeric' })}
                                        <span className="mx-1 text-slate-300" aria-hidden="true">·</span>
                                        {receiptDateTime.toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            </div>
                            {showPreparationAlert && requiresContrast && (
                                <p className="pd-micro mt-1.5 rounded-lg border border-amber-200 bg-amber-50 p-1.5 font-bold leading-snug text-amber-900">
                                    {label('contrastAlert')}
                                </p>
                            )}
                        </section>
                    )}

                    {/* ─── 5. Invoice line items ledger ──────────────────────── */}
                    {showItems && invoiceItems.length > 0 && (
                        <section className="pd-block print-keep-together relative z-10">
                            <DocSectionHead label={label('coveredItems')} />
                            <table className="pd-ledger">
                                <thead>
                                    <tr>
                                        <th>{label('item')}</th>
                                        <th className="pd-num">{label('qty')}</th>
                                        <th className="pd-num">{label('unitPrice')}</th>
                                        <th className="pd-num">{label('lineTotal')}</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {invoiceItems.map((item) => (
                                        <tr key={item.item_id}>
                                            <td className="font-bold text-slate-800">{item.description || item.name || '—'}</td>
                                            <td className="pd-num">{item.quantity}</td>
                                            <td className="pd-num text-slate-500">{formatMoney(item.unit_price)}</td>
                                            <td className="pd-num font-black text-slate-900">{formatMoney(item.total_price || item.total_amount)}</td>
                                        </tr>
                                    ))}
                                    <tr className="pd-total-row">
                                        <td colSpan={3} className="uppercase">{label('amountPaid')}</td>
                                        <td className="pd-num" style={{ color: 'var(--print-accent)' }}>{formatEgp(payableTotal)}</td>
                                    </tr>
                                </tbody>
                            </table>

                            {relatedAppointments.length > 0 && (
                                <div className="mt-2 pd-card p-2">
                                    <span className="pd-label block font-black uppercase tracking-wider" style={{ color: 'var(--print-accent)' }}>{label('relatedAppointments')}</span>
                                    <ul className="pd-micro mt-1 space-y-0.5 font-semibold text-slate-600">
                                        {relatedAppointments.map(row => (
                                            <li key={row.appointment_id} className="flex items-center justify-between gap-2">
                                                <span className="truncate font-bold text-slate-800">{row.exam_type_name || label('radiologyExam')}</span>
                                                <span className="shrink-0 font-mono text-slate-500 ltr-embed">
                                                    {row.start_time ? new Date(row.start_time).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' }) : '—'}
                                                </span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                        </section>
                    )}

                    {/* ─── 5b. Related appointments (no items) ───────────────── */}
                    {invoiceItems.length === 0 && relatedAppointments.length > 0 && (
                        <section className="pd-block print-keep-together relative z-10 pd-card p-2">
                            <span className="pd-label block font-black uppercase tracking-wider" style={{ color: 'var(--print-accent)' }}>{label('relatedAppointments')}</span>
                            <ul className="pd-micro mt-1 space-y-0.5 font-semibold text-slate-600">
                                {relatedAppointments.map(row => (
                                    <li key={row.appointment_id} className="flex items-center justify-between gap-2">
                                        <span className="truncate font-bold text-slate-800">{row.exam_type_name || label('radiologyExam')}</span>
                                        <span className="shrink-0 font-mono text-slate-500 ltr-embed">
                                            {row.start_time ? new Date(row.start_time).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' }) : '—'}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </section>
                    )}

                    {/* ─── 6. Payment summary + history ledger ───────────────── */}
                    {showPaymentDetails && hasPayment && (
                        <section
                            className="pd-block print-keep-together relative z-10 pd-card p-2.5"
                            style={{
                                borderColor: 'color-mix(in srgb, var(--print-accent) 30%, #fff)',
                                background: 'color-mix(in srgb, var(--print-accent) 6%, #fff)'
                            }}
                        >
                            <DocSectionHead
                                label={label('paymentDetails')}
                                trailing={<DocPill tone={statusTone}>{statusText}</DocPill>}
                            />
                            <div className="pd-row border-b pb-1.5" style={{ borderColor: 'color-mix(in srgb, var(--print-accent) 15%, #fff)' }}>
                                <span className="pd-body font-extrabold text-slate-700">{paymentList.length > 0 ? label('totalDue') : label('amountPaid')}</span>
                                <span className="pd-hero font-black leading-none tracking-tight" style={{ color: 'var(--print-accent)' }}>
                                    <span className="ltr-embed">{formatSignedEgp(paymentList.length > 0 ? payableTotal : paidTotal)}</span>
                                </span>
                            </div>

                            {paymentList.length > 0 && (
                                <div className="mt-1.5">
                                    <span className="pd-label block font-black uppercase tracking-wider text-slate-500">{label('paymentHistory')}</span>
                                    <table className="pd-ledger mt-0.5">
                                        <thead>
                                            <tr>
                                                <th>{label('date')}</th>
                                                <th>{label('paymentMethod')}</th>
                                                <th className="pd-num">{label('amountPaid')}</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {paymentList.map((p, idx) => (
                                                <tr key={p.payment_id || idx}>
                                                    <td className="font-mono text-slate-500 ltr-embed">
                                                        {p.transaction_date ? new Date(p.transaction_date).toLocaleDateString(dateLocale) : '—'}
                                                    </td>
                                                    <td className="font-semibold text-slate-700">
                                                        {formatPaymentMethod(p.method || p.payment_method, isReceiptArabic)}
                                                        {p.cashier_name && <span className="pd-micro block text-slate-400">{p.cashier_name}</span>}
                                                    </td>
                                                    <td className="pd-num font-black text-slate-900 ltr-embed">{formatSignedEgp(p.amount)}</td>
                                                </tr>
                                            ))}
                                            <tr className="pd-total-row">
                                                <td colSpan={2} className="uppercase">{label('amountPaid')}</td>
                                                <td className="pd-num" style={{ color: 'var(--print-accent)' }}>{formatSignedEgp(paidTotal)}</td>
                                            </tr>
                                        </tbody>
                                    </table>
                                    {balanceDue > 0 && (
                                        <div className="pd-row mt-1 border-t pt-1" style={{ borderColor: 'color-mix(in srgb, var(--print-accent) 15%, #fff)' }}>
                                            <span className="pd-label font-black uppercase text-rose-600">{label('balanceDue')}</span>
                                            <span className="pd-value font-mono font-black text-rose-700 ltr-embed">{formatEgp(balanceDue)}</span>
                                        </div>
                                    )}
                                </div>
                            )}

                            <div className="pd-micro mt-1.5 space-y-0.5 font-semibold text-slate-600">
                                {paymentList.length === 0 && (
                                    <div className="pd-row">
                                        <span className="text-slate-400">{label('paymentMethod')}</span>
                                        <span className="font-bold text-slate-800">{formatPaymentMethod(appointment.payment?.method, isReceiptArabic)}</span>
                                    </div>
                                )}
                                {invoiceNumberDisplay && (
                                    <div className="pd-row">
                                        <span className="text-slate-400">{label('invoiceNumber')}</span>
                                        <span className="font-mono font-bold text-slate-800 ltr-embed">{invoiceNumberDisplay}</span>
                                    </div>
                                )}
                                {appointment.payment?.payment_reference && (
                                    <div className="pd-row">
                                        <span className="text-slate-400">{label('paymentRef')}</span>
                                        <span className="font-mono font-bold text-slate-800 ltr-embed">{appointment.payment.payment_reference}</span>
                                    </div>
                                )}
                            </div>
                        </section>
                    )}

                    {/* ─── 7. Results turnaround ─────────────────────────────── */}
                    {showAnticipatedResults && anticipatedText && (
                        <section
                            className="pd-block print-keep-together relative z-10 rounded-xl border border-dashed p-2.5 text-center"
                            style={{ borderColor: 'color-mix(in srgb, var(--print-accent) 35%, #fff)' }}
                        >
                            <span className="pd-label block font-black uppercase tracking-wider" style={{ color: 'var(--print-accent)' }}>{label('anticipatedResults')}</span>
                            <p className="pd-body mt-0.5 font-bold leading-snug text-slate-700">{anticipatedText}</p>
                            <p className="pd-micro mt-0.5 font-semibold text-slate-400">{label('smsNotification')}</p>
                        </section>
                    )}

                    {/* ─── 8. Portal access pass ─────────────────────────────── */}
                    {showPortalAccess && (
                        <section className="pd-block print-keep-together relative z-10 pd-card p-3" style={{ borderColor: '#cbd5e1' }}>
                            <DocSectionHead
                                label={label('portalCredentials')}
                                trailing={<Lock size={11} style={{ color: 'var(--print-accent)' }} aria-hidden="true" />}
                            />
                            {showQR ? (
                                <div className="flex items-center justify-center gap-3">
                                    <div className="shrink-0 rounded-lg border border-slate-200 bg-white p-1.5">
                                        <QRCodeSVG value={receiptQrUrl.toString()} size={qrSize} level="M" />
                                    </div>
                                    <div className="min-w-0 flex-1 space-y-1 text-start">
                                        <div>
                                            <span className="pd-micro block font-extrabold uppercase tracking-wider text-slate-400">{label('loginId')}</span>
                                            <span className="pd-body font-mono font-black text-slate-900 ltr-embed">{portalLoginId || '—'}</span>
                                        </div>
                                        <div>
                                            <span className="pd-micro block font-extrabold uppercase tracking-wider text-slate-400">{label('loginUrl')}</span>
                                            <span className="pd-micro block break-all font-mono font-bold text-slate-700 ltr-embed">{portalUrl}</span>
                                        </div>
                                        {showPortalPassword && (
                                            <div>
                                                <span className="pd-micro block font-extrabold uppercase tracking-wider text-slate-400">{label('temporaryPassword')}</span>
                                                <span className="inline-block rounded border border-slate-300 bg-slate-50 px-1.5 py-0.5 font-mono font-black text-slate-900 pd-body ltr-embed">
                                                    {portalPassword || label('issuedSeparately')}
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-1 text-start">
                                    <div className="pd-row">
                                        <span className="pd-micro font-extrabold uppercase tracking-wider text-slate-400">{label('loginId')}</span>
                                        <span className="pd-body font-mono font-black text-slate-900 ltr-embed">{portalLoginId || '—'}</span>
                                    </div>
                                    <div className="pd-row">
                                        <span className="pd-micro font-extrabold uppercase tracking-wider text-slate-400">{label('loginUrl')}</span>
                                        <span className="pd-micro break-all font-mono font-bold text-slate-700 ltr-embed">{portalUrl}</span>
                                    </div>
                                    {showPortalPassword && (
                                        <div className="pd-row">
                                            <span className="pd-micro font-extrabold uppercase tracking-wider text-slate-400">{label('temporaryPassword')}</span>
                                            <span className="pd-body font-mono font-black text-slate-900 ltr-embed">{portalPassword || label('issuedSeparately')}</span>
                                        </div>
                                    )}
                                </div>
                            )}
                            {showQR && (
                                <p className="pd-micro mt-2 text-center font-bold text-slate-500">{label('scanOrVisit')}</p>
                            )}
                            <p className="pd-micro mt-1 text-center font-semibold leading-snug text-slate-400">{label('keepSafe')}</p>
                        </section>
                    )}

                    {/* ─── 9. Thermal tear line + certification ──────────────── */}
                    {!isSheetPaper && <DocTear label={label('tearLine')} />}
                    <DocFooter cert={label('verifiedDocument')} lines={[footerText]} />
                </PrintDocument>
            </PrintStage>
        </div>
    );
};

export default PrintReceipt;
