import React, { useEffect, useMemo, useState } from 'react';
import {
    Plus, X, Search, UserPlus, Clock, CheckCircle2,
    Users, PhoneCall, Gift, ThumbsDown, Calendar, Filter
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    useGetPatientsQuery,
    useGetMachinesQuery,
    useGetExamTypesQuery,
    useCreateWaitingListEntryMutation,
    useUpdateWaitingListEntryMutation,
    useGetWaitingListQuery,
} from '../../store/api';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { toDateInput } from '../../utils/appointmentDates';
import { inputClass as baseInputClass } from '../../utils/designTokens';
import { getPaginationState } from '../../utils/pagination';
import Pagination from '../ui/Pagination';
import toast from 'react-hot-toast';

// Helper functions
const getPatientDisplayName = (patient) => {
    if (!patient) return '';
    const firstName = patient.first_name || '';
    const lastName = patient.last_name || '';
    if (firstName && lastName) return `${firstName} ${lastName}`;
    return firstName || lastName || patient.fullName || '';
};

const getWaitingListValidation = (form, today) => {
    if (!form.patientId) return 'selectPatient';
    if (!form.preferredDate) return 'pastPreferredDate';
    if (form.preferredDate < today) return 'pastPreferredDate';
    if (!form.preferredStartTime || !form.preferredEndTime) return 'incompletePreferredWindow';
    if (form.preferredEndTime <= form.preferredStartTime) return 'invalidPreferredWindow';
    return null;
};

const getDaysWaiting = (createdAt) => {
    if (!createdAt) return 0;
    const diff = Date.now() - new Date(createdAt).getTime();
    return Math.max(0, Math.floor(diff / (1000 * 60 * 60 * 24)));
};

const inputClass = `${baseInputClass} h-9 rounded-xl border-slate-200 bg-white py-0 text-xs transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-slate-950`;
const PAGE_SIZE = 5;

const STATUS_BADGES = {
    Waiting: 'bg-teal-50 text-teal-700 border-teal-200 dark:bg-teal-950/40 dark:text-teal-300 dark:border-teal-800',
    Contacted: 'bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800',
    Offered: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800',
    Declined: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-800',
    Cancelled: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800'
};

