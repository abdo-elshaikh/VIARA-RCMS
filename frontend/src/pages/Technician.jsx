import React, { useMemo } from 'react';
import toast from 'react-hot-toast';
import { Activity, AlertTriangle, CheckCircle2, Loader2, Play, ScanLine, Timer } from 'lucide-react';
import { useGetWorklistQuery, useUpdateReportMutation } from '../store/api';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';

const normalizeStatus = (status = '') => String(status).toLowerCase().replace(/\s+/g, '_');

const Technician = () => {
    const { data: examsResponse, isLoading, refetch, isFetching } = useGetWorklistQuery();
    const [updateStatus, { isLoading: isUpdating }] = useUpdateReportMutation();

    const exams = useMemo(() => {
        const rows = Array.isArray(examsResponse) ? examsResponse : examsResponse?.data || [];
        return rows.filter((exam) => ['checked_in', 'scanning'].includes(normalizeStatus(exam.status)));
    }, [examsResponse]);

    const scanning = exams.filter((exam) => normalizeStatus(exam.status) === 'scanning').length;
    const checkedIn = exams.filter((exam) => normalizeStatus(exam.status) === 'checked_in').length;

    const handleAction = async (exam, newStatus) => {
        try {
            await updateStatus({
                examId: exam.exam_id,
                content: exam.report_content || '',
                status: newStatus
            }).unwrap();
            toast.success(newStatus === 'Scanning' ? 'Scan started.' : 'Scan completed.');
            refetch();
        } catch (error) {
            toast.error(error?.data?.message || 'Action failed.');
        }
    };

    return (
        <div className="app-page pb-10">
            <PageHeader
                icon={ScanLine}
                eyebrow="Modality operations"
                title="Technician worklist"
                description="Track checked-in patients, start scans, and hand completed studies to reporting."
                meta={(
                    <>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-100 bg-teal-50 px-3 py-1 text-xs font-bold text-teal-700 dark:border-teal-900/60 dark:bg-teal-950/30 dark:text-teal-300"><Timer size={13} /> {checkedIn} checked-in</span>
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-xs font-bold text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-300"><Activity size={13} /> {scanning} scanning</span>
                        {isFetching && <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"><Loader2 size={13} className="animate-spin" /> Syncing</span>}
                    </>
                )}
            />

            {isLoading ? (
                <section className="flex min-h-72 items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-500 dark:border-slate-800 dark:bg-[#0b1426]">
                    <Loader2 size={20} className="me-2 animate-spin text-cyan-600" /> Loading technician queue...
                </section>
            ) : exams.length === 0 ? (
                <section className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0b1426]">
                    <EmptyState icon={CheckCircle2} title="No patients waiting for scans" description="Checked-in and scanning studies will appear here." />
                </section>
            ) : (
                <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {exams.map((exam) => {
                        const status = normalizeStatus(exam.status);
                        const isScanning = status === 'scanning';
                        return (
                            <article key={exam.exam_id} className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-md dark:bg-[#0b1426] ${isScanning ? 'border-cyan-200 dark:border-cyan-900/50' : 'border-amber-200 dark:border-amber-900/50'}`}>
                                <div className={`h-1.5 ${isScanning ? 'bg-cyan-600' : 'bg-amber-500'}`} />
                                <div className="p-5">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="text-[10px] font-black uppercase tracking-[.16em] text-slate-400">{exam.modality_type || exam.modality_name || 'Modality'}</p>
                                            <h2 className="mt-1 truncate text-lg font-black text-slate-900 dark:text-white">{exam.patient_name || 'Patient'}</h2>
                                            <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">Exam ID: {String(exam.exam_id).slice(0, 8)}...</p>
                                        </div>
                                        <span className={`rounded-full px-2.5 py-1 text-[10px] font-black uppercase ring-1 ${isScanning ? 'bg-cyan-50 text-cyan-700 ring-cyan-100 dark:bg-cyan-950/30 dark:text-cyan-300 dark:ring-cyan-900/50' : 'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900/50'}`}>{exam.status}</span>
                                    </div>

                                    <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300">
                                        <p className="flex items-start gap-2"><AlertTriangle size={15} className="mt-0.5 shrink-0 text-slate-400" /><span><strong>Notes:</strong> {exam.notes || 'No protocol notes.'}</span></p>
                                    </div>

                                    <button
                                        type="button"
                                        onClick={() => handleAction(exam, isScanning ? 'Reporting' : 'Scanning')}
                                        disabled={isUpdating}
                                        className={`mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-black text-white shadow-lg transition disabled:cursor-not-allowed disabled:opacity-50 ${isScanning ? 'bg-emerald-600 shadow-emerald-900/20 hover:bg-emerald-700' : 'bg-cyan-700 shadow-cyan-900/20 hover:bg-cyan-800'}`}
                                    >
                                        {isScanning ? <CheckCircle2 size={18} /> : <Play size={18} />}
                                        {isScanning ? 'Complete scan' : 'Start scan'}
                                    </button>
                                </div>
                            </article>
                        );
                    })}
                </section>
            )}
        </div>
    );
};

export default Technician;
