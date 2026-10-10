import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    ArrowDown,
    ArrowUp,
    ArrowUpDown,
    Calendar,
    CalendarPlus,
    LayoutGrid,
    List,
    MapPin,
    Phone,
    RefreshCw,
    Search,
    UserRound,
    UsersRound,
    X,
} from 'lucide-react';
import EmptyState from '../ui/EmptyState';
import Pagination from '../ui/Pagination';
import { getPaginationState } from '../../utils/pagination';
import { useGetPatientsQuery } from '../../store/api';
import useDebounce from '../../hooks/useDebounce';

const genderBadgeStyles = {
    Male: 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-500/20 dark:bg-teal-500/10 dark:text-teal-300',
    Female: 'border-pink-200 bg-pink-50 text-pink-700 dark:border-pink-500/20 dark:bg-pink-500/10 dark:text-pink-300',
    Other: 'border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300',
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
    const [viewMode, setViewMode] = useState(() => {
        try {
            return localStorage.getItem('viara_patient_directory_view') || 'table';
        } catch {
            return 'table';
        }
    });

    const isRtl = i18n?.language?.startsWith('ar');
    const debouncedSearch = useDebounce(searchTerm.trim(), 250);

    const {
        data: patientList,
        isLoading,
        isFetching,
        isError,
        refetch,
    } = useGetPatientsQuery({
        search: debouncedSearch || undefined,
        gender: genderFilter === 'All' ? undefined : genderFilter,
        limit: pageSize,
        offset: (currentPage - 1) * pageSize,
        sortBy: sortField === 'dob' ? 'dateOfBirth' : sortField,
        sortDirection,
    }, {
        pollingInterval: 60_000,
        skipPollingIfUnfocused: true,
    });

    const patients = useMemo(() => patientList?.data || [], [patientList?.data]);
    const totalPatients = Number(patientList?.meta?.total || 0);
    const genderCounts = patientList?.meta?.genderCounts || {
        All: totalPatients,
        Male: 0,
        Female: 0,
        Other: 0,
    };

    const paginationState = useMemo(
        () => getPaginationState(totalPatients, currentPage, pageSize),
        [totalPatients, currentPage, pageSize]
    );

    useEffect(() => {
        setCurrentPage(1);
    }, [debouncedSearch, genderFilter, pageSize]);

    useEffect(() => {
        try {
            localStorage.setItem('viara_patient_directory_view', viewMode);
        } catch {
            // Storage can be unavailable in restricted browser contexts.
        }
    }, [viewMode]);

    useEffect(() => {
        if (currentPage !== paginationState.currentPage) {
            setCurrentPage(paginationState.currentPage);
        }
    }, [currentPage, paginationState.currentPage]);

    const handleSort = (field) => {
        if (sortField === field) {
            setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
        } else {
            setSortField(field);
            setSortDirection('asc');
        }
    };

    const clearFilters = () => {
        setSearchTerm('');
        setGenderFilter('All');
        setSortField('mrn');
        setSortDirection('asc');
    };

    const hasFilters = Boolean(searchTerm.trim()) || genderFilter !== 'All';

    const genderLabel = (option) => option === 'All'
        ? t('directory.allGenders', { defaultValue: isRtl ? 'الكل' : 'All' })
        : t(`directory.${option.toLowerCase()}`, { defaultValue: option });

    const SortableHeader = ({ field, label, className = '' }) => {
        const isCurrent = sortField === field;
        return (
            <th className={`px-3 py-2.5 text-start ${className}`}>
                <button
                    type="button"
                    onClick={() => handleSort(field)}
                    className="group inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-[.08em] text-[var(--VIARA-muted)] transition hover:text-[var(--VIARA-ink)]"
                >
                    <span>{label}</span>
                    {isCurrent ? (
                        sortDirection === 'asc'
                            ? <ArrowUp size={11} className="text-teal-600" />
                            : <ArrowDown size={11} className="text-teal-600" />
                    ) : (
                        <ArrowUpDown size={10} className="opacity-40 group-hover:opacity-100" />
                    )}
                </button>
            </th>
        );
    };

    return (
        <section className="overflow-hidden rounded-[22px] border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] shadow-[0_18px_50px_-36px_rgba(15,23,42,.45)]">
            {/* Compact workspace header */}
            <header className="border-b border-[var(--VIARA-line)] bg-gradient-to-br from-teal-500/[0.06] via-[var(--VIARA-surface)] to-cyan-500/[0.03] px-4 py-3.5 sm:px-5">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-sm shadow-teal-600/20">
                            <UsersRound size={19} />
                        </span>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <h2 className="text-base font-black text-[var(--VIARA-ink)] sm:text-lg">
                                    {t('directory.title', { defaultValue: isRtl ? 'دليل المرضى' : 'Patient directory' })}
                                </h2>
                                <span className="rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 font-mono text-[10px] font-black text-teal-700 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-300">
                                    {totalPatients.toLocaleString(isRtl ? 'ar-EG' : 'en-US')}
                                </span>
                                {isFetching && !isLoading && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-teal-500" />}
                            </div>
                            <p className="mt-0.5 truncate text-xs font-medium text-[var(--VIARA-muted)]">
                                {t('directory.subtitle', { defaultValue: isRtl ? 'بحث سريع، فتح الملف، أو إنشاء حجز للمريض.' : 'Search patients, open profiles, and book appointments.' })}
                            </p>
                        </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                        <button
                            type="button"
                            onClick={() => refetch()}
                            disabled={isFetching}
                            className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-3 text-xs font-black text-[var(--VIARA-muted)] transition hover:text-teal-700 disabled:opacity-50"
                        >
                            <RefreshCw size={13} className={isFetching ? 'animate-spin text-teal-600' : ''} />
                            <span className="hidden sm:inline">{isRtl ? 'تحديث' : 'Refresh'}</span>
                        </button>

                        <div className="inline-flex rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] p-0.5">
                            <button
                                type="button"
                                onClick={() => setViewMode('table')}
                                className={`grid h-8 w-8 place-items-center rounded-lg transition ${viewMode === 'table' ? 'bg-[var(--VIARA-surface)] text-teal-700 shadow-sm' : 'text-[var(--VIARA-muted)]'}`}
                                title={isRtl ? 'عرض جدول' : 'Table view'}
                            >
                                <List size={14} />
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('cards')}
                                className={`grid h-8 w-8 place-items-center rounded-lg transition ${viewMode === 'cards' ? 'bg-[var(--VIARA-surface)] text-teal-700 shadow-sm' : 'text-[var(--VIARA-muted)]'}`}
                                title={isRtl ? 'عرض بطاقات' : 'Card view'}
                            >
                                <LayoutGrid size={14} />
                            </button>
                        </div>
                    </div>
                </div>
            </header>

            {/* Search + quick filters */}
            <div className="border-b border-[var(--VIARA-line)] px-4 py-3 sm:px-5">
                <div className="flex flex-col gap-2.5 xl:flex-row xl:items-center">
                    <label className="relative min-w-0 flex-1 xl:max-w-xl">
                        <span className="sr-only">{t('directory.searchPlaceholder')}</span>
                        <Search size={15} className="absolute start-3.5 top-1/2 -translate-y-1/2 text-teal-600 dark:text-teal-400" />
                        <input
                            value={searchTerm}
                            onChange={(event) => setSearchTerm(event.target.value)}
                            placeholder={t('directory.searchPlaceholder', { defaultValue: isRtl ? 'الاسم، رقم الملف، الهاتف أو الرقم القومي...' : 'Name, MRN, phone or national ID...' })}
                            className="h-10 w-full rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] ps-10 pe-10 text-sm font-bold text-[var(--VIARA-ink)] outline-none transition placeholder:font-medium placeholder:text-[var(--VIARA-muted)] focus:border-teal-500 focus:bg-[var(--VIARA-surface)] focus:ring-4 focus:ring-teal-500/10"
                        />
                        {searchTerm && (
                            <button
                                type="button"
                                onClick={() => setSearchTerm('')}
                                className="absolute end-2.5 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-lg text-[var(--VIARA-muted)] transition hover:bg-[var(--VIARA-surface)] hover:text-[var(--VIARA-ink)]"
                                aria-label={t('clear', { defaultValue: 'Clear search' })}
                            >
                                <X size={13} />
                            </button>
                        )}
                    </label>

                    <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 xl:justify-end">
                        {genderOptions.map((option) => {
                            const active = genderFilter === option;
                            return (
                                <button
                                    key={option}
                                    type="button"
                                    onClick={() => setGenderFilter(option)}
                                    aria-pressed={active}
                                    className={`inline-flex h-9 items-center gap-1.5 rounded-xl border px-2.5 text-[11px] font-black transition ${active
                                        ? 'border-teal-500 bg-teal-600 text-white shadow-sm shadow-teal-600/15'
                                        : 'border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] text-[var(--VIARA-muted)] hover:border-teal-300 hover:text-[var(--VIARA-ink)]'
                                    }`}
                                >
                                    <span>{genderLabel(option)}</span>
                                    <span className={`rounded-md px-1.5 py-0.5 font-mono text-[9px] ${active ? 'bg-white/15 text-white' : 'bg-[var(--VIARA-surface-muted)] text-[var(--VIARA-muted)]'}`}>
                                        {Number(genderCounts[option] || 0).toLocaleString(isRtl ? 'ar-EG' : 'en-US')}
                                    </span>
                                </button>
                            );
                        })}

                        {hasFilters && (
                            <button
                                type="button"
                                onClick={clearFilters}
                                className="inline-flex h-9 items-center gap-1 rounded-xl px-2.5 text-[11px] font-black text-rose-600 transition hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/20"
                            >
                                <X size={12} />
                                {isRtl ? 'مسح الفلاتر' : 'Clear'}
                            </button>
                        )}
                    </div>
                </div>
            </div>

            {/* Content */}
            <div className="min-h-[360px]">
                {isLoading ? (
                    <div className="space-y-2 p-4">
                        {Array.from({ length: 7 }).map((_, index) => (
                            <div key={index} className="h-14 animate-pulse rounded-xl bg-[var(--VIARA-surface-muted)]" />
                        ))}
                    </div>
                ) : isError ? (
                    <div role="alert" className="flex min-h-64 flex-col items-center justify-center px-6 text-center">
                        <div className="grid h-11 w-11 place-items-center rounded-2xl bg-rose-500/10 text-rose-600">
                            <UsersRound size={20} />
                        </div>
                        <p className="mt-3 text-sm font-black text-[var(--VIARA-ink)]">
                            {t('directory.loadError', { defaultValue: isRtl ? 'تعذر تحميل دليل المرضى.' : 'Patient directory could not be loaded.' })}
                        </p>
                        <button type="button" onClick={refetch} className="mt-2 text-xs font-black text-teal-700 hover:underline dark:text-teal-300">
                            {t('retry', { defaultValue: isRtl ? 'إعادة المحاولة' : 'Retry' })}
                        </button>
                    </div>
                ) : patients.length > 0 ? (
                    <>
                        {/* Mobile is always card-first */}
                        <div className="space-y-2 p-3 sm:hidden">
                            {patients.map((patient) => (
                                <PatientCard
                                    key={patient.patient_id || patient.id}
                                    patient={patient}
                                    onBook={onBook}
                                    onViewProfile={onViewProfile}
                                    t={t}
                                    isRtl={isRtl}
                                />
                            ))}
                        </div>

                        {/* Desktop table */}
                        {viewMode === 'table' && (
                            <div className="hidden overflow-x-auto sm:block">
                                <table className="w-full min-w-[960px] table-fixed text-start text-sm">
                                    <thead className="sticky top-0 z-10 border-b-2 border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-[#091222]">
                                        <tr>
                                            <th className="w-[30%] px-4 py-2.5 text-start text-[10px] font-black uppercase tracking-[.08em] text-slate-700 dark:text-slate-300">
                                                {t('directory.name', { defaultValue: isRtl ? 'المريض' : 'Patient' })}
                                            </th>
                                            <SortableHeader field="mrn" label={t('directory.mrn', { defaultValue: 'MRN' })} className="w-[140px]" />
                                            <th className="w-[160px] px-3 py-2.5 text-start text-[10px] font-black uppercase tracking-[.08em] text-[var(--VIARA-muted)]">
                                                {t('directory.mobile', { defaultValue: isRtl ? 'التواصل' : 'Contact' })}
                                            </th>
                                            <SortableHeader field="gender" label={t('directory.gender', { defaultValue: isRtl ? 'النوع' : 'Gender' })} className="w-[100px]" />
                                            <SortableHeader field="dob" label={t('directory.birthDate', { defaultValue: isRtl ? 'تاريخ الميلاد' : 'Birth date' })} className="w-[120px]" />
                                            <th className="px-3 py-2.5 text-start text-[10px] font-black uppercase tracking-[.08em] text-[var(--VIARA-muted)]">
                                                {isRtl ? 'العنوان' : 'Address'}
                                            </th>
                                            <th className="w-[210px] px-4 py-2.5 text-end text-[10px] font-black uppercase tracking-[.08em] text-[var(--VIARA-muted)]">
                                                {t('directory.action', { defaultValue: isRtl ? 'إجراء' : 'Action' })}
                                            </th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-[var(--VIARA-line)]">
                                        {patients.map((patient) => (
                                            <PatientRow
                                                key={patient.patient_id || patient.id}
                                                patient={patient}
                                                onBook={onBook}
                                                onViewProfile={onViewProfile}
                                                t={t}
                                                isRtl={isRtl}
                                            />
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        {/* Desktop cards */}
                        {viewMode === 'cards' && (
                            <div className="hidden grid-cols-1 gap-3.5 p-4 sm:grid sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5">
                                {patients.map((patient) => (
                                    <PatientCard
                                        key={patient.patient_id || patient.id}
                                        patient={patient}
                                        onBook={onBook}
                                        onViewProfile={onViewProfile}
                                        t={t}
                                        isRtl={isRtl}
                                    />
                                ))}
                            </div>
                        )}
                    </>
                ) : (
                    <div className="py-12">
                        <EmptyState icon={Search} title={t('directory.noPatients')} />
                        {hasFilters && (
                            <div className="mt-2 text-center">
                                <button type="button" onClick={clearFilters} className="text-xs font-black text-teal-700 hover:underline dark:text-teal-300">
                                    {isRtl ? 'إظهار جميع المرضى' : 'Show all patients'}
                                </button>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {totalPatients > 0 && (
                <footer className="flex flex-col items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-2.5 sm:flex-row sm:px-5 dark:border-slate-800 dark:bg-[#070e1a]">
                    <div className="flex flex-wrap items-center gap-3 text-[11px] font-bold text-slate-600 dark:text-slate-400">
                        <span>
                            {t('pagination.showing', {
                                from: paginationState.startIndex + 1,
                                to: paginationState.endIndex,
                                total: totalPatients,
                                defaultValue: `${paginationState.startIndex + 1}–${paginationState.endIndex} / ${totalPatients}`,
                            })}
                        </span>
                        <label className="inline-flex items-center gap-1.5">
                            <span>{t('pagination.perPage', { defaultValue: isRtl ? 'في الصفحة:' : 'Rows:' })}</span>
                            <select
                                value={pageSize}
                                onChange={(e) => setPageSize(Number(e.target.value))}
                                className="h-7 rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-2 text-xs font-black text-[var(--VIARA-ink)] outline-none focus:border-teal-500"
                            >
                                {PAGE_SIZE_OPTIONS.map((opt) => <option key={opt} value={opt}>{opt}</option>)}
                            </select>
                        </label>
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

const PatientRow = ({ patient, onBook, onViewProfile, t, isRtl }) => {
    const name = getPatientName(patient);
    const genderKey = patient.gender?.toLowerCase() || 'other';

    return (
        <tr
            onClick={() => onViewProfile(patient)}
            className="group cursor-pointer bg-[var(--VIARA-surface)] transition hover:bg-teal-500/[0.035]"
        >
            <td className="px-4 py-2.5">
                <div className="flex min-w-0 items-center gap-2.5">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] text-teal-700 transition group-hover:border-teal-200 group-hover:bg-teal-50 dark:text-teal-300 dark:group-hover:border-teal-800 dark:group-hover:bg-teal-950/30">
                        <UserRound size={15} />
                    </span>
                    <div className="min-w-0">
                        <p className="truncate text-xs font-black text-[var(--VIARA-ink)] sm:text-[13px]">{name}</p>
                        {patient.national_id && (
                            <p className="mt-0.5 truncate font-mono text-[10px] font-semibold text-[var(--VIARA-muted)]" dir="ltr">{patient.national_id}</p>
                        )}
                    </div>
                </div>
            </td>
            <td className="px-3 py-2.5">
                <span className="font-mono text-[11px] font-black uppercase text-[var(--VIARA-muted)] group-hover:text-teal-700 dark:group-hover:text-teal-300" dir="ltr">
                    {patient.mrn || '-'}
                </span>
            </td>
            <td className="px-3 py-2.5">
                {patient.phone ? (
                    <span className="inline-flex items-center gap-1.5 font-mono text-[11px] font-bold text-[var(--VIARA-ink)]" dir="ltr">
                        <Phone size={11} className="text-[var(--VIARA-muted)]" />
                        {patient.phone}
                    </span>
                ) : <span className="text-[var(--VIARA-muted)]">—</span>}
            </td>
            <td className="px-3 py-2.5">
                <span className={`inline-flex rounded-lg border px-2 py-0.5 text-[9.5px] font-black ${genderBadgeStyles[patient.gender] || genderBadgeStyles.Other}`}>
                    {t(`directory.${genderKey}`, { defaultValue: patient.gender || (isRtl ? 'غير محدد' : 'Other') })}
                </span>
            </td>
            <td className="px-3 py-2.5 text-[11px] font-bold text-[var(--VIARA-muted)]">
                {patient.date_of_birth || '—'}
            </td>
            <td className="px-3 py-2.5">
                <span className="block truncate text-[11px] font-semibold text-[var(--VIARA-muted)]">{patient.address || '—'}</span>
            </td>
            <td className="px-4 py-2.5 text-end">
                <div className="flex items-center justify-end gap-1.5 whitespace-nowrap">
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onViewProfile(patient); }}
                        className="inline-flex h-8 shrink-0 whitespace-nowrap items-center gap-1 rounded-lg border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] px-2.5 text-[10.5px] font-black text-[var(--VIARA-muted)] transition hover:border-teal-300 hover:text-teal-700"
                    >
                        <UserRound size={12} className="shrink-0" />
                        <span className="whitespace-nowrap">{t('directory.viewProfile', { defaultValue: isRtl ? 'الملف' : 'Profile' })}</span>
                    </button>
                    {onBook && (
                        <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); onBook(patient); }}
                            className="inline-flex h-8 shrink-0 whitespace-nowrap items-center gap-1 rounded-lg bg-teal-600 px-2.5 text-[10.5px] font-black text-white shadow-sm transition hover:bg-teal-700 active:scale-[.98]"
                        >
                            <CalendarPlus size={12} className="shrink-0" />
                            <span className="whitespace-nowrap">{t('directory.book', { defaultValue: isRtl ? 'حجز' : 'Book' })}</span>
                        </button>
                    )}
                </div>
            </td>
        </tr>
    );
};

const PatientCard = ({ patient, onBook, onViewProfile, t, isRtl }) => {
    const name = getPatientName(patient);
    const genderKey = patient.gender?.toLowerCase() || 'other';

    return (
        <article
            onClick={() => onViewProfile(patient)}
            className="group cursor-pointer rounded-2xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] p-3.5 shadow-[0_10px_30px_-24px_rgba(15,23,42,.35)] transition hover:-translate-y-0.5 hover:border-teal-300 hover:shadow-md dark:hover:border-teal-800"
        >
            <div className="flex items-start gap-2.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-teal-500 to-cyan-600 text-white shadow-sm">
                    <UserRound size={17} />
                </span>
                <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-black text-[var(--VIARA-ink)]">{name}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        <span className="rounded-md bg-[var(--VIARA-surface-muted)] px-1.5 py-0.5 font-mono text-[10px] font-black text-[var(--VIARA-muted)]" dir="ltr">{patient.mrn || '—'}</span>
                        {patient.gender && (
                            <span className={`rounded-md border px-1.5 py-0.5 text-[9px] font-black ${genderBadgeStyles[patient.gender] || genderBadgeStyles.Other}`}>
                                {t(`directory.${genderKey}`, { defaultValue: patient.gender })}
                            </span>
                        )}
                    </div>
                </div>
            </div>

            <div className="mt-3 grid gap-1.5 text-[11px] font-semibold text-[var(--VIARA-muted)]">
                <div className="flex min-w-0 items-center gap-2">
                    <Phone size={12} className="shrink-0" />
                    <span className="truncate font-mono" dir="ltr">{patient.phone || '—'}</span>
                </div>
                <div className="flex min-w-0 items-center gap-2">
                    <Calendar size={12} className="shrink-0" />
                    <span className="truncate">{patient.date_of_birth || '—'}</span>
                </div>
                <div className="flex min-w-0 items-center gap-2">
                    <MapPin size={12} className="shrink-0" />
                    <span className="truncate">{patient.address || '—'}</span>
                </div>
            </div>

            <div className="mt-3 flex items-center gap-2 border-t border-[var(--VIARA-line)] pt-2.5">
                <button
                    type="button"
                    onClick={(e) => { e.stopPropagation(); onViewProfile(patient); }}
                    className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] text-[10.5px] font-black text-[var(--VIARA-muted)] transition hover:text-[var(--VIARA-ink)]"
                >
                    <UserRound size={12} />
                    {t('directory.viewProfile', { defaultValue: isRtl ? 'عرض الملف' : 'Profile' })}
                </button>
                {onBook && (
                    <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); onBook(patient); }}
                        className="inline-flex h-8 flex-1 items-center justify-center gap-1 rounded-xl bg-teal-600 text-[10.5px] font-black text-white shadow-sm transition hover:bg-teal-700"
                    >
                        <CalendarPlus size={12} />
                        {t('directory.book', { defaultValue: isRtl ? 'حجز موعد' : 'Book' })}
                    </button>
                )}
            </div>
        </article>
    );
};

export default PatientDirectory;
