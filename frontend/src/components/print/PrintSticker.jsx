import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useGetAppointmentByIdQuery, useGetCenterSettingsQuery, useUpdateCenterSettingsMutation } from '../../store/api';
import { QRCodeSVG } from 'qrcode.react';
import { CheckCircle2, Loader2, Save, Settings2, Printer, Layout } from 'lucide-react';
import LanguageToggle from '../ui/LanguageToggle';
import { normalizeCenterSettings, resolveDocumentIdentity } from '../../utils/centerSettings';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { VIARA_BRAND } from '../../config/brand';
import { getSheetPreviewVariables, printWhenReady } from '../../utils/printDocument';
import '../../styles/printDocuments.css';

const STICKER_COPY = {
    en: {
        customize: 'Customize Sticker',
        language: 'Language',
        stickerLanguage: 'Sticker language',
        currentSize: 'Current size',
        languageAuto: 'Auto',
        english: 'English',
        arabic: 'Arabic',
        bilingual: 'EN / AR',
        labelSize: 'Label size',
        saved: 'Saved',
        width: 'Width',
        height: 'Height',
        unit: 'Unit',
        custom: 'Custom',
        customSizeHint: 'Use in, mm, cm, or px. Saved size becomes the default custom label.',
        orientation: 'Orientation',
        portrait: 'Portrait',
        landscape: 'Landscape',
        theme: 'Accent color',
        font: 'Typography',
        density: 'Density',
        compact: 'Compact',
        normal: 'Normal',
        cozy: 'Cozy',
        textSize: 'Text size',
        small: 'Small',
        large: 'Large',
        qrLayout: 'QR layout',
        left: 'Left',
        right: 'Right',
        hide: 'Hide',
        qrPayload: 'QR payload',
        preset: 'Preset',
        standard: 'Standard',
        clinical: 'Clinical',
        tiny: 'Tiny',
        bilingualPreset: 'Bilingual',
        order: 'Order',
        appointment: 'Appointment',
        patient: 'Patient',
        brand: 'Brand',
        logo: 'Logo',
        initials: 'Initials',
        text: 'Text',
        hidden: 'Hidden',
        content: 'Content',
        includeBrand: 'Show center brand',
        includeExam: 'Procedure and time',
        includeDoctor: 'Referring doctor',
        includeDob: 'Date of birth',
        includeGender: 'Gender',
        includeMachine: 'Machine',
        includeOrder: 'Order number',
        includeAge: 'Patient age',
        print: 'Print Sticker',
        preview: 'Sticker preview',
        saveCustomization: 'Save customization',
        saving: 'Saving...',
        customizationSaved: 'Sticker customization saved',
        saveFailed: 'Could not save sticker customization',
        invalidSize: 'Enter a valid label width and height, for example 4in or 70mm.',
        close: 'Close',
        mrn: 'MRN',
        dob: 'DOB',
        age: 'Age',
        years: 'Y',
        gender: 'Gender',
        ref: 'Ref',
        self: 'Self',
        scheduled: 'Scheduled',
        examFallback: 'Radiology Exam',
        notAvailable: 'N/A',
        male: 'M',
        female: 'F',
        unknown: 'U'
    },
    ar: {
        customize: 'تخصيص الملصق',
        language: 'اللغة',
        stickerLanguage: 'لغة الملصق',
        currentSize: 'الحجم الحالي',
        languageAuto: 'تلقائي',
        english: 'الإنجليزية',
        arabic: 'العربية',
        bilingual: 'عربي / إنجليزي',
        labelSize: 'حجم الملصق',
        saved: 'محفوظ',
        width: 'العرض',
        height: 'الارتفاع',
        unit: 'الوحدة',
        custom: 'مخصص',
        customSizeHint: 'استخدم in أو mm أو cm أو px. سيتم حفظ الحجم المخصص كافتراضي.',
        orientation: 'الاتجاه',
        portrait: 'رأسي',
        landscape: 'أفقي',
        theme: 'لون التمييز',
        font: 'نوع الخط',
        density: 'الكثافة',
        compact: 'مضغوط',
        normal: 'عادي',
        cozy: 'واسع',
        textSize: 'حجم النص',
        small: 'صغير',
        large: 'كبير',
        qrLayout: 'مكان رمز QR',
        left: 'يسار',
        right: 'يمين',
        hide: 'إخفاء',
        qrPayload: 'محتوى QR',
        preset: 'النمط',
        standard: 'أساسي',
        clinical: 'سريري',
        tiny: 'صغير',
        bilingualPreset: 'ثنائي اللغة',
        order: 'الطلب',
        appointment: 'الموعد',
        patient: 'المريض',
        brand: 'الهوية',
        logo: 'الشعار',
        initials: 'الأحرف',
        text: 'نص',
        hidden: 'مخفي',
        content: 'المحتوى',
        includeBrand: 'إظهار هوية المركز',
        includeExam: 'الإجراء والوقت',
        includeDoctor: 'الطبيب المحول',
        includeDob: 'تاريخ الميلاد',
        includeGender: 'النوع',
        includeMachine: 'الجهاز',
        includeOrder: 'رقم الطلب',
        includeAge: 'عمر المريض',
        print: 'طباعة الملصق',
        preview: 'معاينة الملصق',
        saveCustomization: 'حفظ التخصيص',
        saving: 'جار الحفظ...',
        customizationSaved: 'تم حفظ تخصيص الملصق',
        saveFailed: 'تعذر حفظ تخصيص الملصق',
        invalidSize: 'أدخل عرض وارتفاع صحيحين مثل 4in أو 70mm.',
        close: 'إغلاق',
        mrn: 'رقم الملف',
        dob: 'الميلاد',
        age: 'العمر',
        years: 'س',
        gender: 'النوع',
        ref: 'المحول',
        self: 'ذاتي',
        scheduled: 'الموعد',
        examFallback: 'فحص أشعة',
        notAvailable: 'غير متاح',
        male: 'ذكر',
        female: 'أنثى',
        unknown: 'غير محدد'
    }
};

