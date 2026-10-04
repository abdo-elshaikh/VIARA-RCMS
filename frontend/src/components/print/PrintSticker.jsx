import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useGetAppointmentByIdQuery, useGetCenterSettingsQuery, useUpdateCenterSettingsMutation } from '../../store/api';
import { QRCodeSVG } from 'qrcode.react';
import { CheckCircle2, Loader2, Save } from 'lucide-react';
import LanguageToggle from '../ui/LanguageToggle';
import { normalizeCenterSettings, resolveDocumentIdentity } from '../../utils/centerSettings';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { VIARA_BRAND } from '../../config/brand';
import { getSheetPreviewVariables, printWhenReady } from '../../utils/printDocument';
import {
    LABEL_PRESETS,
    PRINT_ACCENTS,
    PRINT_FONTS,
    buildPrintStyles,
    getDocScaleClasses,
    printCopy,
    printOptionLabels,
    getFontStack,
    resolvePageRule,
} from './printTheme';
import {
    PrintSidebar,
    PrintStage,
    PrintField,
    PrintSection,
    PrintSegmented,
    PrintSelectField,
    PrintTextInput,
    PrintToggle,
} from './PrintControls';
import { DocPill } from './PrintDocument';
import '../../styles/printDocuments.css';

const STICKER_COPY = {
    en: {
        customize: 'Sticker print settings',
        stickerLanguage: 'Sticker language',
        customSizeHint: 'Use in, mm, cm, or px. Saved size becomes the default custom label.',
        textSize: 'Text size',
        small: 'Small',
        large: 'Large',
        qrLayout: 'QR layout',
        left: 'Left',
        right: 'Right',
        hide: 'Hide',
        qrPayload: 'QR payload',
        caseDetails: 'Case details',
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
        includeBrand: 'Show center brand',
        includeExam: 'Procedure and time',
        includeDoctor: 'Referring doctor',
        includeDob: 'Date of birth',
        includeGender: 'Gender',
        includeMachine: 'Machine',
        includeOrder: 'Order number',
        includeAge: 'Patient age',
        print: 'Print sticker',
        preview: 'Sticker preview',
        saveCustomization: 'Save customization',
        customizationSaved: 'Sticker customization saved',
        saveFailed: 'Could not save sticker customization',
        invalidSize: 'Enter a valid label width and height, for example 4in or 70mm.',
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
        customize: 'إعدادات طباعة الملصق',
        stickerLanguage: 'لغة الملصق',
        customSizeHint: 'استخدم in أو mm أو cm أو px. سيتم حفظ الحجم المخصص كافتراضي.',
        textSize: 'حجم النص',
        small: 'صغير',
        large: 'كبير',
        qrLayout: 'مكان رمز QR',
        left: 'يسار',
        right: 'يمين',
        hide: 'إخفاء',
        qrPayload: 'محتوى QR',
        caseDetails: 'تفاصيل الحالة',
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
        customizationSaved: 'تم حفظ تخصيص الملصق',
        saveFailed: 'تعذر حفظ تخصيص الملصق',
        invalidSize: 'أدخل عرض وارتفاع صحيحين مثل 4in أو 70mm.',
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

const parseCopyCount = (value) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1), 100) : 1;
};

