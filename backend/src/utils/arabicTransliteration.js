/**
 * arabicTransliteration.js
 *
 * Professional Arabic to Latin Phonetic Transliteration & DICOM Person Name (PN) Formatter.
 *
 * Solves the critical PACS / Modality Worklist (MWL) challenge where medical scanners
 * (CT, MRI, X-Ray) running ASCII or Latin-1 embedded consoles corrupt Arabic names into
 * unreadable Mojibake (e.g., "Ø£Ø­Ù...Ø¯" or "????"), render letters reversed/disconnected,
 * or prevent technicians from searching with English QWERTY keyboards.
 */

// Dictionary of high-frequency Arabic medical & demographic names for 100% natural transliteration
const ARABIC_DICTIONARY = {
    // Common Male Names
    'محمد': 'Mohamed',
    'أحمد': 'Ahmed',
    'احمد': 'Ahmed',
    'محمود': 'Mahmoud',
    'مصطفى': 'Mostafa',
    'علي': 'Ali',
    'على': 'Ali',
    'حسن': 'Hassan',
    'حسين': 'Hussein',
    'إبراهيم': 'Ibrahim',
    'ابراهيم': 'Ibrahim',
    'يوسف': 'Youssef',
    'عمر': 'Omar',
    'عمرو': 'Amr',
    'خالد': 'Khaled',
    'طارق': 'Tarek',
    'وائل': 'Wael',
    'ياسر': 'Yasser',
    'وليد': 'Waleed',
    'كريم': 'Kareem',
    'سامح': 'Sameh',
    'سامي': 'Sami',
    'أيمن': 'Ayman',
    'ايمن': 'Ayman',
    'أشرف': 'Ashraf',
    'اشرف': 'Ashraf',
    'عادل': 'Adel',
    'ماجد': 'Maged',
    'مجدي': 'Magdy',
    'مدحت': 'Medhat',
    'نبيل': 'Nabil',
    'ناجي': 'Nagy',
    'هشام': 'Hesham',
    'هاني': 'Hany',
    'صلاح': 'Salah',
    'شريف': 'Sherif',
    'سعيد': 'Saeed',
    'سالم': 'Salem',
    'سليمان': 'Soliman',
    'إسماعيل': 'Ismail',
    'اسماعيل': 'Ismail',
    'عصام': 'Essam',
    'علاء': 'Alaa',
    'حاتم': 'Hatem',
    'حازم': 'Hazem',
    'حمزة': 'Hamza',
    'بلال': 'Belal',
    'باسم': 'Bassem',
    'باهر': 'Baher',
    'بدر': 'Badr',
    'تامر': 'Tamer',
    'رامي': 'Ramy',
    'رضا': 'Reda',
    'زياد': 'Ziad',
    'زيد': 'Zaid',
    'فارس': 'Fares',
    'فهد': 'Fahad',
    'فيصل': 'Faisal',
    'قاسم': 'Kassem',
    'مروان': 'Marwan',
    'معتز': 'Moataz',
    'مهند': 'Mohanad',
    'نادر': 'Nader',
    'ناصر': 'Nasser',
    'هيثم': 'Haitham',
    'يحيى': 'Yehia',

    // Theophoric Compound Names (Abd + Divine Attributes)
    'عبد الله': 'Abdullah',
    'عبدالله': 'Abdullah',
    'عبد الرحمن': 'Abdelrahman',
    'عبدالرحمن': 'Abdelrahman',
    'عبد الرحيم': 'Abdelrahim',
    'عبدالعزيز': 'Abdelaziz',
    'عبد العزيز': 'Abdelaziz',
    'عبد الحميد': 'Abdelhamid',
    'عبد الكريم': 'Abdelkareem',
    'عبد الفتاح': 'Abdelfattah',
    'عبد القادر': 'Abdelkader',
    'عبد الرازق': 'Abdelrazek',
    'عبد السلام': 'Abdelsalam',
    'عبد الوهاب': 'Abdelwahab',
    'عبد اللطيف': 'Abdellatif',
    'عبد الرؤوف': 'Abdelraouf',
    'عبد المنعم': 'Abdelmonem',
    'عبد الناصر': 'Abdelnasser',
    'عبد الهادي': 'Abdelhady',
    'عبد العظيم': 'Abdelazim',

    // Common Female Names
    'فاطمة': 'Fatma',
    'مريم': 'Maryam',
    'سارة': 'Sara',
    'ساره': 'Sara',
    'منى': 'Mona',
    'آية': 'Aya',
    'اية': 'Aya',
    'نور': 'Nour',
    'نورا': 'Noura',
    'نورهان': 'Nourhan',
    'ريم': 'Reem',
    'هبة': 'Heba',
    'ياسمين': 'Yasmine',
    'أسماء': 'Asmaa',
    'اسماء': 'Asmaa',
    'دعاء': 'Doaa',
    'شيماء': 'Shaimaa',
    'إسراء': 'Esraa',
    'اسراء': 'Esraa',
    'هند': 'Hind',
    'هدى': 'Hoda',
    'رانيا': 'Rania',
    'رشا': 'Rasha',
    'زينب': 'Zainab',
    'خديجة': 'Khadija',
    'عائشة': 'Aisha',
    'أمينة': 'Amina',
    'امينة': 'Amina',
    'إيمان': 'Eman',
    'ايمان': 'Eman',
    'أمل': 'Amal',
    'امل': 'Amal',
    'نهى': 'Noha',
    'نجلاء': 'Naglaa',
    'داليا': 'Dalia',
    'دينا': 'Dina',
    'بسمة': 'Basma',
    'بسنت': 'Passant',
    'حنان': 'Hanan',
    'مروة': 'Marwa',
    'منار': 'Manar',
    'مها': 'Maha',
    'مي': 'Mai',
    'سما': 'Sama',
    'سلمى': 'Salma',
    'سمية': 'Somaya',
    'شهد': 'Shahd',
    'عبير': 'Abeer',
    'عفاف': 'Afaf',
    'غادة': 'Ghada',
    'فريدة': 'Farida',
    'لبنى': 'Lobna',
    'لمياء': 'Lamia',
    'ندى': 'Nada',
    'نوران': 'Nouran',
    'هاجر': 'Hagar',
    'وفاء': 'Wafaa',
    'ولاء': 'Walaa',

    // Common Family & Surnames
    'المصري': 'El-Masry',
    'مصري': 'Masry',
    'الشريف': 'El-Sherif',
    'السيد': 'El-Sayed',
    'سيد': 'Sayed',
    'عثمان': 'Osman',
    'علي': 'Ali',
    'عمران': 'Omran',
    'عفيفي': 'Afifi',
    'بدوي': 'Badawy',
    'الشافعي': 'El-Shafei',
    'الجزار': 'El-Gazzar',
    'النجار': 'El-Naggar',
    'حداد': 'Haddad',
    'الحداد': 'El-Haddad',
    'خليل': 'Khalil',
    'بكر': 'Bakr',
    'أبو بكر': 'Abu-Bakr',
    'ابو بكر': 'Abu-Bakr'
};

