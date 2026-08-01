export const getPatientDisplayName = (patient) => {
    const fullName = String(patient?.name || '').trim();
    if (fullName) return fullName;

    return [patient?.first_name, patient?.last_name]
        .map(part => String(part || '').trim())
        .filter(Boolean)
        .join(' ');
};

export const getWaitingListValidation = (form, today) => {
    if (!form?.patientId) return 'selectPatient';
    if (form.preferredDate && today && form.preferredDate < today) return 'pastPreferredDate';

    const hasStart = Boolean(form.preferredStartTime);
    const hasEnd = Boolean(form.preferredEndTime);
    if (hasStart !== hasEnd) return 'incompletePreferredWindow';
    if (hasStart && form.preferredStartTime >= form.preferredEndTime) return 'invalidPreferredWindow';

    return null;
};

export const escapeCsvValue = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

export const buildCsv = (headers, rows) => {
    const lines = [headers, ...rows].map(row => row.map(escapeCsvValue).join(','));
    return `\uFEFF${lines.join('\n')}`;
};
