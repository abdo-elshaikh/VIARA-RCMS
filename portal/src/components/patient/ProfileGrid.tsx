import { InfoBlock } from '../ui/DataBlocks';

export interface ProfileGridProps {
  patient: Record<string, any>;
  formatDate: (date: any) => string;
  t: any;
  language?: string;
}

const GENDER_LABELS: Record<string, Record<string, string>> = {
  en: { male: 'Male', female: 'Female', other: 'Other' },
  ar: { male: 'ذكر', female: 'أنثى', other: 'أخرى' },
};

const localizeGender = (value: string | undefined, language?: string) => {
  if (!value) return undefined;
  const key = value.trim().toLowerCase();
  const labels = GENDER_LABELS[language?.toLowerCase() === 'ar' ? 'ar' : 'en'];
  return labels[key] || value;
};

export const ProfileGrid = ({ patient, formatDate, t, language }: ProfileGridProps) => {
  const items: [string, string, string | undefined][] = [
    ['fullName', t('patient.profileInfo.fullName', 'Full name'), patient.full_name],
    ['dob', t('patient.profileInfo.dob', 'Date of birth'), formatDate(patient.date_of_birth)],
    ['gender', t('patient.profileInfo.gender', 'Gender'), localizeGender(patient.gender, language)],
    ['phone', t('patient.profileInfo.phone', 'Phone'), patient.phone],
    ['email', t('patient.profileInfo.email', 'Email'), patient.email],
    ['address', t('patient.profileInfo.address', 'Address'), patient.address],
    ['nationalId', t('patient.profileInfo.nationalId', 'National ID'), patient.national_id],
    ['allergies', t('patient.profileInfo.allergies', 'Allergies'), patient.allergies || t('patient.profileInfo.none', 'None')],
    ['chronicDiseases', t('patient.profileInfo.chronicDiseases', 'Chronic diseases'), patient.chronic_diseases || t('patient.profileInfo.none', 'None')],
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {items.map(([key, label, value]) => (
        <InfoBlock key={key} label={label} value={value || '-'} />
      ))}
    </div>
  );
};

export default ProfileGrid;