const PrintSticker = () => {
    const { id } = useParams();
    const [searchParams] = useSearchParams();
    const copies = parseCopyCount(searchParams.get('copies') || '1');
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

    const [themeColor, setThemeColor] = useState('#087F5B');
    const [fontFamily, setFontFamily] = useState('Inter');
    const [paddingSize, setPaddingSize] = useState('normal');
    const [textSize, setTextSize] = useState('normal');
    const [qrPosition, setQrPosition] = useState('right');
    const [stickerLanguage, setStickerLanguage] = useState('auto');
    const [brandMode, setBrandMode] = useState('logo');
    const [qrPayload, setQrPayload] = useState('case');
    const [showBrand, setShowBrand] = useState(true);
    const [showDob, setShowDob] = useState(true);
    const [showGender, setShowGender] = useState(true);
    const [showMachine, setShowMachine] = useState(true);
    const [showOrderNumber, setShowOrderNumber] = useState(true);
    const [showAge, setShowAge] = useState(false);
    const [layoutPreset, setLayoutPreset] = useState('standard');

    const isArabic = i18n.language.startsWith('ar');
    const base = printCopy(isArabic);
    const doc = STICKER_COPY[isArabic ? 'ar' : 'en'];
    const copy = {
        ...base,
        ...doc,
        cozy: base.cozy,
    };

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
        const baseDims = preset || {
            width: safeDimension(customWidth, '4in', customUnit),
            height: safeDimension(customHeight, '2in', customUnit)
        };
        return isLandscape ? baseDims : { width: baseDims.height, height: baseDims.width };
    };

    const dims = getDimensions();
    const activeStickerLanguage = getStickerLanguage(stickerLanguage, isArabic);
    const stickerIsArabic = activeStickerLanguage === 'ar';
    const stickerDir = stickerIsArabic ? 'rtl' : 'ltr';
    const dateLocale = getStickerLocale(activeStickerLanguage, i18n.language);
    const label = (key) => getStickerText(activeStickerLanguage, key);
    const documentIdentity = resolveDocumentIdentity(centerSettings, appointment, { language: activeStickerLanguage, kind: 'sticker' });
    const centerName = documentIdentity.centerName;
    const branchName = documentIdentity.branchName;
    const logoUrl = documentIdentity.logoUrl;
    const brandInitials = String(centerName || VIARA_BRAND.name).trim().slice(0, 4).toUpperCase();
    const fontStack = getFontStack(fontFamily);
    const caseExamId = appointment.exam_id || null;
    const caseUrl = caseExamId ? `${window.location.origin}/cases/${caseExamId}` : '';
    const qrValueMap = {
        case: caseUrl,
        order: appointment.order_number || appointment.exam_id || appointment.appointment_id,
        appointment: appointment.appointment_id || appointment.exam_id || appointment.order_number,
        patient: appointment.mrn || appointment.patient_id || appointment.order_number
    };
    const qrValue = String(qrValueMap[qrPayload] || caseUrl || appointment.order_number || appointment.appointment_id || appointment.mrn || VIARA_BRAND.name);
    const qrCaption = qrPayload === 'case'
        ? (caseExamId || label('caseDetails'))
        : qrPayload === 'patient'
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

    const docScale = getDocScaleClasses({ label: true, density: paddingSize, text: textSize === 'small' ? 'small' : textSize === 'large' ? 'large' : 'normal' });
    const railPad = paddingSize === 'compact' ? 'p-1' : paddingSize === 'cozy' ? 'p-3' : 'p-2';
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
                    <div className="pd-micro truncate font-black uppercase text-slate-700" style={{ letterSpacing: '0.03em' }}>{centerName}</div>
                    {branchName && <div className="pd-micro truncate font-black uppercase text-slate-400" style={{ letterSpacing: '0.05em' }}>{branchName}</div>}
                </div>
            );
        }

        return (
            <div className="flex min-w-0 items-center gap-1.5">
                {brandMode === 'logo' && logoUrl ? (
                    <img src={logoUrl} alt="" className="h-6 w-6 shrink-0 rounded object-contain" />
                ) : (
                    <span className="pd-micro flex h-6 min-w-6 shrink-0 items-center justify-center rounded font-black text-white" style={{ backgroundColor: themeColor }}>
                        {brandInitials}
                    </span>
                )}
                <div className="min-w-0">
                    <div className="pd-micro truncate font-black uppercase text-slate-700" style={{ letterSpacing: '0.03em' }}>{centerName}</div>
                    {branchName && <div className="pd-micro truncate font-black uppercase text-slate-400" style={{ letterSpacing: '0.05em' }}>{branchName}</div>}
                </div>
            </div>
        );
    };
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
            toast.error(copy.invalidSize);
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
            toast.success(copy.customizationSaved);
        } catch (error) {
            toast.error(getErrorMessage(error, copy.saveFailed));
        }
    };

    return (
        <div className="print-workspace min-h-screen bg-slate-100 flex flex-col lg:flex-row print:block print:bg-white" dir={isArabic ? 'rtl' : 'ltr'} style={{ '--print-accent': themeColor }}>
            <style>
                {buildPrintStyles({
                    pageRule: resolvePageRule({ label: dims }),
                    extraCss: `
                        .sticker-container {
                            border: none !important;
                            box-shadow: none !important;
                            page-break-after: always;
                            break-after: page;
                            margin: 0 !important;
                            border-radius: 0 !important;
                            width: ${dims.width} !important;
                            height: ${dims.height} !important;
                        }
                        .sticker-container:last-child {
                            page-break-after: auto;
                            break-after: auto;
                        }
                    `,
                })}
            </style>

            <PrintSidebar
                title={copy.customize}
                subtitle={`${copy.currentSize}: ${dims.width} × ${dims.height}`}
                onPrint={() => printWhenReady()}
                printLabel={`${copy.print} (${copies})`}
                onSave={saveCustomization}
                saveLabel={copy.saveCustomization}
                saveDisabled={updateState.isLoading}
                saveIcon={updateState.isSuccess ? CheckCircle2 : Save}
                onClose={() => window.close()}
                closeLabel={copy.close}
            >
                <PrintField label={copy.language}>
                    <LanguageToggle variant="default" className="w-full justify-center" />
                    <select value={stickerLanguage} onChange={e => setStickerLanguage(e.target.value)} className="print-select mt-2">
                        <option value="auto">{copy.languageAuto}</option>
                        <option value="en">{copy.english}</option>
                        <option value="ar">{copy.arabic}</option>
                        <option value="both">{copy.bilingual}</option>
                    </select>
                </PrintField>

                <PrintField label={copy.preset}>
                    <PrintSegmented
                        options={printOptionLabels([
                            { value: 'standard', en: copy.standard, ar: copy.standard },
                            { value: 'clinical', en: copy.clinical, ar: copy.clinical },
                            { value: 'tiny', en: copy.tiny, ar: copy.tiny },
                            { value: 'bilingualPreset', en: copy.bilingualPreset, ar: copy.bilingualPreset },
                        ], isArabic)}
                        value={layoutPreset}
                        onChange={applyPreset}
                        columns={2}
                        ariaLabel={copy.preset}
                    />
                </PrintField>

                <PrintField label={copy.labelSize}>
                    <PrintSegmented
                        options={printOptionLabels(
                            [...Object.entries(LABEL_PRESETS).map(([key, preset]) => ({ value: key, en: preset.label, ar: preset.label })), { value: 'custom', en: copy.custom, ar: copy.custom }],
                            isArabic
                        )}
                        value={paperSize}
                        onChange={(size) => size === 'custom' ? setPaperSize('custom') : setPresetPaperSize(size)}
                        columns={2}
                        ariaLabel={copy.labelSize}
                    />
                    <div className="print-section rounded-lg border border-slate-100 bg-slate-50/80 p-2">
                        <PrintSegmented
                            options={printOptionLabels(['in', 'mm', 'cm'].map(unit => ({ value: unit, en: unit.toUpperCase(), ar: unit.toUpperCase() })), isArabic)}
                            value={customUnit}
                            onChange={(unit) => {
                                setCustomUnit(unit);
                                setPaperSize('custom');
                            }}
                            columns={3}
                            ariaLabel={copy.unit}
                        />
                        <div className="grid grid-cols-2 gap-2">
                            <PrintTextInput
                                label={copy.width}
                                value={customWidth}
                                onChange={value => setCustomDimension('width', value)}
                                onBlur={() => setCustomWidth(current => normalizeDimension(current, customUnit))}
                                placeholder={`4${customUnit}`}
                            />
                            <PrintTextInput
                                label={copy.height}
                                value={customHeight}
                                onChange={value => setCustomDimension('height', value)}
                                onBlur={() => setCustomHeight(current => normalizeDimension(current, customUnit))}
                                placeholder={`2${customUnit}`}
                            />
                        </div>
                        <p className="print-hint">{copy.customSizeHint}</p>
                    </div>
                </PrintField>

                <PrintField label={copy.orientation}>
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
                        value={paddingSize}
                        onChange={setPaddingSize}
                        ariaLabel={copy.density}
                    />
                </PrintField>

                <PrintField label={copy.textSize}>
                    <PrintSegmented
                        options={printOptionLabels([
                            { value: 'small', en: copy.small, ar: copy.small },
                            { value: 'normal', en: copy.normal, ar: copy.normal },
                            { value: 'large', en: copy.large, ar: copy.large },
                        ], isArabic)}
                        value={textSize}
                        onChange={setTextSize}
                        ariaLabel={copy.textSize}
                    />
                </PrintField>

                <PrintSection title={copy.qrLayout}>
                    <PrintSegmented
                        options={printOptionLabels([
                            { value: 'left', en: copy.left, ar: copy.left },
                            { value: 'right', en: copy.right, ar: copy.right },
                            { value: 'hide', en: copy.hide, ar: copy.hide },
                        ], isArabic)}
                        value={qrPosition}
                        onChange={(pos) => {
                            setQrPosition(pos);
                            setShowQR(pos !== 'hide');
                        }}
                        ariaLabel={copy.qrLayout}
                    />
                    <PrintSelectField
                        label={copy.qrPayload}
                        value={qrPayload}
                        onChange={setQrPayload}
                        disabled={!showQR}
                        options={printOptionLabels([
                            { value: 'case', en: copy.caseDetails, ar: copy.caseDetails },
                            { value: 'order', en: copy.order, ar: copy.order },
                            { value: 'appointment', en: copy.appointment, ar: copy.appointment },
                            { value: 'patient', en: copy.patient, ar: copy.patient },
                        ], isArabic)}
                    />
                </PrintSection>

                <PrintField label={copy.brand}>
                    <PrintSegmented
                        options={printOptionLabels([
                            { value: 'logo', en: copy.logo, ar: copy.logo },
                            { value: 'initials', en: copy.initials, ar: copy.initials },
                            { value: 'text', en: copy.text, ar: copy.text },
                        ], isArabic)}
                        value={brandMode}
                        onChange={setBrandMode}
                        ariaLabel={copy.brand}
                    />
                </PrintField>

                <PrintSection title={copy.content}>
                    <PrintToggle checked={showBrand} onChange={setShowBrand} label={copy.includeBrand} />
                    <PrintToggle checked={showExamDetails} onChange={setShowExamDetails} label={copy.includeExam} />
                    <PrintToggle checked={showOrderNumber} onChange={setShowOrderNumber} label={copy.includeOrder} />
                    <PrintToggle checked={showAge} onChange={setShowAge} label={copy.includeAge} />
                    <PrintToggle checked={showRefDoctor} onChange={setShowRefDoctor} label={copy.includeDoctor} />
                    <PrintToggle checked={showDob} onChange={setShowDob} label={copy.includeDob} />
                    <PrintToggle checked={showGender} onChange={setShowGender} label={copy.includeGender} />
                    <PrintToggle checked={showMachine} onChange={setShowMachine} label={copy.includeMachine} />
                </PrintSection>
            </PrintSidebar>

            <PrintStage label={copy.preview}>
                <div className="flex w-full flex-col items-center justify-start gap-4">
                    {Array.from({ length: copies }).map((_, index) => (
                        <div
                            key={index}
                            className={`${docScale} sticker-container print-document print-label box-border flex overflow-hidden rounded-lg border border-slate-300 bg-white shadow-md ${orientation === 'portrait' ? 'flex-col' : 'flex-row'}`}
                            style={{
                                width: dims.width,
                                height: dims.height,
                                ...getSheetPreviewVariables({ width: dims.width, height: dims.height }),
                                fontFamily: fontStack,
                                borderLeft: orientation === 'landscape' ? `5px solid ${themeColor}` : 'none',
                                borderTop: orientation === 'portrait' ? `5px solid ${themeColor}` : 'none'
                            }}
                        >
                            {showQR && qrPosition === 'left' && (
                                <div className={`flex flex-col items-center justify-center bg-slate-50/50 ${railPad} ${orientation === 'portrait' ? 'h-auto w-full py-2' : 'shrink-0'}`} style={{ ...qrRailStyle('left'), width: orientation === 'portrait' ? '100%' : qrRailWidth }}>
                                    <QRCodeSVG value={qrValue} size={qrSize} className="mb-1" />
                                    <div className="pd-micro max-w-full truncate font-black text-slate-500 font-mono tracking-wider ltr-embed">
                                        {qrCaption}
                                    </div>
                                </div>
                            )}

                            <div className="pd-content" dir={stickerDir}>
                                <div>
                                    <div className={`flex items-start gap-2 ${showBrand && brandMode !== 'hidden' ? 'justify-between' : 'justify-end'}`}>
                                        {renderBrand()}
                                        <DocPill tone="solid" className="!rounded px-1.5 py-0.5">{appointment.modality_type || 'RAD'}</DocPill>
                                    </div>
                                    {showExamDetails && (
                                        <div className="pd-label mt-1.5 font-extrabold uppercase" style={{ color: themeColor, letterSpacing: '0.05em' }}>
                                            {examName}
                                        </div>
                                    )}
                                    <div className="pd-title mt-0.5 font-black leading-tight text-slate-800 tracking-tight truncate">
                                        {patientName}
                                    </div>
                                </div>

                                <div className={`grid ${metaGridClass} gap-x-2 gap-y-0.5 border-t border-slate-100 pt-1.5`}>
                                    {metaFields.map(field => (
                                        <div key={field.key} className="pd-micro truncate">
                                            <span className="font-semibold text-slate-400">{field.label}:</span>{' '}
                                            <span className={`font-bold text-slate-700 ${field.mono ? 'font-mono ltr-embed' : ''}`}>{field.value}</span>
                                        </div>
                                    ))}
                                </div>

                                {showExamDetails && (
                                    <div className="pd-micro flex items-center justify-between font-semibold text-slate-400 border-t border-slate-100 pt-1.5">
                                        <span className="ltr-embed">{label('scheduled')}: {scheduledDate} {scheduledTime}</span>
                                        {showMachine && <span className="font-bold uppercase ltr-embed" style={{ color: themeColor }}>{appointment.machine_name || appointment.modality_type || ''}</span>}
                                    </div>
                                )}
                            </div>

                            {showQR && qrPosition === 'right' && (
                                <div className={`flex flex-col items-center justify-center bg-slate-50/50 ${railPad} ${orientation === 'portrait' ? 'h-auto w-full py-2' : 'shrink-0'}`} style={{ ...qrRailStyle('right'), width: orientation === 'portrait' ? '100%' : qrRailWidth }}>
                                    <QRCodeSVG value={qrValue} size={qrSize} className="mb-1" />
                                    <div className="pd-micro max-w-full truncate font-black text-slate-500 font-mono tracking-wider ltr-embed">
                                        {qrCaption}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </PrintStage>
        </div>
    );
};

export default PrintSticker;
