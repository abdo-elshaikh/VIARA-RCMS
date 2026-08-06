import React, { useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { ArrowRight, CheckCircle2, ClipboardPenLine, FileText, Loader2, RefreshCw, Save, Search, Stethoscope, UserRound } from 'lucide-react';
import { useGetWorklistQuery, useUpdateReportMutation } from '../store/api';
import PageHeader from '../components/ui/PageHeader';
import EmptyState from '../components/ui/EmptyState';

const Doctor = () => {
    const { data: worklist, isLoading, refetch, isFetching } = useGetWorklistQuery();
    const [updateReport, { isLoading: isSaving }] = useUpdateReportMutation();
    const [selectedExam, setSelectedExam] = useState(null);
    const [reportContent, setReportContent] = useState('');
    const [queueSearch, setQueueSearch] = useState('');

    const exams = useMemo(() => {
        const rows = Array.isArray(worklist) ? worklist : worklist?.data || [];
        return rows.filter(Boolean);
    }, [worklist]);

    const filteredExams = useMemo(() => {
        const query = queueSearch.trim().toLowerCase();
        if (!query) return exams;
        return exams.filter((exam) => [
            exam.patient_name,
            exam.mrn,
            exam.exam_type_name,
            exam.modality_name,
            exam.accession_number,
            exam.status
        ].filter(Boolean).some((value) => String(value).toLowerCase().includes(query)));
    }, [exams, queueSearch]);

    const handleSelect = (exam) => {
        setSelectedExam(exam);
        setReportContent(exam.report_content || '');
    };

    const handleSave = async (finalize) => {
        if (!selectedExam) return;
        try {
            await updateReport({
                examId: selectedExam.exam_id,
                reportContent,
                status: finalize ? 'Finalized' : 'Reporting'
            }).unwrap();
            toast.success(finalize ? 'Report finalized and signed.' : 'Draft report saved.');
            setSelectedExam(null);
            setReportContent('');
            refetch();
        } catch (error) {
            toast.error(error?.data?.message || 'Report could not be saved.');
        }
    };

    return (
        <div className="app-page pb-10">
            <PageHeader
                icon={Stethoscope}
                eyebrow="Reporting workspace"
                title="Doctor worklist"
                description="Review assigned studies, draft structured findings, and finalize reports from one focused workspace."
                meta={(
                    <>
                        <span className="rounded-full border border-teal-100 bg-teal-50 px-3 py-1 text-xs font-bold text-teal-700 dark:border-teal-900/60 dark:bg-teal-950/30 dark:text-teal-300">{exams.length} pending exams</span>
                        {isFetching && <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"><Loader2 size={13} className="animate-spin" /> Syncing</span>}
                    </>
                )}
            />

            <main className="grid min-h-[620px] gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
                <aside className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-[#0b1426]">
                    <div className="border-b border-slate-100 px-3 py-2.5 dark:border-slate-800">
                        <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0">
                                <h2 className="truncate text-sm font-black text-slate-900 dark:text-white">My reporting queue</h2>
                                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">{filteredExams.length} of {exams.length} studies</p>
                            </div>
                            <button
                                type="button"
                                onClick={refetch}
                                disabled={isFetching}
                                className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-600 transition hover:bg-slate-50 disabled:opacity-60 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                                aria-label="Refresh reporting queue"
                                title="Refresh"
                            >
                                <RefreshCw size={15} className={isFetching ? 'animate-spin' : ''} />
                            </button>
                        </div>
                        <label className="mt-2 flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-slate-500 focus-within:border-cyan-500 focus-within:bg-white focus-within:ring-2 focus-within:ring-cyan-500/10 dark:border-slate-800 dark:bg-slate-950/40 dark:focus-within:border-cyan-500 dark:focus-within:bg-slate-950">
                            <Search size={14} />
                            <input
                                value={queueSearch}
                                onChange={(event) => setQueueSearch(event.target.value)}
                                placeholder="Search"
                                className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-slate-900 outline-none placeholder:text-slate-400 dark:text-white"
                            />
                        </label>
                    </div>
                    <div className="max-h-[calc(100vh-290px)] overflow-y-auto">
                        {isLoading ? (
                            <div className="flex min-h-40 items-center justify-center text-sm font-semibold text-slate-500"><Loader2 className="me-2 animate-spin" size={18} /> Loading...</div>
                        ) : filteredExams.length === 0 ? (
                            <EmptyState icon={CheckCircle2} title={exams.length ? 'No matching studies' : 'Queue is clear'} description={exams.length ? 'Try another patient, MRN, or exam.' : 'No pending reports.'} />
                        ) : (
                            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                                {filteredExams.map((exam) => {
                                    const active = selectedExam?.exam_id === exam.exam_id;
                                    return (
                                    <li key={exam.exam_id}>
                                        <button
                                            type="button"
                                            onClick={() => handleSelect(exam)}
                                            className={`group w-full px-3 py-3 text-start transition hover:bg-slate-50 dark:hover:bg-slate-900/50 ${active ? 'bg-cyan-50/80 dark:bg-cyan-950/20' : ''}`}
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0">
                                                    <p className="truncate text-sm font-black text-slate-900 dark:text-white">{exam.patient_name || exam.mrn || 'Patient'}</p>
                                                    <p className="mt-0.5 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{exam.exam_type_name || exam.modality_name || exam.modality_type || 'Study'}</p>
                                                </div>
                                                <ArrowRight size={16} className={`mt-0.5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-cyan-600 dark:text-slate-600 ${active ? 'text-cyan-600 dark:text-cyan-300' : ''}`} />
                                            </div>
                                            <div className="mt-2 flex items-center justify-between gap-2 text-[11px] font-bold">
                                                <span className="truncate text-slate-400">MRN {exam.mrn || '-'}</span>
                                                <span className={`shrink-0 rounded-full px-2 py-0.5 ${active ? 'bg-cyan-600 text-white' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'}`}>{exam.status || 'Pending'}</span>
                                            </div>
                                        </button>
                                    </li>
                                    );
                                })}
                            </ul>
                        )}
                    </div>
                </aside>

                <section className="flex min-w-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-[#0b1426]">
                    {selectedExam ? (
                        <>
                            <div className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/70 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/40 sm:flex-row sm:items-center sm:justify-between">
                                <div className="min-w-0">
                                    <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[.16em] text-cyan-700 dark:text-cyan-300"><ClipboardPenLine size={13} /> Active report</div>
                                    <h2 className="mt-1 truncate text-lg font-black text-slate-900 dark:text-white">{selectedExam.patient_name || selectedExam.mrn}</h2>
                                    <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">{selectedExam.modality_name || selectedExam.exam_type_name} · MRN {selectedExam.mrn || '-'}</p>
                                </div>
                                <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300"><UserRound size={13} /> {selectedExam.gender || 'Unknown'}</span>
                            </div>
                            <div className="flex flex-1 flex-col p-5">
                                <label className="mb-2 text-xs font-black uppercase tracking-[.14em] text-slate-500 dark:text-slate-400" htmlFor="doctor-report-content">Findings and impression</label>
                                <textarea
                                    id="doctor-report-content"
                                    className="min-h-[360px] flex-1 resize-none rounded-2xl border border-slate-200 bg-slate-50/60 p-4 font-mono text-sm leading-6 text-slate-900 outline-none transition focus:border-cyan-500 focus:bg-white focus:ring-4 focus:ring-cyan-500/10 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-100 dark:focus:bg-slate-950"
                                    value={reportContent}
                                    onChange={(event) => setReportContent(event.target.value)}
                                    placeholder="Type medical report here..."
                                />
                            </div>
                            <div className="flex flex-col gap-2 border-t border-slate-100 bg-slate-50/70 px-5 py-4 dark:border-slate-800 dark:bg-slate-900/40 sm:flex-row sm:justify-end">
                                <button type="button" onClick={() => handleSave(false)} disabled={isSaving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"><Save size={16} /> Save draft</button>
                                <button type="button" onClick={() => handleSave(true)} disabled={isSaving} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-cyan-700 px-5 text-sm font-black text-white shadow-lg shadow-cyan-900/20 transition hover:bg-cyan-800 disabled:opacity-50"><FileText size={16} /> Finalize and sign</button>
                            </div>
                        </>
                    ) : (
                        <EmptyState icon={ClipboardPenLine} title="Select a study" description="Choose an exam from the queue to begin reporting." />
                    )}
                </section>
            </main>
        </div>
    );
};

export default Doctor;
