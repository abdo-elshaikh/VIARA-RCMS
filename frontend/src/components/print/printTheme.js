export const PRINT_FONT_IMPORT = "@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Outfit:wght@400;500;600;700;800&family=Space+Mono:wght@400;700&display=swap');";

export const SHEET_SIZES = {
    A4: { width: '210mm', height: '297mm' },
    A5: { width: '148mm', height: '210mm' },
    Letter: { width: '8.5in', height: '11in' },
};

export const ROLL_WIDTHS = {
    '80mm': '80mm',
    '58mm': '58mm',
};

export const LABEL_PRESETS = {
    '4x2': { width: '4in', height: '2in', label: '4 x 2 in' },
    '3x2': { width: '3in', height: '2in', label: '3 x 2 in' },
    '2x1': { width: '2in', height: '1in', label: '2 x 1 in' },
    '70x35': { width: '70mm', height: '35mm', label: '70 x 35 mm' },
};

export const PRINT_FONTS = [
    { value: 'Inter', en: 'Inter · Sans', ar: 'Inter · بلا زوائد' },
    { value: 'Outfit', en: 'Outfit · Rounded', ar: 'Outfit · مستدير' },
    { value: 'Space Mono', en: 'Space Mono · Monospace', ar: 'Space Mono · أحادي المسافة' },
    { value: 'Arial', en: 'Arial · Standard', ar: 'Arial · عادي' },
];

export const PRINT_ACCENTS = [
    { value: '#087F5B', en: 'VIARA Emerald', ar: 'فيارا زمردي' },
    { value: '#327C92', en: 'Clinical blue', ar: 'أزرق طبي' },
    { value: '#F4B942', en: 'Attention amber', ar: 'كهرماني للتنبيه' },
    { value: '#D95757', en: 'Critical coral', ar: 'مرجاني للحالات الحرجة' },
    { value: '#172326', en: 'Clinical charcoal', ar: 'رمادي طبي' },
];

export const getFontStack = (family) => {
    if (family === 'Outfit') return "'Outfit', sans-serif";
    if (family === 'Space Mono') return "'Space Mono', monospace";
    if (family === 'Arial') return "'Arial', sans-serif";
    return "'Inter', sans-serif";
};

export const getPageDimensions = (size, orientation = 'portrait', customWidth) => {
    if (ROLL_WIDTHS[size]) return { width: ROLL_WIDTHS[size], height: 'auto' };
    if (size === 'custom') return { width: customWidth || '80mm', height: 'auto' };
    const sheet = SHEET_SIZES[size] || SHEET_SIZES.A4;
    return orientation === 'landscape'
        ? { width: sheet.height, height: sheet.width }
        : { ...sheet };
};

export const resolvePageRule = ({ size, orientation = 'portrait', customWidth, label }) => {
    if (label) return `${label.width} ${label.height}`;
    if (ROLL_WIDTHS[size]) return `${ROLL_WIDTHS[size]} auto`;
    if (size === 'custom') return `${customWidth || '80mm'} auto`;
    const sheet = SHEET_SIZES[size] || SHEET_SIZES.A4;
    return orientation === 'landscape' ? `${sheet.height} ${sheet.width}` : `${sheet.width} ${sheet.height}`;
};

export const buildPrintStyles = ({ pageRule, margin = '0', extraCss = '' }) => `
${PRINT_FONT_IMPORT}
@media print {
    @page {
        size: ${pageRule};
        margin: ${margin};
    }
    html,
    body {
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
    }
    .no-print {
        display: none !important;
    }
    ${extraCss}
}
`;

export const PRINT_COPY = {
    en: {
        customize: 'Print settings',
        language: 'Interface language',
        docLanguage: 'Document language',
        languageAuto: 'Auto',
        english: 'English',
        arabic: 'Arabic',
        bilingual: 'EN / AR',
        paper: 'Paper size',
        labelSize: 'Label size',
        rollWidth: 'Roll width',
        custom: 'Custom',
        customWidth: 'Custom width',
        paperWidth: 'Paper width',
        width: 'Width',
        height: 'Height',
        unit: 'Unit',
        customSizeHint: 'Use in, mm, cm, or px.',
        orientation: 'Orientation',
        portrait: 'Portrait',
        landscape: 'Landscape',
        accent: 'Accent color',
        typography: 'Typography',
        density: 'Density',
        compact: 'Compact',
        normal: 'Normal',
        cozy: 'Roomy',
        print: 'Print',
        close: 'Close',
        save: 'Save',
        saving: 'Saving...',
        currentSize: 'Current size',
        content: 'Content',
        sections: 'Sections',
        options: 'Options',
    },
    ar: {
        customize: 'إعدادات الطباعة',
        language: 'لغة الواجهة',
        docLanguage: 'لغة المستند',
        languageAuto: 'تلقائي',
        english: 'الإنجليزية',
        arabic: 'العربية',
        bilingual: 'إنجليزي / عربي',
        paper: 'مقاس الورق',
        labelSize: 'حجم الملصق',
        rollWidth: 'عرض الشريط',
        custom: 'مخصص',
        customWidth: 'مقاس مخصص',
        paperWidth: 'عرض الورق',
        width: 'العرض',
        height: 'الارتفاع',
        unit: 'الوحدة',
        customSizeHint: 'استخدم in أو mm أو cm أو px.',
        orientation: 'الاتجاه',
        portrait: 'عمودي',
        landscape: 'أفقي',
        accent: 'اللون المميز',
        typography: 'الخط',
        density: 'كثافة المحتوى',
        compact: 'مضغوط',
        normal: 'عادي',
        cozy: 'واسع',
        print: 'طباعة',
        close: 'إغلاق',
        save: 'حفظ',
        saving: 'جار الحفظ...',
        currentSize: 'الحجم الحالي',
        content: 'المحتوى',
        sections: 'الأقسام',
        options: 'خيارات العرض',
    },
};

export const printCopy = (isArabic) => (isArabic ? PRINT_COPY.ar : PRINT_COPY.en);

export const printOptionLabels = (list, isArabic) => list.map((item) => ({
    value: item.value,
    label: isArabic ? item.ar : item.en,
}));

// Single source of truth for the shared document scale classes (see printDocuments.css .print-doc).
// Composes the base + media + density + narrow modifiers so every template retunes the same token block.
export const getDocScaleClasses = ({ sheet = false, label = false, density = 'normal', narrow = false, text = 'normal' } = {}) => [
    'print-doc',
    sheet ? 'pd-sheet' : '',
    label ? 'pd-label-doc' : '',
    density === 'compact' ? 'pd-compact' : density === 'cozy' ? 'pd-cozy' : '',
    narrow ? 'pd-narrow' : '',
    text === 'small' ? 'pd-text-sm' : text === 'large' ? 'pd-text-lg' : '',
].filter(Boolean).join(' ');

export const formatMoney = (value, digits = 2) => Number(value || 0).toLocaleString('en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
});
