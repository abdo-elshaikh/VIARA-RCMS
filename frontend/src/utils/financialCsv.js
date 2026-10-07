export const escapeFinancialCsvValue = (value) => {
    let text = value === null || value === undefined ? '' : String(value);
    if (/^[\s\uFEFF]*[=+@-]/u.test(text) && !/^-?\d+(?:\.\d+)?$/.test(text)) text = `'${text}`;
    return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};
