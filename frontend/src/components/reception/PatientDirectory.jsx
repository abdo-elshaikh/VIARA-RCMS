import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ArrowDown,
    ArrowUp,
    ArrowUpDown,
    CalendarPlus,
    Search,
    UserRound,
    Users,
    X,
    Phone,
    MapPin,
    Calendar
} from 'lucide-react';
import EmptyState from '../ui/EmptyState';
import Pagination from '../ui/Pagination';
import { getPaginationState } from '../../utils/pagination';
import { useGetPatientsQuery } from '../../store/api';
import useDebounce from '../../hooks/useDebounce';

const genderBadgeStyles = {
    Male: 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-500/20 dark:bg-teal-500/10 dark:text-teal-300',
    Female: 'border-pink-200 bg-pink-50 text-pink-700 dark:border-pink-500/20 dark:bg-pink-500/10 dark:text-pink-300',
    Other: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300'
};

const genderOptions = ['All', 'Male', 'Female', 'Other'];
const PAGE_SIZE_OPTIONS = [10, 20, 50];

const getPatientName = (patient) => [patient.first_name, patient.last_name].filter(Boolean).join(' ') || patient.fullName || '-';

const PatientDirectory = ({ searchTerm, setSearchTerm, onBook, onViewProfile }) => {
    const { t, i18n } = useTranslation('reception');
    const [genderFilter, setGenderFilter] = useState('All');
    const [sortField, setSortField] = useState('mrn');
    const [sortDirection, setSortDirection] = useState('asc');
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize, setPageSize] = useState(20);

    const isRtl = i18n?.language?.startsWith('ar');
    const debouncedSearch = useDebounce(searchTerm.trim(), 300);
    const { data: patientList, isLoading, isError, refetch } = useGetPatientsQuery({
        search: debouncedSearch || undefined,
        gender: genderFilter === 'All' ? undefined : genderFilter,
        limit: pageSize,
        offset: (currentPage - 1) * pageSize,
        sortBy: sortField === 'dob' ? 'dateOfBirth' : sortField,
        sortDirection,
    }, { pollingInterval: 60_000 });
    const patients = useMemo(() => patientList?.data || [], [patientList?.data]);
    const totalPatients = Number(patientList?.meta?.total || 0);

    // Gender counts for filter tiles
    const genderCounts = patientList?.meta?.genderCounts || {
        All: totalPatients,
        Male: 0,
        Female: 0,
        Other: 0,
    };

    // Filter and sort patients
    const filteredAndSortedPatients = useMemo(() => {
        const result = [...patients];

        return result;
    }, [patients]);

    // Reset pagination to page 1 on filter/search change
    useEffect(() => {
        setCurrentPage(1);
    }, [searchTerm, genderFilter, pageSize]);

    // Pagination calculations
    const paginationState = useMemo(() => {
        return getPaginationState(totalPatients, currentPage, pageSize);
    }, [totalPatients, currentPage, pageSize]);

    const paginatedPatients = useMemo(() => {
        return filteredAndSortedPatients;
    }, [filteredAndSortedPatients]);

    const handleSort = (field) => {
        if (sortField === field) {
            setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const SortableHeader = ({ field, label, width, className = '' }) => {
        const isCurrent = sortField === field;
        return (
            <th className={`${width} px-3 py-3 text-start ${className}`}>
                <button
                    type="button"
                    onClick={() => handleSort(field)}
                    className="group inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-slate-500 transition hover:text-slate-900 focus-visible:outline-none dark:text-slate-400 dark:hover:text-white"
                >
                    <span>{label}</span>
                    {isCurrent ? (
                        sortDirection === 'asc' ? (
                            <ArrowUp size={12} className="text-teal-600 dark:text-teal-400" />
                        ) : (
                            <ArrowDown size={12} className="text-teal-600 dark:text-teal-400" />
                        )
                    ) : (
                        <ArrowUpDown size={11} className="opacity-40 group-hover:opacity-100" />
                    )}
                </button>
            </th>
        );
    };

    return (
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {/* Header */}
            <header className="border-b border-slate-150/60 p-4 dark:border-slate-800/60 sm:p-5">
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

                    {/* Gender Tiles */}
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

            {/* Filter & Search Bar */}
            <div className="flex flex-col gap-3 border-b border-slate-150/60 p-4 dark:border-slate-800/60 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
                <label className="relative w-full lg:max-w-md">
                    <span className="sr-only">{t('directory.searchPlaceholder')}</span>
                    <Search size={15} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        value={searchTerm}
                        onChange={(event) => setSearchTerm(event.target.value)}
                        placeholder={t('directory.searchPlaceholder')}
                        className="h-10 w-full rounded-xl border border-slate-200/80 bg-slate-50/50 ps-10 pe-10 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:bg-white focus:ring-4 focus:ring-teal-500/10 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100"
                    />
                    {searchTerm && (
                        <button
                            type="button"
                            onClick={() => setSearchTerm('')}
                            className="absolute end-3 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                            aria-label={t('clear', { defaultValue: 'Clear search' })}
                        >
                            <X size={14} />
                        </button>
                    )}
                </label>

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <p className="rounded-xl bg-slate-50 px-3.5 py-2 text-xs font-bold text-slate-500 dark:bg-slate-950/40 dark:text-slate-400">
                        {t('directory.foundCount', { count: totalPatients })}
                    </p>
                    <select
                        aria-label={t('directory.gender')}
                        value={genderFilter}
                        onChange={(event) => setGenderFilter(event.target.value)}
                        className="h-10 rounded-xl border border-slate-200/80 bg-slate-50/50 px-3.5 text-sm font-semibold text-slate-700 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"
                    >
                        {genderOptions.map((option) => (
                            <option key={option} value={option}>
                                {option === 'All' ? t('directory.allGenders') : t(`directory.${option.toLowerCase()}`, { defaultValue: option })}
                            </option>
                        ))}
                    </select>
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                {isLoading ? (
                    <div className="space-y-2 p-4">
                        {Array.from({ length: 8 }).map((_, index) => (
                            <div key={index} className="h-12 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
                        ))}
                    </div>
                ) : isError ? (
                    <div role="alert" className="py-12 text-center text-sm font-bold text-rose-700">
                        {t('directory.loadError', { defaultValue: 'Patient directory could not be loaded.' })}
                        <button type="button" onClick={refetch} className="ms-2 underline">{t('retry', { defaultValue: 'Retry' })}</button>
                    </div>
                ) : paginatedPatients.length > 0 ? (
                    <table className="w-full table-fixed text-start text-sm">
                        <thead className="border-b border-slate-150/60 bg-slate-50/70 dark:border-slate-800/60 dark:bg-slate-950/40">
                            <tr>
                                <SortableHeader field="mrn" label={t('directory.mrn')} width="w-[100px]" className="ps-5" />
                                <th className="w-[28%] px-3 py-3 text-start text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">{t('directory.name')}</th>
                                <SortableHeader field="gender" label={t('directory.gender')} width="hidden w-[110px] sm:table-cell" />
                                <th className="hidden w-[150px] px-3 py-3 text-start text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 md:table-cell">{t('directory.mobile')}</th>
                                <SortableHeader field="dob" label={t('directory.birthDate')} width="hidden w-[130px] lg:table-cell" />
                                <th className="hidden px-3 py-3 xl:table-cell text-[10px] font-black uppercase tracking-wider text-slate-400">
                                    {t('directory.phoneLocation')}
                                </th>
                                <th className="w-[130px] px-4 py-3 pe-5 text-end text-[10px] font-black uppercase tracking-wider text-slate-400">
                                    {t('directory.action')}
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-150/40 dark:divide-slate-800/60">
                            {paginatedPatients.map((patient) => (
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

            {/* Pagination Footer */}
            {totalPatients > 0 && (
                <footer className="flex flex-col items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/30 sm:flex-row sm:px-6">
                    <div className="flex items-center gap-3 text-xs font-bold text-slate-500 dark:text-slate-400">
                        <span>
                            {t('pagination.showing', {
                                from: paginationState.startIndex + 1,
                                to: paginationState.endIndex,
                                total: totalPatients,
                                defaultValue: `Showing ${paginationState.startIndex + 1}–${paginationState.endIndex} of ${totalPatients}`
                            })}
                        </span>
                        <div className="flex items-center gap-1.5">
                            <span className="text-[11px] font-semibold">{t('pagination.perPage', { defaultValue: 'Rows:' })}</span>
                            <select
                                value={pageSize}
                                onChange={(e) => setPageSize(Number(e.target.value))}
                                className="h-7 rounded-lg border border-slate-200 bg-white px-2 text-xs font-bold text-slate-700 outline-none transition focus:border-teal-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                                aria-label={t('pagination.selectPageSize', { defaultValue: 'Rows per page' })}
                            >
                                {PAGE_SIZE_OPTIONS.map((opt) => (
                                    <option key={opt} value={opt}>{opt}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    <Pagination
                        currentPage={paginationState.currentPage}
                        pageCount={paginationState.pageCount}
                        onPageChange={setCurrentPage}
                        isRtl={isRtl}
                    />
                </footer>
            )}
        </section>
    );
};

const CountTile = ({ active, label, onClick, value }) => (
    <button
        type="button"
        onClick={onClick}
        className={`rounded-xl border px-3 py-2 text-start transition-all duration-200 active:scale-[0.98] ${
            active
                ? 'border-teal-300 bg-teal-50/80 text-teal-800 shadow-xs dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-300'
                : 'border-slate-200/80 bg-slate-50/30 text-slate-600 hover:border-slate-300 hover:bg-slate-100/50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-800/50'
        }`}
        aria-pressed={active}
    >
        <p className="truncate text-[10px] font-black uppercase tracking-wide opacity-70">{label}</p>
        <p className="mt-1 font-mono text-lg font-black tabular-nums">{value}</p>
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
            <td className="px-3 py-3.5 ps-5">
                <span className="max-w-full truncate font-mono text-xs font-black uppercase tracking-wide text-slate-500 ltr-embed group-hover:text-teal-700 dark:group-hover:text-teal-400" dir="ltr">
                    {patient.mrn || '-'}
                </span>
            </td>
            <td className="px-3 py-3.5">
                <div className="flex min-w-0 max-w-full items-center gap-3 text-start">
                    <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 ring-1 ring-slate-200 group-hover:bg-teal-50 group-hover:text-teal-600 group-hover:ring-teal-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700 dark:group-hover:bg-teal-500/10 dark:group-hover:text-teal-400 dark:group-hover:ring-teal-500/30 sm:flex">
                        <UserRound size={16} />
                    </span>
                    <span className="min-w-0">
                        <span className="block truncate font-black text-slate-950 group-hover:text-teal-800 dark:text-white dark:group-hover:text-teal-300 text-xs sm:text-sm">{name}</span>
                        <span className="block truncate text-[11px] font-semibold text-slate-400 md:hidden">{patient.phone || '-'}</span>
                    </span>
                </div>
            </td>
            <td className="hidden px-3 py-3.5 sm:table-cell">
                <span className={`inline-flex rounded-lg border px-2.5 py-0.5 text-[10px] font-black uppercase ${genderBadgeStyles[patient.gender] || genderBadgeStyles.Other}`}>
                    {t(`directory.${genderKey}`, { defaultValue: patient.gender || t('directory.other', { defaultValue: 'Other' }) })}
                </span>
            </td>
            <td className="hidden px-3 py-3.5 md:table-cell">
                <span className="block truncate font-mono text-xs font-semibold text-slate-700 dark:text-slate-300 ltr-embed" dir="ltr">
                    {patient.phone || '-'}
                </span>
            </td>
            <td className="hidden px-3 py-3.5 text-xs font-semibold text-slate-600 dark:text-slate-300 lg:table-cell">
                {patient.date_of_birth || '-'}
            </td>
            <td className="hidden px-3 py-3.5 xl:table-cell">
                <span className="block truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {patient.address || '-'}
                </span>
            </td>
            <td className="px-4 py-3.5 pe-5 text-end">
                <div className="flex items-center justify-end gap-1.5">
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onViewProfile(patient); }}
                        className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition hover:border-teal-300 hover:bg-teal-50 hover:text-teal-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white"
                        title={t('directory.viewProfile') || 'View Profile'}
                    >
                        <UserRound size={13} />
                    </button>
                    {onBook && <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onBook(patient); }}
                        className="inline-flex min-h-8 items-center justify-center gap-1.5 rounded-lg bg-teal-700 px-3 text-xs font-black text-white shadow-sm transition hover:bg-teal-800 active:scale-[0.98] dark:bg-teal-600 dark:hover:bg-teal-500"
                    >
                        <CalendarPlus size={13} />
                        <span className="hidden sm:inline">{t('directory.book')}</span>
                    </button>}
                </div>
            </td>
        </tr>
    );
};

export default PatientDirectory;