// Fallback phonetic character map for words not in the dictionary
const PHONETIC_MAP = {
    'ا': 'A', 'أ': 'A', 'إ': 'E', 'آ': 'A', 'ء': '', 'ئ': 'Y', 'ؤ': 'W',
    'ب': 'B', 'ت': 'T', 'ث': 'Th', 'ج': 'G', 'ح': 'H', 'خ': 'Kh',
    'د': 'D', 'ذ': 'Z', 'ر': 'R', 'ز': 'Z', 'س': 'S', 'ش': 'Sh',
    'ص': 'S', 'ض': 'D', 'ط': 'T', 'ظ': 'Z', 'ع': 'A', 'غ': 'Gh',
    'ف': 'F', 'ق': 'Q', 'ك': 'K', 'ل': 'L', 'م': 'M', 'ن': 'N',
    'ه': 'H', 'ة': 'a', 'و': 'W', 'ي': 'Y', 'ى': 'a'
};

/**
 * Transliterates a single Arabic token or compound word to clean Latin.
 * @param {string} token
 * @returns {string}
 */
const transliterateToken = (token) => {
    if (!token) return '';
    const clean = token.trim();
    if (!clean) return '';

    // Direct dictionary hit
    if (ARABIC_DICTIONARY[clean]) {
        return ARABIC_DICTIONARY[clean];
    }

    // Compound prefix: "عبد " / "عبد"
    if (clean.startsWith('عبد')) {
        const remainder = clean.slice(3).trim();
        if (remainder) {
            const remainderTrans = transliterateToken(remainder);
            return `Abdel${remainderTrans.replace(/^(el|al)-?/i, '')}`;
        }
        return 'Abdel';
    }

    // Compound prefix: "أبو " / "ابو "
    if (clean.startsWith('أبو') || clean.startsWith('ابو')) {
        const remainder = clean.replace(/^(أبو|ابو)\s*/, '');
        return `Abu-${transliterateToken(remainder)}`;
    }

    // Definite article: "ال"
    if (clean.startsWith('ال') && clean.length > 2) {
        const root = clean.slice(2);
        return `El-${transliterateToken(root)}`;
    }

    // Fallback phonetic character-by-character mapping
    let phonetic = '';
    for (let i = 0; i < clean.length; i++) {
        const ch = clean[i];
        if (PHONETIC_MAP[ch] !== undefined) {
            phonetic += PHONETIC_MAP[ch];
        } else if (/[a-zA-Z0-9]/.test(ch)) {
            phonetic += ch;
        }
    }

    if (phonetic.length > 1) {
        return phonetic.charAt(0).toUpperCase() + phonetic.slice(1).toLowerCase();
    }
    return phonetic.toUpperCase();
};

