import React from 'react';
import { InfoBlock } from '../ui/DataBlocks';

const ProfileGrid = ({ patient, formatDate, t }) => {
    const items = [
        ['fullName', t('patient.profileInfo.fullName', 'Full name'), patient.full_name],
        ['dob', t('patient.profileInfo.dob', 'Date of birth'), formatDate(patient.date_of_birth)],
        ['gender', t('patient.profileInfo.gender', 'Gender'), patient.gender],
        ['phone', t('patient.profileInfo.phone', 'Phone'), patient.phone],
        ['email', t('patient.profileInfo.email', 'Email'), patient.email],
        ['address', t('patient.profileInfo.address', 'Address'), patient.address],
        ['nationalId', t('patient.profileInfo.nationalId', 'National ID'), patient.national_id],
        ['allergies', t('patient.profileInfo.allergies', 'Allergies'), patient.allergies || t('patient.profileInfo.none', 'None')],
        ['chronicDiseases', t('patient.profileInfo.chronicDiseases', 'Chronic diseases'), patient.chronic_diseases || t('patient.profileInfo.none', 'None')],
    ];

    return (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {items.map(([key, label, value]) => <InfoBlock key={key} label={label} value={value || '-'} />)}
        </div>
    );
};

export default ProfileGrid;
