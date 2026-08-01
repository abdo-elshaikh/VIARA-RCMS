const localeFor = (language = 'en') => language.startsWith('ar') ? 'ar-EG' : 'en-EG';

export const toFinancialNumber = (value) => {
    const parsed = Number(value || 0);
    return Number.isFinite(parsed) ? parsed : 0;
};

export const roundFinancialAmount = (value) => Math.round((toFinancialNumber(value) + Number.EPSILON) * 100) / 100;

export const formatFinancialAmount = (value) => roundFinancialAmount(value).toFixed(2);

export const toFinancialDateInput = (date = new Date()) => {
    const parsed = date instanceof Date ? date : new Date(date);
    if (Number.isNaN(parsed.getTime())) return '';
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const formatFinancialCurrency = (value, language = 'en') => new Intl.NumberFormat(localeFor(language), {
    style: 'currency',
    currency: 'EGP',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
}).format(roundFinancialAmount(value));

export const formatFinancialDate = (value, language = 'en') => {
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '-';
    return parsed.toLocaleDateString(localeFor(language), { day: '2-digit', month: 'short', year: 'numeric' });
};
