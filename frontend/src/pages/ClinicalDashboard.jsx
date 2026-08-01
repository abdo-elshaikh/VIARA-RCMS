import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    AlertTriangle,
    CheckCircle2,
    Clock3,
    Edit3,
    FileCheck2,
    FileText,
    RefreshCw,
    Save,
    Search,
    Stethoscope
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useGetQueueQuery, useUpdateReportMutation } from '../store/api';
import Modal from '../components/ui/Modal';
import { EmptyState, MetricCard, PageHeader, PagePanel, Skeleton } from '../components/ui';
import { formatDuration } from '../utils/dateFormat';
import { getErrorMessage } from '../utils/getErrorMessage';

const ClinicalDashboard = () => {
    const { t, i18n } = useTranslation('dashboard');
    const locale = i18n.language === 'ar' ? 'ar-EG' : 'en-US';
    const { data: queueResponse, isLoading, isError, refetch, isFetching } = useGetQueueQuery({ station: 'Radiologist', limit: 100 });
    const [updateReport, { isLoading: isUpdating }] = useUpdateReportMutation();
    const [selectedExam, setSelectedExam] = useState(null);
    const [reportContent, setReportContent] = useState('');
    const [isFinalize, setIsFinalize] = useState(false);
    const [search, setSearch] = useState('');
    const worklist = useMemo(() => queueResponse?.data || [], [queueResponse?.data]);

    const filteredWorklist = useMemo(() => {
        const query = search.trim().toLowerCase();
        if (!query) return worklist;
        return worklist.filter(exam => [
            exam.mrn,
            exam.patient_name,
            exam.exam_type_name,
            exam.modality_name,
            exam.body_part,
            exam.clinical_indication,
            exam.priority,
            exam.queue_stage
        ].filter(Boolean).join(' ').toLowerCase().includes(query));
    }, [search, worklist]);

    const summary = useMemo(() => {
        const overdue = worklist.filter(exam => exam.is_overdue).length;
        const urgent = worklist.filter(exam => ['Emergency', 'Urgent'].includes(exam.priority)).length;
        const reporting = worklist.filter(exam => exam.queue_stage === 'Reporting').length;
        const avgWait = worklist.length
            ? worklist.reduce((total, exam) => total + Number(exam.waiting_minutes || 0), 0) / worklist.length
            : 0;
        return { total: worklist.length, overdue, urgent, reporting, avgWait };
    }, [worklist]);

    const handleOpenReport = (exam) => {
        setSelectedExam(exam);
        setReportContent(exam.report_content || '');
        setIsFinalize(false);
    };

    const handleSubmit = async (event) => {
        event.preventDefault();
        try {
            await updateReport({
                examId: selectedExam.exam_id,
                reportContent,
                status: isFinalize ? 'Finalized' : 'Reporting'
            }).unwrap();

            toast.success(isFinalize ? t('clinicalWorklist.messages.finalized') : t('clinicalWorklist.messages.saved'));
            setSelectedExam(null);
            refetch();
        } catch (error) {
            toast.error(getErrorMessage(error, t('clinicalWorklist.messages.failed')));
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader
                icon={Stethoscope}
                eyebrowIcon={FileText}
                eyebrow={t('clinicalWorklist.eyebrow')}
                title={t('clinicalWorklist.title')}
                description={t('clinicalWorklist.description')}
                actions={
                    <button type="button" onClick={refetch} disabled={isFetching} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-teal-800 disabled:cursor-wait disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-teal-100">
                        <RefreshCw size={17} className={isFetching ? 'animate-spin' : ''} />{isFetching ? t('common.refreshing') : t('common.refresh')}
                    </button>
                }
            />

            <section className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label={t('clinicalWorklist.metricsLabel')}>
                <MetricCard icon={FileText} tone="cyan" label={t('clinicalWorklist.metrics.total')} value={formatNumber(summary.total, locale)} detail={t('clinicalWorklist.metrics.totalHelp')} />
                <MetricCard icon={Edit3} tone="blue" label={t('clinicalWorklist.metrics.reporting')} value={formatNumber(summary.reporting, locale)} detail={t('clinicalWorklist.metrics.reportingHelp')} />
                <MetricCard icon={AlertTriangle} tone={summary.overdue ? 'rose' : 'emerald'} label={t('clinicalWorklist.metrics.overdue')} value={formatNumber(summary.overdue, locale)} detail={t('clinicalWorklist.metrics.overdueHelp')} />
                <MetricCard icon={Clock3} tone="amber" label={t('clinicalWorklist.metrics.averageWait')} value={formatDuration(summary.avgWait, locale)} detail={t('clinicalWorklist.metrics.averageWaitHelp')} />
            </section>

            <PagePanel
                title={t('clinicalWorklist.queue.title')}
                description={t('clinicalWorklist.queue.description')}
                icon={FileCheck2}
                action={<span className="rounded-full bg-cyan-50 px-3 py-1 text-xs font-bold text-cyan-800 dark:bg-cyan-900/20 dark:text-cyan-400">{t('clinicalWorklist.queue.results', { count: filteredWorklist.length })}</span>}
            >
                <label className="relative mb-4 block">
                    <span className="sr-only">{t('clinicalWorklist.searchLabel')}</span>
                    <Search className="absolute start-3.5 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
                    <input value={search} onChange={event => setSearch(event.target.value)} placeholder={t('clinicalWorklist.searchPlaceholder')} className="h-11 w-full rounded-xl border border-slate-200 bg-slate-50/60 ps-10 pe-3 text-sm outline-none transition focus:border-cyan-600 focus:bg-white focus:ring-4 focus:ring-cyan-500/10 dark:border-slate-700 dark:bg-slate-900/50 dark:focus:border-cyan-500 dark:focus:bg-[#0b1426]" />
                </label>

                {isLoading ? (
                    <div className="grid gap-4 md:grid-cols-2">{[1, 2, 3, 4].map(item => <Skeleton key={item} variant="card" className="h-36" />)}</div>
                ) : isError ? (
                    <EmptyState icon={AlertTriangle} title={t('clinicalWorklist.states.errorTitle')} description={t('clinicalWorklist.states.errorDescription')} actionLabel={t('common.refresh')} onAction={refetch} />
                ) : filteredWorklist.length === 0 ? (
                    <EmptyState icon={CheckCircle2} title={t('clinicalWorklist.states.emptyTitle')} description={search ? t('clinicalWorklist.states.filteredEmpty') : t('clinicalWorklist.states.emptyDescription')} />
                ) : (
                    <>
                        <div className="divide-y divide-slate-100 dark:divide-slate-800 lg:hidden">
                            {filteredWorklist.map(exam => <ExamCard key={exam.exam_id} exam={exam} t={t} locale={locale} onOpen={() => handleOpenReport(exam)} />)}
                        </div>
                        <div className="hidden overflow-x-auto lg:block">
                            <table className="min-w-[980px] w-full text-start text-sm">
                                <thead className="border-b border-slate-200 bg-slate-50/90 dark:border-slate-800 dark:bg-slate-900/50">
                                    <tr>
                                        <TableHead>{t('clinicalWorklist.table.status')}</TableHead>
                                        <TableHead>{t('clinicalWorklist.table.time')}</TableHead>
                                        <TableHead>{t('clinicalWorklist.table.patient')}</TableHead>
                                        <TableHead>{t('clinicalWorklist.table.exam')}</TableHead>
                                        <TableHead align="end">{t('clinicalWorklist.table.action')}</TableHead>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {filteredWorklist.map(exam => (
                                        <tr key={exam.exam_id} className={`transition ${exam.is_overdue ? 'bg-rose-50/50 dark:bg-rose-950/10' : 'hover:bg-cyan-50/35 dark:hover:bg-cyan-900/20'}`}>
                                            <td className="px-5 py-4"><StatusStack exam={exam} t={t} /></td>
                                            <td className="px-5 py-4"><TimeStack exam={exam} t={t} locale={locale} /></td>
                                            <td className="px-5 py-4"><PatientStack exam={exam} t={t} /></td>
                                            <td className="px-5 py-4"><ExamStack exam={exam} t={t} /></td>
                                            <td className="px-5 py-4 text-end"><OpenButton onClick={() => handleOpenReport(exam)} t={t} /></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </PagePanel>

            <Modal isOpen={Boolean(selectedExam)} onClose={() => setSelectedExam(null)} title={t('clinicalWorklist.modal.title')} width="max-w-3xl">
                {selectedExam && (
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-900/40 sm:grid-cols-2">
                            <Info label={t('clinicalWorklist.modal.patient')} value={selectedExam.patient_name || selectedExam.mrn} />
                            <Info label={t('clinicalWorklist.modal.exam')} value={selectedExam.exam_type_name || selectedExam.modality_name} />
                        </div>

                        <label className="block">
                            <span className="mb-1.5 block text-sm font-bold text-slate-700 dark:text-slate-300">{t('clinicalWorklist.modal.findings')}</span>
                            <textarea
                                value={reportContent}
                                onChange={(event) => setReportContent(event.target.value)}
                                rows={10}
                                className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 font-mono text-sm leading-6 outline-none transition focus:border-cyan-600 focus:ring-4 focus:ring-cyan-500/10 dark:border-slate-700 dark:bg-[#0b1426] dark:text-slate-100 dark:focus:border-cyan-500"
                                placeholder={t('clinicalWorklist.modal.placeholder')}
                                required
                            />
                        </label>

                        <label className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
                            <input type="checkbox" checked={isFinalize} onChange={(event) => setIsFinalize(event.target.checked)} className="mt-1 h-4 w-4 rounded border-amber-300 text-cyan-700 focus:ring-cyan-500" />
                            <span className="text-sm leading-6 text-amber-900 dark:text-amber-200"><strong className="block">{t('clinicalWorklist.modal.finalize')}</strong>{t('clinicalWorklist.modal.finalizeHelp')}</span>
                        </label>

                        <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-4 dark:border-slate-800 sm:flex-row sm:justify-end">
                            <button type="button" onClick={() => setSelectedExam(null)} className="min-h-11 rounded-xl px-4 text-sm font-bold text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800">{t('clinicalWorklist.modal.cancel')}</button>
                            <button type="submit" disabled={isUpdating} className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-cyan-700 px-5 text-sm font-bold text-white transition hover:bg-cyan-800 disabled:cursor-wait disabled:opacity-60">
                                {isFinalize ? <FileCheck2 size={16} /> : <Save size={16} />}
                                {isUpdating ? t('clinicalWorklist.modal.saving') : (isFinalize ? t('clinicalWorklist.modal.sign') : t('clinicalWorklist.modal.save'))}
                            </button>
                        </div>
                    </form>
                )}
            </Modal>
        </div>
    );
};

const TableHead = ({ children, align = 'start' }) => <th className={`px-5 py-3.5 text-xs font-bold uppercase tracking-[.1em] text-slate-500 ${align === 'end' ? 'text-end' : 'text-start'}`}>{children}</th>;
const ExamCard = ({ exam, t, locale, onOpen }) => <article className={`p-4 ${exam.is_overdue ? 'bg-rose-50/60 dark:bg-rose-950/10' : ''}`}><div className="flex items-start justify-between gap-3"><StatusStack exam={exam} t={t} /><OpenButton onClick={onOpen} t={t} compact /></div><div className="mt-4 grid gap-3 sm:grid-cols-2"><PatientStack exam={exam} t={t} /><TimeStack exam={exam} t={t} locale={locale} /><ExamStack exam={exam} t={t} /></div></article>;
const StatusStack = ({ exam, t }) => <div className="space-y-2"><span className="inline-flex rounded-full bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">{exam.queue_stage || t('clinicalWorklist.values.pending')}</span><PriorityBadge priority={exam.priority} t={t} /></div>;
const TimeStack = ({ exam, t, locale }) => <div><p className="text-sm font-bold text-slate-900 dark:text-white">{t('clinicalWorklist.values.wait', { duration: formatDuration(exam.waiting_minutes || 0, locale) })}</p><p className={`mt-1 text-xs font-semibold ${exam.is_overdue ? 'text-rose-600 dark:text-rose-400' : 'text-slate-500'}`}>{exam.is_overdue ? t('clinicalWorklist.values.overdue') : formatDate(exam.created_at, locale)}</p></div>;
const PatientStack = ({ exam, t }) => <div><p className="font-bold text-slate-900 dark:text-white">{exam.patient_name || exam.mrn || t('clinicalWorklist.values.unknownPatient')}</p><p className="mt-1 text-xs text-slate-500">{exam.mrn || t('clinicalWorklist.values.noMrn')} {exam.gender ? `- ${exam.gender}` : ''}</p></div>;
const ExamStack = ({ exam, t }) => <div className="max-w-md"><p className="text-sm font-bold text-slate-800 dark:text-slate-200">{exam.exam_type_name || exam.modality_name || t('clinicalWorklist.values.unknownExam')}</p><p className="mt-1 text-xs text-slate-500">{exam.body_part || exam.modality_type || t('clinicalWorklist.values.noBodyPart')}</p>{exam.clinical_indication && <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{t('clinicalWorklist.values.indication', { value: exam.clinical_indication })}</p>}</div>;
const OpenButton = ({ onClick, t, compact = false }) => <button type="button" onClick={onClick} className={`inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-700 text-sm font-bold text-white transition hover:bg-cyan-800 ${compact ? 'min-h-9 px-3' : 'min-h-10 px-4'}`}><Edit3 size={15} />{t('clinicalWorklist.actions.write')}</button>;
const Info = ({ label, value }) => <div><p className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">{label}</p><p className="mt-1 font-bold text-slate-900 dark:text-white">{value || '-'}</p></div>;

const PriorityBadge = ({ priority = 'Routine', t }) => {
    const tone = {
        Emergency: 'bg-rose-50 text-rose-700 dark:bg-rose-900/20 dark:text-rose-400',
        Urgent: 'bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400',
        Routine: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
    }[priority] || 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
    return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-bold ${tone}`}>{t(`clinicalWorklist.priority.${priority}`, { defaultValue: priority })}</span>;
};

const formatNumber = (value, locale) => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Number(value || 0));
const formatDate = (value, locale) => value ? new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date(value)) : '-';

export default ClinicalDashboard;
