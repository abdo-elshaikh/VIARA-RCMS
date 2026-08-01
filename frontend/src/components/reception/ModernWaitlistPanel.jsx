import React, { useEffect, useMemo, useState } from 'react';
import {
    Plus, X, Search, UserPlus, Clock, CheckCircle2,
    Users
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
    if (!form.patientId) return 'waitlist.patientRequired';
    if (!form.preferredDate) return 'waitlist.dateRequired';
    if (form.preferredDate < today) return 'waitlist.dateInPast';
    if (form.preferredEndTime <= form.preferredStartTime) return 'waitlist.timeInvalid';
    return null;
};

const inputClass = `${baseInputClass} h-8 border-slate-200 bg-white py-0 text-[11px] transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-slate-950`;

const ModernWaitlistPanel = ({ selectedDate, t }) => {
    const [showForm, setShowForm] = useState(false);
    
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

    const { data: waitingList = [], isLoading: isWaitlistLoading } = useGetWaitingListQuery({ status: 'Waiting', date: selectedDate });
    const { data: patientsResponse } = useGetPatientsQuery({ limit: 100 });
    const { data: machines = [] } = useGetMachinesQuery();
    const { data: examTypes = [] } = useGetExamTypesQuery(waitlistForm.modalityId, { skip: !waitlistForm.modalityId });
    const [createWaitingListEntry, { isLoading: isAdding }] = useCreateWaitingListEntryMutation();
    const [updateWaitingListEntry] = useUpdateWaitingListEntryMutation();

    const patients = useMemo(() => patientsResponse?.data || [], [patientsResponse?.data]);
    const [patientQuery, setPatientQuery] = useState('');

    useEffect(() => {
        if (!showForm) setPatientQuery('');
    }, [showForm]);

    const filteredPatients = useMemo(() => {
        const q = patientQuery.toLowerCase().trim();
        if (!q) return patients;
        return patients.filter((p) =>
            p.mrn?.toLowerCase().includes(q) ||
            getPatientDisplayName(p).toLowerCase().includes(q)
        );
    }, [patients, patientQuery]);

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
            toast.success(t('reception:toast.waitlistMarked', { status: t(`reception:waitlist.statuses.${status}`, { defaultValue: status }) }));
        } catch (error) {
            toast.error(getErrorMessage(error, t('reception:toast.waitlistFailed')));
        }
    };

    return (
        <section className="rounded-none border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-4 dark:border-slate-800 sm:px-5">
                <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-none bg-teal-50 text-teal-700 ring-1 ring-teal-100 dark:bg-teal-500/10 dark:text-teal-300 dark:ring-teal-500/20">
                        <Users size={15} />
                    </span>
                    <div className="min-w-0">
                        <h2 className="truncate text-sm font-black text-slate-900 dark:text-white">
                            {t('reception:waitlist.title', { defaultValue: 'Waiting List' })}
                        </h2>
                        <p className="mt-0.5 text-[10px] font-bold text-slate-500">
                            {waitingList.length} {t('reception:waitlist.entries', { defaultValue: 'entries' })}
                        </p>
                    </div>
                </div>
                <button 
                    type="button" 
                    onClick={() => setShowForm(v => !v)}
                    className={`flex h-8 w-8 items-center justify-center rounded-none border transition ${
                        showForm 
                            ? 'border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-400' 
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                    }`}
                    aria-label={showForm ? t('appointments:waitlist.collapseForm') : t('appointments:waitlist.add')}
                >
                    {showForm ? <X size={15} /> : <Plus size={16} />}
                </button>
            </div>

            {showForm && (
                <div className="space-y-3 border-b border-slate-100 bg-slate-50 px-4 py-4 dark:border-slate-800 dark:bg-slate-950/30 sm:px-5">
                    <div className="relative">
                        <Search className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" size={13} />
                        <input
                            type="text"
                            value={patientQuery}
                            onChange={(e) => setPatientQuery(e.target.value)}
                            placeholder={t('appointments:waitlist.searchPatientPlaceholder')}
                            className="h-9 w-full rounded-none border border-slate-200 bg-white ps-9 pe-8 text-xs font-semibold text-slate-900 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                        />
                        {patientQuery && (
                            <button 
                                type="button" 
                                onClick={() => setPatientQuery('')}
                                className="absolute end-3 top-1/2 -translate-y-1/2 rounded-none text-slate-400 transition hover:text-slate-700"
                            >
                                <X size={14} />
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

                    <textarea 
                        value={waitlistForm.notes} 
                        onChange={(e) => setWaitlistForm(prev => ({ ...prev, notes: e.target.value }))} 
                        rows={2} 
                        placeholder={t('appointments:waitlist.notes')} 
                        className={`${baseInputClass} border-slate-200 bg-white py-2 text-[11px] transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/10 dark:border-slate-700 dark:bg-slate-950`}
                    />

                    <button 
                        type="button" 
                        onClick={handleAddWaitlist} 
                        disabled={isAdding}
                        className="inline-flex w-full items-center justify-center gap-1.5 rounded-none bg-teal-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-teal-700 active:scale-[0.98] disabled:opacity-50"
                    >
                        <UserPlus size={14} />
                        {isAdding ? t('appointments:waitlist.adding') : t('appointments:waitlist.add')}
                    </button>
                </div>
            )}

            <div className="px-2 py-2 sm:px-3">
                {isWaitlistLoading ? (
                    <div className="py-10 text-center text-xs font-bold text-slate-400">
                        {t('common:status.loading')}
                    </div>
                ) : waitingList.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-12 text-center">
                        <div className="mb-3 rounded-none bg-slate-100 p-3 ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">
                            <UserPlus size={20} className="text-slate-400 dark:text-slate-500" />
                        </div>
                        <p className="text-sm font-black text-slate-800 dark:text-slate-200">
                            {t('reception:waitlist.noEntries')}
                        </p>
                        <p className="mt-1 text-[11px] font-semibold text-slate-500">
                            {t('reception:waitlist.emptySubtitle', { defaultValue: 'No patients are waiting.' })}
                        </p>
                    </div>
                ) : (
                    <div className="max-h-[500px] divide-y divide-slate-100 overflow-y-auto overflow-x-hidden pe-1 dark:divide-slate-800">
                        {waitingList.map((entry, qIdx) => (
                            <WaitlistEntry 
                                key={entry.waitlist_id} 
                                entry={entry} 
                                index={qIdx} 
                                onUpdateStatus={handleUpdateStatus} 
                                selectedDate={selectedDate} 
                                t={t} 
                            />
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
};

const WaitlistEntry = ({ entry, index, onUpdateStatus, selectedDate, t }) => {
    return (
        <div className="group min-w-0 rounded-none p-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-none bg-slate-100 text-[10px] font-black text-slate-500 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700">
                            {(index + 1)}
                        </span>
                        <h3 className="min-w-0 truncate text-sm font-black text-slate-900 dark:text-white">
                            {entry.patient_name || t('fallback.unnamed', { defaultValue: 'Unnamed Patient' })}
                        </h3>
                        {entry.priority !== 'Routine' && (
                            <span 
                                className={`inline-block h-2 w-2 rounded-none shadow-sm ${
                                    entry.priority === 'Emergency' ? 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.6)]' : 'bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.6)]'
                                }`} 
                                title={entry.priority} 
                            />
                        )}
                    </div>
                    <p className="mt-1.5 font-mono text-[10px] font-bold text-slate-400">
                        {entry.mrn}
                    </p>
                    <p className="mt-1 truncate text-xs font-bold text-slate-700 dark:text-slate-300">
                        {entry.exam_type_name || t('appointments:waitlist.anyExam')}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[10px] font-semibold text-slate-500">
                        <span className="flex items-center gap-1 truncate">
                            <Clock size={11} /> 
                            {entry.machine_name || t('appointments:waitlist.anyRoomShort')}
                        </span>
                    </div>
                    {entry.notes && (
                        <p className="mt-2 text-[10px] italic text-slate-500 line-clamp-1 transition-all duration-300 group-hover:line-clamp-none">
                            <span className="font-bold text-slate-400">Notes:</span> {entry.notes}
                        </p>
                    )}
                </div>
            </div>

            <div className="mt-3 flex flex-col gap-2 border-t border-slate-100 pt-3 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-end lg:opacity-0 lg:transition-opacity lg:duration-150 lg:group-hover:opacity-100 lg:focus-within:opacity-100">
                <Link 
                    to={`/appointments/new?patientId=${entry.patient_id}&date=${selectedDate}&modalityId=${entry.modality_id || ''}&examTypeId=${entry.exam_type_id || ''}&priority=${entry.priority || 'Routine'}&notes=${encodeURIComponent(entry.notes || '')}`}
                    className="inline-flex min-h-8 flex-1 items-center justify-center rounded-none bg-teal-600 px-2.5 py-1.5 text-[10px] font-black text-white transition hover:bg-teal-700 active:scale-95"
                >
                    {t('appointments:waitlist.bookNow')}
                </Link>
                <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center">
                    <button
                        type="button"
                        onClick={() => onUpdateStatus(entry, 'Contacted')}
                        className="inline-flex h-8 items-center justify-center rounded-none border border-slate-200 bg-white px-2 text-slate-500 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-600 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-emerald-500/30 dark:hover:bg-emerald-500/10 dark:hover:text-emerald-400 sm:w-8 sm:px-0"
                        title={t('appointments:waitlist.contacted')}
                    >
                        <CheckCircle2 size={13} />
                    </button>
                    <button
                        type="button"
                        onClick={() => onUpdateStatus(entry, 'Cancelled')}
                        className="inline-flex h-8 items-center justify-center rounded-none border border-slate-200 bg-white px-2 text-slate-500 transition hover:border-rose-300 hover:bg-rose-50 hover:text-rose-600 active:scale-95 dark:border-slate-700 dark:bg-slate-800 dark:hover:border-rose-500/30 dark:hover:bg-rose-500/10 dark:hover:text-rose-400 sm:w-8 sm:px-0"
                        title={t('appointments:waitlist.cancel')}
                    >
                        <X size={13} />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ModernWaitlistPanel;
