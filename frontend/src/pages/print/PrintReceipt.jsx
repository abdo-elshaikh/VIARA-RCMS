import React, { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useGetAppointmentByIdQuery, useGetCenterSettingsQuery } from '../../store/api';
import { QRCodeSVG } from 'qrcode.react';
import { AlignCenter, AlignLeft, AlignRight, KeyRound, Layout, Loader2, Printer, Settings2, ShieldCheck } from 'lucide-react';
import LanguageToggle from '../../components/ui/LanguageToggle';
import { buildReceiptFooter, buildReceiptHeader, normalizeCenterSettings } from '../../utils/centerSettings';
import { getPatientPortalLoginUrl } from '../../utils/portalUrls';

const RECEIPT_COPY = {
    en: {
        customize: 'Customize receipt',
        language: 'Receipt language',
        languageAuto: 'Auto',
        english: 'English',
        arabic: 'Arabic',
        bilingual: 'EN / AR',
        paper: 'Paper and layout',
        customWidth: 'Custom width',
        paperWidth: 'Paper width',
        portrait: 'Portrait',
        landscape: 'Landscape',
        theme: 'Accent theme',
        typography: 'Typography',
        density: 'Density',
        compact: 'Compact',
        normal: 'Normal',
        roomy: 'Roomy',
        header: 'Header',
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
        receiptSections: 'Receipt sections',
        includeHeader: 'Include receipt header',
        displayDob: 'Display patient DOB',
        displayExam: 'Display exam details',
        displayDoctor: 'Display referring doctor',
        displayResults: 'Display anticipated results banner',
        displayQr: 'Display access QR code',
        print: 'Print receipt',
        close: 'Close',
        date: 'Date',
        time: 'Time',
        orderNo: 'Order #',
        patientInfo: 'Patient information',
        mrn: 'MRN',
        dob: 'DOB',
        refDoctor: 'Ref doctor',
        selfReferred: 'Self-referred',
        examDetails: 'Examination details',
        scheduled: 'Scheduled',
        anticipatedResults: 'Anticipated results',
        portalCredentials: 'Patient portal credentials',
        loginUrl: 'Login URL',
        loginId: 'MRN / Login ID',
        issuedSeparately: 'Issued separately',
        accessOnline: 'Access your results online',
        scanOrVisit: 'Scan this QR code or visit',
        keepSafe: 'Keep these credentials private. Ask reception to reset the password if it is lost.',
        resultWait: 'Your report will be available in approximately 24-48 hours after your examination.',
        radiologyExam: 'Radiology examination'
    },
    ar: {
        customize: 'تخصيص الإيصال',
        language: 'لغة الإيصال',
        languageAuto: 'تلقائي',
        english: 'الإنجليزية',
        arabic: 'العربية',
        bilingual: 'إنجليزي / عربي',
        paper: 'المقاس والتخطيط',
        customWidth: 'مقاس مخصص',
        paperWidth: 'عرض الورق',
        portrait: 'طولي',
        landscape: 'عرضي',
        theme: 'لون الإيصال',
        typography: 'الخط',
        density: 'كثافة المحتوى',
        compact: 'مضغوط',
        normal: 'عادي',
        roomy: 'واسع',
        header: 'الترويسة',
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
        receiptSections: 'أقسام الإيصال',
        includeHeader: 'إظهار ترويسة الإيصال',
        displayDob: 'إظهار تاريخ الميلاد',
        displayExam: 'إظهار بيانات الفحص',
        displayDoctor: 'إظهار الطبيب المحول',
        displayResults: 'إظهار موعد النتيجة المتوقع',
        displayQr: 'إظهار رمز الدخول QR',
        print: 'طباعة الإيصال',
        close: 'إغلاق',
        date: 'التاريخ',
        time: 'الوقت',
        orderNo: 'رقم الطلب',
        patientInfo: 'بيانات المريض',
        mrn: 'رقم الملف',
        dob: 'تاريخ الميلاد',
        refDoctor: 'الطبيب المحول',
        selfReferred: 'بدون إحالة',
        examDetails: 'بيانات الفحص',
        scheduled: 'الموعد',
        anticipatedResults: 'موعد النتيجة المتوقع',
        portalCredentials: 'بيانات بوابة المريض',
        loginUrl: 'رابط الدخول',
        loginId: 'رقم الملف / اسم الدخول',
        issuedSeparately: 'تم تسليمها منفصلة',
        accessOnline: 'الوصول إلى النتائج إلكترونيا',
        scanOrVisit: 'امسح رمز QR أو افتح الرابط',
        keepSafe: 'احتفظ بهذه البيانات بسرية. اطلب من الاستقبال إعادة تعيين كلمة المرور إذا فُقدت.',
        resultWait: 'سيكون التقرير متاحا خلال 24-48 ساعة تقريبا بعد الفحص.',
        radiologyExam: 'فحص أشعة'
    }
};