const getStickerLanguage = (mode, appIsArabic) => {
    if (mode === 'auto') return appIsArabic ? 'ar' : 'en';
    return mode;
};

const getStickerText = (language, key) => {
    if (language === 'both') {
        return `${STICKER_COPY.en[key] || key} / ${STICKER_COPY.ar[key] || key}`;
    }
    return STICKER_COPY[language]?.[key] || STICKER_COPY.en[key] || key;
};

const getStickerLocale = (language, appLanguage) => {
    if (language === 'ar') return 'ar-EG';
    if (language === 'both') return appLanguage?.startsWith('ar') ? 'ar-EG' : 'en-US';
    return 'en-US';
};

const formatStickerDateTime = (value, locale, options, fallback) => {
    if (!value) return fallback;
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return fallback;
    return date.toLocaleString(locale, options);
};

const calculateAge = (value) => {
    if (!value) return null;
    const birthDate = new Date(value);
    if (Number.isNaN(birthDate.getTime())) return null;
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDelta = today.getMonth() - birthDate.getMonth();
    if (monthDelta < 0 || (monthDelta === 0 && today.getDate() < birthDate.getDate())) age -= 1;
    return age >= 0 && age < 130 ? age : null;
};

const LABEL_PRESETS = {
    '4x2': { width: '4in', height: '2in', label: '4 x 2 in' },
    '3x2': { width: '3in', height: '2in', label: '3 x 2 in' },
    '2x1': { width: '2in', height: '1in', label: '2 x 1 in' },
    '70x35': { width: '70mm', height: '35mm', label: '70 x 35 mm' }
};

const VALID_DIMENSION_PATTERN = /^\d+(\.\d+)?(in|mm|cm|px)$/i;

const normalizeDimension = (value, unit = 'in') => {
    const trimmed = String(value || '').trim();
    if (!trimmed) return '';
    if (VALID_DIMENSION_PATTERN.test(trimmed)) return trimmed;
    if (/^\d+(\.\d+)?$/.test(trimmed)) return `${trimmed}${unit}`;
    return trimmed;
};

const isValidDimension = (value) => VALID_DIMENSION_PATTERN.test(String(value || '').trim());

const safeDimension = (value, fallback, unit = 'in') => {
    const normalized = normalizeDimension(value, unit);
    return isValidDimension(normalized) ? normalized : fallback;
};

const inferPaperSize = (width, height) => {
    const match = Object.entries(LABEL_PRESETS).find(([, preset]) => preset.width === width && preset.height === height);
    return match?.[0] || 'custom';
};

