const DEMO_USER_TRANSLATIONS = {
    'Dr. Administrator (Medical Director)': 'common:demoUsers.admin',
    'Eng. Dev Admin': 'common:demoUsers.developer',
    'Hossam Accountant (CFO)': 'common:demoUsers.accountant',
    'Sarah Receptionist (Lead Desk)': 'common:demoUsers.receptionist',
    'Nour Cashier (Main Cashier)': 'common:demoUsers.cashier',
    'Mervat HR Manager': 'common:demoUsers.hrManager',
    'Tarek Insurance Specialist': 'common:demoUsers.insuranceSpecialist',
    'Dr. Ahmed Hassan (Consultant Radiologist)': 'common:demoUsers.ahmedRadiologist',
    'Dr. Mona Ibrahim (Neuro/MSK Radiologist)': 'common:demoUsers.monaRadiologist',
    'Dr. Omar Khalil (Cardiothoracic Radiologist)': 'common:demoUsers.omarRadiologist',
    'Dr. Fatma Saad (Women & Breast Imaging)': 'common:demoUsers.fatmaRadiologist',
    'Tech. Mohamed Ali (Senior MRI Tech)': 'common:demoUsers.mohamedTechnician',
    'Tech. Sara Mahmoud (Senior CT Tech)': 'common:demoUsers.saraTechnician',
    'Nurse Heba Fouad (Contrast/IV Lead)': 'common:demoUsers.hebaNurse',
    'Nurse Dina Kamal (Patient Prep Nurse)': 'common:demoUsers.dinaNurse'
};

export const getLocalizedDemoUserName = (name, t) => {
    if (!name) return '';
    const translationKey = DEMO_USER_TRANSLATIONS[name];
    return translationKey ? t(translationKey, { defaultValue: name }) : name;
};
