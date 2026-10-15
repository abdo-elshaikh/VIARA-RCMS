import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
    Activity,
    AlertTriangle,
    ArrowDownRight,
    ArrowUpRight,
    BarChart3,
    CalendarDays,
    CheckCircle2,
    Clock3,
    Download,
    Gauge,
    Layers3,
    LineChart as LineChartIcon,
    PieChart as PieChartIcon,
    Printer,
    RefreshCw,
    Sparkles,
    Stethoscope,
    TimerReset,
    TrendingUp,
    WalletCards,
    XCircle,
    Zap,
    UsersRound,
    SunMedium,
    LayoutDashboard,
    Cpu,
    Filter,
    ShieldCheck,
    FileSpreadsheet,
    FileType2,
    FileText,
    ChevronDown,
    Flame
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { downloadAuthenticatedFile } from '../utils/authenticatedFetch';
import { exportAnalyticsReport } from '../utils/analyticsReportExport';
import {
    Area,
    AreaChart,
    Bar,
    BarChart,
    CartesianGrid,
    Cell,
    Line,
    LineChart,
    Pie,
    PieChart,
    ResponsiveContainer,
    Tooltip,
    XAxis,
    YAxis,
    ComposedChart
} from 'recharts';
import {
    useGetPerformanceAnalyticsQuery,
    useGetRevenueAnalyticsQuery,
    useGetVolumeAnalyticsQuery,
    useGetPeakHoursAnalyticsQuery,
    useGetEquipmentUtilizationQuery,
    useGetTopProceduresAnalyticsQuery,
    useGetReferralAnalyticsQuery,
    useGetMachinesQuery
} from '../store/api';
import { formatDuration } from '../utils/dateFormat';
import AccessibleChartData from '../components/ui/AccessibleChartData';
import PageHeader from '../components/ui/PageHeader';

const DAY = 24 * 60 * 60 * 1000;
const CHART_COLORS = ['#0d9488', '#0284c7', '#8b5cf6', '#f59e0b', '#f43f5e', '#64748b', '#10b981'];

const chartTooltipStyle = {
    background: 'rgba(15, 23, 42, 0.95)',
    backdropFilter: 'blur(12px)',
    border: '1px solid rgba(51, 65, 85, 0.6)',
    borderRadius: '16px',
    boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.4)',
    fontSize: '12px',
    fontWeight: '700',
    padding: '10px 14px',
    color: '#f8fafc'
};

const isoDate = (date) => {
    const value = new Date(date);
    if (Number.isNaN(value.getTime())) return '';
    const localDate = new Date(value.getTime() - value.getTimezoneOffset() * 60 * 1000);
    return localDate.toISOString().split('T')[0];
};

const toNumber = (value) => (Number.isFinite(Number(value)) ? Number(value) : 0);
const sumRows = (rows) => rows.reduce((total, row) => total + toNumber(row.value), 0);
const topRow = (rows) => [...rows].sort((a, b) => toNumber(b.value) - toNumber(a.value))[0] || null;
const shareOf = (row, total) => (row && total > 0 ? (toNumber(row.value) / total) * 100 : 0);

const rangeDays = (startDate, endDate) => Math.max(
    1,
    Math.round((new Date(endDate).getTime() - new Date(startDate).getTime()) / DAY) + 1
);

const previousRangeFor = (startDate, endDate) => {
    const days = rangeDays(startDate, endDate);
    const previousEnd = new Date(`${startDate}T12:00:00`);
    previousEnd.setDate(previousEnd.getDate() - 1);
    const previousStart = new Date(previousEnd);
    previousStart.setDate(previousStart.getDate() - days + 1);
    return { startDate: isoDate(previousStart), endDate: isoDate(previousEnd), days };
};

const percentChange = (current, previous) => {
    const now = toNumber(current);
    const before = toNumber(previous);
    if (!before && !now) return 0;
    if (!before) return 100;
    return ((now - before) / Math.abs(before)) * 100;
};

const formatMetric = (value, formatter, suffix = '') => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? `${formatter.format(numeric)}${suffix}` : '-';
};

const trendSentence = (delta, t, formatter, inverse = false) => {
    const value = Math.abs(delta);
    const formatted = formatter.format(value);
    const direction = delta >= 0 ? 'up' : 'down';
    const isGood = inverse ? delta <= 0 : delta >= 0;
    const toneText = isGood
        ? t('analytics.trend.improved', { defaultValue: 'Improved vs previous' })
        : t('analytics.trend.watch', { defaultValue: 'Watch vs previous' });
    return `${direction === 'up' ? '▲' : '▼'} ${formatted}% (${toneText})`;
};

const trendText = (delta, formatter) => {
    const sign = delta > 0 ? '+' : '';
    return `${sign}${formatter.format(delta)}%`;
};

