/**
 * arabicTransliteration.js
 *
 * Frontend phonetic transliteration helper for Arabic names to clean Latin / DICOM format.
 * Enables live preview in registration and scheduling modals, reassuring reception staff
 * that the Arabic name entered will cleanly translate for modality consoles (CT, MRI, X-Ray)
 * and dry laser film printers without Mojibake or question marks.
 */

export const ARABIC_DICTIONARY = {
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

    // Theophoric Compound Names
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

const PHONETIC_MAP = {
    'ا': 'A', 'أ': 'A', 'إ': 'E', 'آ': 'A', 'ء': '', 'ئ': 'Y', 'ؤ': 'W',
    'ب': 'B', 'ت': 'T', 'ث': 'Th', 'ج': 'G', 'ح': 'H', 'خ': 'Kh',
    'د': 'D', 'ذ': 'Z', 'ر': 'R', 'ز': 'Z', 'س': 'S', 'ش': 'Sh',
    'ص': 'S', 'ض': 'D', 'ط': 'T', 'ظ': 'Z', 'ع': 'A', 'غ': 'Gh',
    'ف': 'F', 'ق': 'Q', 'ك': 'K', 'ل': 'L', 'م': 'M', 'ن': 'N',
    'ه': 'H', 'ة': 'a', 'و': 'W', 'ي': 'Y', 'ى': 'a'
};

const transliterateToken = (token) => {
    if (!token) return '';
    const clean = token.trim();
    if (!clean) return '';

    if (ARABIC_DICTIONARY[clean]) {
        return ARABIC_DICTIONARY[clean];
    }

    if (clean.startsWith('عبد')) {
        const remainder = clean.slice(3).trim();
        if (remainder) {
            const remainderTrans = transliterateToken(remainder);
            return `Abdel${remainderTrans.replace(/^(el|al)-?/i, '')}`;
        }
        return 'Abdel';
    }

    if (clean.startsWith('أبو') || clean.startsWith('ابو')) {
        const remainder = clean.replace(/^(أبو|ابو)\s*/, '');
        return `Abu-${transliterateToken(remainder)}`;
    }

    if (clean.startsWith('ال') && clean.length > 2) {
        const root = clean.slice(2);
        return `El-${transliterateToken(root)}`;
    }

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

export const transliterateArabicToLatin = (text) => {
    if (!text || typeof text !== 'string') return '';
    const trimmed = text.trim();
    if (!trimmed) return '';

    if (!/[\u0600-\u06FF]/.test(trimmed)) {
        return trimmed;
    }

    const normalized = trimmed
        .replace(/(^|\s)عبد\s+/g, (m, p1) => p1 + 'عبد')
        .replace(/(^|\s)(أبو|ابو)\s+/g, (m, p1, p2) => p1 + p2);

    return normalized
        .split(/\s+/)
        .map(t => transliterateToken(t))
        .filter(Boolean)
        .join(' ');
};

export const toDicomPatientName = (last, first) => {
    const cleanDicom = (s) => String(s || '').replace(/[\^=]/g, ' ').trim();
    const rawLast = cleanDicom(last);
    const rawFirst = cleanDicom(first);

    const latinLast = cleanDicom(transliterateArabicToLatin(rawLast)) || 'UNKNOWN';
    const latinFirst = cleanDicom(transliterateArabicToLatin(rawFirst)) || 'PATIENT';

    return `${latinLast}^${latinFirst}`;
};
