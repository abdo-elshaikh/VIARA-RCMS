import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import {
    Activity,
    Award,
    BarChart3,
    Calendar,
    CheckSquare,
    ChevronDown,
    ChevronUp,
    Download,
    HeartHandshake,
    Megaphone,
    MessageCircle,
    Network,
    Plus,
    RefreshCw,
    Send,
    Sparkles,
    Star,
    Stethoscope,
    TrendingUp,
    UserCheck,
    Users,
    Zap
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import CampaignManager from '../components/crm/CampaignManager';
import TaskBoard from '../components/crm/TaskBoard';
import FeedbackDashboard from '../components/crm/FeedbackDashboard';
import ReferralsTab from '../components/marketing/ReferralsTab';
import MarketingDashboard from '../components/marketing/MarketingDashboard';
import { selectCurrentUser } from '../store/authSlice';
import { hasDeveloperOrAdminRole } from '../utils/roles';
import PageHeader from '../components/ui/PageHeader';
import {
    useGetCampaignsQuery,
    useGetCrmActivitiesQuery,
    useGetFeedbackQuery,
    useGetReferralAnalyticsQuery,
    useGetSegmentsQuery
} from '../store/api';

const DAY = 24 * 60 * 60 * 1000;
const isoDate = (date) => date.toISOString().split('T')[0];

const formatMoney = (val, currency = 'EGP') => {
    const formatted = new Intl.NumberFormat(undefined, {
        style: 'currency',
        currency,
        maximumFractionDigits: 0
    }).format(Number(val || 0));
    return formatted.replace(/\s+/g, '\u00A0');
};

const Marketing = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const { t, i18n } = useTranslation('workspace');
    const isArabic = i18n.language?.startsWith('ar');
    const isRtl = i18n.dir() === 'rtl';
    const user = useSelector(selectCurrentUser);
    const hasSystemRole = hasDeveloperOrAdminRole(user?.role);

    const canViewCampaigns = hasSystemRole || ['Receptionist', 'Marketing'].includes(user?.role);
    const canViewTasks = hasSystemRole || ['Receptionist', 'HR', 'Marketing'].includes(user?.role);
    const canViewFeedback = hasSystemRole || ['Receptionist', 'Marketing'].includes(user?.role);
    const canViewReferrals = hasSystemRole || ['Accountant', 'Marketing'].includes(user?.role);
    const canViewDashboard = canViewCampaigns || canViewTasks || canViewFeedback || canViewReferrals;

    const referralRange = useMemo(() => ({
        startDate: isoDate(new Date(Date.now() - 30 * DAY)),
        endDate: isoDate(new Date())
    }), []);

    const campaignsQuery = useGetCampaignsQuery(undefined, { skip: !canViewCampaigns });
    const segmentsQuery = useGetSegmentsQuery(undefined, { skip: !canViewCampaigns });
    const tasksQuery = useGetCrmActivitiesQuery({}, { skip: !canViewTasks });
    const feedbackQuery = useGetFeedbackQuery(undefined, { skip: !canViewFeedback });
    const referralsQuery = useGetReferralAnalyticsQuery(referralRange, { skip: !canViewReferrals });

    const campaigns = Array.isArray(campaignsQuery.data) ? campaignsQuery.data : [];
    const segments = Array.isArray(segmentsQuery.data) ? segmentsQuery.data : [];
    const tasks = Array.isArray(tasksQuery.data) ? tasksQuery.data : [];
    const feedback = Array.isArray(feedbackQuery.data) ? feedbackQuery.data : [];
    const referralDoctors = Array.isArray(referralsQuery.data?.topDoctors) ? referralsQuery.data.topDoctors : [];

    const now = Date.now();
    const activeCampaigns = campaigns.filter(item => item.status === 'Active').length;
    const pendingTasks = tasks.filter(item => item.status === 'Pending').length;
    const overdueTasks = tasks.filter(item => item.status === 'Pending' && item.due_date && new Date(item.due_date).getTime() < now).length;
    const averageRating = feedback.length ? (feedback.reduce((sum, item) => sum + Number(item.rating || 0), 0) / feedback.length).toFixed(1) : '5.0';
    const lowFeedback = feedback.filter(item => Number(item.rating) <= 2).length;
    const referralVolume = referralDoctors.reduce((sum, item) => sum + Number(item.totalExams || 0), 0);
    const referralRevenue = referralDoctors.reduce((sum, item) => sum + Number(item.totalRevenue || 0), 0);

    const headerLoading = campaignsQuery.isLoading || tasksQuery.isLoading || feedbackQuery.isLoading || referralsQuery.isLoading;
    const headerFetching = campaignsQuery.isFetching || tasksQuery.isFetching || feedbackQuery.isFetching || referralsQuery.isFetching;

    const refreshHeader = () => {
        if (canViewCampaigns) {
            campaignsQuery.refetch();
            segmentsQuery.refetch();
        }
        if (canViewTasks) tasksQuery.refetch();
        if (canViewFeedback) feedbackQuery.refetch();
        if (canViewReferrals) referralsQuery.refetch();
    };

    const tabs = useMemo(() => [
        {
            id: 'dashboard',
            icon: BarChart3,
            label: isArabic ? 'لوحة الأداء والنمو' : 'Overview & Growth KPIs',
            badge: `${campaigns.length} ${isArabic ? 'حملات' : 'campaigns'}`,
            visible: canViewDashboard
        },
        {
            id: 'campaigns',
            icon: Megaphone,
            label: isArabic ? 'الحملات والشرائح الموجهة' : 'Promotional Campaigns',
            badge: activeCampaigns > 0 ? `${activeCampaigns} ${isArabic ? 'نشطة' : 'active'}` : null,
            visible: canViewCampaigns
        },
        {
            id: 'tasks',
            icon: CheckSquare,
            label: isArabic ? 'متابعات ومهام CRM' : 'CRM Task Board',
            badge: pendingTasks > 0 ? `${pendingTasks}` : null,
            visible: canViewTasks
        },
        {
            id: 'feedback',
            icon: MessageCircle,
            label: isArabic ? 'رضا المرضى والتقييمات' : 'Patient Feedback & CSAT',
            badge: `${averageRating}★`,
            visible: canViewFeedback
        },
        {
            id: 'referrals',
            icon: Stethoscope,
            label: isArabic ? 'شبكة الأطباء والإحالات' : 'Referring Network & Doctors',
            badge: `${referralDoctors.length} ${isArabic ? 'أطباء' : 'doctors'}`,
            visible: canViewReferrals
        },
    ].filter(tab => tab.visible), [
        canViewCampaigns,
        canViewDashboard,
        canViewFeedback,
        canViewReferrals,
        canViewTasks,
        isArabic,
        campaigns.length,
        activeCampaigns,
        pendingTasks,
        averageRating,
        referralDoctors.length
    ]);

    const requestedTab = searchParams.get('tab');
    const safeTab = tabs.some(tab => tab.id === requestedTab) ? requestedTab : (tabs[0]?.id || 'dashboard');
    const setActiveTab = (tab) => setSearchParams((current) => { const next = new URLSearchParams(current); next.set('tab', tab); return next; }, { replace: true });

    return (
        <main className="mx-auto max-w-[1680px] space-y-4" dir={isRtl ? 'rtl' : 'ltr'}>
            {/* 1. Unified PageHeader */}
            <PageHeader
                icon={Megaphone}
                eyebrowIcon={Network}
                eyebrow={isArabic ? 'التسويق وعلاقات المرضى والإحالات الطبية' : 'Growth, Patient Engagement & CRM'}
                title={isArabic ? 'منظومة التسويق وإدارة علاقات المرضى' : 'Marketing, Growth & Patient CRM'}
                description={isArabic
                    ? 'إدارة الحملات الترويجية والرسائل التفاعلية، قياس رضا وتقييمات المرضى، متابعة مهام الـ CRM، وتحليل شبكة إحالات الأطباء.'
                    : 'Track multi-channel promotional campaigns, patient feedback, CRM task workflows, and doctor referral networks.'}
                meta={
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-bold text-teal-700 dark:text-teal-300">
                            <span className="relative flex h-2 w-2">
                                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-75" />
                                <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-500" />
                            </span>
                            <span>{isArabic ? 'محرك النمو والعلاقات نشط' : 'Growth Engine Active'}</span>
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                            {segments.length} {isArabic ? 'شرائح مستهدفة' : 'Audience Segments'}
                        </span>
                        <span className="rounded-full border border-slate-200 bg-white/80 px-3 py-1 text-xs font-bold text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                            {isArabic ? 'آخر ٣٠ يوماً' : '30-Day Window'}
                        </span>
                    </div>
                }
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        {canViewCampaigns && (
                            <button
                                type="button"
                                onClick={() => setActiveTab('campaigns')}
                                className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-4 text-xs font-bold text-white shadow-md shadow-teal-600/20 transition hover:brightness-110"
                            >
                                <Plus size={15} />
                                <span>{isArabic ? 'حملة ترويجية جديدة' : 'New Campaign'}</span>
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={refreshHeader}
                            disabled={headerFetching}
                            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300"
                        >
                            <RefreshCw size={14} className={headerFetching ? 'animate-spin text-teal-600' : ''} />
                            <span>{isArabic ? 'تحديث السجلات' : 'Refresh'}</span>
                        </button>
                    </div>
                }
                metrics={[
                    canViewCampaigns && {
                        key: 'campaigns',
                        icon: Megaphone,
                        label: isArabic ? 'الحملات التسويقية النشطة' : 'Active Campaigns',
                        value: activeCampaigns,
                        detail: `${campaigns.length} ${isArabic ? 'إجمالي الحملات' : 'total campaigns'}`,
                        tone: 'teal',
                        loading: headerLoading,
                        error: campaignsQuery.isError
                    },
                    canViewTasks && {
                        key: 'tasks',
                        icon: CheckSquare,
                        label: isArabic ? 'مهام ومتابعات CRM' : 'Pending CRM Tasks',
                        value: pendingTasks,
                        detail: overdueTasks > 0 ? `${overdueTasks} ${isArabic ? 'متأخرة' : 'overdue'}` : (isArabic ? 'مكتملة ومحدثة' : 'On schedule'),
                        tone: overdueTasks > 0 ? 'rose' : pendingTasks > 0 ? 'amber' : 'emerald',
                        loading: headerLoading,
                        error: tasksQuery.isError
                    },
                    canViewFeedback && {
                        key: 'feedback',
                        icon: Star,
                        label: isArabic ? 'مؤشر رضا المرضى (CSAT)' : 'Patient CSAT Rating',
                        value: `${averageRating} / 5`,
                        detail: `${feedback.length} ${isArabic ? 'استجابة وتقييم' : 'reviews'}`,
                        tone: Number(averageRating) >= 4.0 ? 'emerald' : 'amber',
                        loading: headerLoading,
                        error: feedbackQuery.isError
                    },
                    canViewReferrals && {
                        key: 'referrals',
                        icon: Stethoscope,
                        label: isArabic ? 'إيرادات الإحالات الطبية (30 يوم)' : 'Referral Revenue (30d)',
                        value: formatMoney(referralRevenue, 'EGP'),
                        detail: `${referralVolume} ${isArabic ? 'فحص مُحال' : 'referred exams'}`,
                        tone: 'indigo',
                        loading: headerLoading,
                        error: referralsQuery.isError
                    }
                ].filter(Boolean)}
                metricsLabel={isArabic ? 'مؤشرات التسويق والنمو' : 'Marketing & Growth Indicators'}
            />

            {/* 2. Single-Tier Segmented Tabs Navigation Bar */}
<div data-workspace-tabs className="rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 shadow-sm dark:border-slate-800 dark:bg-slate-900/90 lg:hidden">
                <nav aria-label={isArabic ? 'أقسام التسويق' : 'Marketing sections'} className="flex flex-wrap gap-1">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        const isActive = safeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                aria-current={isActive ? 'page' : undefined}
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex min-h-9 items-center gap-2 rounded-xl px-4 py-1.5 text-xs font-bold transition-all ${isActive
                                        ? 'bg-teal-700 text-white shadow-sm font-black'
                                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800'
                                    }`}
                            >
                                <Icon size={14} aria-hidden="true" />
                                <span className="whitespace-nowrap">{tab.label}</span>
                                {tab.badge && (
                                    <span className={`rounded-md px-1.5 py-0.2 text-[10px] font-black whitespace-nowrap ${isActive
                                            ? 'bg-teal-900/60 text-teal-200'
                                            : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                                        }`}>
                                        {tab.badge}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </nav>
            </div>

            {/* 3. Tab Component Views */}
            <div className="transition-all duration-300">
                {safeTab === 'dashboard' && <MarketingDashboard onOpenTab={setActiveTab} />}
                {safeTab === 'campaigns' && <CampaignManager />}
                {safeTab === 'tasks' && <TaskBoard />}
                {safeTab === 'feedback' && <FeedbackDashboard />}
                {safeTab === 'referrals' && <ReferralsTab />}
            </div>
        </main>
    );
};

export default Marketing;