const ModernWaitlistPanel = ({ selectedDate, t, canManage = false, canCreateAppointments = false, onClose }) => {
    const { i18n } = useTranslation();
    const [showForm, setShowForm] = useState(false);
    const [filterDateOnly, setFilterDateOnly] = useState(true);
    const [searchQuery, setSearchQuery] = useState('');
    const [currentPage, setCurrentPage] = useState(1);
    const [patientQuery, setPatientQuery] = useState('');
    
    const [waitlistForm, setWaitlistForm] = useState({
        patientId: '',
        modalityId: '',
        examTypeId: '',
        preferredDate: selectedDate || toDateInput(),
        preferredStartTime: '08:00',
        preferredEndTime: '12:00',
        priority: 'Routine',
        source: 'Walk-in',
        notes: ''
    });

    useEffect(() => {
        setWaitlistForm(prev => ({ ...prev, preferredDate: selectedDate || toDateInput() }));
    }, [selectedDate]);

    const activeDateParam = filterDateOnly ? (selectedDate || toDateInput()) : undefined;
    const { data: waitingList = [], isLoading: isWaitlistLoading } = useGetWaitingListQuery({
        active: 'true',
        date: activeDateParam,
        q: searchQuery.trim() || undefined
    });

    const { data: patientsResponse } = useGetPatientsQuery({ limit: 25, q: patientQuery.trim() || undefined });
    const { data: machines = [] } = useGetMachinesQuery();
    const { data: examTypes = [] } = useGetExamTypesQuery(waitlistForm.modalityId, { skip: !waitlistForm.modalityId });
    const [createWaitingListEntry, { isLoading: isAdding }] = useCreateWaitingListEntryMutation();
    const [updateWaitingListEntry] = useUpdateWaitingListEntryMutation();

    const patients = useMemo(() => patientsResponse?.data || [], [patientsResponse?.data]);
    useEffect(() => {
        if (!showForm) setPatientQuery('');
    }, [showForm]);

    useEffect(() => {
        setCurrentPage(1);
    }, [waitingList.length, selectedDate, filterDateOnly, searchQuery]);

    const filteredPatients = useMemo(() => {
        const q = patientQuery.toLowerCase().trim();
        if (!q) return patients;
        return patients.filter((p) =>
            p.mrn?.toLowerCase().includes(q) ||
            getPatientDisplayName(p).toLowerCase().includes(q)
        );
    }, [patients, patientQuery]);

    // Pagination calculations
    const paginationState = useMemo(() => {
        return getPaginationState(waitingList.length, currentPage, PAGE_SIZE);
    }, [waitingList.length, currentPage]);

    const paginatedList = useMemo(() => {
        return waitingList.slice(paginationState.startIndex, paginationState.endIndex);
    }, [waitingList, paginationState.startIndex, paginationState.endIndex]);

    const handleAddWaitlist = async () => {
        const validationError = getWaitingListValidation(waitlistForm, toDateInput());
        if (validationError) {
            toast.error(t(`appointments:toast.${validationError}`));
            return;
        }
        try {
            await createWaitingListEntry({
                ...waitlistForm,
                modalityId: waitlistForm.modalityId || undefined,
                examTypeId: waitlistForm.examTypeId || undefined,
                notes: waitlistForm.notes.trim() || undefined
            }).unwrap();
            toast.success(t('appointments:toast.waitlistAdded'));
            setWaitlistForm(prev => ({ ...prev, patientId: '', notes: '' }));
            setShowForm(false);
        } catch (error) {
            toast.error(getErrorMessage(error, t('appointments:toast.waitlistFailed')));
        }
    };

    const handleUpdateStatus = async (entry, status) => {
        try {
            await updateWaitingListEntry({ id: entry.waitlist_id, status }).unwrap();
            const localizedStatus = t(`reception:waitlist.statuses.${status}`, {
                defaultValue: t(`appointments:status.${status}`, { defaultValue: status })
            });
            toast.success(t('reception:toast.waitlistMarked', { status: localizedStatus }));
        } catch (error) {
            toast.error(getErrorMessage(error, t('reception:toast.waitlistFailed')));
        }
    };

    return (
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#070e1a]">
            {/* ── Header ── */}
            <div className="border-b border-slate-200 bg-slate-50 px-4 pb-3 pt-4 dark:border-slate-800 dark:bg-[#091222]">
                {/* Title row */}
                <div className="flex items-center justify-between gap-2">
                    <div className="flex min-w-0 items-center gap-2.5">
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-500/10 text-teal-600 ring-1 ring-teal-500/20 dark:text-teal-300">
                            <Users size={16} />
                        </span>
                        <div className="min-w-0">
                            <h2 className="text-sm font-black text-slate-900 dark:text-white">
                                {t('waitlist.title', { defaultValue: t('reception:waitlist.title', { defaultValue: 'قائمة الانتظار' }) })}
                            </h2>
                            <p className="text-[10.5px] font-medium text-slate-400">
                                {waitingList.length} {t('waitlist.entries', { defaultValue: t('reception:waitlist.entries', { defaultValue: 'حالة' }) })}
                            </p>
                        </div>
                    </div>

                    {/* Toolbar: date toggle + add */}
                    <div className="flex items-center gap-1.5">
                        <button
                            type="button"
                            onClick={() => setFilterDateOnly(v => !v)}
                            title={filterDateOnly
                                ? t('reception:waitlist.showingDateOnly', { defaultValue: 'عرض التاريخ المحدد فقط' })
                                : t('reception:waitlist.showingAll', { defaultValue: 'عرض كل التواريخ' })}
                            className={`inline-flex h-7 items-center gap-1 rounded-lg border px-2 text-[10.5px] font-bold transition active:scale-95 ${
                                filterDateOnly
                                    ? 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-800/60 dark:bg-teal-950/40 dark:text-teal-300'
                                    : 'border-slate-200 bg-white text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                            }`}
                        >
                            <Calendar size={11} />
                            <span className="max-w-[68px] truncate">
                                {filterDateOnly
                                    ? (selectedDate || t('common:dates.today', { defaultValue: 'اليوم' }))
                                    : t('reception:waitlist.allDates', { defaultValue: 'الكل' })}
                            </span>
                        </button>

                        {canManage && (
                            <button
                                type="button"
                                onClick={() => setShowForm(v => !v)}
                                aria-label={showForm ? t('appointments:waitlist.collapseForm') : t('appointments:waitlist.add')}
                                className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border transition active:scale-95 ${
                                    showForm
                                        ? 'border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-400'
                                        : 'border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100 dark:border-teal-800/60 dark:bg-teal-950/40 dark:text-teal-300'
                                }`}
                            >
                                {showForm ? <X size={13} /> : <Plus size={13} />}
                            </button>
                        )}

                        {onClose && (
                            <button
                                type="button"
                                onClick={onClose}
                                title={t('waitlist.closePanel', { defaultValue: 'إغلاق اللوحة' })}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 transition hover:border-slate-300 hover:bg-slate-50 hover:text-slate-700 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:hover:text-white"
                            >
                                <X size={13} />
                            </button>
                        )}
                    </div>
                </div>

                {/* Search */}
                <div className="relative mt-2.5">
                    <Search size={12} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder={t('appointments:waitlist.filterPlaceholder', { defaultValue: 'بحث بالاسم أو الرقم الطبي أو الفحص...' })}
                        className="h-8 w-full rounded-xl border border-slate-200 bg-white ps-8 pe-7 text-[11px] font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-[#0b1426] dark:text-slate-200"
                    />
                    {searchQuery && (
                        <button
                            type="button"
                            onClick={() => setSearchQuery('')}
                            className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
                        >
                            <X size={11} />
                        </button>
                    )}
                </div>
            </div>

            {/* ── Add Waitlist Form ── */}
            {showForm && (
                <div className="space-y-2.5 border-b border-slate-100 bg-slate-50/60 px-4 py-3.5 dark:border-slate-800 dark:bg-slate-950/40">
                    <div className="relative">
                        <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" size={12} />
                        <input
                            type="text"
                            value={patientQuery}
                            onChange={(e) => setPatientQuery(e.target.value)}
                            placeholder={t('appointments:waitlist.searchPatientPlaceholder')}
                            className="h-8 w-full rounded-xl border border-slate-200 bg-white ps-8 pe-7 text-xs font-medium text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                        {patientQuery && (
                            <button
                                type="button"
                                onClick={() => setPatientQuery('')}
                                className="absolute end-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700"
                            >
                                <X size={11} />
                            </button>
                        )}
                    </div>

                    <select
                        value={waitlistForm.patientId}
                        onChange={(e) => setWaitlistForm(prev => ({ ...prev, patientId: e.target.value }))}
                        className={inputClass}
                    >
                        <option value="">
                            {filteredPatients.length === 0
                                ? t('appointments:waitlist.noPatientsFound')
                                : t('appointments:waitlist.selectPatient')}
                        </option>
                        {filteredPatients.map((p) => (
                            <option key={p.patient_id} value={p.patient_id}>
                                {p.mrn} — {getPatientDisplayName(p) || t('appointments:waitlist.unnamedPatient')}
                            </option>
                        ))}
                    </select>

                    <div className="grid grid-cols-2 gap-2">
                        <select
                            value={waitlistForm.modalityId}
                            onChange={(e) => setWaitlistForm(prev => ({ ...prev, modalityId: e.target.value, examTypeId: '' }))}
                            className={inputClass}
                        >
                            <option value="">{t('appointments:waitlist.anyRoom')}</option>
                            {machines.filter((m) => m.status === 'Active').map((m) => (
                                <option key={m.modality_id} value={m.modality_id}>{m.name}</option>
                            ))}
                        </select>
                        <select
                            value={waitlistForm.examTypeId}
                            onChange={(e) => setWaitlistForm(prev => ({ ...prev, examTypeId: e.target.value }))}
                            disabled={!waitlistForm.modalityId}
                            className={inputClass}
                        >
                            <option value="">{t('appointments:waitlist.anyExamType')}</option>
                            {examTypes.map((ex) => (
                                <option key={ex.type_id} value={ex.type_id}>{ex.name}</option>
                            ))}
                        </select>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                        <input
                            type="date"
                            required
                            min={toDateInput()}
                            value={waitlistForm.preferredDate}
                            onChange={(e) => setWaitlistForm(prev => ({ ...prev, preferredDate: e.target.value }))}
                            className={inputClass}
                        />
                        <input
                            type="time"
                            required
                            value={waitlistForm.preferredStartTime}
                            onChange={(e) => setWaitlistForm(prev => ({ ...prev, preferredStartTime: e.target.value }))}
                            className={inputClass}
                        />
                        <input
                            type="time"
                            required
                            value={waitlistForm.preferredEndTime}
                            onChange={(e) => setWaitlistForm(prev => ({ ...prev, preferredEndTime: e.target.value }))}
                            className={inputClass}
                        />
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <select
                            value={waitlistForm.priority}
                            onChange={(e) => setWaitlistForm(prev => ({ ...prev, priority: e.target.value }))}
                            className={inputClass}
                        >
                            {['Routine', 'Urgent', 'Emergency'].map((p) => (
                                <option key={p} value={p}>{p}</option>
                            ))}
                        </select>
                        <select
                            value={waitlistForm.source}
                            onChange={(e) => setWaitlistForm(prev => ({ ...prev, source: e.target.value }))}
                            className={inputClass}
                        >
                            {['Walk-in', 'Phone', 'Online', 'Referral'].map((s) => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </div>

                    <textarea
                        value={waitlistForm.notes}
                        onChange={(e) => setWaitlistForm(prev => ({ ...prev, notes: e.target.value }))}
                        rows={2}
                        placeholder={t('appointments:waitlist.notes')}
                        className={`${baseInputClass} rounded-xl border-slate-200 bg-white py-2 text-xs transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-slate-950`}
                    />

                    <button
                        type="button"
                        onClick={handleAddWaitlist}
                        disabled={isAdding}
                        className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-teal-600 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-teal-700 active:scale-[0.98] disabled:opacity-50"
                    >
                        <UserPlus size={13} />
                        {isAdding
                            ? t('appointments:waitlist.adding')
                            : t('appointments:waitlist.add')}
                    </button>
                </div>
            )}

            {/* ── List ── */}
            <div className="p-2">
                {isWaitlistLoading ? (
                    <div className="space-y-2 py-3">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100 dark:bg-slate-800" />
                        ))}
                    </div>
                ) : waitingList.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-slate-100 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
                            <UserPlus size={18} className="text-slate-400" />
                        </div>
                        <p className="text-sm font-black text-slate-700 dark:text-slate-200">
                            {t('waitlist.noEntries', { defaultValue: t('reception:waitlist.noEntries', { defaultValue: 'لا توجد حالات انتظار' }) })}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-400">
                            {t('waitlist.emptySubtitle', { defaultValue: t('reception:waitlist.emptySubtitle', { defaultValue: 'لا يوجد مرضى في قائمة الانتظار.' }) })}
                        </p>
                        {canManage && (
                            <button
                                type="button"
                                onClick={() => setShowForm(true)}
                                className="mt-3 inline-flex items-center gap-1.5 rounded-xl bg-teal-600 px-3 py-1.5 text-xs font-bold text-white shadow-sm transition hover:bg-teal-700 active:scale-95"
                            >
                                <Plus size={13} />
                                <span>{t('waitlist.addPatient', { defaultValue: 'إضافة مريض للانتظار' })}</span>
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="space-y-2.5">
                        {paginatedList.map((entry, qIdx) => (
                            <WaitlistEntry
                                key={entry.waitlist_id}
                                entry={entry}
                                index={paginationState.startIndex + qIdx}
                                onUpdateStatus={handleUpdateStatus}
                                selectedDate={selectedDate}
                                canManage={canManage}
                                canCreateAppointments={canCreateAppointments}
                                t={t}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* ── Compact Pagination ── */}
            {waitingList.length > PAGE_SIZE && (
                <footer className="flex items-center justify-between border-t border-slate-200 bg-slate-50 px-3.5 py-2 dark:border-slate-800 dark:bg-[#070e1a]">
                    <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                        {paginationState.startIndex + 1}–{paginationState.endIndex} / {waitingList.length}
                    </span>
                    <Pagination
                        currentPage={currentPage}
                        pageCount={paginationState.pageCount}
                        onPageChange={setCurrentPage}
                        isRtl={i18n.language?.startsWith('ar')}
                        compact
                    />
                </footer>
            )}
        </section>
    );
};

const WaitlistEntry = ({ entry, index, onUpdateStatus, selectedDate, t, canManage, canCreateAppointments }) => {
    const daysWaiting  = getDaysWaiting(entry.created_at);
    const statusClass  = STATUS_BADGES[entry.status] || STATUS_BADGES.Waiting;
    const isUrgent     = entry.priority === 'Urgent';
    const isEmergency  = entry.priority === 'Emergency';

    return (
        <div className={`group rounded-2xl border-2 p-3.5 transition-all shadow-2xs hover:shadow-sm ${
            isEmergency
                ? 'border-rose-300 border-s-4 border-s-rose-500 bg-rose-50 dark:border-rose-800 dark:border-s-rose-500 dark:bg-[#200a0e]'
                : isUrgent
                    ? 'border-amber-300 border-s-4 border-s-amber-500 bg-amber-50 dark:border-amber-800 dark:border-s-amber-500 dark:bg-[#281c0b]'
                    : 'border-slate-200 border-s-4 border-s-teal-500 bg-white hover:border-teal-300 dark:border-slate-800 dark:border-s-teal-500 dark:bg-[#0b1426]'
        }`}>

            {/* Row 1: Number + Name + Status badge */}
            <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-lg text-[9px] font-black ring-1 ${
                        isEmergency
                            ? 'bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:ring-rose-900/50'
                            : isUrgent
                                ? 'bg-amber-100 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:ring-amber-900/50'
                                : 'bg-slate-100 text-slate-500 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700'
                    }`}>
                        {index + 1}
                    </span>
                    <h3 className="min-w-0 truncate text-xs font-black text-slate-900 dark:text-white">
                        {entry.patient_name || t('fallback.unnamed', { defaultValue: 'غير معرّف' })}
                    </h3>
                </div>
                <span className={`inline-flex shrink-0 items-center rounded-lg border px-1.5 py-0.5 text-[9px] font-bold ${statusClass}`}>
                    {t(`reception:waitlist.statuses.${entry.status}`, { defaultValue: entry.status })}
                </span>
            </div>

            {/* Row 2: MRN + days waiting + phone */}
            <div className="mt-1 flex flex-wrap items-center gap-2">
                <span className="font-mono text-[10px] text-slate-400 ltr-embed">{entry.mrn}</span>
                {(entry.phone || entry.patient_phone) && (
                    <a
                        href={`tel:${entry.phone || entry.patient_phone}`}
                        className="font-mono text-[10px] text-teal-600 hover:underline dark:text-teal-400 ltr-embed"
                    >
                        {entry.phone || entry.patient_phone}
                    </a>
                )}
                {daysWaiting > 0 && (
                    <span className="flex items-center gap-0.5 text-[9.5px] font-semibold text-amber-600 dark:text-amber-400">
                        <Clock size={9} />
                        {daysWaiting}د
                    </span>
                )}
                {(isEmergency || isUrgent) && (
                    <span className={`text-[9px] font-black ${isEmergency ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400'}`}>
                        · {entry.priority}
                    </span>
                )}
            </div>

            {/* Row 3: Exam + Machine + Date */}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <p className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    {entry.exam_type_name || t('appointments:waitlist.anyExam')}
                </p>
                {entry.machine_name && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-400">
                        · {entry.machine_name}
                    </span>
                )}
                {entry.preferred_date && (
                    <span className="inline-flex items-center gap-0.5 rounded bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                        <Calendar size={9} />
                        {entry.preferred_date}
                    </span>
                )}
            </div>

            {/* Notes (collapsed, expand on hover) */}
            {entry.notes && (
                <p className="mt-1.5 line-clamp-1 text-[10px] italic text-slate-500 transition-all group-hover:line-clamp-none dark:text-slate-400">
                    {entry.notes}
                </p>
            )}

            {/* Actions row */}
            <div className="mt-2.5 flex items-center gap-1 border-t border-slate-100 pt-2 dark:border-slate-800">
                {canCreateAppointments && (
                    <Link
                        to={`/appointments/new?patientId=${entry.patient_id}&date=${entry.preferred_date || selectedDate}&modalityId=${entry.modality_id || ''}&examTypeId=${entry.exam_type_id || ''}&priority=${entry.priority || 'Routine'}&source=${encodeURIComponent(entry.source || 'Walk-in')}&waitlistId=${entry.waitlist_id}&notes=${encodeURIComponent(entry.notes || '')}`}
                        className="inline-flex h-7 items-center gap-1 rounded-lg bg-teal-600 px-2.5 text-[10.5px] font-black text-white shadow-sm transition hover:bg-teal-700 active:scale-95"
                    >
                        {t('appointments:waitlist.bookNow', { defaultValue: 'حجز' })}
                    </Link>
                )}

                {canManage && (
                    <>
                        {entry.status !== 'Contacted' && (
                            <button
                                type="button"
                                onClick={() => onUpdateStatus(entry, 'Contacted')}
                                title={t('reception:waitlist.markContacted', { defaultValue: 'تم التواصل' })}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-sky-300 hover:bg-sky-50 hover:text-sky-700 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-sky-700/50 dark:hover:bg-sky-950/30 dark:hover:text-sky-400"
                            >
                                <PhoneCall size={11} />
                            </button>
                        )}
                        {entry.status !== 'Offered' && (
                            <button
                                type="button"
                                onClick={() => onUpdateStatus(entry, 'Offered')}
                                title={t('reception:waitlist.markOffered', { defaultValue: 'تم عرض موعد' })}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-amber-300 hover:bg-amber-50 hover:text-amber-700 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-amber-700/50 dark:hover:bg-amber-950/30 dark:hover:text-amber-400"
                            >
                                <Gift size={11} />
                            </button>
                        )}
                        {entry.status !== 'Declined' && (
                            <button
                                type="button"
                                onClick={() => onUpdateStatus(entry, 'Declined')}
                                title={t('reception:waitlist.markDeclined', { defaultValue: 'رفض' })}
                                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 transition hover:border-purple-300 hover:bg-purple-50 hover:text-purple-700 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-400 dark:hover:border-purple-700/50 dark:hover:bg-purple-950/30 dark:hover:text-purple-400"
                            >
                                <ThumbsDown size={11} />
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => onUpdateStatus(entry, 'Cancelled')}
                            title={t('appointments:waitlist.cancel', { defaultValue: 'إلغاء' })}
                            className="ms-auto inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-400 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-rose-700/50 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
                        >
                            <X size={11} />
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

export default ModernWaitlistPanel;