const AnalyticsDashboard = () => {
    const { t, i18n } = useTranslation('admin');
    const isArabic = (i18n.resolvedLanguage || i18n.language || 'en').startsWith('ar');
    const [startDate, setStartDate] = useState(isoDate(new Date(Date.now() - 29 * DAY)));
    const [endDate, setEndDate] = useState(isoDate(new Date()));
    const [volumeGroup, setVolumeGroup] = useState('date');
    const [revenueGroup, setRevenueGroup] = useState('date');
    const [selectedModality, setSelectedModality] = useState('all');
    const [searchParams, setSearchParams] = useSearchParams();
    const validAnalyticsTabs = ['overview', 'clinical', 'equipment', 'peak_hours', 'procedures', 'financial'];
    const requestedAnalyticsTab = searchParams.get('tab');
    const analyticsTab = validAnalyticsTabs.includes(requestedAnalyticsTab) ? requestedAnalyticsTab : (localStorage.getItem('viara_analytics_tab') || 'overview');
    const [exportMenuOpen, setExportMenuOpen] = useState(false);
    const [analyticsFocus, setAnalyticsFocus] = useState(() => localStorage.getItem('viara_analytics_focus') || 'operations');
    const [showSupportingDetails, setShowSupportingDetails] = useState(false);

    const locale = isArabic ? 'ar-EG' : 'en-US';
    const number = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }), [locale]);
    const integer = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }), [locale]);
    const money = useMemo(() => new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'EGP',
        maximumFractionDigits: 0
    }), [locale]);

    const query = useMemo(() => ({
        startDate,
        endDate,
        ...(selectedModality !== 'all' ? { modalityId: selectedModality } : {})
    }), [endDate, selectedModality, startDate]);

    const dateInvalid = Boolean(startDate && endDate && startDate > endDate);
    const previousQuery = useMemo(() => previousRangeFor(startDate, endDate), [endDate, startDate]);

    // Data Queries
    const machines = useGetMachinesQuery();
    const volume = useGetVolumeAnalyticsQuery({ ...query, groupBy: volumeGroup }, { skip: dateInvalid });
    const revenue = useGetRevenueAnalyticsQuery({ ...query, groupBy: revenueGroup }, { skip: dateInvalid });
    const performance = useGetPerformanceAnalyticsQuery(query, { skip: dateInvalid });

    const previousVolume = useGetVolumeAnalyticsQuery({ ...previousQuery, groupBy: 'date' }, { skip: dateInvalid });
    const previousRevenue = useGetRevenueAnalyticsQuery({ ...previousQuery, groupBy: 'date' }, { skip: dateInvalid });
    const previousPerformance = useGetPerformanceAnalyticsQuery(previousQuery, { skip: dateInvalid });

    const modalityVolume = useGetVolumeAnalyticsQuery({ ...query, groupBy: 'modality' }, { skip: dateInvalid });
    const doctorVolume = useGetVolumeAnalyticsQuery({ ...query, groupBy: 'doctor' }, { skip: dateInvalid });
    const payerRevenue = useGetRevenueAnalyticsQuery({ ...query, groupBy: 'payer' }, { skip: dateInvalid });
    const modalityRevenue = useGetRevenueAnalyticsQuery({ ...query, groupBy: 'modality' }, { skip: dateInvalid });
    const roomRevenue = useGetRevenueAnalyticsQuery({ ...query, groupBy: 'room' }, { skip: dateInvalid });
    const receptionRevenue = useGetRevenueAnalyticsQuery({ ...query, groupBy: 'reception' }, { skip: dateInvalid });

    // Enhanced Analytics Queries
    const peakHours = useGetPeakHoursAnalyticsQuery(query, { skip: dateInvalid });
    const equipment = useGetEquipmentUtilizationQuery({ startDate, endDate }, { skip: dateInvalid });
    const topProcedures = useGetTopProceduresAnalyticsQuery({ startDate, endDate, limit: 10 }, { skip: dateInvalid });
    const referrals = useGetReferralAnalyticsQuery({ startDate, endDate }, { skip: dateInvalid });

    const volumeData = useMemo(() => Array.isArray(volume.data) ? volume.data : [], [volume.data]);
    const revenueData = useMemo(() => Array.isArray(revenue.data) ? revenue.data : [], [revenue.data]);
    const modalityRows = useMemo(() => Array.isArray(modalityVolume.data) ? modalityVolume.data : [], [modalityVolume.data]);
    const doctorRows = useMemo(() => Array.isArray(doctorVolume.data) ? doctorVolume.data : [], [doctorVolume.data]);
    const payerRows = useMemo(() => Array.isArray(payerRevenue.data) ? payerRevenue.data : [], [payerRevenue.data]);
    const modalityRevenueRows = useMemo(() => Array.isArray(modalityRevenue.data) ? modalityRevenue.data : [], [modalityRevenue.data]);
    const roomRevenueRows = useMemo(() => Array.isArray(roomRevenue.data) ? roomRevenue.data : [], [roomRevenue.data]);
    const receptionRevenueRows = useMemo(() => Array.isArray(receptionRevenue.data) ? receptionRevenue.data : [], [receptionRevenue.data]);
    const equipmentRows = useMemo(() => Array.isArray(equipment.data) ? equipment.data : [], [equipment.data]);
    const topProceduresRows = useMemo(() => Array.isArray(topProcedures.data) ? topProcedures.data : [], [topProcedures.data]);
    const peakHourlyData = useMemo(() => peakHours.data?.hourlyData || [], [peakHours.data]);

    const modalitiesList = useMemo(() => {
        if (Array.isArray(machines.data) && machines.data.length > 0) {
            return machines.data.map(m => ({ id: m.modality_id || m.id, name: m.name }));
        }
        if (Array.isArray(equipment.data) && equipment.data.length > 0) {
            return equipment.data.map(m => ({ id: m.modality_id, name: m.modality_name }));
        }
        return [];
    }, [machines.data, equipment.data]);

    const summary = useMemo(() => {
        const studies = sumRows(volumeGroup === 'date' ? volumeData : (Array.isArray(modalityVolume.data) ? modalityVolume.data : []));
        const revenueTotal = sumRows(revenueGroup === 'date' ? revenueData : (Array.isArray(payerRevenue.data) ? payerRevenue.data : []));
        const previousStudies = sumRows(Array.isArray(previousVolume.data) ? previousVolume.data : []);
        const previousRevenueTotal = sumRows(Array.isArray(previousRevenue.data) ? previousRevenue.data : []);
        const days = rangeDays(startDate, endDate);
        const cancelled = toNumber(performance.data?.cancelledAppointments);
        const totalAppointments = toNumber(performance.data?.totalAppointments);
        return {
            studies,
            previousStudies,
            revenueTotal,
            previousRevenueTotal,
            days,
            averageDailyStudies: studies / days,
            revenuePerStudy: studies > 0 ? revenueTotal / studies : 0,
            cancellationRate: toNumber(performance.data?.cancellationRatePercentage),
            cancelled,
            totalAppointments,
            serviceCompletion: totalAppointments > 0 ? ((totalAppointments - cancelled) / totalAppointments) * 100 : 0,
            studyTrend: percentChange(studies, previousStudies),
            revenueTrend: percentChange(revenueTotal, previousRevenueTotal),
            waitTrend: percentChange(performance.data?.averageWaitTimeMinutes, previousPerformance.data?.averageWaitTimeMinutes),
            tatTrend: percentChange(performance.data?.averageTurnaroundTimeHours, previousPerformance.data?.averageTurnaroundTimeHours)
        };
    }, [
        endDate, modalityVolume.data, payerRevenue.data, performance.data, previousPerformance.data,
        previousRevenue.data, previousVolume.data, revenueData, revenueGroup, startDate, volumeData, volumeGroup
    ]);

    const matrixRows = useMemo(() => {
        const revenueByLabel = new Map(modalityRevenueRows.map((row) => [row.label, toNumber(row.value)]));
        return modalityRows.map((row) => {
            const studies = toNumber(row.value);
            const revenue = revenueByLabel.get(row.label) || 0;
            return {
                label: row.label,
                studies,
                revenue,
                studyShare: summary.studies > 0 ? (studies / summary.studies) * 100 : 0,
                revenueShare: summary.revenueTotal > 0 ? (revenue / summary.revenueTotal) * 100 : 0,
                yieldPerStudy: studies > 0 ? revenue / studies : 0
            };
        });
    }, [modalityRevenueRows, modalityRows, summary.revenueTotal, summary.studies]);

    const handleExport = async (format) => {
        try {
            toast.loading(t('analytics.exporting', { defaultValue: 'Preparing export report...' }), { id: 'analytics-export' });

            const perf = performance.data || {};
            const refData = referrals.data || {};
            const topDoctorsList = Array.isArray(refData.topDoctors) ? refData.topDoctors : [];
            const bookingSources = Array.isArray(refData.sources) ? refData.sources : [];

            // 1. Compute Executive Strategic Insights
            const insights = [
                {
                    title: isArabic ? 'كفاءة المسار السريري وسرعة التسليم (TAT & SLA)' : 'Clinical Turnaround & SLA Adherence',
                    detail: isArabic
                        ? `حقق المركز متوسط زمن إنجاز قدره ${perf.averageTurnaroundTimeHours || 0} ساعة، مع التزام كامل بنسبة ${perf.statSlaCompliancePct || 100}% لفحوصات الطوارئ و${perf.routineSlaCompliancePct || 100}% للفحوصات الروتينية.`
                        : `Achieved an average turnaround time of ${perf.averageTurnaroundTimeHours || 0} hours with ${perf.statSlaCompliancePct || 100}% STAT SLA compliance and ${perf.routineSlaCompliancePct || 100}% routine compliance.`
                },
                {
                    title: isArabic ? 'استغلال الطاقة الاستيعابية وساعات الذروة' : 'Capacity Utilization & Peak Windows',
                    detail: isArabic
                        ? `تم تسجيل نافذة الذروة القصوى عند الساعة ${peakHours.data?.peakHour || '11:00'} بنسبة إشغال قدرها ${peakHourlyData.find(h => h.hour === peakHours.data?.peakHour)?.capacity || 75}%. يُنصح بإعادة توجيه الحالات الروتينية للفترات المسائية.`
                        : `Peak operating window identified at ${peakHours.data?.peakHour || '11:00'} (${peakHourlyData.find(h => h.hour === peakHours.data?.peakHour)?.capacity || 75}% capacity). Recommended routing routine exams to evening slots.`
                },
                {
                    title: isArabic ? 'الأداء المالي ومعدل العائد لكل فحص' : 'Financial Yield & Unit Economics',
                    detail: isArabic
                        ? `إجمالي الإيراد الصافي المحقق بلغ ${money.format(summary.revenueTotal)} عبر ${number.format(summary.studies)} فحصاً، بمتوسط عائد ${money.format(summary.revenuePerStudy)} لكل دراسة.`
                        : `Total generated net revenue reached ${money.format(summary.revenueTotal)} across ${number.format(summary.studies)} studies (avg yield ${money.format(summary.revenuePerStudy)} / study).`
                },
                {
                    title: isArabic ? 'جودة وسلامة المرضى (Safety Compliance)' : 'Patient Safety & Quality Screening',
                    detail: isArabic
                        ? `نسبة الالتزام بفحص موانع ومحددات الصبغة بلغت ${perf.contrastSafetyCompliancePct || 100}%، مع تسجيل معدل إلغاء بنسبة ${perf.cancellationRatePercentage || 0}%.`
                        : `Contrast allergy and renal safety screening compliance reached ${perf.contrastSafetyCompliancePct || 100}% with a cancellation rate of ${perf.cancellationRatePercentage || 0}%.`
                }
            ];

            const reportData = {
                title: isArabic ? 'تقرير التحليلات وذكاء الأعمال التنفيذي الشامل' : 'Comprehensive Executive Analytics & BI Report',
                subtitle: isArabic
                    ? 'مركز الأشعة التشخيصية — تقرير شامل لكافة مؤشرات الأداء والتشغيل والإنتاجية والجودة'
                    : 'Radiology Center — Comprehensive Operations, Productivity, SLA & Financial Intelligence',
                filename: `analytics-report-${startDate}-to-${endDate}`,
                generatedAt: new Date().toLocaleString(locale),
                isArabic,
                range: { startDate, endDate },
                insights,
                summary: [
                    { label: isArabic ? 'إجمالي الفحوصات المنفذة' : 'Total Examinations', value: number.format(summary.studies) },
                    { label: isArabic ? 'إجمالي الإيراد الصافي' : 'Total Net Revenue', value: money.format(summary.revenueTotal) },
                    { label: isArabic ? 'متوسط زمن الإنجاز الكامل (TAT)' : 'Avg Turnaround Time', value: `${perf.averageTurnaroundTimeHours || 0} ${isArabic ? 'ساعة' : 'hrs'}` },
                    { label: isArabic ? 'الالتزام باتفاقية الطوارئ (STAT SLA)' : 'STAT SLA Compliance', value: `${perf.statSlaCompliancePct || 100}%` },
                    { label: isArabic ? 'الالتزام بالفحوصات الروتينية' : 'Routine SLA Compliance', value: `${perf.routineSlaCompliancePct || 100}%` },
                    { label: isArabic ? 'متوسط زمن الانتظار' : 'Avg Patient Wait Time', value: `${perf.averageWaitTimeMinutes || 0} ${isArabic ? 'دقيقة' : 'min'}` },
                    { label: isArabic ? 'متوسط العائد لكل فحص' : 'Average Yield / Study', value: money.format(summary.revenuePerStudy) },
                    { label: isArabic ? 'نسبة الإلغاء وعدم الحضور' : 'Cancellation / No-Show Rate', value: `${perf.cancellationRatePercentage || 0}%` },
                    { label: isArabic ? 'نسبة فحوصات الصبغة' : 'Contrast Studies Ratio', value: `${perf.contrastRatioPct || 0}%` },
                    { label: isArabic ? 'نسبة الأمان لموانع الصبغة' : 'Contrast Safety Compliance', value: `${perf.contrastSafetyCompliancePct || 100}%` },
                ],
                sections: [
                    {
                        title: isArabic ? '1. تفكيك مراحل زمن الإنجاز والمسار السريري (TAT Waterfall)' : '1. Clinical Turnaround Time (TAT) Waterfall',
                        shortTitle: isArabic ? 'الأداء السريري وTAT' : 'Clinical TAT',
                        columns: [
                            { key: 'stage', header: isArabic ? 'المرحلة السريرية' : 'Clinical Stage' },
                            { key: 'duration', header: isArabic ? 'متوسط الزمن' : 'Avg Duration' },
                            { key: 'benchmark', header: isArabic ? 'المعيار المستهدف' : 'Target SLA' },
                            { key: 'status', header: isArabic ? 'الحالة' : 'Status' },
                        ],
                        rows: [
                            { stage: isArabic ? 'الانتظار حتى الفحص (Check-in -> Scan)' : 'Wait Time (Check-in -> Scan)', duration: `${perf.averageWaitTimeMinutes || 0} ${isArabic ? 'دقيقة' : 'min'}`, benchmark: '< 15 min', status: isArabic ? 'مطابق' : 'Compliant' },
                            { stage: isArabic ? 'مدة تنفيذ الفحص (Scan Execution)' : 'Scan Execution', duration: `${perf.averageScanMinutes || 0} ${isArabic ? 'دقيقة' : 'min'}`, benchmark: '15-25 min', status: isArabic ? 'طبيعي' : 'Normal' },
                            { stage: isArabic ? 'مدة صياغة التقرير (Drafting)' : 'Drafting Duration', duration: `${perf.averageDraftTimeHours || 0} ${isArabic ? 'ساعة' : 'hrs'}`, benchmark: '< 4 hrs', status: isArabic ? 'جيد' : 'Good' },
                            { stage: isArabic ? 'مدة الاعتماد النهائي (Finalizing)' : 'Finalizing Duration', duration: `${perf.averageSignTimeHours || 0} ${isArabic ? 'ساعة' : 'hrs'}`, benchmark: '< 2 hrs', status: isArabic ? 'ممتاز' : 'Excellent' },
                            { stage: isArabic ? 'الزمن الإجمالي الكامل (Full TAT)' : 'Full Turnaround Time', duration: `${perf.averageTurnaroundTimeHours || 0} ${isArabic ? 'ساعة' : 'hrs'}`, benchmark: '< 24 hrs', status: isArabic ? 'مطابق' : 'Compliant' },
                        ]
                    },
                    {
                        title: isArabic ? '2. استخدام وإنتاجية الأجهزة (Equipment Utilization & Yield Matrix)' : '2. Equipment Utilization & Yield Matrix',
                        shortTitle: isArabic ? 'الأجهزة والإنتاجية' : 'Equipment',
                        columns: [
                            { key: 'modality_name', header: isArabic ? 'الجهاز' : 'Modality Name' },
                            { key: 'modality_type', header: isArabic ? 'النوع' : 'Type' },
                            { key: 'study_count', header: isArabic ? 'عدد الفحوصات' : 'Studies' },
                            { key: 'busy_hours', header: isArabic ? 'ساعات التشغيل' : 'Busy Hours' },
                            { key: 'avg_duration_minutes', header: isArabic ? 'متوسط مدة الفحص (دقيقة)' : 'Avg Duration (min)' },
                            { key: 'utilization_pct', header: isArabic ? 'نسبة الاستخدام' : 'Utilization %' },
                            { key: 'total_revenue', header: isArabic ? 'إجمالي الإيراد (ج.م)' : 'Revenue (EGP)' },
                            { key: 'revenue_per_study', header: isArabic ? 'الإيراد لكل فحص (ج.م)' : 'Yield / Study (EGP)' },
                        ],
                        rows: equipmentRows.map(r => ({
                            modality_name: r.modality_name,
                            modality_type: r.modality_type,
                            study_count: r.study_count,
                            busy_hours: r.busy_hours,
                            avg_duration_minutes: r.avg_duration_minutes || '-',
                            utilization_pct: `${r.utilization_pct}%`,
                            total_revenue: money.format(r.total_revenue),
                            revenue_per_study: money.format(r.revenue_per_study)
                        }))
                    },
                    {
                        title: isArabic ? '3. توزيع ساعات الذروة واستغلال السعة (Peak Hours & Capacity Distribution)' : '3. Peak Hours & Capacity Distribution',
                        shortTitle: isArabic ? 'ساعات الذروة' : 'Peak Hours',
                        columns: [
                            { key: 'hour', header: isArabic ? 'الساعة' : 'Hour' },
                            { key: 'studies', header: isArabic ? 'إجمالي الفحوصات' : 'Total Studies' },
                            { key: 'avgStudiesPerDay', header: isArabic ? 'متوسط يومي' : 'Daily Avg' },
                            { key: 'capacity', header: isArabic ? 'نسبة إشغال السعة' : 'Capacity %' },
                            { key: 'avgDurationMinutes', header: isArabic ? 'متوسط مدة الفحص (دقيقة)' : 'Avg Duration (min)' },
                        ],
                        rows: peakHourlyData.map(r => ({
                            hour: r.hour,
                            studies: r.studies,
                            avgStudiesPerDay: r.avgStudiesPerDay,
                            capacity: `${r.capacity}%`,
                            avgDurationMinutes: r.avgDurationMinutes
                        }))
                    },
                    {
                        title: isArabic ? '4. الإجراءات والفحوصات الأكثر طلباً (Top Requested Procedures & Protocols)' : '4. Top Requested Procedures & Protocols',
                        shortTitle: isArabic ? 'الإجراءات الأكثر طلباً' : 'Top Procedures',
                        columns: [
                            { key: 'exam_name', header: isArabic ? 'اسم الفحص' : 'Procedure Name' },
                            { key: 'exam_code', header: isArabic ? 'كود الفحص' : 'Code' },
                            { key: 'modality_name', header: isArabic ? 'الجهاز' : 'Modality' },
                            { key: 'study_count', header: isArabic ? 'عدد الفحوصات' : 'Studies' },
                            { key: 'volume_share_pct', header: isArabic ? 'الحصة من الحجم' : 'Share %' },
                            { key: 'contrast_count', header: isArabic ? 'حالات الصبغة' : 'Contrast Cases' },
                            { key: 'total_revenue', header: isArabic ? 'الإيراد الصافي (ج.م)' : 'Net Revenue (EGP)' },
                            { key: 'revenue_per_study', header: isArabic ? 'العائد لكل فحص (ج.م)' : 'Yield / Study (EGP)' },
                        ],
                        rows: topProceduresRows.map(r => ({
                            exam_name: r.exam_name,
                            exam_code: r.exam_code,
                            modality_name: r.modality_name,
                            study_count: r.study_count,
                            volume_share_pct: `${r.volume_share_pct}%`,
                            contrast_count: r.contrast_count,
                            total_revenue: money.format(r.total_revenue),
                            revenue_per_study: money.format(r.revenue_per_study)
                        }))
                    },
                    {
                        title: isArabic ? '5. أطباء الإحالة وشبكة العيادات (Referring Doctors & Marketing Reach)' : '5. Referring Doctors & Marketing Reach',
                        shortTitle: isArabic ? 'أطباء الإحالة' : 'Referring Doctors',
                        columns: [
                            { key: 'doctorName', header: isArabic ? 'اسم الطبيب المحول' : 'Doctor Name' },
                            { key: 'clinicName', header: isArabic ? 'العيادة / المستشفى' : 'Clinic / Hospital' },
                            { key: 'totalExams', header: isArabic ? 'عدد الحالات المحولة' : 'Referred Studies' },
                            { key: 'totalRevenue', header: isArabic ? 'إجمالي الإيراد (ج.م)' : 'Generated Revenue (EGP)' },
                            { key: 'yield', header: isArabic ? 'متوسط الإيراد للحالة (ج.م)' : 'Revenue / Case (EGP)' },
                        ],
                        rows: topDoctorsList.map(d => ({
                            doctorName: d.doctorName,
                            clinicName: d.clinicName || '-',
                            totalExams: d.totalExams,
                            totalRevenue: money.format(d.totalRevenue),
                            yield: money.format(d.totalExams > 0 ? d.totalRevenue / d.totalExams : 0)
                        }))
                    },
                    {
                        title: isArabic ? '6. إنتاجية الأطباء الإشعاعيين (Radiologist Interpretation Workload)' : '6. Radiologist Interpretation Workload',
                        shortTitle: isArabic ? 'إنتاجية الأطباء' : 'Radiologist Workload',
                        columns: [
                            { key: 'label', header: isArabic ? 'طبيب الأشعة' : 'Radiologist' },
                            { key: 'value', header: isArabic ? 'عدد التقارير المعتمدة' : 'Interpreted Studies' },
                            { key: 'share', header: isArabic ? 'الحصة من إجمالي التقارير' : 'Workload Share %' }
                        ],
                        rows: doctorRows.map(r => ({
                            label: r.label,
                            value: r.value,
                            share: `${summary.studies > 0 ? ((toNumber(r.value) / summary.studies) * 100).toFixed(1) : 0}%`
                        }))
                    },
                    {
                        title: isArabic ? '7. حجم الفحوصات حسب نوع الجهاز (Volume Breakdown by Modality)' : '7. Volume Breakdown by Modality',
                        shortTitle: isArabic ? 'الحجم حسب الأجهزة' : 'Modality Volume',
                        columns: [
                            { key: 'label', header: isArabic ? 'الجهاز' : 'Modality' },
                            { key: 'value', header: isArabic ? 'عدد الفحوصات' : 'Study Count' },
                            { key: 'share', header: isArabic ? 'النسبة المئوية' : 'Share %' }
                        ],
                        rows: modalityRows.map(r => ({
                            label: r.label,
                            value: r.value,
                            share: `${summary.studies > 0 ? ((toNumber(r.value) / summary.studies) * 100).toFixed(1) : 0}%`
                        }))
                    },
                    {
                        title: isArabic ? '8. الإيرادات حسب جهات التحصيل والتأمين (Revenue by Payer & Insurance)' : '8. Revenue by Payer & Insurance',
                        shortTitle: isArabic ? 'الإيراد حسب جهة الدفع' : 'Payer Revenue',
                        columns: [
                            { key: 'label', header: isArabic ? 'جهة الدفع / التأمين' : 'Payer / Category' },
                            { key: 'value', header: isArabic ? 'الإيراد الصافي (ج.م)' : 'Net Revenue (EGP)' },
                            { key: 'share', header: isArabic ? 'الحصة من الإيرادات' : 'Revenue Share %' }
                        ],
                        rows: payerRows.map(r => ({
                            label: r.label,
                            value: money.format(r.value),
                            share: `${summary.revenueTotal > 0 ? ((toNumber(r.value) / summary.revenueTotal) * 100).toFixed(1) : 0}%`
                        }))
                    },
                    {
                        title: isArabic ? '9. قنوات وتدفق حجز المواعيد (Appointment Inflow Channels)' : '9. Appointment Inflow Channels',
                        shortTitle: isArabic ? 'قنوات الحجز' : 'Booking Channels',
                        columns: [
                            { key: 'label', header: isArabic ? 'قناة الحجز (Source)' : 'Booking Channel' },
                            { key: 'value', header: isArabic ? 'عدد الحجوزات' : 'Bookings Count' }
                        ],
                        rows: bookingSources.map(s => ({
                            label: s.label,
                            value: s.value
                        }))
                    }
                ]
            };

            await exportAnalyticsReport(reportData, format);
            toast.success(t('analytics.exportSuccess', { defaultValue: 'Report exported successfully.' }), { id: 'analytics-export' });
        } catch (err) {
            console.error('Export error:', err);
            toast.error(t('analytics.exportError', { defaultValue: 'Failed to export report' }), { id: 'analytics-export' });
        }
    };

    const operatingInsights = useMemo(() => {
        const payerTotal = sumRows(payerRows);
        const modalityTotal = sumRows(modalityRows);
        const leadingPayer = topRow(payerRows);
        const leadingModality = topRow(modalityRows);
        const payerShare = shareOf(leadingPayer, payerTotal);
        const modalityShare = shareOf(leadingModality, modalityTotal);
        const waitMinutes = toNumber(performance.data?.averageWaitTimeMinutes);
        const tatHours = toNumber(performance.data?.averageTurnaroundTimeHours);

        return [
            {
                key: 'demand',
                icon: Activity,
                label: t('analytics.operatingInsights.demandTitle', { defaultValue: 'Access demand' }),
                value: trendText(summary.studyTrend, number),
                detail: summary.studyTrend >= 0
                    ? t('analytics.operatingInsights.demandUp', { defaultValue: 'Demand is ahead of the previous matching period.' })
                    : t('analytics.operatingInsights.demandDown', { defaultValue: 'Demand is softer than the previous matching period.' }),
                tone: summary.studyTrend >= 0 ? 'emerald' : 'amber'
            },
            {
                key: 'cycle',
                icon: TimerReset,
                label: t('analytics.operatingInsights.cycleTitle', { defaultValue: 'Cycle-time pressure' }),
                value: Number.isFinite(waitMinutes) ? formatDuration(waitMinutes, locale) : '-',
                detail: t('analytics.operatingInsights.cycleDetail', {
                    defaultValue: 'Average report turnaround is {{tat}}.',
                    tat: formatMetric(tatHours, number, t('analytics.units.hours'))
                }),
                tone: waitMinutes <= 20 && tatHours <= 6 ? 'emerald' : waitMinutes <= 45 && tatHours <= 12 ? 'amber' : 'rose'
            },
            {
                key: 'payer',
                icon: WalletCards,
                label: t('analytics.operatingInsights.payerTitle', { defaultValue: 'Payer concentration' }),
                value: leadingPayer ? `${number.format(payerShare)}%` : '-',
                detail: leadingPayer
                    ? t('analytics.operatingInsights.payerDetail', { defaultValue: '{{payer}} is the leading payer.', payer: leadingPayer.label || t('analytics.unknown', { defaultValue: 'Unknown' }) })
                    : t('analytics.noLeader', { defaultValue: 'No leading segment yet' }),
                tone: payerShare >= 60 ? 'amber' : 'emerald'
            },
            {
                key: 'modality',
                icon: BarChart3,
                label: t('analytics.operatingInsights.modalityTitle', { defaultValue: 'Modality concentration' }),
                value: leadingModality ? `${number.format(modalityShare)}%` : '-',
                detail: leadingModality
                    ? t('analytics.operatingInsights.modalityDetail', { defaultValue: '{{modality}} leads study volume.', modality: leadingModality.label || t('analytics.unknown', { defaultValue: 'Unknown' }) })
                    : t('analytics.noLeader', { defaultValue: 'No leading segment yet' }),
                tone: modalityShare >= 55 ? 'amber' : 'cyan'
            }
        ];
    }, [locale, modalityRows, number, payerRows, performance.data, summary.studyTrend, t]);

    const loading = volume.isLoading || revenue.isLoading || performance.isLoading;
    const fetching = volume.isFetching || revenue.isFetching || performance.isFetching
        || modalityVolume.isFetching || doctorVolume.isFetching || payerRevenue.isFetching
        || modalityRevenue.isFetching || roomRevenue.isFetching || receptionRevenue.isFetching
        || peakHours.isFetching || equipment.isFetching || topProcedures.isFetching;

    const setPreset = (days) => {
        setEndDate(isoDate(new Date()));
        setStartDate(isoDate(new Date(Date.now() - (days - 1) * DAY)));
    };

    const setYearToDate = () => {
        const now = new Date();
        setEndDate(isoDate(now));
        setStartDate(`${now.getFullYear()}-01-01`);
    };

    const refreshAll = () => {
        [
            volume, revenue, performance, previousVolume, previousRevenue, previousPerformance,
            modalityVolume, doctorVolume, payerRevenue, modalityRevenue, peakHours, equipment, topProcedures
        ].forEach((queryState) => queryState.refetch?.());
    };

    const kpis = [
        {
            key: 'revenue',
            icon: WalletCards,
            label: t('analytics.kpis.revenue', { defaultValue: 'Recorded revenue' }),
            value: money.format(summary.revenueTotal),
            note: trendSentence(summary.revenueTrend, t, number),
            tone: 'emerald'
        },
        {
            key: 'studies',
            icon: Activity,
            label: t('analytics.kpis.studies'),
            value: integer.format(summary.studies),
            note: t('analytics.kpis.studiesNote'),
            tone: 'cyan'
        },
        {
            key: 'rps',
            icon: Stethoscope,
            label: t('analytics.kpis.revenuePerStudy', { defaultValue: 'Revenue per study' }),
            value: money.format(summary.revenuePerStudy),
            note: t('analytics.kpis.revenuePerStudyNote', { defaultValue: 'Net revenue divided by study volume' }),
            tone: 'blue'
        },
        {
            key: 'daily',
            icon: CalendarDays,
            label: t('analytics.kpis.dailyDemand', { defaultValue: 'Daily demand' }),
            value: number.format(summary.averageDailyStudies),
            note: t('analytics.insights.selectedRange', { count: summary.days, defaultValue: '{{count}} days selected' }),
            tone: 'slate'
        },
        {
            key: 'turnaround',
            icon: TimerReset,
            label: t('analytics.kpis.turnaround'),
            value: formatMetric(performance.data?.averageTurnaroundTimeHours, number, t('analytics.units.hours')),
            note: trendSentence(summary.tatTrend, t, number, true),
            tone: 'violet'
        },
        {
            key: 'wait',
            icon: Clock3,
            label: t('analytics.kpis.wait'),
            value: Number.isFinite(Number(performance.data?.averageWaitTimeMinutes)) ? formatDuration(performance.data?.averageWaitTimeMinutes, locale) : '-',
            note: trendSentence(summary.waitTrend, t, number, true),
            tone: 'amber'
        },
        {
            key: 'cancellation',
            icon: XCircle,
            label: t('analytics.kpis.cancellation'),
            value: formatMetric(summary.cancellationRate, number, '%'),
            note: t('analytics.kpis.cancellationNote'),
            tone: summary.cancellationRate <= 5 ? 'emerald' : 'rose'
        },
        {
            key: 'completion',
            icon: Gauge,
            label: t('analytics.kpis.completion', { defaultValue: 'Service completion' }),
            value: formatMetric(summary.serviceCompletion, number, '%'),
            note: t('analytics.kpis.completionNote', { defaultValue: 'Non-cancelled appointment share' }),
            tone: 'cyan'
        }
    ];

    const focusOptions = [
        { id: 'operations', label: isArabic ? 'التشغيل والإنتاجية' : 'Operations & productivity', icon: Activity },
        { id: 'clinical', label: isArabic ? 'الجودة وزمن الإنجاز' : 'Quality & turnaround', icon: Stethoscope },
        { id: 'capacity', label: isArabic ? 'السعة والاستغلال' : 'Capacity & utilization', icon: Cpu },
        { id: 'financial', label: isArabic ? 'العائد وجهات الدفع' : 'Yield & payers', icon: WalletCards },
    ];
    const focusKpiKeys = {
        operations: ['studies', 'daily', 'completion', 'turnaround'],
        clinical: ['turnaround', 'wait', 'completion', 'cancellation'],
        capacity: ['studies', 'daily', 'turnaround', 'wait'],
        financial: ['revenue', 'rps', 'studies', 'daily'],
    };
    const focusInsightKeys = {
        operations: ['demand', 'cycle', 'modality'],
        clinical: ['cycle', 'demand', 'modality'],
        capacity: ['modality', 'cycle', 'demand'],
        financial: ['payer', 'demand', 'modality'],
    };
    const focusedKpis = kpis.filter((item) => (focusKpiKeys[analyticsFocus] || focusKpiKeys.operations).includes(item.key));
    const focusedInsights = operatingInsights.filter((item) => (focusInsightKeys[analyticsFocus] || focusInsightKeys.operations).includes(item.key));
    const setFocus = (focus) => {
        setAnalyticsFocus(focus);
        localStorage.setItem('viara_analytics_focus', focus);
    };
    const setTab = (tab) => {
        localStorage.setItem('viara_analytics_tab', tab);
        setSearchParams((current) => { const next = new URLSearchParams(current); next.set('tab', tab); return next; }, { replace: true });
    };

    return (
        <main className="mx-auto max-w-[1600px] space-y-6 pb-12 print:p-0 print:space-y-4">
            <PageHeader
                icon={TrendingUp}
                eyebrowIcon={Sparkles}
                eyebrow={t('analytics.eyebrow')}
                title={t('analytics.title')}
                description={t('analytics.description')}
                compact
            />

            {/* Top Header & Range Command Deck */}
            <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-5 print:hidden">
                <div className="relative flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
                    {/* Global Filter Bar */}
                    <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3 py-1.5 dark:border-slate-800 dark:bg-slate-950/50">
                            <Filter size={14} className="text-teal-600 dark:text-teal-400 shrink-0" />
                            <label className="text-xs font-bold text-slate-500 dark:text-slate-400">
                                {t('analytics.filters.filterModality', { defaultValue: 'Modality' })}:
                            </label>
                            <select
                                value={selectedModality}
                                onChange={(e) => setSelectedModality(e.target.value)}
                                className="h-7 rounded-lg border-0 bg-transparent text-xs font-black text-slate-800 outline-hidden dark:text-slate-200 cursor-pointer"
                            >
                                <option value="all">{t('analytics.filters.allModalities', { defaultValue: 'All Modalities' })}</option>
                                {(modalitiesList || []).map(m => (
                                    <option key={m.id} value={m.id}>{m.name}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Filter & Range Controls */}
                    <div className="flex flex-col gap-3 lg:items-end">
                        <div className="flex flex-wrap items-center gap-2">
                            <div className="flex items-center gap-1.5 rounded-2xl border border-slate-200/80 bg-slate-50/80 p-1.5 dark:border-slate-800 dark:bg-slate-950/50">
                                <DateField label={t('analytics.startDate')} value={startDate} onChange={setStartDate} />
                                <span className="text-xs font-bold text-slate-400 px-1">{t('analytics.to')}</span>
                                <DateField label={t('analytics.endDate')} value={endDate} onChange={setEndDate} />
                            </div>

                            <button
                                type="button"
                                onClick={refreshAll}
                                disabled={fetching || dateInvalid}
                                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-xs transition hover:bg-slate-50 hover:text-teal-600 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-800 dark:text-slate-300 cursor-pointer"
                                title={t('analytics.refresh', { defaultValue: 'Refresh' })}
                            >
                                <RefreshCw size={15} className={fetching ? 'animate-spin text-teal-500' : ''} />
                            </button>

                            {/* Multi-Format Export Dropdown */}
                            <div className="relative">
                                <button
                                    type="button"
                                    onClick={() => setExportMenuOpen(!exportMenuOpen)}
                                    disabled={fetching || dateInvalid}
                                    className="inline-flex h-10 items-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-3.5 text-xs font-black text-teal-800 shadow-2xs transition hover:bg-teal-100 disabled:opacity-50 dark:border-teal-800/80 dark:bg-teal-950/50 dark:text-teal-300 dark:hover:bg-teal-900/60 cursor-pointer"
                                    title={t('analytics.export', { defaultValue: 'Export Analytics Report' })}
                                >
                                    <Download size={15} />
                                    <span>{t('analytics.exportReport', { defaultValue: 'Export Report' })}</span>
                                    <ChevronDown size={13} className={`transition-transform duration-200 ${exportMenuOpen ? 'rotate-180' : ''}`} />
                                </button>

                                {exportMenuOpen && (
                                    <>
                                        <div
                                            className="fixed inset-0 z-40"
                                            onClick={() => setExportMenuOpen(false)}
                                        />
                                        <div className="absolute end-0 top-full z-50 mt-1.5 w-60 rounded-2xl border border-slate-200/90 bg-white/95 p-1.5 shadow-xl backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/95 animate-in fade-in zoom-in-95 duration-150">
                                            <div className="px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                                {t('analytics.exportFormats', { defaultValue: 'Select Export Format' })}
                                            </div>
                                            <button
                                                type="button"
                                                onClick={() => { setExportMenuOpen(false); handleExport('excel'); }}
                                                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-start text-xs font-bold text-slate-700 transition hover:bg-teal-50 hover:text-teal-800 dark:text-slate-200 dark:hover:bg-teal-950/40 dark:hover:text-teal-300 cursor-pointer"
                                            >
                                                <FileSpreadsheet size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                                                <div>
                                                    <div className="font-extrabold">{t('analytics.exportExcel', { defaultValue: 'Excel Workbook (.xlsx)' })}</div>
                                                    <div className="text-[10px] text-slate-400">{t('analytics.excelDesc', { defaultValue: 'Multi-sheet workbook with all KPIs' })}</div>
                                                </div>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => { setExportMenuOpen(false); handleExport('word'); }}
                                                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-start text-xs font-bold text-slate-700 transition hover:bg-teal-50 hover:text-teal-800 dark:text-slate-200 dark:hover:bg-teal-950/40 dark:hover:text-teal-300 cursor-pointer"
                                            >
                                                <FileType2 size={16} className="text-blue-600 dark:text-blue-400 shrink-0" />
                                                <div>
                                                    <div className="font-extrabold">{t('analytics.exportWord', { defaultValue: 'Executive Word Doc (.docx)' })}</div>
                                                    <div className="text-[10px] text-slate-400">{t('analytics.wordDesc', { defaultValue: 'Formatted report document' })}</div>
                                                </div>
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => { setExportMenuOpen(false); handleExport('csv'); }}
                                                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-start text-xs font-bold text-slate-700 transition hover:bg-teal-50 hover:text-teal-800 dark:text-slate-200 dark:hover:bg-teal-950/40 dark:hover:text-teal-300 cursor-pointer"
                                            >
                                                <FileText size={16} className="text-amber-600 dark:text-amber-400 shrink-0" />
                                                <div>
                                                    <div className="font-extrabold">{t('analytics.exportCsv', { defaultValue: 'CSV Dataset (.csv)' })}</div>
                                                    <div className="text-[10px] text-slate-400">{t('analytics.csvDesc', { defaultValue: 'UTF-8 encoded for Excel & BI' })}</div>
                                                </div>
                                            </button>
                                            <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                                            <button
                                                type="button"
                                                onClick={() => { setExportMenuOpen(false); handleExport('pdf'); }}
                                                className="flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-start text-xs font-bold text-slate-700 transition hover:bg-teal-50 hover:text-teal-800 dark:text-slate-200 dark:hover:bg-teal-950/40 dark:hover:text-teal-300 cursor-pointer"
                                            >
                                                <Printer size={16} className="text-purple-600 dark:text-purple-400 shrink-0" />
                                                <div>
                                                    <div className="font-extrabold">{t('analytics.printReport', { defaultValue: 'Print / Save PDF' })}</div>
                                                    <div className="text-[10px] text-slate-400">{t('analytics.pdfDesc', { defaultValue: 'High-res printable layout' })}</div>
                                                </div>
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>

                        {/* Quick Presets */}
                        <div className="flex flex-wrap items-center gap-1.5" aria-label={t('analytics.presets')}>
                            {[7, 30, 90].map((days) => (
                                <button
                                    key={days}
                                    type="button"
                                    onClick={() => setPreset(days)}
                                    className="rounded-xl border border-slate-200/80 bg-white px-3 py-1 text-xs font-bold text-slate-600 shadow-2xs transition hover:border-teal-500/40 hover:bg-teal-50 hover:text-teal-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-teal-950/30 dark:hover:text-teal-300 cursor-pointer"
                                >
                                    {t('analytics.lastDays', { count: days })}
                                </button>
                            ))}
                            <button
                                type="button"
                                onClick={setYearToDate}
                                className="rounded-xl border border-slate-200/80 bg-white px-3 py-1 text-xs font-bold text-slate-600 shadow-2xs transition hover:border-teal-500/40 hover:bg-teal-50 hover:text-teal-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-teal-950/30 dark:hover:text-teal-300 cursor-pointer"
                            >
                                {t('analytics.ytd', { defaultValue: 'Year to date' })}
                            </button>
                        </div>
                    </div>
                </div>

                <div className="mt-4 border-t border-slate-100 pt-3 dark:border-slate-800">
                    <div className="mb-2 flex items-center justify-between gap-3">
                        <p className="text-xs font-black text-slate-700 dark:text-slate-300">{isArabic ? 'محور التحليل المفضل' : 'Preferred analysis focus'}</p>
                        <p className="hidden text-[10px] font-semibold text-slate-400 sm:block">{isArabic ? 'يُحفظ اختيارك تلقائياً' : 'Your selection is saved automatically'}</p>
                    </div>
                    <div className="flex gap-1.5 overflow-x-auto pb-1" role="group" aria-label={isArabic ? 'اختيار محور التحليل' : 'Choose analytics focus'}>
                        {focusOptions.map(({ id, label, icon: Icon }) => (
                            <button key={id} type="button" onClick={() => setFocus(id)} aria-pressed={analyticsFocus === id} className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-xs font-black transition ${analyticsFocus === id ? 'bg-slate-900 text-white dark:bg-teal-600' : 'border border-slate-200 bg-slate-50 text-slate-600 hover:border-teal-300 hover:text-teal-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400'}`}>
                                <Icon size={14} />{label}
                            </button>
                        ))}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[10px] font-semibold text-slate-400">{isArabic ? 'الوضع المختصر يعرض ما يحتاج قراراً الآن' : 'Focus mode shows what needs a decision now.'}</span>
                        <button type="button" onClick={() => setShowSupportingDetails((value) => !value)} aria-pressed={showSupportingDetails} className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-[11px] font-black text-slate-600 hover:border-teal-300 hover:text-teal-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
                            <Layers3 size={13} />
                            {showSupportingDetails ? (isArabic ? 'إخفاء التفاصيل المساندة' : 'Hide supporting detail') : (isArabic ? 'إظهار التفاصيل المساندة' : 'Show supporting detail')}
                        </button>
                    </div>
                </div>

                {/* Section View Tabs */}
<div data-workspace-tabs className="mt-5 flex gap-1.5 overflow-x-auto border-t border-slate-100 pt-4 dark:border-slate-800 xl:grid xl:grid-cols-6 xl:overflow-visible" role="tablist" aria-label={t('analytics.tabs.label', { defaultValue: 'Analytics sections' })}>
                    {[
                        { id: 'overview', label: t('analytics.tabs.overview', { defaultValue: 'Executive Overview' }), icon: LayoutDashboard },
                        { id: 'clinical', label: t('analytics.tabs.clinical', { defaultValue: 'Clinical & TAT Performance' }), icon: Stethoscope },
                        { id: 'equipment', label: t('analytics.tabs.equipment', { defaultValue: 'Equipment & Utilization' }), icon: Cpu },
                        { id: 'peak_hours', label: t('analytics.tabs.peak_hours', { defaultValue: 'Peak Hours & Capacity' }), icon: SunMedium },
                        { id: 'procedures', label: t('analytics.tabs.procedures', { defaultValue: 'Top Procedures & Quality' }), icon: Layers3 },
                        { id: 'financial', label: t('analytics.tabs.financial', { defaultValue: 'Financial & Payers' }), icon: WalletCards },
                    ].map(tab => {
                        const Icon = tab.icon;
                        const isActive = analyticsTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                 onClick={() => setTab(tab.id)}
                                role="tab"
                                aria-selected={isActive}
                                className={`inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-xl px-3 py-2 text-center text-xs font-black transition cursor-pointer xl:w-full xl:min-w-0 xl:shrink ${isActive
                                    ? 'bg-teal-600 text-white shadow-sm shadow-teal-600/20'
                                    : 'border border-slate-200/80 bg-slate-50 text-slate-600 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800'
                                    }`}
                            >
                                <Icon size={14} />
                                <span className="whitespace-nowrap xl:whitespace-normal">{tab.label}</span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {dateInvalid && (
                <div role="alert" className="flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs font-semibold text-amber-800 dark:text-amber-300">
                    <AlertTriangle className="mt-0.5 shrink-0" size={18} aria-hidden="true" />
                    <div>
                        <p className="font-black">{t('analytics.invalidPeriod')}</p>
                        <p className="mt-0.5">{t('analytics.invalidPeriodHelp')}</p>
                    </div>
                </div>
            )}

            {/* Transparent run-rate projection */}
            <div className="relative flex flex-col gap-3 rounded-2xl border border-teal-500/25 bg-teal-500/5 p-3.5 sm:flex-row sm:items-center sm:justify-between dark:bg-teal-950/20">
                <div className="flex items-center gap-3.5">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-teal-500/15 text-teal-700 dark:text-teal-300">
                            <Zap size={17} />
                    </span>
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-300">
                                {t('analytics.projection.label', { defaultValue: 'Operational run-rate projection' })}
                            </span>
                            <span className="rounded-md bg-teal-500/20 px-1.5 py-0.2 text-[9px] font-black text-teal-800 dark:text-teal-200">
                                {t('analytics.projection.method', { defaultValue: 'Calculated estimate' })}
                            </span>
                        </div>
                        <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                            {summary.studies > 0
                                ? t('analytics.projection.detail', {
                                    count: integer.format(Math.round(summary.averageDailyStudies * 30)),
                                    revenue: money.format(Math.round(summary.revenuePerStudy * summary.averageDailyStudies * 30)),
                                    defaultValue: 'At the selected-period run rate, the next 30 days would produce about {{count}} studies and {{revenue}} in recorded revenue. This is a simple estimate, not an AI prediction.'
                                })
                                : t('analytics.projection.empty', { defaultValue: 'More activity is required before a run-rate projection can be calculated.' })}
                        </p>
                    </div>
                </div>
            </div>

            {/* TAB 1: OVERVIEW */}
            {analyticsTab === 'overview' && (
                <div className="space-y-5">
                    <section className="grid gap-3 md:grid-cols-3" aria-label={t('analytics.operatingInsights.label', { defaultValue: 'Operating insights' })}>
                        {focusedInsights.map(({ key, ...insight }) => (
                            <InsightCard key={key} {...insight} loading={fetching && !loading} />
                        ))}
                    </section>

                    <ManagementDecisionQueue
                        summary={summary}
                        performance={performance.data}
                        isArabic={isArabic}
                        number={number}
                    />

                    {/* Performance KPIs Matrix */}
                    <section aria-labelledby="performance-heading" className="space-y-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <h2 id="performance-heading" className="text-base font-black text-slate-900 dark:text-white">
                                    {t('analytics.performance')}
                                </h2>
                                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                    {t('analytics.performanceDescription')}
                                </p>
                            </div>
                        </div>

                        {performance.isError ? (
                            <ErrorState label={t('analytics.performanceError')} onRetry={performance.refetch} t={t} />
                        ) : (
                            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                                {focusedKpis.map(({ key, ...item }) => (
                                    <MetricCard key={key} {...item} loading={loading} />
                                ))}
                            </div>
                        )}
                    </section>

                    {/* Visual Analytics Charts */}
                    <div className="grid gap-5 xl:grid-cols-2">
                        <ChartPanel
                            title={t('analytics.volume.title')}
                            description={t('analytics.volume.description')}
                            icon={BarChart3}
                            data={volumeData}
                            group={volumeGroup}
                            groups={['date', 'modality', 'doctor']}
                            onGroupChange={setVolumeGroup}
                            onExport={() => handleExport('volume', volumeGroup)}
                            loading={volume.isLoading || volume.isFetching}
                            error={volume.isError}
                            onRetry={volume.refetch}
                            emptyLabel={t('analytics.volume.empty')}
                            errorLabel={t('analytics.volume.error')}
                            valueLabel={t('analytics.volume.value')}
                            valueFormatter={(value) => integer.format(toNumber(value))}
                            color="#0d9488"
                            t={t}
                        />
                        <ChartPanel
                            title={t('analytics.revenue.title')}
                            description={t('analytics.revenue.description')}
                            icon={LineChartIcon}
                            data={revenueData}
                            group={revenueGroup}
                             groups={['date', 'modality', 'room', 'reception', 'payer']}
                            onGroupChange={setRevenueGroup}
                            onExport={() => handleExport('revenue', revenueGroup)}
                            loading={revenue.isLoading || revenue.isFetching}
                            error={revenue.isError}
                            onRetry={revenue.refetch}
                            emptyLabel={t('analytics.revenue.empty')}
                            errorLabel={t('analytics.revenue.error')}
                            valueLabel={t('analytics.revenue.value')}
                            valueFormatter={(value) => money.format(toNumber(value))}
                            color="#10b981"
                            t={t}
                        />
                    </div>

                    <details open={showSupportingDetails} onToggle={(event) => setShowSupportingDetails(event.currentTarget.open)} className="group rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-black text-slate-800 marker:hidden dark:text-slate-200">
                            <span>{isArabic ? 'الجداول التفصيلية والتركيز حسب القطاعات' : 'Detailed tables and segment concentration'}</span>
                            <ChevronDown size={16} className="transition-transform group-open:rotate-180" />
                        </summary>
                        <section className="grid gap-5 border-t border-slate-100 p-4 dark:border-slate-800 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(320px,0.85fr)]">
                        <LeaderboardPanel
                            icon={Stethoscope}
                            title={t('analytics.tables.modalityTitle', { defaultValue: 'Modality operating mix' })}
                            description={t('analytics.tables.modalityDescription', { defaultValue: 'Volume, revenue, and yield by modality.' })}
                            rows={matrixRows}
                            loading={modalityVolume.isLoading || modalityRevenue.isLoading}
                            emptyLabel={t('analytics.tables.emptyModality', { defaultValue: 'No modality activity was recorded.' })}
                            columns={[
                                [t('analytics.tables.modality', { defaultValue: 'Modality' }), (row) => row.label],
                                [t('analytics.volume.value'), (row) => integer.format(row.studies), 'text-center'],
                                [t('analytics.revenue.value'), (row) => money.format(row.revenue), 'text-end'],
                                [t('analytics.tables.yield', { defaultValue: 'Yield' }), (row) => money.format(row.revenuePerStudy), 'text-end']
                            ]}
                            t={t}
                        />
                        <LeaderboardPanel
                            icon={Activity}
                            title={t('analytics.tables.doctorTitle', { defaultValue: 'Radiologist workload' })}
                            description={t('analytics.tables.doctorDescription', { defaultValue: 'Study volume grouped by performing radiologist.' })}
                            rows={doctorRows.slice(0, 10)}
                            loading={doctorVolume.isLoading}
                            emptyLabel={t('analytics.tables.emptyDoctors', { defaultValue: 'No radiologist workload was recorded.' })}
                            columns={[
                                [t('analytics.groups.doctor'), (row) => row.label || '-'],
                                [t('analytics.volume.value'), (row) => integer.format(row.value), 'text-end']
                            ]}
                            t={t}
                        />
                        <MixPanel
                            icon={PieChartIcon}
                            title={t('analytics.tables.payerTitle', { defaultValue: 'Payer mix' })}
                            description={t('analytics.tables.payerDescription', { defaultValue: 'Revenue concentration by payer.' })}
                            rows={payerRows}
                            loading={payerRevenue.isLoading}
                            valueFormatter={(value) => money.format(value)}
                            locale={locale}
                            t={t}
                        />
                        </section>
                    </details>
                </div>
            )}

            {/* TAB 2: CLINICAL & TAT PERFORMANCE */}
            {analyticsTab === 'clinical' && (
                <div className="space-y-6">
                    {/* TAT Waterfall Breakdown Card */}
                    <section className="rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-8">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-6">
                            <div>
                                <h3 className="text-base font-black text-slate-900 dark:text-white">
                                    {t('analytics.tat.waterfallTitle', { defaultValue: 'Turnaround Time (TAT) Waterfall Breakdown' })}
                                </h3>
                                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                    {t('analytics.tat.waterfallDesc', { defaultValue: 'Multi-stage breakdown of clinical imaging workflow cycle times from arrival to sign-off.' })}
                                </p>
                            </div>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-black text-teal-700 dark:text-teal-300">
                                <TimerReset size={14} />
                                <span>{t('analytics.kpis.turnaround')}: {performance.data?.averageTurnaroundTimeHours || '-'} {t('analytics.units.hours')}</span>
                            </span>
                        </div>

                        {/* 4 Stages Waterfall Steps */}
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                            <div className="rounded-2xl border border-amber-500/30 bg-amber-50/50 p-4 dark:border-amber-900/40 dark:bg-amber-950/20">
                                <p className="text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400">
                                    {t('analytics.tat.waitStage', { defaultValue: '1. Reception Wait' })}
                                </p>
                                <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white tabular-nums">
                                    {performance.data?.averageWaitTimeMinutes || '-'} <span className="text-xs font-bold text-slate-400">{t('analytics.units.minutes')}</span>
                                </p>
                                <p className="mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                    {isArabic ? 'من تسجيل الوصول إلى بدء الفحص' : 'From check-in to scanner room'}
                                </p>
                            </div>

                            <div className="rounded-2xl border border-sky-500/30 bg-sky-50/50 p-4 dark:border-sky-900/40 dark:bg-sky-950/20">
                                <p className="text-[10px] font-black uppercase tracking-wider text-sky-700 dark:text-sky-400">
                                    {t('analytics.tat.scanStage', { defaultValue: '2. Active Scan' })}
                                </p>
                                <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white tabular-nums">
                                    {performance.data?.averageScanMinutes || '-'} <span className="text-xs font-bold text-slate-400">{t('analytics.units.minutes')}</span>
                                </p>
                                <p className="mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                    {isArabic ? 'مدة التصوير الفعلي بالجهاز' : 'Active scanning protocol duration'}
                                </p>
                            </div>

                            <div className="rounded-2xl border border-purple-500/30 bg-purple-50/50 p-4 dark:border-purple-900/40 dark:bg-purple-950/20">
                                <p className="text-[10px] font-black uppercase tracking-wider text-purple-700 dark:text-purple-400">
                                    {t('analytics.tat.draftStage', { defaultValue: '3. Report Drafting' })}
                                </p>
                                <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white tabular-nums">
                                    {performance.data?.averageDraftTimeHours || '-'} <span className="text-xs font-bold text-slate-400">{t('analytics.units.hours')}</span>
                                </p>
                                <p className="mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                    {isArabic ? 'من انتهاء الفحص لمسودة التقرير' : 'From scan complete to draft'}
                                </p>
                            </div>

                            <div className="rounded-2xl border border-emerald-500/30 bg-emerald-50/50 p-4 dark:border-emerald-900/40 dark:bg-emerald-950/20">
                                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
                                    {t('analytics.tat.signStage', { defaultValue: '4. Final Review & Sign-off' })}
                                </p>
                                <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white tabular-nums">
                                    {performance.data?.averageSignTimeHours || '-'} <span className="text-xs font-bold text-slate-400">{t('analytics.units.hours')}</span>
                                </p>
                                <p className="mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">
                                    {isArabic ? 'مراجعة واعتماد الاستشاري' : 'Consultant approval & finalization'}
                                </p>
                            </div>
                        </div>
                    </section>

                    {/* SLA Compliance & Safety Gauges */}
                    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                        <article className="rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                            <div className="flex items-center justify-between">
                                <span className="text-[10.5px] font-black uppercase tracking-wider text-slate-400">{t('analytics.tat.statSla', { defaultValue: 'STAT / Urgent SLA' })}</span>
                                <span className="grid h-9 w-9 place-items-center rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400">
                                    <Flame size={16} />
                                </span>
                            </div>
                            <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white tabular-nums">
                                {performance.data?.statSlaCompliancePct || '100'}%
                            </p>
                            <p className="mt-1 text-xs font-semibold text-rose-600 dark:text-rose-400">
                                {t('analytics.tat.statSlaTarget', { defaultValue: 'Target: < 2 Hours' })}
                            </p>
                        </article>

                        <article className="rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                            <div className="flex items-center justify-between">
                                <span className="text-[10.5px] font-black uppercase tracking-wider text-slate-400">{t('analytics.tat.routineSla', { defaultValue: 'Routine SLA' })}</span>
                                <span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                    <ShieldCheck size={16} />
                                </span>
                            </div>
                            <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white tabular-nums">
                                {performance.data?.routineSlaCompliancePct || '100'}%
                            </p>
                            <p className="mt-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                                {t('analytics.tat.routineSlaTarget', { defaultValue: 'Target: < 24 Hours' })}
                            </p>
                        </article>

                        <article className="rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                            <div className="flex items-center justify-between">
                                <span className="text-[10.5px] font-black uppercase tracking-wider text-slate-400">{t('analytics.tat.contrastRatio', { defaultValue: 'Contrast Study Share' })}</span>
                                <span className="grid h-9 w-9 place-items-center rounded-xl bg-teal-500/10 text-teal-600 dark:text-teal-400">
                                    <Activity size={16} />
                                </span>
                            </div>
                            <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white tabular-nums">
                                {performance.data?.contrastRatioPct || '0'}%
                            </p>
                            <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                {performance.data?.contrastCount || 0} {isArabic ? 'فحص بالصبغة' : 'contrast studies'}
                            </p>
                        </article>

                        <article className="rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                            <div className="flex items-center justify-between">
                                <span className="text-[10.5px] font-black uppercase tracking-wider text-slate-400">{t('analytics.tat.contrastSafety', { defaultValue: 'Contrast Safety Clearance' })}</span>
                                <span className="grid h-9 w-9 place-items-center rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400">
                                    <CheckCircle2 size={16} />
                                </span>
                            </div>
                            <p className="mt-2 text-2xl font-black text-slate-900 dark:text-white tabular-nums">
                                {performance.data?.contrastSafetyCompliancePct || '100'}%
                            </p>
                            <p className="mt-1 text-xs font-semibold text-cyan-600 dark:text-cyan-400">
                                {t('analytics.tat.contrastSafetyDetail', { defaultValue: 'Creatinine/Allergy documented' })}
                            </p>
                        </article>
                    </section>

                    <div className="grid gap-6 xl:grid-cols-2">
                        <LeaderboardPanel
                            icon={Activity}
                            title={t('analytics.tables.doctorTitle', { defaultValue: 'Radiologist workload' })}
                            description={t('analytics.tables.doctorDescription', { defaultValue: 'Study volume grouped by performing radiologist.' })}
                            rows={doctorRows.slice(0, 10)}
                            loading={doctorVolume.isLoading}
                            emptyLabel={t('analytics.tables.emptyDoctors', { defaultValue: 'No radiologist workload was recorded.' })}
                            columns={[
                                [t('analytics.groups.doctor'), (row) => row.label || '-'],
                                [t('analytics.volume.value'), (row) => integer.format(row.value), 'text-end']
                            ]}
                            t={t}
                        />

                        <ChartPanel
                            title={t('analytics.volume.title')}
                            description={t('analytics.volume.description')}
                            icon={BarChart3}
                            data={volumeData}
                            group={volumeGroup}
                            groups={['date', 'modality', 'doctor']}
                            onGroupChange={setVolumeGroup}
                            onExport={() => handleExport('volume', volumeGroup)}
                            loading={volume.isLoading || volume.isFetching}
                            error={volume.isError}
                            onRetry={volume.refetch}
                            emptyLabel={t('analytics.volume.empty')}
                            errorLabel={t('analytics.volume.error')}
                            valueLabel={t('analytics.volume.value')}
                            valueFormatter={(value) => integer.format(toNumber(value))}
                            color="#0d9488"
                            t={t}
                        />
                    </div>
                </div>
            )}

            {/* TAB 3: EQUIPMENT & UTILIZATION */}
            {analyticsTab === 'equipment' && (
                <div className="space-y-6">
                    <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                        <div className="flex flex-col gap-4 border-b border-slate-100 p-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                            <div className="flex items-center gap-3.5">
                                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/30">
                                    <Cpu size={20} />
                                </span>
                                <div>
                                    <h3 className="text-base font-black text-slate-900 dark:text-white">
                                        {t('analytics.equipment.title', { defaultValue: 'Machine & Equipment Utilization Matrix' })}
                                    </h3>
                                    <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                        {t('analytics.equipment.description', { defaultValue: 'Active imaging hours, scanner capacity utilization, and hourly financial yield.' })}
                                    </p>
                                </div>
                            </div>
                            <ExportButton onClick={() => handleExport('equipment-utilization')} disabled={dateInvalid} label={t('analytics.exportPdf.exportEquipment', { defaultValue: 'Export Equipment' })} />
                        </div>

                        <div className="p-4 sm:p-6">
                            {equipment.isLoading ? (
                                <PanelSkeleton />
                            ) : equipmentRows.length ? (
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[700px] border-separate border-spacing-0 text-start">
                                        <thead>
                                            <tr>
                                                <th className="border-b border-slate-100 px-3.5 py-3 text-start text-[10.5px] font-black uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:text-slate-500">{t('analytics.equipment.modality')}</th>
                                                <th className="border-b border-slate-100 px-3.5 py-3 text-center text-[10.5px] font-black uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:text-slate-500">{t('analytics.volume.value')}</th>
                                                <th className="border-b border-slate-100 px-3.5 py-3 text-center text-[10.5px] font-black uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:text-slate-500">{t('analytics.equipment.busyHours')}</th>
                                                <th className="border-b border-slate-100 px-3.5 py-3 text-center text-[10.5px] font-black uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:text-slate-500">{t('analytics.equipment.utilizationRate')}</th>
                                                <th className="border-b border-slate-100 px-3.5 py-3 text-end text-[10.5px] font-black uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:text-slate-500">{t('analytics.equipment.revenue')}</th>
                                                <th className="border-b border-slate-100 px-3.5 py-3 text-end text-[10.5px] font-black uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:text-slate-500">{t('analytics.equipment.revenuePerStudy')}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {equipmentRows.map((row) => (
                                                <tr key={row.modality_id} className="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                                                    <td className="px-3.5 py-3.5 text-xs font-black text-slate-900 dark:text-white">
                                                        <div className="flex items-center gap-2">
                                                            <span className="h-2 w-2 rounded-full bg-teal-500" />
                                                            <span>{row.modality_name}</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-3.5 py-3.5 text-center text-xs font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                                                        {integer.format(row.study_count)}
                                                    </td>
                                                    <td className="px-3.5 py-3.5 text-center text-xs font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                                                        {row.busy_hours} {t('analytics.units.hours')}
                                                    </td>
                                                    <td className="px-3.5 py-3.5 text-center tabular-nums">
                                                        <div className="flex items-center justify-center gap-2">
                                                            <div className="h-2 w-20 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                                                                <div
                                                                    className={`h-full rounded-full ${row.utilization_pct >= 80 ? 'bg-amber-500' : 'bg-teal-500'}`}
                                                                    style={{ width: `${Math.min(100, row.utilization_pct)}%` }}
                                                                />
                                                            </div>
                                                            <span className="text-xs font-black text-slate-800 dark:text-slate-200">{row.utilization_pct}%</span>
                                                        </div>
                                                    </td>
                                                    <td className="px-3.5 py-3.5 text-end text-xs font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                                                        {money.format(row.total_revenue)}
                                                    </td>
                                                    <td className="px-3.5 py-3.5 text-end text-xs font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                                                        {money.format(row.revenue_per_study)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <EmptyChart label={t('analytics.equipment.empty')} />
                            )}
                        </div>
                    </section>
                </div>
            )}

            {/* TAB 4: PEAK HOURS & CAPACITY */}
            {analyticsTab === 'peak_hours' && (
                <div className="space-y-6">
                    <section className="rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-6">
                            <div>
                                <h3 className="text-base font-black text-slate-900 dark:text-white">
                                    {isArabic ? 'خريطة أوقات الذروة واستخدام الطاقة التشغيلية' : 'Hourly Peak Demand & Utilization Distribution'}
                                </h3>
                                <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                    {isArabic ? 'معدل كثافة الفحوصات ونسبة تشغيل الأجهزة على مدار ساعات اليوم الفعلي من قاعدة البيانات' : 'Average hourly scans and scanner utilization rate throughout operating hours'}
                                </p>
                            </div>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-black text-amber-700 dark:text-amber-300">
                                <SunMedium size={14} />
                                <span>{isArabic ? `ذروة الطلب: ${peakHours.data?.peakHour || '11:00'} (${peakHours.data?.peakWindowAr || '10:00 ص - 04:00 م'})` : `Peak: ${peakHours.data?.peakHour || '11:00'} (${peakHours.data?.peakWindowEn || '10:00 AM - 04:00 PM'})`}</span>
                            </span>
                        </div>

                        <div className="h-80 w-full min-w-0">
                            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                <ComposedChart data={peakHourlyData} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="4 4" stroke="currentColor" className="text-slate-100 dark:text-slate-800" vertical={false} />
                                    <XAxis dataKey="hour" tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
                                    <YAxis yAxisId="studies" allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
                                    <YAxis yAxisId="cap" orientation="right" unit="%" tick={{ fill: '#94a3b8', fontSize: 11, fontWeight: 700 }} axisLine={false} tickLine={false} />
                                    <Tooltip contentStyle={chartTooltipStyle} />
                                    <Bar yAxisId="studies" dataKey="studies" name={isArabic ? 'عدد الفحوصات' : 'Scans'} fill="#0d9488" radius={[8, 8, 0, 0]} maxBarSize={44} />
                                    <Line yAxisId="cap" type="monotone" dataKey="capacity" name={isArabic ? 'نسبة الإشغال %' : 'Capacity %'} stroke="#f59e0b" strokeWidth={3} dot={{ r: 4, fill: '#f59e0b' }} />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </section>
                </div>
            )}

            {/* TAB 5: TOP PROCEDURES & QUALITY */}
            {analyticsTab === 'procedures' && (
                <div className="space-y-6">
                    <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                        <div className="flex flex-col gap-4 border-b border-slate-100 p-5 dark:border-slate-800 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                            <div className="flex items-center gap-3.5">
                                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/30">
                                    <Layers3 size={20} />
                                </span>
                                <div>
                                    <h3 className="text-base font-black text-slate-900 dark:text-white">
                                        {t('analytics.topProcedures.title', { defaultValue: 'Top 10 Imaging Procedures' })}
                                    </h3>
                                    <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                        {t('analytics.topProcedures.description', { defaultValue: 'Most frequently performed imaging protocols by volume and revenue contribution.' })}
                                    </p>
                                </div>
                            </div>
                            <ExportButton onClick={() => handleExport('top-procedures')} disabled={dateInvalid} label={t('analytics.exportPdf.exportProcedures', { defaultValue: 'Export Procedures' })} />
                        </div>

                        <div className="p-4 sm:p-6">
                            {topProcedures.isLoading ? (
                                <PanelSkeleton />
                            ) : topProceduresRows.length ? (
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[700px] border-separate border-spacing-0 text-start">
                                        <thead>
                                            <tr>
                                                <th className="border-b border-slate-100 px-3.5 py-3 text-start text-[10.5px] font-black uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:text-slate-500">{t('analytics.topProcedures.procedure')}</th>
                                                <th className="border-b border-slate-100 px-3.5 py-3 text-center text-[10.5px] font-black uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:text-slate-500">{t('analytics.topProcedures.modality')}</th>
                                                <th className="border-b border-slate-100 px-3.5 py-3 text-center text-[10.5px] font-black uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:text-slate-500">{t('analytics.topProcedures.volume')}</th>
                                                <th className="border-b border-slate-100 px-3.5 py-3 text-center text-[10.5px] font-black uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:text-slate-500">{t('analytics.topProcedures.share')}</th>
                                                <th className="border-b border-slate-100 px-3.5 py-3 text-end text-[10.5px] font-black uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:text-slate-500">{t('analytics.topProcedures.revenue')}</th>
                                                <th className="border-b border-slate-100 px-3.5 py-3 text-end text-[10.5px] font-black uppercase tracking-wider text-slate-400 dark:border-slate-800 dark:text-slate-500">{t('analytics.topProcedures.avgDuration')}</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                            {topProceduresRows.map((row, idx) => (
                                                <tr key={row.exam_type_id || idx} className="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                                                    <td className="px-3.5 py-3.5 text-xs font-black text-slate-900 dark:text-white">
                                                        <div className="flex items-center gap-2">
                                                            <span className="grid h-5 w-5 place-items-center rounded-md bg-slate-100 text-[10px] font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                                                {idx + 1}
                                                            </span>
                                                            <div className="min-w-0">
                                                                <p className="truncate font-bold">{row.exam_name}</p>
                                                                {row.exam_code && <p className="text-[10px] font-mono text-slate-400">{row.exam_code}</p>}
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-3.5 py-3.5 text-center text-xs font-bold text-slate-700 dark:text-slate-200">
                                                        <span className="rounded-lg bg-teal-500/10 px-2 py-0.5 text-[10.5px] font-bold text-teal-700 dark:text-teal-300">
                                                            {row.modality_name || '-'}
                                                        </span>
                                                    </td>
                                                    <td className="px-3.5 py-3.5 text-center text-xs font-bold text-slate-700 dark:text-slate-200 tabular-nums">
                                                        {integer.format(row.study_count)}
                                                    </td>
                                                    <td className="px-3.5 py-3.5 text-center text-xs font-black text-slate-800 dark:text-slate-200 tabular-nums">
                                                        {row.volume_share_pct}%
                                                    </td>
                                                    <td className="px-3.5 py-3.5 text-end text-xs font-black text-emerald-600 dark:text-emerald-400 tabular-nums">
                                                        {money.format(row.total_revenue)}
                                                    </td>
                                                    <td className="px-3.5 py-3.5 text-end text-xs font-bold text-slate-600 dark:text-slate-300 tabular-nums">
                                                        {row.avg_duration_minutes} {t('analytics.units.minutes')}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <EmptyChart label={t('analytics.topProcedures.empty')} />
                            )}
                        </div>
                    </section>
                </div>
            )}

            {/* TAB 6: FINANCIAL & PAYERS */}
            {analyticsTab === 'financial' && (
                <div className="space-y-6">
                    <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                        <MetricCard
                            icon={WalletCards}
                            label={t('analytics.kpis.revenue', { defaultValue: 'Recorded revenue' })}
                            value={money.format(summary.revenueTotal)}
                            note={trendSentence(summary.revenueTrend, t, number)}
                            tone="emerald"
                        />
                        <MetricCard
                            icon={Stethoscope}
                            label={t('analytics.kpis.revenuePerStudy', { defaultValue: 'Revenue per study' })}
                            value={money.format(summary.revenuePerStudy)}
                            note={t('analytics.kpis.revenuePerStudyNote', { defaultValue: 'Net revenue divided by study volume' })}
                            tone="blue"
                        />
                        <MetricCard
                            icon={Activity}
                            label={t('analytics.kpis.studies')}
                            value={integer.format(summary.studies)}
                            note={t('analytics.kpis.studiesNote')}
                            tone="cyan"
                        />
                    </section>

                    <div className="grid gap-6 xl:grid-cols-2">
                        <ChartPanel
                            title={t('analytics.revenue.title')}
                            description={t('analytics.revenue.description')}
                            icon={LineChartIcon}
                            data={revenueData}
                            group={revenueGroup}
                             groups={['date', 'modality', 'room', 'reception', 'payer']}
                            onGroupChange={setRevenueGroup}
                            onExport={() => handleExport('revenue', revenueGroup)}
                            loading={revenue.isLoading || revenue.isFetching}
                            error={revenue.isError}
                            onRetry={revenue.refetch}
                            emptyLabel={t('analytics.revenue.empty')}
                            errorLabel={t('analytics.revenue.error')}
                            valueLabel={t('analytics.revenue.value')}
                            valueFormatter={(value) => money.format(toNumber(value))}
                            color="#10b981"
                            t={t}
                        />
                        <MixPanel
                            icon={PieChartIcon}
                            title={t('analytics.tables.payerTitle', { defaultValue: 'Payer mix' })}
                            description={t('analytics.tables.payerDescription', { defaultValue: 'Revenue concentration by payer.' })}
                            rows={payerRows}
                            loading={payerRevenue.isLoading}
                            valueFormatter={(value) => money.format(value)}
                            locale={locale}
                            t={t}
                        />
                    </div>

                    <LeaderboardPanel
                        icon={Stethoscope}
                        title={t('analytics.tables.modalityTitle', { defaultValue: 'Modality operating mix' })}
                        description={t('analytics.tables.modalityDescription', { defaultValue: 'Volume, revenue, and yield by modality.' })}
                        rows={matrixRows}
                        loading={modalityVolume.isLoading || modalityRevenue.isLoading}
                        emptyLabel={t('analytics.tables.emptyModality', { defaultValue: 'No modality activity was recorded.' })}
                        columns={[
                            [t('analytics.tables.modality', { defaultValue: 'Modality' }), (row) => row.label],
                            [t('analytics.volume.value'), (row) => integer.format(row.studies), 'text-center'],
                            [t('analytics.revenue.value'), (row) => money.format(row.revenue), 'text-end'],
                            [t('analytics.tables.yield', { defaultValue: 'Yield' }), (row) => money.format(row.revenuePerStudy), 'text-end']
                        ]}
                        t={t}
                    />
                </div>
            )}

            {/* Key Snapshots Deck */}
            <section className="grid gap-4 rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:grid-cols-2 xl:grid-cols-4 print:hidden" aria-label={t('analytics.insights.label')}>
                <Snapshot icon={Activity} label={t('analytics.insights.studyVolume')} value={integer.format(summary.studies)} detail={topRow(modalityRows)?.label || t('analytics.noLeader', { defaultValue: 'No leading segment yet' })} />
                <Snapshot icon={TrendingUp} label={t('analytics.insights.revenueTotal')} value={money.format(summary.revenueTotal)} detail={topRow(payerRows)?.label || t('analytics.noLeader', { defaultValue: 'No leading segment yet' })} />
                <Snapshot icon={CalendarDays} label={t('analytics.insights.dailyStudies')} value={number.format(summary.averageDailyStudies)} detail={t('analytics.insights.dailyStudiesHelp')} />
                <Snapshot icon={Download} label={t('analytics.insights.exports')} value="CSV & PDF" detail={t('analytics.insights.exportsHelp')} />
            </section>
        </main>
    );
};

// ─── Sub-Components ───────────────────────────────────────────────────

const DateField = ({ label, value, onChange }) => (
    <label className="grid gap-1">
        <span className="px-1 text-[10px] font-black text-slate-500 dark:text-slate-400">{label}</span>
        <input
            type="date"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            aria-label={label}
            className="h-9 rounded-xl border border-slate-200/80 bg-white px-2.5 text-xs font-black text-slate-800 outline-hidden transition focus:border-teal-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:[color-scheme:dark]"
        />
    </label>
);

const ExportButton = ({ onClick, disabled, label }) => (
    <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3 text-xs font-black text-slate-700 shadow-2xs transition hover:bg-slate-50 hover:text-teal-700 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 cursor-pointer"
    >
        <Download size={14} aria-hidden="true" />
        <span>{label}</span>
    </button>
);

const MetricCard = ({ icon: Icon, label, value, note, tone, loading }) => {
    const tones = {
        cyan: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30 from-cyan-500/10',
        blue: 'bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/30 from-sky-500/10',
        emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 from-emerald-500/10',
        amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30 from-amber-500/10',
        rose: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30 from-rose-500/10',
        violet: 'bg-purple-500/10 text-purple-700 dark:text-purple-300 border-purple-500/30 from-purple-500/10',
        slate: 'bg-slate-500/10 text-slate-700 dark:text-slate-300 border-slate-500/30 from-slate-500/10'
    };
    const toneClass = tones[tone] || tones.cyan;

    return (
        <article className="group relative flex flex-col justify-between overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 p-5 shadow-sm backdrop-blur-xl transition-all duration-200 hover:shadow-md hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900/90 dark:hover:border-slate-700">
            <div className={`pointer-events-none absolute -end-8 -top-8 h-28 w-28 rounded-full bg-gradient-to-bl ${toneClass.split(' ').pop()} to-transparent blur-xl opacity-60 group-hover:opacity-100 transition-opacity`} />

            <div className="flex items-start justify-between gap-3">
                <p className="text-[11px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 truncate">
                    {label}
                </p>
                <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl border ${toneClass.split(' ').slice(0, 3).join(' ')}`}>
                    <Icon size={18} aria-hidden="true" />
                </span>
            </div>

            <div className="mt-3 min-w-0">
                <p className={`truncate text-2xl font-black text-slate-900 dark:text-white sm:text-3xl tabular-nums ${loading ? 'animate-pulse text-slate-300 dark:text-slate-700' : ''}`} aria-live="polite">
                    {loading ? '-' : value}
                </p>
                <p className="mt-1 min-h-5 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {note}
                </p>
            </div>
        </article>
    );
};

const SignalCard = ({ icon: Icon, title, value, detail, tone }) => {
    const tones = {
        emerald: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300',
        amber: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300',
        rose: 'border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300'
    };
    return (
        <article className={`group relative flex min-h-[92px] items-center gap-3.5 rounded-2xl border p-4 shadow-sm backdrop-blur-xl transition-all hover:shadow-md ${tones[tone] || tones.emerald}`}>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/80 dark:bg-slate-900/80 shadow-xs ring-1 ring-black/5 dark:ring-white/10">
                <Icon size={20} className="text-current" />
            </span>
            <div className="min-w-0">
                <p className="text-[10.5px] font-black uppercase tracking-wider opacity-75 truncate">
                    {title}
                </p>
                <p className="mt-0.5 text-xl font-black text-slate-900 dark:text-white tabular-nums truncate">
                    {value}
                </p>
                <p className="mt-0.5 text-xs font-bold opacity-85 truncate">
                    {detail}
                </p>
            </div>
        </article>
    );
};

const InsightCard = ({ icon: Icon, label, value, detail, tone, loading }) => {
    const tones = {
        cyan: 'bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border-cyan-500/30',
        emerald: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30',
        amber: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30',
        rose: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30'
    };
    return (
        <article className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
            <div className="flex items-start gap-3">
                <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-2xl border ${tones[tone] || tones.cyan}`}>
                    <Icon size={19} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 truncate">
                        {label}
                    </p>
                    <p className={`mt-0.5 truncate text-lg font-black text-slate-900 dark:text-white tabular-nums ${loading ? 'animate-pulse text-slate-300 dark:text-slate-700' : ''}`}>
                        {loading ? '-' : value}
                    </p>
                    <p className="mt-0.5 truncate text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {detail}
                    </p>
                </div>
            </div>
        </article>
    );
};

const ManagementDecisionQueue = ({ summary, performance = {}, isArabic, number }) => {
    const decisions = [
        summary.cancellationRate > 5 && {
            tone: 'rose',
            icon: XCircle,
            title: isArabic ? 'مراجعة الإلغاءات' : 'Review cancellations',
            detail: isArabic ? `معدل الإلغاء ${number.format(summary.cancellationRate)}% ويتجاوز حد المتابعة.` : `Cancellation is ${number.format(summary.cancellationRate)}%, above the watch threshold.`,
        },
        toNumber(performance.averageWaitTimeMinutes) > 30 && {
            tone: 'amber',
            icon: Clock3,
            title: isArabic ? 'ضغط على الاستقبال' : 'Front desk pressure',
            detail: isArabic ? `متوسط الانتظار ${number.format(performance.averageWaitTimeMinutes)} دقيقة.` : `Average wait is ${number.format(performance.averageWaitTimeMinutes)} minutes.`,
        },
        toNumber(performance.averageTurnaroundTimeHours) > 12 && {
            tone: 'amber',
            icon: TimerReset,
            title: isArabic ? 'مراجعة زمن الإنجاز' : 'Review turnaround',
            detail: isArabic ? `متوسط الإنجاز ${number.format(performance.averageTurnaroundTimeHours)} ساعة.` : `Average turnaround is ${number.format(performance.averageTurnaroundTimeHours)} hours.`,
        },
    ].filter(Boolean);

    return (
        <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900" aria-labelledby="management-decisions-title">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h2 id="management-decisions-title" className="text-sm font-black text-slate-900 dark:text-white">{isArabic ? 'قائمة قرارات الإدارة' : 'Management decision queue'}</h2>
                    <p className="mt-0.5 text-[11px] font-semibold text-slate-500 dark:text-slate-400">{isArabic ? 'تنبيهات تظهر فقط عند وجود مؤشر يحتاج متابعة.' : 'Only signals that require management follow-up appear here.'}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${decisions.length ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'}`}>
                    {decisions.length ? (isArabic ? `${decisions.length} للمتابعة` : `${decisions.length} to review`) : (isArabic ? 'لا توجد استثناءات' : 'No exceptions')}
                </span>
            </div>
            {decisions.length ? (
                <div className="mt-3 grid gap-2 md:grid-cols-3">
                    {decisions.map(({ title, detail, icon: Icon, tone }) => (
                        <div key={title} className={`flex items-start gap-2.5 rounded-xl border p-3 ${tone === 'rose' ? 'border-rose-200 bg-rose-50/70 dark:border-rose-900/60 dark:bg-rose-950/20' : 'border-amber-200 bg-amber-50/70 dark:border-amber-900/60 dark:bg-amber-950/20'}`}>
                            <Icon size={16} className={tone === 'rose' ? 'mt-0.5 shrink-0 text-rose-600' : 'mt-0.5 shrink-0 text-amber-600'} />
                            <div className="min-w-0"><p className="text-xs font-black text-slate-900 dark:text-white">{title}</p><p className="mt-0.5 text-[11px] font-semibold leading-4 text-slate-600 dark:text-slate-300">{detail}</p></div>
                        </div>
                    ))}
                </div>
            ) : <p className="mt-3 rounded-xl border border-dashed border-emerald-200 bg-emerald-50/50 p-3 text-xs font-bold text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/20 dark:text-emerald-300">{isArabic ? 'مؤشرات التشغيل ضمن حدود المتابعة الحالية.' : 'Operating indicators are within the current watch thresholds.'}</p>}
        </section>
    );
};

const ChartPanel = ({
    title,
    description,
    icon: Icon,
    data,
    group,
    groups,
    onGroupChange,
    onExport,
    loading,
    error,
    onRetry,
    emptyLabel,
    errorLabel,
    valueLabel,
    valueFormatter,
    color = '#0d9488',
    t
}) => (
    <section className="min-w-0 overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90" aria-labelledby={`${group}-${title.replace(/\s+/g, '-')}`}>
        <div className="border-b border-slate-100 p-5 dark:border-slate-800 sm:p-6">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="flex min-w-0 items-start gap-3.5">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/30">
                        <Icon size={20} aria-hidden="true" />
                    </span>
                    <div>
                        <h2 className="text-base font-black text-slate-900 dark:text-white">{title}</h2>
                        <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">{description}</p>
                    </div>
                </div>
                <button
                    type="button"
                    onClick={onExport}
                    className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-teal-600 px-3.5 py-2 text-xs font-black text-white shadow-xs transition hover:bg-teal-500 active:scale-95 cursor-pointer"
                >
                    <Download size={14} aria-hidden="true" />
                    <span>{t('analytics.export')}</span>
                </button>
            </div>
            <div className="mt-4 flex gap-1 overflow-x-auto rounded-xl bg-slate-100/80 p-1 dark:bg-slate-950/60" aria-label={t('analytics.groupBy')}>
                {groups.map((item) => (
                    <button
                        key={item}
                        type="button"
                        onClick={() => onGroupChange(item)}
                        aria-pressed={group === item}
                        className={`min-w-fit flex-1 rounded-lg px-3 py-1.5 text-xs font-black transition cursor-pointer ${group === item
                            ? 'bg-white text-teal-700 shadow-xs dark:bg-slate-800 dark:text-teal-300'
                            : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-300'
                            }`}
                    >
                        {t(`analytics.groups.${item}`)}
                    </button>
                ))}
            </div>
        </div>

        <div className="p-4 sm:p-6">
            {loading ? (
                <ChartSkeleton label={t('analytics.loading')} />
            ) : error ? (
                <ErrorState label={errorLabel} onRetry={onRetry} t={t} />
            ) : data.length === 0 ? (
                <EmptyChart label={emptyLabel} />
            ) : (
                <AccessibleChartData
                    title={title}
                    summary={t('analytics.chartSummary', { count: data.length, title, defaultValue: '{{count}} data points in {{title}}.' })}
                    rows={data}
                    columns={[
                        { key: 'label', label: t(`analytics.groups.${group}`) },
                        { key: 'value', label: valueLabel, render: row => valueFormatter(row.value) },
                    ]}
                    disclosureLabel={t('analytics.viewChartData', { defaultValue: 'View chart data' })}
                    tableLabel={t('analytics.chartDataTable', { title, defaultValue: '{{title}} data' })}
                    className="overflow-x-auto pb-2"
                >
                    <div className="h-80 w-full min-w-[300px]">
                        <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={280}>
                            {group === 'date' ? (
                                <AreaChart data={data} margin={{ top: 8, right: 14, left: 0, bottom: 8 }}>
                                    <defs>
                                        <linearGradient id={`areaGrad-${group}`} x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={color} stopOpacity={0.3} />
                                            <stop offset="95%" stopColor={color} stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="currentColor" className="text-slate-100 dark:text-slate-800" />
                                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 700 }} dy={10} minTickGap={24} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 700 }} tickFormatter={valueFormatter} width={70} />
                                    <Tooltip formatter={(value) => [valueFormatter(value), valueLabel]} contentStyle={chartTooltipStyle} />
                                    <Area type="monotone" dataKey="value" stroke={color} strokeWidth={3} fill={`url(#areaGrad-${group})`} name={valueLabel} />
                                </AreaChart>
                            ) : (
                                <BarChart data={data} margin={{ top: 8, right: 14, left: 0, bottom: 8 }}>
                                    <CartesianGrid strokeDasharray="4 4" vertical={false} stroke="currentColor" className="text-slate-100 dark:text-slate-800" />
                                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 700 }} dy={10} minTickGap={12} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8', fontWeight: 700 }} tickFormatter={valueFormatter} width={70} />
                                    <Tooltip formatter={(value) => [valueFormatter(value), valueLabel]} cursor={{ fill: 'rgba(241, 245, 249, 0.4)' }} contentStyle={chartTooltipStyle} />
                                    <Bar dataKey="value" fill={color} radius={[8, 8, 0, 0]} maxBarSize={48} name={valueLabel} />
                                </BarChart>
                            )}
                        </ResponsiveContainer>
                    </div>
                </AccessibleChartData>
            )}
        </div>
    </section>
);

