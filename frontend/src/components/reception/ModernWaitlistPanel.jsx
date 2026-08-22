import React, { useEffect, useMemo, useState } from 'react';
import {
    Plus, X, Search, UserPlus, Clock, CheckCircle2,
    Users, ChevronLeft, ChevronRight
} from 'lucide-react';
import { Link } from 'react-router-dom';
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

const inputClass = `${baseInputClass} h-9 rounded-xl border-slate-200 bg-white py-0 text-xs transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-slate-950`;
const PAGE_SIZE = 5;

const ModernWaitlistPanel = ({ selectedDate, t, canManage = false, canCreateAppointments = false }) => {
    const [showForm, setShowForm] = useState(false);
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

    const { data: waitingList = [], isLoading: isWaitlistLoading } = useGetWaitingListQuery({ active: 'true', date: selectedDate });
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
    }, [waitingList.length, selectedDate]);

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
        <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
            {/* Header */}
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 p-5 dark:border-slate-800 sm:p-6">
                <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/30">
                        <Users size={18} />
                    </span>
                    <div className="min-w-0">
                        <h2 className="truncate text-sm font-black text-slate-900 dark:text-white">
                            {t('waitlist.title', { defaultValue: t('reception:waitlist.title', { defaultValue: 'Waiting list' }) })}
                        </h2>
                        <p className="mt-0.5 text-[11px] font-bold text-slate-400">
                            {waitingList.length} {t('waitlist.entries', { defaultValue: t('reception:waitlist.entries', { defaultValue: 'entries' }) })}
                        </p>
                    </div>
                </div>
                {canManage && <button 
                    type="button" 
                    onClick={() => setShowForm(v => !v)}
                    className={`flex h-8 w-8 items-center justify-center rounded-xl border shadow-sm transition active:scale-95 ${
                        showForm 
                            ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400' 
                            : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                    }`}
                    aria-label={showForm ? t('appointments:waitlist.collapseForm') : t('appointments:waitlist.add')}
                >
                    {showForm ? <X size={14} /> : <Plus size={15} />}
                </button>}
            </div>

            {/* Add Waitlist Form */}
            {showForm && (
                <div className="space-y-3 border-b border-slate-100 bg-slate-50/70 p-4 dark:border-slate-800 dark:bg-slate-950/30 sm:p-5">
                    <div className="relative">
                        <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                        <input
                            type="text"
                            value={patientQuery}
                            onChange={(e) => setPatientQuery(e.target.value)}
                            placeholder={t('appointments:waitlist.searchPatientPlaceholder')}
                            className="h-9 w-full rounded-xl border border-slate-200 bg-white ps-9 pe-8 text-xs font-semibold text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                        {patientQuery && (
                            <button 
                                type="button" 
                                onClick={() => setPatientQuery('')}
                                className="absolute end-3 top-1/2 -translate-y-1/2 rounded-md text-slate-400 hover:text-slate-700"
                            >
                                <X size={13} />
                            </button>
                        )}
                    </div>

                    <select 
                        value={waitlistForm.patientId} 
                        onChange={(e) => setWaitlistForm(prev => ({ ...prev, patientId: e.target.value }))} 
                        className={inputClass}
                    >
                        <option value="">
                            {filteredPatients.length === 0 ? t('appointments:waitlist.noPatientsFound') : t('appointments:waitlist.selectPatient')}
                        </option>
                        {filteredPatients.map((p) => (
                            <option key={p.patient_id} value={p.patient_id}>
                                {p.mrn} - {getPatientDisplayName(p) || t('appointments:waitlist.unnamedPatient')}
                            </option>
                        ))}
                    </select>

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
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

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
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

                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                        <select value={waitlistForm.priority} onChange={(e) => setWaitlistForm(prev => ({ ...prev, priority: e.target.value }))} className={inputClass}>
                            {['Routine', 'Urgent', 'Emergency'].map((priority) => <option key={priority} value={priority}>{priority}</option>)}
                        </select>
                        <select value={waitlistForm.source} onChange={(e) => setWaitlistForm(prev => ({ ...prev, source: e.target.value }))} className={inputClass}>
                            {['Walk-in', 'Phone', 'Online', 'Referral'].map((source) => <option key={source} value={source}>{source}</option>)}
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
                        className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-teal-600 px-4 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-teal-700 active:scale-[0.98] disabled:opacity-50"
                    >
                        <UserPlus size={14} />
                        {isAdding ? t('appointments:waitlist.adding') : t('appointments:waitlist.add')}
                    </button>
                </div>
            )}

            {/* List */}
            <div className="p-2 sm:p-3">
                {isWaitlistLoading ? (
                    <div className="py-10 text-center text-xs font-bold text-slate-400">
                        {t('common:status.loading')}
                    </div>
                ) : waitingList.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="mb-3 rounded-2xl bg-slate-100 p-3.5 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
                            <UserPlus size={20} className="text-slate-400 dark:text-slate-500" />
                        </div>
                        <p className="text-sm font-black text-slate-800 dark:text-slate-200">
                            {t('waitlist.noEntries', { defaultValue: t('reception:waitlist.noEntries', { defaultValue: 'No entries' }) })}
                        </p>
                        <p className="mt-1 text-[11px] font-semibold text-slate-500">
                            {t('waitlist.emptySubtitle', { defaultValue: t('reception:waitlist.emptySubtitle', { defaultValue: 'No patients are waiting.' }) })}
                        </p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100 overflow-x-hidden dark:divide-slate-800">
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

            {/* Compact Waitlist Pagination */}
            {waitingList.length > PAGE_SIZE && (
                <footer className="flex items-center justify-between border-t border-slate-100 bg-slate-50/50 px-3.5 py-2.5 dark:border-slate-800 dark:bg-slate-950/30">
                    <span className="text-[10px] font-bold text-slate-400">
                        {paginationState.startIndex + 1}–{paginationState.endIndex} / {waitingList.length}
                    </span>
                    <div className="flex items-center gap-1">
                        <button
                            type="button"
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={currentPage === 1}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            aria-label="Previous waitlist page"
                        >
                            <ChevronLeft size={13} />
                        </button>
                        <span className="px-1 text-[10px] font-bold text-slate-600 dark:text-slate-400">
                            {currentPage} / {paginationState.pageCount}
                        </span>
                        <button
                            type="button"
                            onClick={() => setCurrentPage(p => Math.min(paginationState.pageCount, p + 1))}
                            disabled={currentPage === paginationState.pageCount}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-50 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
                            aria-label="Next waitlist page"
                        >
                            <ChevronRight size={13} />
                        </button>
                    </div>
                </footer>
            )}
        </section>
    );
};

