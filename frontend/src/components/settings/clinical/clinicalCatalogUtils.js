export const machineCreateFields = [
    'name',
    'type',
    'roomNumber',
    'serialNumber',
    'manufacturer',
    'model',
    'installationDate',
    'location',
    'status'
];

export const machineUpdateFields = machineCreateFields;

export const buildMachineForm = (machine, fallback = {}) => ({
    name: machine?.name || fallback.name || '',
    type: machine?.type || fallback.type || 'MRI',
    roomNumber: machine?.roomNumber ?? machine?.room_number ?? fallback.roomNumber ?? '',
    serialNumber: machine?.serialNumber ?? machine?.serial_number ?? fallback.serialNumber ?? '',
    manufacturer: machine?.manufacturer ?? fallback.manufacturer ?? '',
    model: machine?.model ?? fallback.model ?? '',
    installationDate: (machine?.installationDate || machine?.installation_date || fallback.installationDate || '').slice(0, 10),
    location: machine?.location ?? fallback.location ?? '',
    status: machine?.status || fallback.status || 'Active'
});

export const buildExamForm = (exam, fallback = {}) => ({
    modalityId: exam?.modalityId ?? exam?.modality_id ?? fallback.modalityId ?? '',
    code: exam?.code ?? fallback.code ?? '',
    name: exam?.name ?? fallback.name ?? '',
    price: String(exam?.price ?? fallback.price ?? ''),
    durationMinutes: String(exam?.durationMinutes ?? exam?.duration_minutes ?? fallback.durationMinutes ?? 30),
    bodyPart: exam?.bodyPart ?? exam?.body_part ?? fallback.bodyPart ?? '',
    preparationInstructions: exam?.preparationInstructions ?? exam?.preparation_instructions ?? fallback.preparationInstructions ?? '',
    contrastRequired: Boolean(exam?.contrastRequired ?? exam?.contrast_required ?? fallback.contrastRequired ?? false),
    isActive: exam?.isActive ?? exam?.is_active ?? fallback.isActive ?? true
});

const pruneEmpty = (payload) => Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined)
);

export const toMachinePayload = (form, { mode = 'create' } = {}) => {
    const payload = pruneEmpty({
        name: form.name?.trim(),
        type: form.type,
        roomNumber: form.roomNumber?.trim() || undefined,
        serialNumber: form.serialNumber?.trim() || undefined,
        manufacturer: form.manufacturer?.trim() || undefined,
        model: form.model?.trim() || undefined,
        installationDate: form.installationDate || undefined,
        location: form.location?.trim() || undefined,
        status: form.status || 'Active'
    });

    if (mode === 'update') return payload;
    return payload;
};

export const toExamPayload = (form, { mode = 'create' } = {}) => {
    const payload = pruneEmpty({
        modalityId: form.modalityId || undefined,
        code: form.code?.trim() ? form.code.trim().toUpperCase() : undefined,
        name: form.name?.trim(),
        price: form.price === '' || form.price === undefined ? undefined : Number(form.price),
        durationMinutes: form.durationMinutes === '' || form.durationMinutes === undefined ? undefined : Number(form.durationMinutes),
        bodyPart: form.bodyPart?.trim() || undefined,
        preparationInstructions: form.preparationInstructions?.trim() || undefined,
        contrastRequired: Boolean(form.contrastRequired),
        isActive: form.isActive !== false
    });

    if (mode === 'update') return payload;
    return payload;
};

export const makeCsvFile = (header, rows) => {
    const csvContent = [header, ...rows]
        .map(row => row.map(cell => `"${String(cell ?? '').replace(/"/g, '""')}"`).join(','))
        .join('\n');
    return new Blob([`\uFEFF${csvContent}`], { type: 'text/csv;charset=utf-8;' });
};

export const downloadBlob = (blob, fileName) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
};
