const SYSTEM_CHANNEL_TRANSLATIONS = {
    general: {
        nameKey: 'chat.channelGeneralName',
        descriptionKey: 'chat.channelGeneralDesc',
        defaultName: 'General Hub',
        defaultDescription: 'Center-wide announcements & discussion'
    },
    radiology: {
        nameKey: 'chat.channelRadiologyName',
        descriptionKey: 'chat.channelRadiologyDesc',
        defaultName: 'Radiology Desk',
        defaultDescription: 'Radiologist and technician channel'
    },
    reception: {
        nameKey: 'chat.channelReceptionName',
        descriptionKey: 'chat.channelReceptionDesc',
        defaultName: 'Reception Desk',
        defaultDescription: 'Receptionist desk coordination'
    }
};

const STAFF_ROLE_TRANSLATIONS = {
    admin: ['chat.staffRoleAdmin', 'Admin'],
    radiologist: ['chat.staffRoleRadiologist', 'Radiologist'],
    technician: ['chat.staffRoleTechnician', 'Technician'],
    receptionist: ['chat.staffRoleReceptionist', 'Receptionist'],
    doctor: ['chat.staffRoleDoctor', 'Doctor'],
    nurse: ['chat.staffRoleNurse', 'Nurse'],
    accountant: ['chat.staffRoleAccountant', 'Accountant'],
    marketing: ['chat.staffRoleMarketing', 'Marketing'],
    developer: ['chat.staffRoleDeveloper', 'Developer']
};

const SEEDED_MESSAGE_TRANSLATIONS = {
    'Welcome team to the VIARA Diagnostic Hub morning briefing. All 3T MRI and 256-Slice CT slots are operating at full capacity.': 'chat.seedMessageGeneralBriefing',
    'Emergency stroke CT Angiography from Nile Hospital has been priority-reported and approved. Please alert the neurology team.': 'chat.seedMessageStrokeAlert',
    'MRI Suite 101 contrast protocol calibration completed successfully.': 'chat.seedMessageMriCalibration',
    'All morning insurance approval batches from AXA and Bupa have been confirmed.': 'chat.seedMessageInsuranceApprovals'
};

const getSystemChannelTranslation = (channel) => {
    const channelId = String(channel?.channel_id || channel?.id || channel?.name || '').toLowerCase();
    return SYSTEM_CHANNEL_TRANSLATIONS[channelId];
};

export const getLocalizedChannelName = (channel, t) => {
    const translation = getSystemChannelTranslation(channel);
    if (translation && channel?.is_system !== false) {
        return t(translation.nameKey, { defaultValue: translation.defaultName });
    }
    return channel?.display_name || channel?.name || '';
};

export const getLocalizedChannelDescription = (channel, t) => {
    const translation = getSystemChannelTranslation(channel);
    if (translation && channel?.is_system !== false) {
        return t(translation.descriptionKey, { defaultValue: translation.defaultDescription });
    }
    return channel?.description || '';
};

export const getLocalizedStaffRole = (role, t) => {
    if (!role) return '';
    const translation = STAFF_ROLE_TRANSLATIONS[String(role).toLowerCase()];
    return translation ? t(translation[0], { defaultValue: translation[1] }) : role;
};

export const getLocalizedSeedMessage = (body, t) => {
    if (!body) return '';
    const translationKey = SEEDED_MESSAGE_TRANSLATIONS[body];
    return translationKey ? t(translationKey, { defaultValue: body }) : body;
};