const PrintSticker = () => {
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    const copies = parseInt(searchParams.get('copies') || '1', 10);
    const { t, i18n } = useTranslation('common');
    
    const { data: appointment, isLoading: apptLoading, isError: apptError } = useGetAppointmentByIdQuery(id);
    const { data: settings, isLoading: settingsLoading } = useGetCenterSettingsQuery();
    const [updateSettings, updateState] = useUpdateCenterSettingsMutation();

    const [paperSize, setPaperSize] = useState('4x2');
    const [customWidth, setCustomWidth] = useState('4in');
    const [customHeight, setCustomHeight] = useState('2in');
    const [customUnit, setCustomUnit] = useState('in');
    const [orientation, setOrientation] = useState('landscape');
    const [showQR, setShowQR] = useState(true);
    const [showRefDoctor, setShowRefDoctor] = useState(true);
    const [showExamDetails, setShowExamDetails] = useState(true);

    // Advanced print settings states
    const [themeColor, setThemeColor] = useState('#087F5B');
    const [fontFamily, setFontFamily] = useState('Inter');
    const [paddingSize, setPaddingSize] = useState('normal'); // compact, normal, cozy
    const [textSize, setTextSize] = useState('normal'); // small, normal, large
    const [qrPosition, setQrPosition] = useState('right'); // left, right, hide
    const [stickerLanguage, setStickerLanguage] = useState('auto'); // auto, en, ar, both
    const [brandMode, setBrandMode] = useState('logo'); // logo, initials, text
    const [qrPayload, setQrPayload] = useState('order'); // order, appointment, patient
    const [showBrand, setShowBrand] = useState(true);
    const [showDob, setShowDob] = useState(true);
    const [showGender, setShowGender] = useState(true);
    const [showMachine, setShowMachine] = useState(true);
    const [showOrderNumber, setShowOrderNumber] = useState(true);
    const [showAge, setShowAge] = useState(false);
    const [layoutPreset, setLayoutPreset] = useState('standard');

    const isArabic = i18n.language.startsWith('ar');

    const centerSettings = useMemo(() => normalizeCenterSettings(settings), [settings]);

    useEffect(() => {
        if (centerSettings) {
            const ps = centerSettings.print_settings;
            if (ps) {
                const savedCustomization = ps.stickerCustomization || {};
                const savedWidth = savedCustomization.customWidth || ps.stickerWidth;
                const savedHeight = savedCustomization.customHeight || ps.stickerHeight;
                const savedPaperSize = savedCustomization.paperSize || inferPaperSize(savedWidth, savedHeight);
                if (savedPaperSize) setPaperSize(savedPaperSize);
                if (ps.stickerWidth) setCustomWidth(ps.stickerWidth);
                if (ps.stickerHeight) setCustomHeight(ps.stickerHeight);
                if (savedCustomization.customWidth) setCustomWidth(savedCustomization.customWidth);
                if (savedCustomization.customHeight) setCustomHeight(savedCustomization.customHeight);
                if (savedCustomization.customUnit) setCustomUnit(savedCustomization.customUnit);
                if (ps.showQR !== undefined) {
                    setShowQR(ps.showQR);
                    setQrPosition(ps.showQR ? 'right' : 'hide');
                }
                if (ps.themeColor) setThemeColor(ps.themeColor);
                if (ps.fontFamily) setFontFamily(ps.fontFamily);
                if (savedCustomization.orientation) setOrientation(savedCustomization.orientation);
                if (savedCustomization.stickerLanguage) setStickerLanguage(savedCustomization.stickerLanguage);
                if (savedCustomization.brandMode) setBrandMode(savedCustomization.brandMode);
                if (savedCustomization.qrPayload) setQrPayload(savedCustomization.qrPayload);
                if (savedCustomization.paddingSize) setPaddingSize(savedCustomization.paddingSize);
                if (savedCustomization.textSize) setTextSize(savedCustomization.textSize);
                if (savedCustomization.qrPosition) {
                    setQrPosition(savedCustomization.qrPosition);
                    setShowQR(savedCustomization.qrPosition !== 'hide');
                }
                if (savedCustomization.layoutPreset) setLayoutPreset(savedCustomization.layoutPreset);
                if (savedCustomization.showBrand !== undefined) setShowBrand(savedCustomization.showBrand);
                if (savedCustomization.showExamDetails !== undefined) setShowExamDetails(savedCustomization.showExamDetails);
                if (savedCustomization.showRefDoctor !== undefined) setShowRefDoctor(savedCustomization.showRefDoctor);
                if (savedCustomization.showDob !== undefined) setShowDob(savedCustomization.showDob);
                if (savedCustomization.showGender !== undefined) setShowGender(savedCustomization.showGender);
                if (savedCustomization.showMachine !== undefined) setShowMachine(savedCustomization.showMachine);
                if (savedCustomization.showOrderNumber !== undefined) setShowOrderNumber(savedCustomization.showOrderNumber);
                if (savedCustomization.showAge !== undefined) setShowAge(savedCustomization.showAge);
            }
        }
    }, [centerSettings]);

    if (apptLoading || settingsLoading) return <div className="flex h-screen items-center justify-center"><Loader2 className="animate-spin text-slate-400" size={32} /></div>;
    if (apptError || !appointment) return <div className="p-8 text-center font-bold text-red-500">{t('errors.loadFailed', { defaultValue: 'Failed to load details' })}</div>;

    const getDimensions = () => {
        const isLandscape = orientation === 'landscape';
        const preset = LABEL_PRESETS[paperSize];
        const base = preset || {
            width: safeDimension(customWidth, '4in', customUnit),
            height: safeDimension(customHeight, '2in', customUnit)
        };
        return isLandscape ? base : { width: base.height, height: base.width };
    };

    const dims = getDimensions();
    const activeStickerLanguage = getStickerLanguage(stickerLanguage, isArabic);
    const stickerIsArabic = activeStickerLanguage === 'ar';
    const stickerDir = stickerIsArabic ? 'rtl' : 'ltr';
    const dateLocale = getStickerLocale(activeStickerLanguage, i18n.language);
    const uiLanguage = isArabic ? 'ar' : 'en';
    const ui = (key) => STICKER_COPY[uiLanguage][key] || STICKER_COPY.en[key] || key;
    const label = (key) => getStickerText(activeStickerLanguage, key);
    const documentIdentity = resolveDocumentIdentity(centerSettings, appointment, { language: activeStickerLanguage, kind: 'sticker' });
    const centerName = documentIdentity.centerName;
    const branchName = documentIdentity.branchName;
    const logoUrl = documentIdentity.logoUrl;
    const brandInitials = String(centerName || VIARA_BRAND.name).trim().slice(0, 4).toUpperCase();
    const fontStack = fontFamily === 'Outfit' ? "'Outfit', sans-serif" : fontFamily === 'Space Mono' ? "'Space Mono', monospace" : fontFamily === 'Arial' ? "'Arial', sans-serif" : "'Inter', sans-serif";
    const qrValueMap = {
        order: appointment.order_number || appointment.exam_id || appointment.appointment_id,
        appointment: appointment.appointment_id || appointment.exam_id || appointment.order_number,
        patient: appointment.mrn || appointment.patient_id || appointment.order_number
    };
    const qrValue = String(qrValueMap[qrPayload] || appointment.order_number || appointment.appointment_id || appointment.mrn || VIARA_BRAND.name);
    const qrCaption = qrPayload === 'patient'
        ? (appointment.mrn || label('patient'))
        : qrPayload === 'appointment'
            ? (appointment.appointment_id || label('appointment'))
            : (appointment.order_number || appointment.exam_id || label('order'));
    const patientName = appointment.patient_name || label('patient');
    const examName = appointment.exam_type_name || label('examFallback');
    const refDoctor = appointment.referring_doctor_name ? appointment.referring_doctor_name.split(' ')[0] : label('self');
    const dobText = formatStickerDateTime(appointment.date_of_birth, dateLocale, { dateStyle: 'short' }, label('notAvailable'));
    const scheduledDate = formatStickerDateTime(appointment.start_time, dateLocale, { dateStyle: 'short' }, label('notAvailable'));
    const scheduledTime = formatStickerDateTime(appointment.start_time, dateLocale, { hour: '2-digit', minute: '2-digit' }, '');
    const genderKey = String(appointment.gender || '').toLowerCase().startsWith('f') ? 'female' : String(appointment.gender || '').toLowerCase().startsWith('m') ? 'male' : 'unknown';
    const age = calculateAge(appointment.date_of_birth);
    const ageText = age === null ? label('notAvailable') : `${age}${label('years')}`;
    const orderReference = appointment.order_number || appointment.exam_id || appointment.appointment_id;
    const metaFields = [
        { key: 'mrn', label: label('mrn'), value: appointment.mrn || label('notAvailable'), mono: true, show: true },
        { key: 'order', label: label('order'), value: orderReference || label('notAvailable'), mono: true, show: showOrderNumber },
        { key: 'dob', label: label('dob'), value: dobText, mono: true, show: showDob },
        { key: 'age', label: label('age'), value: ageText, mono: true, show: showAge },
        { key: 'gender', label: label('gender'), value: label(genderKey), show: showGender },
        { key: 'ref', label: label('ref'), value: refDoctor, show: showRefDoctor }
    ].filter(field => field.show);
    const metaGridClass = metaFields.length > 2 ? 'grid-cols-2' : 'grid-cols-1';
    const isTinyLabel = paperSize === '2x1';
    const qrSize = isTinyLabel ? 38 : orientation === 'portrait' ? 44 : 58;
    const qrRailWidth = isTinyLabel ? '0.72in' : '1.1in';

    // Style helper values
    const getPaddingClass = () => {
        if (paddingSize === 'compact') return 'p-2 gap-1';
        if (paddingSize === 'cozy') return 'p-4 gap-2.5';
        return 'p-3 gap-1.5';
    };

    const getTextScale = () => {
        if (textSize === 'small') return { name: 'text-base', meta: 'text-[9px]', tag: 'text-[8px]' };
        if (textSize === 'large') return { name: 'text-xl', meta: 'text-[12px]', tag: 'text-[11px]' };
        return { name: 'text-lg', meta: 'text-[11px]', tag: 'text-[10px]' };
    };

    const txt = getTextScale();
    const optionButtonStyle = (isActive) => ({
        borderColor: isActive ? themeColor : '#e2e8f0',
        backgroundColor: isActive ? `${themeColor}12` : '#ffffff',
        color: isActive ? themeColor : '#475569'
    });
    const qrRailStyle = (side) => {
        if (orientation === 'portrait') {
            return side === 'left'
                ? { borderBottom: '1px dashed #e2e8f0' }
                : { borderTop: '1px dashed #e2e8f0' };
        }
        return side === 'left'
            ? { borderInlineEnd: '1px dashed #e2e8f0' }
            : { borderInlineStart: '1px dashed #e2e8f0' };
    };
    const renderBrand = () => {
        if (!showBrand || brandMode === 'hidden') return null;

        if (brandMode === 'text') {
            return (
                <div className="min-w-0">
                    <div className="truncate text-[9px] font-black uppercase tracking-wide text-slate-700">{centerName}</div>
                    {branchName && <div className="truncate text-[7px] font-black uppercase tracking-wider text-slate-400">{branchName}</div>}
                </div>
            );
        }

        return (
            <div className="flex min-w-0 items-center gap-1.5">
                {brandMode === 'logo' && logoUrl ? (
                    <img src={logoUrl} alt="" className="h-6 w-6 shrink-0 rounded object-contain" />
                ) : (
                    <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded text-[7px] font-black text-white" style={{ backgroundColor: themeColor }}>
                        {brandInitials}
                    </span>
                )}
                <div className="min-w-0">
                    <div className="truncate text-[9px] font-black uppercase tracking-wide text-slate-700">{centerName}</div>
                    {branchName && <div className="truncate text-[7px] font-black uppercase tracking-wider text-slate-400">{branchName}</div>}
                </div>
            </div>
        );
    };
    const ToggleRow = ({ checked, onChange, children }) => (
        <label className="flex min-h-9 cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 transition hover:border-slate-300">
            <span>{children}</span>
            <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500" />
        </label>
    );
    const setPresetPaperSize = (size) => {
        setPaperSize(size);
        if (LABEL_PRESETS[size]) {
            setCustomWidth(LABEL_PRESETS[size].width);
            setCustomHeight(LABEL_PRESETS[size].height);
        }
    };
    const setCustomDimension = (field, value) => {
        setPaperSize('custom');
        const setter = field === 'width' ? setCustomWidth : setCustomHeight;
        setter(value);
    };
    const applyPreset = (preset) => {
        setLayoutPreset(preset);
        if (preset === 'tiny') {
            setPresetPaperSize('2x1');
            setOrientation('landscape');
            setPaddingSize('compact');
            setTextSize('small');
            setQrPosition('hide');
            setShowQR(false);
            setShowBrand(false);
            setShowExamDetails(false);
            setShowRefDoctor(false);
            setShowDob(false);
            setShowGender(false);
            setShowMachine(false);
            setShowOrderNumber(true);
            setShowAge(false);
            return;
        }
        if (preset === 'clinical') {
            setPresetPaperSize('4x2');
            setOrientation('landscape');
            setPaddingSize('normal');
            setTextSize('normal');
            setQrPosition('right');
            setShowQR(true);
            setShowBrand(true);
            setBrandMode('logo');
            setShowExamDetails(true);
            setShowRefDoctor(true);
            setShowDob(true);
            setShowGender(true);
            setShowMachine(true);
            setShowOrderNumber(true);
            setShowAge(true);
            return;
        }
        if (preset === 'bilingualPreset') {
            setPresetPaperSize('4x2');
            setOrientation('landscape');
            setPaddingSize('compact');
            setTextSize('small');
            setStickerLanguage('both');
            setQrPosition('right');
            setShowQR(true);
            setShowBrand(true);
            setBrandMode('text');
            setShowExamDetails(true);
            setShowRefDoctor(true);
            setShowDob(true);
            setShowGender(true);
            setShowMachine(true);
            setShowOrderNumber(true);
            setShowAge(false);
            return;
        }
        setPresetPaperSize('4x2');
        setOrientation('landscape');
        setPaddingSize('normal');
        setTextSize('normal');
        setQrPosition('right');
        setShowQR(true);
        setShowBrand(true);
        setBrandMode('logo');
        setShowExamDetails(true);
        setShowRefDoctor(true);
        setShowDob(true);
        setShowGender(true);
        setShowMachine(true);
        setShowOrderNumber(true);
        setShowAge(false);
    };
    const saveCustomization = async () => {
        const stickerWidth = paperSize === 'custom' ? normalizeDimension(customWidth, customUnit) : LABEL_PRESETS[paperSize]?.width;
        const stickerHeight = paperSize === 'custom' ? normalizeDimension(customHeight, customUnit) : LABEL_PRESETS[paperSize]?.height;
        if (!isValidDimension(stickerWidth) || !isValidDimension(stickerHeight)) {
            toast.error(ui('invalidSize'));
            return;
        }

        const stickerCustomization = {
            paperSize,
            customWidth: stickerWidth,
            customHeight: stickerHeight,
            customUnit,
            orientation,
            stickerLanguage,
            layoutPreset,
            themeColor,
            fontFamily,
            paddingSize,
            textSize,
            qrPosition,
            qrPayload,
            brandMode,
            showBrand,
            showExamDetails,
            showRefDoctor,
            showDob,
            showGender,
            showMachine,
            showOrderNumber,
            showAge
        };

        try {
            await updateSettings({
                ...centerSettings,
                print_settings: {
                    ...centerSettings.print_settings,
                    stickerWidth,
                    stickerHeight,
                    showQR,
                    themeColor,
                    fontFamily,
                    stickerCustomization
                }
            }).unwrap();
            toast.success(ui('customizationSaved'));
        } catch (error) {
            toast.error(getErrorMessage(error, ui('saveFailed')));
        }
    };

    return (
        <div className="print-workspace min-h-screen bg-slate-100 flex flex-col lg:flex-row print:block print:bg-white" dir={isArabic ? 'rtl' : 'ltr'}>
            <style>
                {`
                    @import url('https://fonts.googleapis.com/css2?family=Space+Mono:wght@400;700&family=Inter:wght@400;500;600;700;800&family=Outfit:wght@400;500;600;700;800&display=swap');
                    @media print {
                        @page {
                            size: ${dims.width} ${dims.height};
                            margin: 0;
                        }
                        body {
                            margin: 0;
                            padding: 0;
                            background-color: white !important;
                            -webkit-print-color-adjust: exact;
                            print-color-adjust: exact;
                        }
                        .sticker-container {
                            border: none !important;
                            box-shadow: none !important;
                            page-break-after: always;
                            margin: 0 !important;
                            border-radius: 0 !important;
                            width: ${dims.width} !important;
                            height: ${dims.height} !important;
                        }
                        .sticker-container:last-child {
                            page-break-after: auto;
                            break-after: auto;
                        }
                        .no-print {
                            display: none !important;
                        }
                    }
                `}
            </style>
            
            {/* Configuration Sidebar */}
            <aside className="print-controls no-print w-full lg:w-80 bg-white border-b lg:border-b-0 lg:border-e border-slate-200 p-4 sm:p-5 flex flex-col shrink-0 h-auto lg:h-screen lg:sticky top-0 overflow-y-auto z-10 font-sans">
                <div className="mb-5 flex items-center gap-3 text-slate-800">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-50 ring-1 ring-slate-200">
                        <Settings2 size={20} style={{ color: themeColor }} />
                    </span>
                    <div>
                        <h2 className="text-lg font-black tracking-tight">{ui('customize')}</h2>
                        <p className="mt-0.5 text-[11px] font-semibold text-slate-400">
                            {ui('currentSize')}: <span className="ltr-embed">{dims.width} x {dims.height}</span>
                        </p>
                    </div>
                </div>

                <div className="space-y-4 flex-1 text-slate-700">
                    <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">{ui('language')}</label>
                        <LanguageToggle variant="default" className="w-full justify-center" />
                        <label className="mt-3 block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">{ui('stickerLanguage')}</label>
                        <select value={stickerLanguage} onChange={e => setStickerLanguage(e.target.value)} className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs font-bold text-slate-700">
                            <option value="auto">{ui('languageAuto')}</option>
                            <option value="en">{ui('english')}</option>
                            <option value="ar">{ui('arabic')}</option>
                            <option value="both">{ui('bilingual')}</option>
                        </select>
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white p-3">
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">{ui('preset')}</label>
                        <div className="grid grid-cols-2 gap-1.5">
                            {['standard', 'clinical', 'tiny', 'bilingualPreset'].map(preset => (
                                <button
                                    key={preset}
                                    type="button"
                                    onClick={() => applyPreset(preset)}
                                    className="min-h-9 rounded-lg border px-2 py-1.5 text-xs font-bold transition-all"
                                    style={optionButtonStyle(layoutPreset === preset)}
                                >
                                    {ui(preset)}
                                </button>
                            ))}
                        </div>
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white p-3">
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">{ui('labelSize')}</label>
                        <div className="grid grid-cols-2 gap-1.5">
                            {[...Object.keys(LABEL_PRESETS), 'custom'].map(size => (
                                <button
                                    key={size}
                                    type="button"
                                    onClick={() => size === 'custom' ? setPaperSize('custom') : setPresetPaperSize(size)}
                                    className="min-h-9 rounded-lg border px-2 py-1.5 text-xs font-bold transition-all"
                                    style={optionButtonStyle(paperSize === size)}
                                >
                                    {size === 'custom' ? ui('custom') : LABEL_PRESETS[size].label}
                                </button>
                            ))}
                        </div>
                        <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/80 p-2">
                            <div className="mb-2 grid grid-cols-3 gap-1.5">
                                {['in', 'mm', 'cm'].map(unit => (
                                    <button
                                        key={unit}
                                        type="button"
                                        onClick={() => {
                                            setCustomUnit(unit);
                                            setPaperSize('custom');
                                        }}
                                        className="rounded-md border px-2 py-1 text-[11px] font-black uppercase transition-all"
                                        style={optionButtonStyle(customUnit === unit)}
                                    >
                                        {unit}
                                    </button>
                                ))}
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <label className="block">
                                    <span className="mb-1 block text-[9px] font-black uppercase tracking-wider text-slate-400">{ui('width')}</span>
                                    <input
                                        value={customWidth}
                                        onChange={e => setCustomDimension('width', e.target.value)}
                                        onBlur={() => setCustomWidth(current => normalizeDimension(current, customUnit))}
                                        className="w-full rounded-lg border border-slate-200 bg-white p-2 font-mono text-xs font-bold"
                                        placeholder={`4${customUnit}`}
                                    />
                                </label>
                                <label className="block">
                                    <span className="mb-1 block text-[9px] font-black uppercase tracking-wider text-slate-400">{ui('height')}</span>
                                    <input
                                        value={customHeight}
                                        onChange={e => setCustomDimension('height', e.target.value)}
                                        onBlur={() => setCustomHeight(current => normalizeDimension(current, customUnit))}
                                        className="w-full rounded-lg border border-slate-200 bg-white p-2 font-mono text-xs font-bold"
                                        placeholder={`2${customUnit}`}
                                    />
                                </label>
                            </div>
                            <p className="mt-2 text-[10px] font-semibold leading-4 text-slate-400">{ui('customSizeHint')}</p>
                        </div>
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white p-3">
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">{ui('orientation')}</label>
                        <div className="grid grid-cols-2 gap-1.5">
                            <button onClick={() => setOrientation('portrait')} className="py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center justify-center gap-1.5" style={optionButtonStyle(orientation === 'portrait')}>
                                <Layout size={12} className="rotate-90" /> {ui('portrait')}
                            </button>
                            <button onClick={() => setOrientation('landscape')} className="py-1.5 rounded-lg text-xs font-bold border transition-all flex items-center justify-center gap-1.5" style={optionButtonStyle(orientation === 'landscape')}>
                                <Layout size={12} /> {ui('landscape')}
                            </button>
                        </div>
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">{ui('theme')}</label>
                        <select value={themeColor} onChange={e => setThemeColor(e.target.value)} className="w-full text-xs font-bold border border-slate-200 rounded-lg p-2 bg-white">
                            <option value="#087F5B">VIARA Emerald</option>
                            <option value="#327C92">Clinical Info</option>
                            <option value="#F4B942">Attention Amber</option>
                            <option value="#D95757">Critical Coral</option>
                        </select>

                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">{ui('font')}</label>
                        <select value={fontFamily} onChange={e => setFontFamily(e.target.value)} className="w-full text-xs font-bold border border-slate-200 rounded-lg p-2 bg-white">
                            <option value="Inter">Inter (Sans-serif)</option>
                            <option value="Outfit">Outfit (Round style)</option>
                            <option value="Space Mono">Space Mono (Tech style)</option>
                            <option value="Arial">Arial (Standard)</option>
                        </select>
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white p-3">
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">{ui('density')}</label>
                        <div className="grid grid-cols-3 gap-1.5">
                            {['compact', 'normal', 'cozy'].map(pad => (
                                <button
                                    key={pad}
                                    onClick={() => setPaddingSize(pad)}
                                    className="py-1.5 rounded-lg text-xs font-bold border capitalize transition-all"
                                    style={optionButtonStyle(paddingSize === pad)}
                                >
                                    {ui(pad)}
                                </button>
                            ))}
                        </div>
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white p-3">
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">{ui('textSize')}</label>
                        <div className="grid grid-cols-3 gap-1.5">
                            {['small', 'normal', 'large'].map(scale => (
                                <button
                                    key={scale}
                                    onClick={() => setTextSize(scale)}
                                    className="py-1.5 rounded-lg text-xs font-bold border capitalize transition-all"
                                    style={optionButtonStyle(textSize === scale)}
                                >
                                    {ui(scale)}
                                </button>
                            ))}
                        </div>
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">{ui('qrLayout')}</label>
                        <div className="grid grid-cols-3 gap-1.5">
                            {['left', 'right', 'hide'].map(pos => (
                                <button
                                    key={pos}
                                    onClick={() => {
                                        setQrPosition(pos);
                                        setShowQR(pos !== 'hide');
                                    }}
                                    className="py-1.5 rounded-lg text-xs font-bold border capitalize transition-all"
                                    style={optionButtonStyle(qrPosition === pos)}
                                >
                                    {ui(pos)}
                                </button>
                            ))}
                        </div>
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">{ui('qrPayload')}</label>
                        <select value={qrPayload} onChange={e => setQrPayload(e.target.value)} disabled={!showQR} className="w-full text-xs font-bold border border-slate-200 rounded-lg p-2 bg-white disabled:bg-slate-50 disabled:text-slate-400">
                            <option value="order">{ui('order')}</option>
                            <option value="appointment">{ui('appointment')}</option>
                            <option value="patient">{ui('patient')}</option>
                        </select>
                    </section>

                    <section className="rounded-xl border border-slate-200 bg-white p-3">
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400 mb-2">{ui('brand')}</label>
                        <div className="grid grid-cols-3 gap-1.5">
                            {['logo', 'initials', 'text'].map(mode => (
                                <button
                                    key={mode}
                                    onClick={() => setBrandMode(mode)}
                                    className="py-1.5 rounded-lg text-xs font-bold border capitalize transition-all"
                                    style={optionButtonStyle(brandMode === mode)}
                                >
                                    {ui(mode)}
                                </button>
                            ))}
                        </div>
                    </section>

                    <section className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3">
                        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-400">{ui('content')}</label>
                        <ToggleRow checked={showBrand} onChange={setShowBrand}>{ui('includeBrand')}</ToggleRow>
                        <ToggleRow checked={showExamDetails} onChange={setShowExamDetails}>{ui('includeExam')}</ToggleRow>
                        <ToggleRow checked={showOrderNumber} onChange={setShowOrderNumber}>{ui('includeOrder')}</ToggleRow>
                        <ToggleRow checked={showAge} onChange={setShowAge}>{ui('includeAge')}</ToggleRow>
                        <ToggleRow checked={showRefDoctor} onChange={setShowRefDoctor}>{ui('includeDoctor')}</ToggleRow>
                        <ToggleRow checked={showDob} onChange={setShowDob}>{ui('includeDob')}</ToggleRow>
                        <ToggleRow checked={showGender} onChange={setShowGender}>{ui('includeGender')}</ToggleRow>
                        <ToggleRow checked={showMachine} onChange={setShowMachine}>{ui('includeMachine')}</ToggleRow>
                    </section>
                </div>

                <div className="sticky bottom-0 mt-6 space-y-2 border-t border-slate-200 bg-white/95 pt-4 pb-1 backdrop-blur">
                    <button
                        type="button"
                        onClick={saveCustomization}
                        disabled={updateState.isLoading}
                        className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2.5 font-extrabold text-slate-700 shadow-sm transition-all hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        {updateState.isLoading ? <Loader2 size={16} className="animate-spin" /> : updateState.isSuccess ? <CheckCircle2 size={16} className="text-emerald-600" /> : <Save size={16} />}
                        {updateState.isLoading ? ui('saving') : ui('saveCustomization')}
                    </button>
                    <button onClick={() => printWhenReady()} className="w-full flex items-center justify-center gap-2 rounded-xl py-3 font-extrabold text-white shadow-sm transition-all" style={{ backgroundColor: themeColor }}>
                        <Printer size={16} /> {ui('print')} ({copies})
                    </button>
                    <button onClick={() => window.close()} className="w-full flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-2 font-bold text-slate-500 hover:bg-slate-50 transition-all text-xs">
                        {ui('close')}
                    </button>
                </div>
            </aside>

            {/* Print Preview Canvas */}
            <main className="print-preview-stage flex min-w-0 flex-1 overflow-auto p-4 lg:p-8 flex-col items-center justify-start gap-4 bg-slate-200/50" aria-label={ui('preview')}>
                {Array.from({ length: copies }).map((_, index) => (
                    <div 
                        key={index} 
                        className={`sticker-container print-document print-label box-border overflow-hidden rounded-lg border border-slate-300 bg-white shadow-md flex ${orientation === 'portrait' ? 'flex-col' : 'flex-row'}`} 
                        style={{ 
                            width: dims.width, 
                            height: dims.height, 
                            ...getSheetPreviewVariables({ width: dims.width, height: dims.height }),
                            fontFamily: fontStack,
                            borderLeft: orientation === 'landscape' ? `5px solid ${themeColor}` : 'none',
                            borderTop: orientation === 'portrait' ? `5px solid ${themeColor}` : 'none'
                        }}
                    >
                        {/* Left Side QR layout (if chosen) */}
                        {showQR && qrPosition === 'left' && (
                            <div className={`flex flex-col items-center justify-center bg-slate-50/50 ${isTinyLabel ? 'p-1' : 'p-2'} ${orientation === 'portrait' ? 'h-auto w-full py-2' : 'shrink-0'}`} style={{ ...qrRailStyle('left'), width: orientation === 'portrait' ? '100%' : qrRailWidth }}>
                                <QRCodeSVG value={qrValue} size={qrSize} className="mb-1" />
                                <div className="max-w-full truncate text-[7px] font-black text-slate-500 font-mono tracking-wider ltr-embed">
                                    {qrCaption}
                                </div>
                            </div>
                        )}

                        <div className={`flex flex-1 flex-col justify-between overflow-hidden ${getPaddingClass()}`} dir={stickerDir}>
                            <div>
                                <div className={`flex items-start gap-2 ${showBrand && brandMode !== 'hidden' ? 'justify-between' : 'justify-end'}`}>
                                    {renderBrand()}
                                    <span className="text-[8px] font-black tracking-widest px-1.5 py-0.5 rounded text-white" style={{ backgroundColor: themeColor }}>
                                        {appointment.modality_type || 'RAD'}
                                    </span>
                                </div>
                                {showExamDetails && (
                                    <div className={`${txt.tag} font-extrabold uppercase tracking-wide mt-1.5`} style={{ color: themeColor }}>
                                        {examName}
                                    </div>
                                )}
                                <div className={`${txt.name} font-black leading-tight text-slate-800 tracking-tight truncate mt-0.5`}>
                                    {patientName}
                                </div>
                            </div>
                            
                            <div className={`grid ${metaGridClass} gap-x-2 gap-y-0.5 border-t border-slate-100 pt-1.5`}>
                                {metaFields.map(field => (
                                    <div key={field.key} className={`${txt.meta} truncate`}>
                                        <span className="font-semibold text-slate-400">{field.label}:</span>{' '}
                                        <span className={`font-bold text-slate-700 ${field.mono ? 'ltr-embed' : ''}`}>{field.value}</span>
                                    </div>
                                ))}
                            </div>
                            
                            {showExamDetails && (
                                <div className="mt-1 flex items-center justify-between text-[8px] font-semibold text-slate-400 border-t border-slate-100 pt-1.5">
                                    <span className="ltr-embed">{label('scheduled')}: {scheduledDate} {scheduledTime}</span>
                                    {showMachine && <span className="font-bold uppercase ltr-embed" style={{ color: themeColor }}>{appointment.machine_name || appointment.modality_type || ''}</span>}
                                </div>
                            )}
                        </div>

                        {/* Right Side QR layout (if chosen) */}
                        {showQR && qrPosition === 'right' && (
                            <div className={`flex flex-col items-center justify-center bg-slate-50/50 ${isTinyLabel ? 'p-1' : 'p-2'} ${orientation === 'portrait' ? 'h-auto w-full py-2' : 'shrink-0'}`} style={{ ...qrRailStyle('right'), width: orientation === 'portrait' ? '100%' : qrRailWidth }}>
                                <QRCodeSVG value={qrValue} size={qrSize} className="mb-1" />
                                <div className="max-w-full truncate text-[7px] font-black text-slate-500 font-mono tracking-wider ltr-embed">
                                    {qrCaption}
                                </div>
                            </div>
                        )}
                    </div>
                ))}
            </main>
        </div>
    );
};

export default PrintSticker;