/**
 * Converts any Arabic string into standardized Latin/English romanization.
 * If the string is already Latin, it preserves it untouched.
 *
 * @param {string} text - Arabic or Latin input text
 * @returns {string} - Clean Latin transliterated text
 */
const transliterateArabicToLatin = (text) => {
    if (!text || typeof text !== 'string') return '';
    const trimmed = text.trim();
    if (!trimmed) return '';

    // If text contains NO Arabic characters, return as-is
    if (!/[\u0600-\u06FF]/.test(trimmed)) {
        return trimmed;
    }

    // Normalize compound "عبد ..." and "أبو ..." if space was separated
    const normalized = trimmed
        .replace(/(^|\s)عبد\s+/g, (m, p1) => p1 + 'عبد')
        .replace(/(^|\s)(أبو|ابو)\s+/g, (m, p1, p2) => p1 + p2);

    return normalized
        .split(/\s+/)
        .map(t => transliterateToken(t))
        .filter(Boolean)
        .join(' ');
};

/**
 * Builds a DICOM-compliant PatientName (0010,0010) with VR=PN.
 * Format: "Family^Given^Middle^Prefix^Suffix"
 *
 * By default in medical imaging across the Middle East, Romanized (Latin) names
 * are placed in the Alphabetic group so that modality consoles (CT/MRI/X-Ray)
 * display clean, readable names and allow technicians to search using standard
 * English keyboards without Mojibake or crashes.
 *
 * If `dualGroup: true`, it appends the native Arabic name in the secondary
 * group: "LatinLast^LatinFirst=ArabicLast^ArabicFirst".
 *
 * @param {string} last - Last/Family name
 * @param {string} first - First/Given name
 * @param {object} [options]
 * @param {boolean} [options.dualGroup=false] - Whether to include a second name group after '='
 * @param {boolean} [options.nativeFirst=false] - Keep the native Arabic name as the primary group
 * @returns {string} - DICOM formatted PN string
 */
const toDicomPatientName = (last, first, options = {}) => {
    const cleanDicom = (s) => String(s || '').replace(/[\^=]/g, ' ').trim();

    const rawLast = cleanDicom(last);
    const rawFirst = cleanDicom(first);

    const latinLast = cleanDicom(transliterateArabicToLatin(rawLast)) || 'UNKNOWN';
    const latinFirst = cleanDicom(transliterateArabicToLatin(rawFirst)) || 'PATIENT';

    const alphabeticGroup = `${latinLast}^${latinFirst}`;

    if (options.dualGroup && (/[\u0600-\u06FF]/.test(rawLast) || /[\u0600-\u06FF]/.test(rawFirst))) {
        const arabicGroup = `${rawLast}^${rawFirst}`;
        return options.nativeFirst
            ? `${arabicGroup}=${alphabeticGroup}`
            : `${alphabeticGroup}=${arabicGroup}`;
    }

    return alphabeticGroup;
};

module.exports = {
    transliterateArabicToLatin,
    toDicomPatientName,
    ARABIC_DICTIONARY
};