const DENSITY_STYLES = {
    compact: { page: 'p-4', block: 'mb-3', section: 'p-2', gap: 'space-y-0.5', qrGap: 'mt-3', headerLogo: 'h-9' },
    normal: { page: 'p-6', block: 'mb-4', section: 'p-2.5', gap: 'space-y-0.5', qrGap: 'mt-4', headerLogo: 'h-12' },
    roomy: { page: 'p-8', block: 'mb-5', section: 'p-3.5', gap: 'space-y-1', qrGap: 'mt-5', headerLogo: 'h-14' }
};

const getReceiptLanguage = (mode, isArabic) => {
    if (mode === 'auto') return isArabic ? 'ar' : 'en';
    return mode;
};

const receiptLabel = (mode, key) => {
    if (mode === 'both') return `${RECEIPT_COPY.en[key]} / ${RECEIPT_COPY.ar[key]}`;
    return RECEIPT_COPY[mode]?.[key] || RECEIPT_COPY.en[key] || key;
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
    const [showHeader, setShowHeader] = useState(true);
    const [showAnticipatedResults, setShowAnticipatedResults] = useState(true);
    const [showPortalAccess, setShowPortalAccess] = useState(true);
    const [showPortalPassword, setShowPortalPassword] = useState(Boolean(searchParams.get('portalPassword') || searchParams.get('password')));
    const [portalPassword, setPortalPassword] = useState(() => searchParams.get('portalPassword') || searchParams.get('password') || '');
    const appliedPrintDefaults = useRef(false);

    // Advanced print settings states
    const [themeColor, setThemeColor] = useState('#0f766e');
    const [fontFamily, setFontFamily] = useState('Inter');
    const [showDob, setShowDob] = useState(true);
    const [showModality, setShowModality] = useState(true);
    const [showRefDoctor, setShowRefDoctor] = useState(true);
    const [qrSize, setQrSize] = useState(110);
    const [anticipatedText, setAnticipatedText] = useState('');

    const isArabic = i18n.language.startsWith('ar');
    const activeReceiptLanguage = getReceiptLanguage(receiptLanguage, isArabic);
    const isReceiptArabic = activeReceiptLanguage === 'ar';
    const receiptDirection = isReceiptArabic ? 'rtl' : 'ltr';
    const receiptCopy = RECEIPT_COPY[activeReceiptLanguage === 'both' ? (isArabic ? 'ar' : 'en') : activeReceiptLanguage] || RECEIPT_COPY.en;
    const label = key => receiptLabel(activeReceiptLanguage, key);
    const dateLocale = receiptLocale(activeReceiptLanguage, i18n.language);
    const densityStyle = DENSITY_STYLES[density] || DENSITY_STYLES.normal;
    const headerAlignClass = headerAlign === 'start'
        ? 'text-start items-start'
        : headerAlign === 'end'
            ? 'text-end items-end'
            : 'text-center items-center';

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
    
    const logoUrl = centerSettings.logo_url;
    const headerLines = buildReceiptHeader(centerSettings).split('\n');
    const footerText = buildReceiptFooter(centerSettings);

    const getPageDimensions = () => {
        if (paperSize === '80mm') return { width: '80mm', minHeight: 'auto' };
        if (paperSize === '58mm') return { width: '58mm', minHeight: 'auto' };
        if (paperSize === 'A4') return orientation === 'portrait' ? { width: '210mm', minHeight: '297mm' } : { width: '297mm', minHeight: '210mm' };
        if (paperSize === 'A5') return orientation === 'portrait' ? { width: '148mm', minHeight: '210mm' } : { width: '210mm', minHeight: '148mm' };
        return { width: customPaperWidth || '80mm', minHeight: 'auto' };
    };

    const fontStack = fontFamily === 'Outfit' ? "'Outfit', sans-serif" : fontFamily === 'Space Mono' ? "'Space Mono', monospace" : fontFamily === 'Arial' ? "'Arial', sans-serif" : "'Inter', sans-serif";

    return (
        <div className="min-h-screen bg-slate-100 flex flex-col md:flex-row print:block print:bg-white" dir={isArabic ? 'rtl' : 'ltr'}>
            <style>
                {`
                    @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600;700;800&family=Outfit:wght@400;500;600;700;800&display=swap');
                    @media print {
                        @page {
                            margin: 0;
                            size: ${['80mm', '58mm'].includes(paperSize) ? `${paperSize} auto` : paperSize === 'custom' ? `${customPaperWidth || '80mm'} auto` : `${paperSize} ${orientation}`};
                        }
                        body {
                            margin: 0;
                            padding: 0;
                            background-color: white !important;
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                        }
                        .no-print {
                            display: none !important;
                        }
                        .receipt-container {
                            box-shadow: none !important;
                            margin: 0 !important;
                            width: ${['80mm', '58mm', 'custom'].includes(paperSize) ? '100%' : 'auto'} !important;
                            max-width: none !important;
                        }
                    }
                `}
            </style>
            
            {/* Configuration Sidebar */}
            <aside className="no-print w-full md:w-80 bg-white border-b md:border-b-0 md:border-e border-slate-200 p-6 flex flex-col shrink-0 h-auto md:h-screen sticky top-0 overflow-y-auto z-10 font-sans">
                <div className="flex items-center gap-3 mb-6 text-slate-800">
                    <Settings2 size={22} style={{ color: themeColor }} />
                    <h2 className="text-lg font-black tracking-tight">{receiptCopy.customize}</h2>
                </div>

                <div className="space-y-5 flex-1 text-slate-700">
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">{receiptCopy.language}</label>
                        <LanguageToggle variant="default" className="w-full justify-center" />
                        <select value={receiptLanguage} onChange={event => setReceiptLanguage(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs font-bold">
                            <option value="auto">{receiptCopy.languageAuto}</option>
                            <option value="en">{receiptCopy.english}</option>
                            <option value="ar">{receiptCopy.arabic}</option>
                            <option value="both">{receiptCopy.bilingual}</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">{receiptCopy.paper}</label>
                        <div className="grid grid-cols-4 gap-1 mb-2">
                            {['80mm', '58mm', 'A4', 'A5'].map(size => (
                                <button
                                    key={size}
                                    onClick={() => setPaperSize(size)}
                                    className="py-1.5 rounded-lg text-xs font-bold border transition-all"
                                    style={{
                                        borderColor: paperSize === size ? themeColor : '#e2e8f0',
                                        backgroundColor: paperSize === size ? `${themeColor}12` : '#ffffff',
                                        color: paperSize === size ? themeColor : '#475569'
                                    }}
                                >
                                    {size}
                                </button>
                            ))}
                        </div>
                        <button
                            onClick={() => setPaperSize('custom')}
                            className="mb-2 w-full rounded-lg border py-1.5 text-xs font-bold transition-all"
                            style={{
                                borderColor: paperSize === 'custom' ? themeColor : '#e2e8f0',
                                backgroundColor: paperSize === 'custom' ? `${themeColor}12` : '#ffffff',
                                color: paperSize === 'custom' ? themeColor : '#475569'
                            }}
                        >
                            {receiptCopy.customWidth}
                        </button>
                        {paperSize === 'custom' && (
                            <label className="mb-2 block">
                                <span className="mb-1 block text-[9px] font-black uppercase tracking-wider text-slate-400">{receiptCopy.paperWidth}</span>
                                <input value={customPaperWidth} onChange={e => setCustomPaperWidth(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white p-2 font-mono text-xs font-bold" placeholder="80mm" />
                            </label>
                        )}
                        {!['80mm', '58mm', 'custom'].includes(paperSize) && (
                            <div className="grid grid-cols-2 gap-1.5">
                                <button onClick={() => setOrientation('portrait')} className="py-1 rounded-lg text-[11px] font-bold border transition-all flex items-center justify-center gap-1" style={{ borderColor: orientation === 'portrait' ? themeColor : '#e2e8f0', backgroundColor: orientation === 'portrait' ? `${themeColor}12` : '#ffffff', color: orientation === 'portrait' ? themeColor : '#475569' }}>
                                    <Layout size={10} className="rotate-90" /> {receiptCopy.portrait}
                                </button>
                                <button onClick={() => setOrientation('landscape')} className="py-1 rounded-lg text-[11px] font-bold border transition-all flex items-center justify-center gap-1" style={{ borderColor: orientation === 'landscape' ? themeColor : '#e2e8f0', backgroundColor: orientation === 'landscape' ? `${themeColor}12` : '#ffffff', color: orientation === 'landscape' ? themeColor : '#475569' }}>
                                    <Layout size={10} /> {receiptCopy.landscape}
                                </button>
                            </div>
                        )}
                    </div>

                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">{receiptCopy.theme}</label>
                        <select value={themeColor} onChange={e => setThemeColor(e.target.value)} className="w-full text-xs font-bold border border-slate-200 rounded-lg p-2 bg-white">
                            <option value="#0f766e">Radiology Teal</option>
                            <option value="#1e3a8a">Classic Navy</option>
                            <option value="#111827">Minimalist Black</option>
                            <option value="#374151">Cool Charcoal</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">{receiptCopy.typography}</label>
                        <select value={fontFamily} onChange={e => setFontFamily(e.target.value)} className="w-full text-xs font-bold border border-slate-200 rounded-lg p-2 bg-white">
                            <option value="Inter">Inter (Clean sans)</option>
                            <option value="Outfit">Outfit (Soft round)</option>
                            <option value="Space Mono">Space Mono (Console look)</option>
                            <option value="Arial">Arial (Standard)</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">{receiptCopy.density}</label>
                        <div className="grid grid-cols-3 gap-1.5">
                            {['compact', 'normal', 'roomy'].map(option => (
                                <button
                                    key={option}
                                    type="button"
                                    onClick={() => setDensity(option)}
                                    className="rounded-lg border py-1.5 text-xs font-bold capitalize transition"
                                    style={{
                                        borderColor: density === option ? themeColor : '#e2e8f0',
                                        backgroundColor: density === option ? `${themeColor}12` : '#ffffff',
                                        color: density === option ? themeColor : '#475569'
                                    }}
                                >
                                    {receiptCopy[option]}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">{receiptCopy.header}</label>
                        <div className="grid grid-cols-3 gap-1.5">
                            {[
                                { key: 'start', icon: AlignLeft },
                                { key: 'center', icon: AlignCenter },
                                { key: 'end', icon: AlignRight }
                            ].map(({ key, icon: Icon }) => (
                                <button
                                    key={key}
                                    type="button"
                                    onClick={() => setHeaderAlign(key)}
                                    className="flex h-9 items-center justify-center rounded-lg border transition"
                                    style={{
                                        borderColor: headerAlign === key ? themeColor : '#e2e8f0',
                                        backgroundColor: headerAlign === key ? `${themeColor}12` : '#ffffff',
                                        color: headerAlign === key ? themeColor : '#475569'
                                    }}
                                    title={receiptCopy.headerAlign}
                                    aria-label={`${receiptCopy.headerAlign}: ${key}`}
                                >
                                    <Icon size={15} />
                                </button>
                            ))}
                        </div>
                        <select value={logoMode} onChange={event => setLogoMode(event.target.value)} className="mt-2 w-full rounded-lg border border-slate-200 bg-white p-2 text-xs font-bold">
                            <option value="full">{receiptCopy.logoFull}</option>
                            <option value="compact">{receiptCopy.logoCompact}</option>
                            <option value="hidden">{receiptCopy.logoHidden}</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">{receiptCopy.qrSize}</label>
                        <select value={qrSize} onChange={e => setQrSize(Number(e.target.value))} className="w-full text-xs font-bold border border-slate-200 rounded-lg p-2 bg-white">
                            <option value="80">{receiptCopy.small} (80px)</option>
                            <option value="110">{receiptCopy.medium} (110px)</option>
                            <option value="140">{receiptCopy.large} (140px)</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">{receiptCopy.waitMessage}</label>
                        <textarea
                            value={anticipatedText}
                            onChange={e => setAnticipatedText(e.target.value)}
                            className="w-full text-xs font-semibold border border-slate-200 rounded-lg p-2 bg-white min-h-16 resize-y"
                        />
                    </div>

                    <div className="rounded-xl border border-cyan-100 bg-cyan-50/70 p-3">
                        <div className="mb-2 flex items-center gap-2 text-cyan-900">
                            <ShieldCheck size={15} />
                            <span className="text-[10px] font-black uppercase tracking-wider">{receiptCopy.portalAccess}</span>
                        </div>
                        <div className="space-y-2 font-semibold text-xs text-slate-600">
                            <label className="flex items-center gap-2.5 cursor-pointer">
                                <input type="checkbox" checked={showPortalAccess} onChange={e => setShowPortalAccess(e.target.checked)} className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 w-4 h-4" />
                                <span>{receiptCopy.displayPortal}</span>
                            </label>
                            <label className="flex items-center gap-2.5 cursor-pointer">
                                <input type="checkbox" checked={showPortalPassword} onChange={e => setShowPortalPassword(e.target.checked)} className="rounded border-slate-300 text-cyan-600 focus:ring-cyan-500 w-4 h-4" disabled={!showPortalAccess} />
                                <span>{receiptCopy.printPassword}</span>
                            </label>
                            {showPortalPassword && (
                                <label className="block">
                                    <span className="mb-1 block text-[9px] font-black uppercase tracking-wider text-slate-400">{receiptCopy.temporaryPassword}</span>
                                    <input
                                        value={portalPassword}
                                        onChange={e => setPortalPassword(e.target.value)}
                                        className="w-full rounded-lg border border-cyan-100 bg-white p-2 font-mono text-xs font-bold"
                                        placeholder={receiptCopy.passwordPlaceholder}
                                        autoComplete="off"
                                        dir="ltr"
                                    />
                                </label>
                            )}
                        </div>
                    </div>

                    <div className="space-y-2 border-t pt-3 font-semibold text-xs text-slate-600">
                        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{receiptCopy.receiptSections}</p>
                        <label className="flex items-center gap-2.5 cursor-pointer">
                            <input type="checkbox" checked={showHeader} onChange={e => setShowHeader(e.target.checked)} className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 w-4 h-4" />
                            <span>{receiptCopy.includeHeader}</span>
                        </label>
                        <label className="flex items-center gap-2.5 cursor-pointer">
                            <input type="checkbox" checked={showDob} onChange={e => setShowDob(e.target.checked)} className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 w-4 h-4" />
                            <span>{receiptCopy.displayDob}</span>
                        </label>
                        <label className="flex items-center gap-2.5 cursor-pointer">
                            <input type="checkbox" checked={showModality} onChange={e => setShowModality(e.target.checked)} className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 w-4 h-4" />
                            <span>{receiptCopy.displayExam}</span>
                        </label>
                        <label className="flex items-center gap-2.5 cursor-pointer">
                            <input type="checkbox" checked={showRefDoctor} onChange={e => setShowRefDoctor(e.target.checked)} className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 w-4 h-4" />
                            <span>{receiptCopy.displayDoctor}</span>
                        </label>
                        <label className="flex items-center gap-2.5 cursor-pointer">
                            <input type="checkbox" checked={showAnticipatedResults} onChange={e => setShowAnticipatedResults(e.target.checked)} className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 w-4 h-4" />
                            <span>{receiptCopy.displayResults}</span>
                        </label>
                        <label className="flex items-center gap-2.5 cursor-pointer">
                            <input type="checkbox" checked={showQR} onChange={e => setShowQR(e.target.checked)} className="rounded border-slate-300 text-teal-600 focus:ring-teal-500 w-4 h-4" />
                            <span>{receiptCopy.displayQr}</span>
                        </label>
                    </div>
                </div>

                <div className="mt-6 pt-5 border-t border-slate-200 space-y-2">
                    <button onClick={() => window.print()} className="w-full flex items-center justify-center gap-2 rounded-xl py-3 font-extrabold text-white shadow-sm transition-all" style={{ backgroundColor: themeColor }}>
                        <Printer size={16} /> {receiptCopy.print}
                    </button>
                    <button onClick={() => window.close()} className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2 font-bold text-slate-500 hover:bg-slate-50 transition-all text-xs">
                        {receiptCopy.close}
                    </button>
                </div>
            </aside>

            {/* Print Preview Canvas */}
            <main className="flex-1 overflow-y-auto p-4 md:p-8 flex justify-center items-start">
                <div 
                    className={`receipt-container bg-white ${densityStyle.page} shadow-md border border-slate-200/60 rounded-md font-sans text-slate-700 transition-all ${['80mm', '58mm', 'custom'].includes(paperSize) ? '' : 'origin-top scale-[0.8] md:scale-100 print:scale-100'}`} 
                    style={{ 
                        ...getPageDimensions(), 
                        fontFamily: fontStack 
                    }}
                    dir={receiptDirection}
                >
                    {showHeader && (
                        <div className={`${densityStyle.block} flex flex-col ${headerAlignClass}`}>
                            {logoMode !== 'hidden' && (logoUrl ? (
                                <img src={logoUrl} alt="Logo" className={`mb-2.5 w-auto object-contain grayscale ${logoMode === 'compact' ? 'h-8' : densityStyle.headerLogo}`} />
                            ) : (
                                <div className={`${logoMode === 'compact' ? 'h-8 w-8' : 'h-10 w-10'} mb-2 flex items-center justify-center rounded-full text-white`} style={{ backgroundColor: themeColor }}>
                                    <svg xmlns="http://www.w3.org/2000/svg" width={logoMode === 'compact' ? '16' : '20'} height={logoMode === 'compact' ? '16' : '20'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                                </div>
                            ))}
                            {headerLines.map((line, idx) => (
                                <p key={idx} className={idx === 0 && !logoUrl ? "mb-0.5 text-base font-black tracking-tight" : "text-[10px] font-semibold text-slate-500"} style={idx === 0 ? { color: themeColor } : {}}>
                                    {line}
                                </p>
                            ))}
                        </div>
                    )}

                    <div className={`${densityStyle.block} border-y border-dashed border-slate-200 py-3 ${densityStyle.gap} font-mono text-[10px] text-slate-500`}>
                        <div className="flex justify-between">
                            <span>{label('date')}:</span>
                            <span className="font-bold text-slate-800">{new Date().toLocaleDateString(dateLocale)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>{label('time')}:</span>
                            <span className="font-bold text-slate-800">{new Date().toLocaleTimeString(dateLocale)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>{label('orderNo')}:</span>
                            <span className="font-extrabold text-slate-900 ltr-embed">{appointment.order_number}</span>
                        </div>
                    </div>

                    <div className={`${densityStyle.block} text-xs`}>
                        <h2 className="mb-1.5 text-start text-[9px] font-black uppercase tracking-widest text-slate-400">{label('patientInfo')}</h2>
                        <p className="mb-1 text-start text-sm font-black leading-none text-slate-800" style={{ color: themeColor }}>{appointment.patient_name}</p>
                        <div className={`mt-1 ${densityStyle.gap} text-[10px] text-slate-500 font-semibold`}>
                            <div className="text-start">{label('mrn')}: <span className="text-slate-800 font-bold ltr-embed">{appointment.mrn}</span></div>
                            {showDob && <div className="text-start">{label('dob')}: <span className="text-slate-800 font-bold ltr-embed">{new Date(appointment.date_of_birth).toLocaleDateString(dateLocale)}</span></div>}
                            {showRefDoctor && (
                                <div className="text-start">
                                    <span>{label('refDoctor')}:</span> <span className="text-slate-800 font-bold">{appointment.referring_doctor_name || label('selfReferred')}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {showModality && (
                        <div className={`${densityStyle.block} text-xs`}>
                            <h2 className="mb-1.5 text-start text-[9px] font-black uppercase tracking-widest text-slate-400">{label('examDetails')}</h2>
                            <div className={`rounded-lg bg-slate-50/50 ${densityStyle.section} border border-slate-100 text-start`}>
                                <p className="font-extrabold text-slate-800 text-[11px] leading-tight">{appointment.exam_type_name || label('radiologyExam')}</p>
                                <p className="mt-0.5 text-[10px] font-bold text-slate-400 ltr-embed">{appointment.machine_name} - {appointment.modality_type}</p>
                                <p className="mt-1.5 text-[9px] font-semibold text-slate-500 border-t border-slate-200/50 pt-1.5 ltr-embed">
                                    {label('scheduled')}: {new Date(appointment.start_time).toLocaleDateString(dateLocale)} {new Date(appointment.start_time).toLocaleTimeString(dateLocale, { hour: '2-digit', minute: '2-digit' })}
                                </p>
                            </div>
                        </div>
                    )}

                    {showAnticipatedResults && anticipatedText && (
                        <div className={`${densityStyle.block} rounded-lg border border-slate-100 bg-slate-50/30 ${densityStyle.section} text-center`}>
                            <h2 className="mb-1 text-[9px] font-black text-slate-500 uppercase tracking-widest">{label('anticipatedResults')}</h2>
                            <p className="text-[10px] font-bold leading-normal text-slate-500">{anticipatedText}</p>
                        </div>
                    )}

                    {showPortalAccess && (
                        <div className={`${densityStyle.qrGap} border-t border-dashed border-slate-200 pt-5 text-center`}>
                            <div className="mb-3 flex items-center justify-center gap-1.5">
                                <KeyRound size={13} style={{ color: themeColor }} />
                                <p className="text-[9px] font-black uppercase tracking-wider text-slate-500">{label('portalCredentials')}</p>
                            </div>
                            <div className={`rounded-lg border border-slate-100 bg-slate-50/40 ${densityStyle.section} text-start`}>
                                <div className="grid gap-2 text-[9px] font-bold text-slate-500">
                                    <div>
                                        <span className="block uppercase tracking-wider text-slate-400">{label('loginUrl')}</span>
                                        <span className="block break-all font-mono text-slate-800 ltr-embed">{portalUrl}</span>
                                    </div>
                                    <div>
                                        <span className="block uppercase tracking-wider text-slate-400">{label('loginId')}</span>
                                        <span className="block font-mono text-slate-800 ltr-embed">{portalLoginId || '-'}</span>
                                    </div>
                                    {showPortalPassword && (
                                        <div>
                                            <span className="block uppercase tracking-wider text-slate-400">{label('temporaryPassword')}</span>
                                            <span className="block break-all font-mono text-slate-900 ltr-embed">{portalPassword || label('issuedSeparately')}</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                            {showQR && (
                                <div className="mt-4 flex flex-col items-center justify-center text-center">
                                    <p className="mb-2 text-[9px] font-black uppercase tracking-wider text-slate-400">{label('accessOnline')}</p>
                                    <div className="rounded-lg bg-white p-1.5 shadow-sm border border-slate-100">
                                        <QRCodeSVG value={portalUrl} size={qrSize} />
                                    </div>
                                    <p className="mt-2 text-[8px] font-bold text-slate-400">{label('scanOrVisit')}</p>
                                </div>
                            )}
                            <p className="mt-3 text-[8px] font-semibold leading-4 text-slate-400">
                                {label('keepSafe')}
                            </p>
                        </div>
                    )}
                    
                    <div className="mt-6 text-center text-[9px] font-bold text-slate-400/80 uppercase whitespace-pre-wrap px-4 tracking-wider leading-relaxed">
                        {footerText}
                    </div>
                </div>
            </main>
        </div>
    );
};

export default PrintReceipt;
