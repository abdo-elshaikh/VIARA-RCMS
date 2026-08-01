import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CalendarPlus, Search, UserRound, X } from 'lucide-react';
import EmptyState from '../ui/EmptyState';

const genderBadgeStyles = {
    Male: 'border-teal-100 bg-teal-50 text-teal-700 dark:border-teal-500/20 dark:bg-teal-500/10 dark:text-teal-300',
    Female: 'border-pink-100 bg-pink-50 text-pink-700 dark:border-pink-500/20 dark:bg-pink-500/10 dark:text-pink-300',
    Other: 'border-cyan-100 bg-cyan-50 text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300'
};

const genderOptions = ['All', 'Male', 'Female', 'Other'];

const getPatientName = (patient) => [patient.first_name, patient.last_name].filter(Boolean).join(' ') || patient.fullName || '-';
const isOtherGender = (gender) => !['Male', 'Female'].includes(gender);

const PatientDirectory = ({ patientList, isLoading, searchTerm, setSearchTerm, onBook, onViewProfile }) => {
    const { t } = useTranslation('reception');
    const [genderFilter, setGenderFilter] = useState('All');
    const patients = useMemo(() => patientList?.data || [], [patientList?.data]);

    const filteredPatients = useMemo(() => {
        const searchTokens = searchTerm.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
        return patients.filter((patient) => {
            if (genderFilter === 'Other' && !isOtherGender(patient.gender)) return false;
            if (!['All', 'Other'].includes(genderFilter) && patient.gender !== genderFilter) return false;
            if (searchTokens.length === 0) return true;
            const searchable = [patient.first_name, patient.last_name, patient.fullName, patient.mrn, patient.phone, patient.address]
                .filter(Boolean)
                .join(' ')
                .toLocaleLowerCase();
            return searchTokens.every((token) => searchable.includes(token));
        });
    }, [genderFilter, patients, searchTerm]);

    const genderCounts = useMemo(() => ({
        All: patients.length,
        Male: patients.filter((patient) => patient.gender === 'Male').length,
        Female: patients.filter((patient) => patient.gender === 'Female').length,
        Other: patients.filter((patient) => isOtherGender(patient.gender)).length,
    }), [patients]);

    return (
        <section className="rounded-none border border-slate-200/60 bg-white/70 shadow-sm backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/50">
            <header className="border-b border-slate-150/60 px-4 py-4 dark:border-slate-800/60 sm:px-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[.18em] text-teal-700 dark:text-teal-400">
                            {t('tabs.patients')}
                        </p>
                        <h2 className="mt-1 text-xl font-black text-slate-950 dark:text-white sm:text-2xl">
                            {t('directory.title', { defaultValue: 'Patient directory' })}
                        </h2>
                        <p className="mt-1 max-w-2xl text-sm text-slate-500 dark:text-slate-400">
                            {t('directory.subtitle', { defaultValue: 'Find existing patients, open profiles, and book appointments.' })}
                        </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:min-w-[420px]">
                        {genderOptions.map((option) => (
                            <CountTile
                                key={option}
                                label={option === 'All' ? t('directory.allGenders') : t(`directory.${option.toLowerCase()}`, { defaultValue: option })}
                                value={genderCounts[option]}
                                active={genderFilter === option}
                                onClick={() => setGenderFilter(option)}
                            />
                        ))}
                    </div>
                </div>
            </header>

            <div className="flex flex-col gap-3 border-b border-slate-150/60 px-4 py-4 dark:border-slate-800/60 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
                <label className="relative w-full lg:max-w-md">
                    <span className="sr-only">{t('directory.searchPlaceholder')}</span>
                    <Search size={16} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        placeholder={t('directory.searchPlaceholder')}
                        className="h-10 w-full rounded-none border border-slate-200/60 bg-white/80 ps-10 pe-10 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-800/60 dark:bg-slate-950/50 dark:text-slate-100"
                    />
                    {searchTerm && (
                        <button
                            type="button"
                            onClick={() => setSearchTerm('')}
                            className="absolute end-3 top-1/2 -translate-y-1/2 rounded-none p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                            aria-label={t('clear', { defaultValue: 'Clear search' })}
                        >
                            <X size={14} />
                        </button>
                    )}
                </label>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <p className="rounded-none bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500 dark:bg-slate-950/40 dark:text-slate-400">
                        {t('directory.foundCount', { count: filteredPatients.length })}
                    </p>
                    <select
                        aria-label={t('directory.gender')}
                        value={genderFilter}
                        onChange={(event) => setGenderFilter(event.target.value)}
                        className="h-10 rounded-none border border-slate-200/60 bg-white/80 px-3.5 text-sm font-semibold text-slate-700 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-800/60 dark:bg-slate-950/50 dark:text-slate-300"
                    >
                        {genderOptions.map((option) => (
                            <option key={option} value={option}>
                                {option === 'All' ? t('directory.allGenders') : t(`directory.${option.toLowerCase()}`, { defaultValue: option })}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="overflow-hidden">
                {isLoading ? (
                    <div className="space-y-2 p-4">
                        {Array.from({ length: 8 }).map((_, index) => (
                            <div key={index} className="h-12 animate-pulse rounded-none bg-slate-100 dark:bg-slate-800" />
                        ))}
                    </div>
                ) : filteredPatients.length > 0 ? (
                    <table className="w-full table-fixed text-start text-sm">
                        <thead className="border-b border-slate-150/60 bg-slate-50/40 dark:border-slate-800/60 dark:bg-slate-950/40">
                            <tr className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                <th className="w-[96px] px-4 py-3 sm:px-5">{t('directory.mrn')}</th>
                                <th className="px-3 py-3">{t('directory.name')}</th>
                                <th className="hidden w-[112px] px-3 py-3 sm:table-cell">{t('directory.gender')}</th>
                                <th className="hidden w-[150px] px-3 py-3 md:table-cell">{t('directory.mobile')}</th>
                                <th className="hidden w-[130px] px-3 py-3 lg:table-cell">{t('directory.birthDate')}</th>
                                <th className="hidden px-3 py-3 xl:table-cell">{t('directory.phoneLocation')}</th>
                                <th className="w-[118px] px-4 py-3 text-end sm:px-5">{t('directory.action')}</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-150/40 dark:divide-slate-800/60">
                            {filteredPatients.map((patient) => (
                                <PatientRow
                                    key={patient.patient_id}
                                    onBook={onBook}
                                    onViewProfile={onViewProfile}
                                    patient={patient}
                                    t={t}
                                />
                            ))}
                        </tbody>
                    </table>
                ) : (
                    <div className="py-12">
                        <EmptyState icon={Search} title={t('directory.noPatients')} />
                    </div>
                )}
            </div>
        </section>
    );
};

const CountTile = ({ active, label, onClick, value }) => (
    <button
        type="button"
        onClick={onClick}
        className={`rounded-none border px-3 py-2 text-start transition ${
            active
                ? 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-500/20 dark:bg-teal-500/10 dark:text-teal-300'
                : 'border-slate-200/60 bg-slate-50/30 text-slate-600 hover:bg-slate-100/50 dark:border-slate-800/60 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800/50'
        }`}
        aria-pressed={active}
    >
        <p className="truncate text-[10px] font-black uppercase tracking-wide opacity-70">{label}</p>
        <p className="mt-1 font-mono text-lg font-black">{value}</p>
    </button>
);

const PatientRow = ({ patient, onBook, onViewProfile, t }) => {
    const name = getPatientName(patient);
    const genderKey = patient.gender?.toLowerCase() || 'other';

    return (
        <tr 
            onClick={() => onViewProfile(patient)}
            className="group cursor-pointer transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/40"
        >
            <td className="px-4 py-3 sm:px-5">
                <span className="max-w-full truncate font-mono text-[11px] font-black uppercase tracking-wide text-slate-500 ltr-embed group-hover:text-teal-700 dark:group-hover:text-teal-400" dir="ltr">
                    {patient.mrn || '-'}
                </span>
            </td>
            <td className="px-3 py-3">
                <div className="flex min-w-0 max-w-full items-center gap-3 text-start">
                    <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-none bg-slate-100 text-slate-500 ring-1 ring-slate-200 group-hover:bg-teal-50 group-hover:text-teal-600 group-hover:ring-teal-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700 dark:group-hover:bg-teal-500/10 dark:group-hover:text-teal-400 dark:group-hover:ring-teal-500/30 sm:flex">
                        <UserRound size={16} />
                    </span>
                    <span className="min-w-0">
                        <span className="block truncate font-black text-slate-950 group-hover:text-teal-800 dark:text-white dark:group-hover:text-teal-300">{name}</span>
                        <span className="block truncate text-[11px] font-semibold text-slate-400 md:hidden">{patient.phone || '-'}</span>
                    </span>
                </div>
            </td>
            <td className="hidden px-3 py-3 sm:table-cell">
                <span className={`inline-flex rounded-none border px-2.5 py-1 text-[10px] font-black uppercase ${genderBadgeStyles[patient.gender] || genderBadgeStyles.Other}`}>
                    {t(`directory.${genderKey}`, { defaultValue: patient.gender || t('directory.other', { defaultValue: 'Other' }) })}
                </span>
            </td>
            <td className="hidden px-3 py-3 md:table-cell">
                <span className="block truncate font-mono text-xs font-semibold text-slate-700 dark:text-slate-300 ltr-embed" dir="ltr">
                    {patient.phone || '-'}
                </span>
            </td>
            <td className="hidden px-3 py-3 text-xs font-semibold text-slate-600 dark:text-slate-300 lg:table-cell">
                {patient.date_of_birth || '-'}
            </td>
            <td className="hidden px-3 py-3 xl:table-cell">
                <span className="block truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {patient.address || '-'}
                </span>
            </td>
            <td className="px-4 py-3 text-end sm:px-5">
                <div className="flex items-center justify-end gap-2">
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onViewProfile(patient); }}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-none text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                        title={t('directory.viewProfile') || 'View Profile'}
                    >
                        <UserRound size={15} />
                    </button>
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onBook(patient); }}
                        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-none bg-teal-700 px-3 text-[11px] font-black text-white transition hover:bg-teal-800 active:scale-[0.98] dark:bg-teal-600 dark:hover:bg-teal-500"
                    >
                        <CalendarPlus size={13} />
                        <span className="hidden sm:inline">{t('directory.book')}</span>
                    </button>
                </div>
            </td>
        </tr>
    );
};

export default PatientDirectory;
