export const buildPatientRegistrationPayload = (data) => {
    const nameParts = String(data.fullName || '').trim().split(/\s+/).filter(Boolean);
    return {
        firstName: nameParts[0] || '',
        lastName: nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'Unknown',
        dateOfBirth: data.dob,
        gender: data.gender,
        phone: String(data.phone || '').replace(/\D/g, ''),
        address: data.address?.trim() || undefined,
        mrn: data.mrn?.trim() || undefined
    };
};
