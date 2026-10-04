import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
    Activity,
    AlertCircle,
    Calendar,
    CheckCircle2,
    Clock,
    Filter,
    MessageSquare,
    Phone,
    Plus,
    RefreshCw,
    Search,
    Send,
    Sparkles,
    Stethoscope,
    Users
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
    useGetDueRecallsQuery,
    useCreateRecallTaskMutation,
    useGetCenterSettingsQuery
} from '../../store/api';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { getCenterDisplayName, normalizeCenterSettings } from '../../utils/centerSettings';

const ClinicalRecallsTab = () => {
    const { t, i18n } = useTranslation(['workspace', 'common']);
    const isArabic = i18n.language?.startsWith('ar');
    const locale = isArabic ? 'ar-EG' : 'en-US';

    const [selectedModality, setSelectedModality] = useState('ALL');
    const [searchQuery, setSearchQuery] = useState('');

    const { data: rawCenterSettings } = useGetCenterSettingsQuery();
    const centerSettings = normalizeCenterSettings(rawCenterSettings || {});
    const centerDisplayName = getCenterDisplayName(centerSettings);

    const {
        data: dueRecalls = [],
        isLoading,
        isFetching,
        refetch
    } = useGetDueRecallsQuery({
        modality: selectedModality === 'ALL' ? undefined : selectedModality
    });

    const [createRecallTask, { isLoading: isCreatingTask }] = useCreateRecallTaskMutation();

    const filteredRecalls = useMemo(() => {
        return dueRecalls.filter(item => {
            if (!searchQuery.trim()) return true;
            const q = searchQuery.toLowerCase();
            return (
                item.mrn?.toLowerCase().includes(q) ||
                item.patient_name?.toLowerCase().includes(q) ||
                item.modality_name?.toLowerCase().includes(q) ||
                item.exam_type_name?.toLowerCase().includes(q) ||
                item.patient_phone?.includes(q)
            );
        });
    }, [dueRecalls, searchQuery]);

    const stats = useMemo(() => {
        const total = dueRecalls.length;
        const mammo = dueRecalls.filter(r => r.modality_name?.toLowerCase().includes('mammo')).length;
        const dexa = dueRecalls.filter(r => r.modality_name?.toLowerCase().includes('dexa') || r.modality_name?.toLowerCase().includes('bone')).length;
        const scheduled = dueRecalls.filter(r => r.existing_task_id).length;
        return { total, mammo, dexa, scheduled };
    }, [dueRecalls]);

    const handleScheduleTask = async (item) => {
        try {
            await createRecallTask({
                patientId: item.patient_id,
                examId: item.exam_id,
                modalityName: item.modality_name || item.exam_type_name,
                notes: `استدعاء سريري ومتابعة وقائية دورية: ${item.recall_protocol || item.modality_name}. آخر فحص كان بتاريخ ${new Date(item.last_exam_date).toLocaleDateString(locale)}.`
            }).unwrap();
            toast.success(isArabic ? 'تمت جدولة مهمة الاستدعاء في CRM بنجاح' : 'Recall task scheduled successfully');
            refetch();
        } catch (error) {
            toast.error(getErrorMessage(error, isArabic ? 'فشل جدولة مهمة الاستدعاء' : 'Failed to schedule recall task'));
        }
    };

    const handleWhatsAppReminder = (item) => {
        if (!item.patient_phone) {
            toast.error(isArabic ? 'رقم هاتف المريض غير متوفر' : 'Patient phone number is missing');
            return;
        }
        const text = isArabic
            ? `مرحباً ${item.patient_name || ''}،\n\nنود تذكيركم من ${centerDisplayName} بموعد الفحص الوقائي الدوري للاطمئنان على صحتكم:\nالفحص: ${item.exam_type_name || item.modality_name}\nالبروتوكول: ${item.recall_protocol}\n\nنرحب بتواصلكم لتحديد الموعد الأنسب لكم، ودمتم بصحة وعافية.`
            : `Hello ${item.patient_name || ''},\n\nThis is a friendly preventive check-up reminder from ${centerDisplayName}.\nExam: ${item.exam_type_name || item.modality_name}\nProtocol: ${item.recall_protocol}\n\nPlease contact us to arrange your appointment at your convenience.`;

        const cleanPhone = item.patient_phone.replace(/\D/g, '');
        const phoneWithCountry = cleanPhone.startsWith('01') ? `20${cleanPhone.slice(1)}` : cleanPhone;
        const url = `https://wa.me/${phoneWithCountry}?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank', 'noopener,noreferrer');
    };

    return (
        <div className="space-y-6">
            {/* KPI Cards */}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-500 dark:text-slate-400">
                            {isArabic ? 'إجمالي المستحقين للاستدعاء' : 'Total Due for Recall'}
                        </span>
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400">
                            <Users size={18} />
                        </span>
                    </div>
                    <div className="mt-3 flex items-baseline gap-2">
                        <span className="text-2xl font-black text-slate-900 dark:text-white">{stats.total}</span>
                        <span className="text-xs font-bold text-teal-600 dark:text-teal-400">
                            {isArabic ? 'مريض مستحق' : 'patients'}
                        </span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-400">
                        {isArabic ? 'حالات تجاوزت فترة البروتوكول دون حجز' : 'Patients overdue per clinical protocol'}
                    </p>
                </div>

                <div className="rounded-2xl border border-pink-200/60 dark:border-pink-900/40 bg-pink-50/20 dark:bg-pink-950/10 p-5 shadow-xs">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-pink-700 dark:text-pink-300">
                            {isArabic ? 'فحوصات الماموجرام الوقائية' : 'Mammography Screening'}
                        </span>
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-pink-100 text-pink-700 dark:bg-pink-900/40 dark:text-pink-300">
                            <Activity size={18} />
                        </span>
                    </div>
                    <div className="mt-3 flex items-baseline gap-2">
                        <span className="text-2xl font-black text-pink-900 dark:text-pink-100">{stats.mammo}</span>
                        <span className="text-xs font-bold text-pink-600 dark:text-pink-400">
                            {isArabic ? 'متابعة دورية' : 'screenings'}
                        </span>
                    </div>
                    <p className="mt-1 text-[11px] text-pink-600/80 dark:text-pink-400/80">
                        {isArabic ? 'بروتوكول 6 أشهر (BI-RADS 3) أو سنوي' : '6-month follow-up or annual'}
                    </p>
                </div>

                <div className="rounded-2xl border border-indigo-200/60 dark:border-indigo-900/40 bg-indigo-50/20 dark:bg-indigo-950/10 p-5 shadow-xs">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">
                            {isArabic ? 'هشاشة العظام (DEXA)' : 'DEXA Bone Screening'}
                        </span>
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                            <Stethoscope size={18} />
                        </span>
                    </div>
                    <div className="mt-3 flex items-baseline gap-2">
                        <span className="text-2xl font-black text-indigo-900 dark:text-indigo-100">{stats.dexa}</span>
                        <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                            {isArabic ? 'فحص دوري' : 'scans'}
                        </span>
                    </div>
                    <p className="mt-1 text-[11px] text-indigo-600/80 dark:text-indigo-400/80">
                        {isArabic ? 'متابعة سنوية لكثافة العظام' : 'Annual bone density follow-up'}
                    </p>
                </div>

                <div className="rounded-2xl border border-emerald-200/60 dark:border-emerald-900/40 bg-emerald-50/20 dark:bg-emerald-950/10 p-5 shadow-xs">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-700 dark:text-emerald-300">
                            {isArabic ? 'مهام استدعاء مجدولة' : 'Scheduled Tasks'}
                        </span>
                        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                            <CheckCircle2 size={18} />
                        </span>
                    </div>
                    <div className="mt-3 flex items-baseline gap-2">
                        <span className="text-2xl font-black text-emerald-900 dark:text-emerald-100">{stats.scheduled}</span>
                        <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                            {isArabic ? 'قيد المتابعة' : 'in CRM'}
                        </span>
                    </div>
                    <p className="mt-1 text-[11px] text-emerald-600/80 dark:text-emerald-400/80">
                        {isArabic ? 'مهام تم تعيينها لفريق الاستقبال' : 'Assigned to reception team'}
                    </p>
                </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="flex flex-col gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 inline-flex items-center gap-1.5">
                        <Filter size={14} />
                        {isArabic ? 'تصفية الفحوصات:' : 'Filter Modality:'}
                    </span>
                    {[
                        { key: 'ALL', label: isArabic ? 'الكل' : 'All' },
                        { key: 'mammo', label: isArabic ? 'ماموجرام' : 'Mammography' },
                        { key: 'dexa', label: isArabic ? 'هشاشة عظام DEXA' : 'DEXA' },
                        { key: 'ct', label: isArabic ? 'مقطعية CT' : 'CT' },
                        { key: 'mri', label: isArabic ? 'رنين مغناطيسي MRI' : 'MRI' }
                    ].map(mod => (
                        <button
                            key={mod.key}
                            type="button"
                            onClick={() => setSelectedModality(mod.key)}
                            className={`h-8 rounded-xl px-3 text-xs font-bold transition-all ${
                                selectedModality === mod.key
                                    ? 'bg-teal-600 text-white shadow-xs'
                                    : 'border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                        >
                            {mod.label}
                        </button>
                    ))}
                </div>

                <div className="flex items-center gap-2">
                    <div className="relative min-w-[240px]">
                        <Search size={14} className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder={isArabic ? 'بحث بالاسم، الرقم الطبي، الهاتف...' : 'Search by name, MRN, phone...'}
                            className="h-9 w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60 ps-8 pe-3 text-xs font-medium text-slate-800 dark:text-slate-200 focus:border-teal-500 focus:outline-hidden"
                        />
                    </div>
                    <button
                        type="button"
                        onClick={() => refetch()}
                        className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition-all"
                    >
                        <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
                    </button>
                </div>
            </div>

            {/* Recalls Table */}
            <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
                <div className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-950/30 px-5 py-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-teal-50 text-teal-600 dark:bg-teal-950/40 dark:text-teal-400">
                                <Clock size={16} />
                            </span>
                            <div>
                                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                                    {isArabic ? 'قائمة المرضى المستحقين للمتابعة والاستدعاء' : 'Clinical Recall Due List'}
                                </h3>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                    {isArabic ? 'فحوصات وقائية ودورية تتطلب استدعاء المريض وفق البرتوكولات الطبية' : 'Proactive clinical recall candidates based on diagnostic protocols'}
                                </p>
                            </div>
                        </div>
                        <span className="rounded-full border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1 text-xs font-bold text-slate-600 dark:text-slate-300">
                            {filteredRecalls.length} {isArabic ? 'مريض' : 'records'}
                        </span>
                    </div>
                </div>

                {isLoading ? (
                    <div className="p-12 text-center text-slate-400">
                        <RefreshCw size={24} className="mx-auto mb-3 animate-spin text-teal-600" />
                        <p className="text-xs font-bold">{isArabic ? 'جاري فحص بروتوكولات الاستدعاء السريري...' : 'Loading recall candidates...'}</p>
                    </div>
                ) : filteredRecalls.length === 0 ? (
                    <div className="p-12 text-center text-slate-400">
                        <CheckCircle2 size={36} className="mx-auto mb-3 text-teal-500 opacity-60" />
                        <p className="text-sm font-black text-slate-700 dark:text-slate-300">
                            {isArabic ? 'لا توجد حالات متأخرة مستحقة للاستدعاء حالياً' : 'No patients currently due for recall'}
                        </p>
                        <p className="text-xs mt-1 text-slate-400">
                            {isArabic ? 'جميع الفحوصات الدورية الوقائية ومتابعات المرضى محدثة ومجدولة.' : 'All clinical preventive screenings and follow-ups are up to date.'}
                        </p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="min-w-full text-start text-xs">
                            <thead className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40 text-[10px] font-black uppercase tracking-wider text-slate-400">
                                <tr>
                                    <th className="px-5 py-3.5 text-start">{isArabic ? 'المريض' : 'Patient'}</th>
                                    <th className="px-5 py-3.5 text-start">{isArabic ? 'الفحص السابق' : 'Prior Examination'}</th>
                                    <th className="px-5 py-3.5 text-start">{isArabic ? 'تاريخ الفحص' : 'Last Exam Date'}</th>
                                    <th className="px-5 py-3.5 text-start">{isArabic ? 'بروتوكول الاستدعاء' : 'Recall Protocol'}</th>
                                    <th className="px-5 py-3.5 text-start">{isArabic ? 'المدة المنقضية' : 'Overdue By'}</th>
                                    <th className="px-5 py-3.5 text-start">{isArabic ? 'حالة المتابعة' : 'Status'}</th>
                                    <th className="px-5 py-3.5 text-center">{isArabic ? 'إجراءات سريعة' : 'Actions'}</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {filteredRecalls.map((item) => {
                                    const overdueDays = Math.max(0, item.days_since_exam - (item.threshold_days || 180));
                                    const isScheduled = !!item.existing_task_id;

                                    return (
                                        <tr key={item.exam_id || item.patient_id} className="hover:bg-slate-50/60 dark:hover:bg-slate-800/40 transition-colors">
                                            <td className="px-5 py-3.5">
                                                <div className="font-bold text-slate-900 dark:text-white">
                                                    {item.patient_name}
                                                </div>
                                                <div className="font-mono text-[10px] text-teal-600 dark:text-teal-400">
                                                    {item.mrn} • {item.patient_phone || '—'}
                                                </div>
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <div className="font-semibold text-slate-800 dark:text-slate-200">
                                                    {item.exam_type_name || item.modality_name}
                                                </div>
                                                <div className="text-[10px] text-slate-400">
                                                    {item.modality_name}
                                                </div>
                                            </td>
                                            <td className="px-5 py-3.5 whitespace-nowrap text-slate-600 dark:text-slate-300">
                                                {new Date(item.last_exam_date).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })}
                                            </td>
                                            <td className="px-5 py-3.5">
                                                <span className="inline-flex items-center gap-1 rounded-lg border border-teal-200 dark:border-teal-900/60 bg-teal-50/60 dark:bg-teal-950/20 px-2 py-0.5 text-[10px] font-bold text-teal-700 dark:text-teal-300">
                                                    <Stethoscope size={11} />
                                                    {item.recall_protocol}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3.5 whitespace-nowrap">
                                                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-black ${
                                                    overdueDays > 60
                                                        ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900/40'
                                                        : overdueDays > 0
                                                            ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-900/40'
                                                            : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                                                }`}>
                                                    <AlertCircle size={11} />
                                                    {overdueDays > 0
                                                        ? (isArabic ? `متأخر ${overdueDays} يوم` : `${overdueDays}d overdue`)
                                                        : (isArabic ? 'مستحق الآن' : 'Due now')}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3.5 whitespace-nowrap">
                                                {isScheduled ? (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900/40">
                                                        <CheckCircle2 size={11} />
                                                        {isArabic ? 'مجدول في CRM' : 'Task Scheduled'}
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
                                                        {isArabic ? 'بانتظار الجدولة' : 'Pending Task'}
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-5 py-3.5 whitespace-nowrap text-center">
                                                <div className="flex items-center justify-center gap-1.5">
                                                    {!isScheduled && (
                                                        <button
                                                            type="button"
                                                            disabled={isCreatingTask}
                                                            onClick={() => handleScheduleTask(item)}
                                                            className="inline-flex h-7 items-center gap-1 rounded-lg bg-teal-600 px-2.5 text-[10px] font-bold text-white hover:bg-teal-700 active:scale-95 transition-all shadow-xs"
                                                            title={isArabic ? 'جدولة مهمة متابعة سريرية في CRM' : 'Schedule recall task in CRM'}
                                                        >
                                                            <Plus size={12} />
                                                            {isArabic ? 'جدولة مهمة' : 'Schedule'}
                                                        </button>
                                                    )}
                                                    <button
                                                        type="button"
                                                        onClick={() => handleWhatsAppReminder(item)}
                                                        className="inline-flex h-7 items-center gap-1 rounded-lg border border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/50 dark:bg-emerald-950/30 px-2.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 active:scale-95 transition-all"
                                                        title={isArabic ? 'إرسال تذكير استدعاء عبر واتساب' : 'Send WhatsApp recall reminder'}
                                                    >
                                                        <MessageSquare size={12} />
                                                        {isArabic ? 'واتساب' : 'WhatsApp'}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

export default ClinicalRecallsTab;