const WaitlistEntry = ({ entry, index, onUpdateStatus, selectedDate, t, canManage, canCreateAppointments }) => {
    return (
        <div className="group min-w-0 rounded-xl p-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md bg-slate-100 text-[10px] font-black text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700">
                            {(index + 1)}
                        </span>
                        <h3 className="min-w-0 truncate text-xs font-black text-slate-900 dark:text-white">
                            {entry.patient_name || t('fallback.unnamed', { defaultValue: 'Unnamed Patient' })}
                        </h3>
                        {entry.priority !== 'Routine' && (
                            <span 
                                className={`inline-block h-2 w-2 rounded-full shadow-sm ${
                                    entry.priority === 'Emergency' ? 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.6)]' : 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.6)]'
                                }`} 
                                title={entry.priority} 
                            />
                        )}
                    </div>
                    <p className="mt-1 font-mono text-[10px] font-bold text-slate-400">
                        {entry.mrn}
                    </p>
                    <p className="mt-0.5 truncate text-xs font-bold text-slate-700 dark:text-slate-300">
                        {entry.exam_type_name || t('appointments:waitlist.anyExam')}
                    </p>
                    <div className="mt-0.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] font-semibold text-slate-500">
                        <span className="flex items-center gap-1 truncate">
                            <Clock size={11} /> 
                            {entry.machine_name || t('appointments:waitlist.anyRoomShort')}
                        </span>
                    </div>
                    {entry.notes && (
                        <p className="mt-1.5 text-[10px] italic text-slate-500 line-clamp-1 transition-all duration-300 group-hover:line-clamp-none">
                            <span className="font-bold text-slate-400">Notes:</span> {entry.notes}
                        </p>
                    )}
                </div>
            </div>

            <div className="mt-2.5 flex items-center justify-end gap-1.5 border-t border-slate-100 pt-2 dark:border-slate-800">
                {canCreateAppointments && <Link 
                    to={`/appointments/new?patientId=${entry.patient_id}&date=${entry.preferred_date || selectedDate}&modalityId=${entry.modality_id || ''}&examTypeId=${entry.exam_type_id || ''}&priority=${entry.priority || 'Routine'}&source=${encodeURIComponent(entry.source || 'Walk-in')}&waitlistId=${entry.waitlist_id}&notes=${encodeURIComponent(entry.notes || '')}`}
                    className="inline-flex min-h-7 items-center justify-center rounded-lg bg-teal-600 px-2.5 py-1 text-[10px] font-black text-white shadow-xs transition hover:bg-teal-700 active:scale-95"
                >
                    {t('appointments:waitlist.bookNow', { defaultValue: 'Book' })}
                </Link>}
                {canManage && <button
                    type="button"
                    onClick={() => onUpdateStatus(entry, 'Contacted')}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-xs transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-600 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-400"
                    title={t('appointments:waitlist.contacted', { defaultValue: 'Contacted' })}
                >
                    <CheckCircle2 size={13} />
                </button>}
                {canManage && <button
                    type="button"
                    onClick={() => onUpdateStatus(entry, 'Cancelled')}
                    className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-xs transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-rose-500/30 dark:hover:bg-rose-500/10 dark:hover:text-rose-400"
                    title={t('appointments:waitlist.cancel', { defaultValue: 'Cancel' })}
                >
                    <X size={13} />
                </button>}
            </div>
        </div>
    );
};

export default ModernWaitlistPanel;