const LeaderboardPanel = ({ icon: Icon, title, description, rows, columns, loading, emptyLabel, t }) => (
    <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
        <PanelHeader icon={Icon} title={title} description={description} />
        <div className="p-4">
            {loading ? (
                <PanelSkeleton />
            ) : rows.length ? (
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[400px] border-separate border-spacing-0 text-start">
                        <thead>
                            <tr>
                                {columns.map(([label, , align = 'text-start']) => (
                                    <th key={label} className={`border-b border-slate-100 dark:border-slate-800 px-3 py-2.5 text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 ${align}`}>
                                        {label}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {rows.map((row, index) => (
                                <tr key={`${row.label || row.id || index}-${index}`} className="transition hover:bg-slate-50/80 dark:hover:bg-slate-800/40">
                                    {columns.map(([label, render, align = 'text-start'], columnIndex) => (
                                        <td key={label} className={`px-3 py-3 text-xs font-bold text-slate-700 dark:text-slate-200 ${align}`}>
                                            {columnIndex === 0 ? <span className="line-clamp-1">{render(row)}</span> : render(row)}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ) : (
                <EmptyChart label={emptyLabel || t('analytics.states.noData', { defaultValue: 'No data' })} />
            )}
        </div>
    </section>
);

const MixPanel = ({ icon: Icon, title, description, rows, loading, valueFormatter, locale, t }) => {
    const total = useMemo(() => rows.reduce((sum, item) => sum + toNumber(item.value), 0), [rows]);

    return (
        <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
            <PanelHeader icon={Icon} title={title} description={description} />
            <div className="p-4 sm:p-6">
                {loading ? (
                    <PanelSkeleton />
                ) : rows.length ? (
                    <div className="space-y-4">
                        <div className="h-56 w-full min-w-0">
                            <ResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={0}>
                                <PieChart>
                                    <Pie data={rows} dataKey="value" nameKey="label" innerRadius={54} outerRadius={80} paddingAngle={4}>
                                        {rows.map((_, index) => (
                                            <Cell key={`mix-cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} stroke="transparent" />
                                        ))}
                                    </Pie>
                                    <Tooltip formatter={(value) => [valueFormatter(value), t('analytics.values.revenue', { defaultValue: 'Revenue' })]} contentStyle={chartTooltipStyle} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                        <ul className="space-y-2 text-xs font-bold divide-y divide-slate-100 dark:divide-slate-800">
                            {rows.map((row, index) => {
                                const share = total > 0 ? (toNumber(row.value) / total) * 100 : 0;
                                return (
                                    <li key={row.label || index} className="flex items-center justify-between pt-2">
                                        <span className="flex items-center gap-2 text-slate-600 dark:text-slate-300">
                                            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }} />
                                            <span className="truncate">{row.label || t('analytics.unknown', { defaultValue: 'Unknown' })}</span>
                                        </span>
                                        <span className="text-slate-900 dark:text-white tabular-nums font-black">
                                            {new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(share)}%
                                        </span>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ) : (
                    <EmptyChart label={t('analytics.tables.emptyPayers', { defaultValue: 'No payer revenue was recorded.' })} />
                )}
            </div>
        </section>
    );
};

const PanelHeader = ({ icon: Icon, title, description }) => (
    <div className="flex items-center gap-3.5 border-b border-slate-100 p-5 dark:border-slate-800">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/30">
            <Icon size={19} aria-hidden="true" />
        </span>
        <div className="min-w-0">
            <h2 className="truncate text-base font-black text-slate-900 dark:text-white">{title}</h2>
            <p className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{description}</p>
        </div>
    </div>
);

const Snapshot = ({ icon: Icon, label, value, detail }) => (
    <div className="flex items-center gap-3.5">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <Icon size={19} aria-hidden="true" />
        </span>
        <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 truncate">{label}</p>
            <p className="text-base font-black text-slate-900 dark:text-white tabular-nums truncate">{value}</p>
            <p className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 truncate">{detail}</p>
        </div>
    </div>
);

const EmptyChart = ({ label }) => (
    <div className="grid h-72 place-content-center text-center text-xs font-bold text-slate-400">
        <Activity size={32} className="mx-auto text-slate-300 mb-2 dark:text-slate-700" />
        <p>{label}</p>
    </div>
);

const ErrorState = ({ label, onRetry, t }) => (
    <div className="grid h-72 place-content-center text-center text-xs font-bold text-rose-500">
        <AlertTriangle size={32} className="mx-auto mb-2 opacity-80" />
        <p>{label}</p>
        <button
            type="button"
            onClick={onRetry}
            className="mx-auto mt-3 rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-black text-rose-700 hover:bg-rose-100 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300 cursor-pointer"
        >
            {t('analytics.actions.retry', { defaultValue: 'Retry' })}
        </button>
    </div>
);

const ChartSkeleton = ({ label }) => (
    <div className="flex h-80 flex-col items-center justify-center gap-3 text-xs font-bold text-slate-400">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-teal-500/30 border-t-teal-600" />
        <p>{label}</p>
    </div>
);

const PanelSkeleton = () => (
    <div className="space-y-3 p-4">
        {[1, 2, 3, 4].map((item) => (
            <div key={item} className="h-10 animate-pulse rounded-xl bg-slate-100 dark:bg-slate-800" />
        ))}
    </div>
);

export default AnalyticsDashboard;
