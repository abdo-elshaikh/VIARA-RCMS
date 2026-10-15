import { useCallback, useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import {
    AlertTriangle,
    BarChart3,
    CalendarClock,
    CheckCircle2,
    Megaphone,
    MessageCircle,
    Network,
    Send,
    Star,
    Target,
    Users
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import {
    useGetCampaignsQuery,
    useGetCrmActivitiesQuery,
    useGetFeedbackQuery,
    useGetReferralAnalyticsQuery,
    useGetSegmentsQuery
} from '../../store/api';
import { selectCurrentUser } from '../../store/authSlice';
import { hasDeveloperOrAdminRole } from '../../utils/roles';

const DAY = 24 * 60 * 60 * 1000;
const isoDate = (date) => date.toISOString().split('T')[0];
const toneClass = {
    cyan: 'bg-cyan-50 text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-300',
    emerald: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300',
    amber: 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300',
    rose: 'bg-rose-50 text-rose-700 dark:bg-rose-400/10 dark:text-rose-300',
    slate: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    pink: 'bg-pink-50 text-pink-700 dark:bg-pink-400/10 dark:text-pink-300'
};

const MarketingDashboard = ({ onOpenTab }) => {
    const { t, i18n } = useTranslation('workspace');
    const isArabic = i18n.language?.startsWith('ar');
    const copy = useCallback((key, options) => t(`marketing.dashboard.${key}`, options), [t]);
    const user = useSelector(selectCurrentUser);
    const locale = isArabic ? 'ar-EG' : 'en-EG';
    const hasSystemRole = hasDeveloperOrAdminRole(user?.role);

    const canCampaigns = hasSystemRole || ['Receptionist', 'Marketing'].includes(user?.role);
    const canTasks = hasSystemRole || ['Receptionist', 'HR', 'Marketing'].includes(user?.role);
    const canFeedback = hasSystemRole || ['Receptionist', 'Marketing'].includes(user?.role);
    const canReferrals = hasSystemRole || ['Accountant', 'Marketing'].includes(user?.role);

    const [rangeDays, setRangeDays] = useState(30);
    const referralRange = useMemo(() => ({
        startDate: isoDate(new Date(Date.now() - (rangeDays - 1) * DAY)),
        endDate: isoDate(new Date())
    }), [rangeDays]);

    const { data: campaigns = [], isLoading: campaignsLoading } = useGetCampaignsQuery(undefined, { skip: !canCampaigns });
    const { data: segments = [], isLoading: segmentsLoading } = useGetSegmentsQuery(undefined, { skip: !canCampaigns });
    const { data: activities = [], isLoading: tasksLoading } = useGetCrmActivitiesQuery({}, { skip: !canTasks });
    const { data: feedback = [], isLoading: feedbackLoading } = useGetFeedbackQuery(undefined, { skip: !canFeedback });
    const { data: referrals, isLoading: referralsLoading } = useGetReferralAnalyticsQuery(referralRange, { skip: !canReferrals });

    const now = Date.now();
    const number = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }), [locale]);
    const formatMoney = useCallback((val) => {
        const formatted = new Intl.NumberFormat(locale, { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }).format(Number(val || 0));
        return formatted.replace(/\s+/g, '\u00A0');
    }, [locale]);

    const campaignStats = useMemo(() => {
        const total = campaigns.length;
        const active = campaigns.filter(item => item.status === 'Active').length;
        const draft = campaigns.filter(item => item.status === 'Draft').length;
        const queued = campaigns.reduce((sum, item) => sum + Number(item.queued_count || 0), 0);
        const sent = campaigns.reduce((sum, item) => sum + Number(item.sent_count || 0), 0);
        const failed = campaigns.reduce((sum, item) => sum + Number(item.failed_count || 0), 0);
        const skipped = campaigns.reduce((sum, item) => sum + Number(item.skipped_count || 0), 0);
        const recipients = campaigns.reduce((sum, item) => sum + Number(item.recipient_count || 0), 0);
        const budget = campaigns.reduce((sum, item) => sum + Number(item.budget || 0), 0);
        const deliveredBase = sent + failed + skipped;
        const health = deliveredBase ? Math.round((sent / deliveredBase) * 100) : 0;
        return { total, active, draft, queued, sent, failed, skipped, recipients, budget, health };
    }, [campaigns]);

    const channelMix = useMemo(() => {
        const grouped = campaigns.reduce((acc, campaign) => {
            const key = campaign.channel || 'Other';
            acc[key] = (acc[key] || 0) + 1;
            return acc;
        }, {});
        return Object.entries(grouped)
            .map(([label, value]) => ({ label, value }))
            .sort((a, b) => b.value - a.value);
    }, [campaigns]);

    const taskStats = useMemo(() => {
        const pending = activities.filter(item => item.status === 'Pending').length;
        const overdue = activities.filter(item => item.status === 'Pending' && item.due_date && new Date(item.due_date).getTime() < now).length;
        const completed = activities.filter(item => item.status === 'Completed').length;
        return { pending, overdue, completed };
    }, [activities, now]);

    const feedbackStats = useMemo(() => {
        const total = feedback.length;
        const average = total ? feedback.reduce((sum, item) => sum + Number(item.rating || 0), 0) / total : 0;
        const low = feedback.filter(item => Number(item.rating) <= 2).length;
        return { total, average, low };
    }, [feedback]);

    const referralStats = useMemo(() => {
        const doctors = referrals?.topDoctors || [];
        const sources = referrals?.sources || [];
        return {
            doctors,
            sources,
            referrals: doctors.reduce((sum, item) => sum + Number(item.totalExams || 0), 0),
            revenue: doctors.reduce((sum, item) => sum + Number(item.totalRevenue || 0), 0),
            topDoctor: doctors[0]?.doctorName || '-',
            topSource: sources[0]?.label || '-'
        };
    }, [referrals]);

    const alerts = useMemo(() => [
        {
            key: 'failedSends',
            icon: AlertTriangle,
            value: campaignStats.failed,
            label: copy('failedSends'),
            detail: copy('failedSendsDetail'),
            tone: campaignStats.failed ? 'rose' : 'emerald',
            tab: 'campaigns'
        },
        {
            key: 'overdueTasks',
            icon: CalendarClock,
            value: taskStats.overdue,
            label: copy('overdueTasks'),
            detail: copy('overdueTasksDetail'),
            tone: taskStats.overdue ? 'rose' : 'emerald',
            tab: 'tasks'
        },
        {
            key: 'draftCampaigns',
            icon: Megaphone,
            value: campaignStats.draft,
            label: copy('draftCampaigns'),
            detail: copy('draftCampaignsDetail'),
            tone: campaignStats.draft ? 'amber' : 'slate',
            tab: 'campaigns'
        },
        {
            key: 'lowFeedback',
            icon: MessageCircle,
            value: feedbackStats.low,
            label: copy('lowFeedback'),
            detail: copy('lowFeedbackDetail'),
            tone: feedbackStats.low ? 'rose' : 'emerald',
            tab: 'feedback'
        }
    ], [campaignStats.draft, campaignStats.failed, copy, feedbackStats.low, taskStats.overdue]);

    const recentCampaigns = useMemo(() => {
        return [...campaigns]
            .sort((a, b) => new Date(b.created_at || b.start_date || 0) - new Date(a.created_at || a.start_date || 0))
            .slice(0, 5);
    }, [campaigns]);

    const nextTasks = useMemo(() => {
        return activities
            .filter(item => item.status === 'Pending')
            .sort((a, b) => {
                if (!a.due_date) return 1;
                if (!b.due_date) return -1;
                return new Date(a.due_date) - new Date(b.due_date);
            })
            .slice(0, 5);
    }, [activities]);

    const isLoading = campaignsLoading || segmentsLoading || tasksLoading || feedbackLoading || referralsLoading;

    return (
        <div className="space-y-6">
            {/* Top KPI Metrics Row */}
            <section className="grid grid-cols-2 gap-4 xl:grid-cols-4" aria-label={copy('pipelineTitle')}>
                <Metric
                    icon={Send}
                    label={copy('deliveryHealth')}
                    value={`${campaignStats.health}%`}
                    detail={`${number.format(campaignStats.sent)} ${copy('sent')}`}
                    tone={campaignStats.health >= 85 ? 'emerald' : campaignStats.health >= 60 ? 'amber' : 'cyan'}
                    loading={campaignsLoading}
                />
                <Metric
                    icon={CalendarClock}
                    label={copy('pendingTasks')}
                    value={taskStats.pending}
                    detail={taskStats.overdue > 0 ? `${taskStats.overdue} ${isArabic ? 'متأخرة' : 'overdue'}` : (isArabic ? 'مكتملة ومحدثة' : 'On schedule')}
                    tone={taskStats.overdue > 0 ? 'rose' : taskStats.pending > 0 ? 'amber' : 'emerald'}
                    loading={tasksLoading}
                />
                <Metric
                    icon={Star}
                    label={copy('satisfaction')}
                    value={feedbackStats.total ? `${feedbackStats.average.toFixed(1)} ★` : '-'}
                    detail={`${feedbackStats.total} ${isArabic ? 'تقييم واستجابة' : 'reviews'}`}
                    tone={feedbackStats.average >= 4 ? 'emerald' : feedbackStats.average >= 3 ? 'amber' : 'rose'}
                    loading={feedbackLoading}
                />
                <Metric
                    icon={Network}
                    label={copy('referralRevenue')}
                    value={formatMoney(referralStats.revenue)}
                    detail={`${number.format(referralStats.referrals)} ${copy('referrals30')}`}
                    tone="cyan"
                    loading={referralsLoading}
                />
            </section>

            {/* Performance Panels */}
            <section className="grid gap-5 xl:grid-cols-3">
                <Panel
                    title={copy('pipelineTitle')}
                    description={copy('pipelineDescription')}
                    icon={Megaphone}
                    action={
                        <button
                            type="button"
                            onClick={() => onOpenTab?.('campaigns')}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        >
                            {copy('openCampaigns')}
                        </button>
                    }
                >
                    <div className="space-y-4">
                        <Progress label={copy('sent')} value={campaignStats.sent} total={campaignStats.recipients || campaignStats.sent || 1} tone="emerald" />
                        <Progress label={copy('queued')} value={campaignStats.queued} total={campaignStats.recipients || 1} tone="cyan" />
                        <Progress label={copy('failed')} value={campaignStats.failed} total={campaignStats.recipients || 1} tone="rose" />
                        <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-black dark:border-slate-800">
                            <span className="text-slate-500">{copy('totalAudience')}</span>
                            <span className="font-mono text-slate-900 dark:text-white">{number.format(campaignStats.recipients)}</span>
                        </div>
                    </div>
                </Panel>

                <Panel
                    title={copy('taskPulse')}
                    description={copy('taskPulseDescription')}
                    icon={CalendarClock}
                    action={
                        <button
                            type="button"
                            onClick={() => onOpenTab?.('tasks')}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                        >
                            {copy('openBoard')}
                        </button>
                    }
                >
                    <div className="space-y-4">
                        <Progress label={copy('completed')} value={taskStats.completed} total={(taskStats.completed + taskStats.pending) || 1} tone="emerald" />
                        <Progress label={copy('pending')} value={taskStats.pending} total={(taskStats.completed + taskStats.pending) || 1} tone="amber" />
                        <Progress label={copy('overdue')} value={taskStats.overdue} total={(taskStats.completed + taskStats.pending) || 1} tone="rose" />
                        <div className="flex items-center justify-between border-t border-slate-100 pt-3 text-xs font-black dark:border-slate-800">
                            <span className="text-slate-500">{copy('activeWorkflows')}</span>
                            <span className="font-mono text-slate-900 dark:text-white">{number.format(activities.length)}</span>
                        </div>
                    </div>
                </Panel>

                <Panel
                    title={copy('referralTitle')}
                    description={copy('referralDescription')}
                    icon={Network}
                    action={
                        <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1 dark:bg-slate-800 text-[11px] font-bold">
                            {[7, 30, 90].map(days => (
                                <button
                                    key={days}
                                    type="button"
                                    onClick={() => setRangeDays(days)}
                                    className={`rounded-lg px-2.5 py-1 transition ${rangeDays === days ? 'bg-white shadow-xs text-teal-700 dark:bg-slate-900 dark:text-teal-300 font-black' : 'text-slate-500'}`}
                                >
                                    {days} {isArabic ? 'يوم' : 'd'}
                                </button>
                            ))}
                        </div>
                    }
                >
                    <div className="grid gap-3">
                        <MiniStat label={copy('referrals30')} value={number.format(referralStats.referrals)} loading={referralsLoading} />
                        <MiniStat label={copy('referralRevenue')} value={formatMoney(referralStats.revenue)} loading={referralsLoading} />
                        <MiniStat label={copy('topDoctor')} value={referralStats.topDoctor} loading={referralsLoading} />
                        <MiniStat label={copy('topSource')} value={referralStats.topSource} loading={referralsLoading} />
                    </div>
                </Panel>
            </section>

            {/* Mix & Attention Rows */}
            <section className="grid gap-5 xl:grid-cols-[minmax(360px,.8fr)_minmax(0,1.2fr)]">
                <Panel title={copy('mixTitle')} description={copy('mixDescription')} icon={BarChart3}>
                    <div className="space-y-5">
                        <MixList title={copy('channelMix')} items={channelMix} empty={copy('noChannelMix')} />
                        <MixList title={copy('sourceMix')} items={referralStats.sources.slice(0, 5)} empty={copy('noSourceMix')} />
                    </div>
                </Panel>

                <Panel title={copy('attentionTitle')} description={copy('attentionDescription')} icon={AlertTriangle}>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {alerts.map(alert => <AlertCard key={alert.key} alert={alert} onOpenTab={onOpenTab} isArabic={isArabic} />)}
                    </div>
                </Panel>
            </section>

            {/* Recent Campaigns and Next Actions */}
            <section className="grid gap-5 xl:grid-cols-2">
                <Panel title={copy('recentCampaigns')} description={copy('recentCampaignsDescription')} icon={Target}>
                    {recentCampaigns.length ? (
                        <div className="space-y-3">
                            {recentCampaigns.map(campaign => <CampaignRow key={campaign.campaign_id} campaign={campaign} copy={copy} />)}
                        </div>
                    ) : <Empty icon={Megaphone} label={copy('noCampaigns')} />}
                </Panel>

                <Panel
                    title={copy('nextActions')}
                    description={copy('nextActionsDescription')}
                    icon={CheckCircle2}
                    action={
                        <button
                            type="button"
                            onClick={() => onOpenTab?.('tasks')}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-600 shadow-xs hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                        >
                            {copy('openTasks')}
                        </button>
                    }
                >
                    {nextTasks.length ? (
                        <div className="space-y-3">
                            {nextTasks.map(task => <TaskRow key={task.activity_id} task={task} locale={locale} copy={copy} />)}
                        </div>
                    ) : <Empty icon={Users} label={copy('noTasks')} />}
                </Panel>
            </section>

            {isLoading ? <p className="text-center text-xs font-bold text-slate-400">{copy('loading')}</p> : null}
        </div>
    );
};

const Metric = ({ icon: Icon, label, value, detail, tone, loading }) => (
    <article className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
                <p className="truncate text-[10px] font-black uppercase leading-4 tracking-wider text-slate-400">{label}</p>
                <p className={`mt-2 font-mono text-2xl font-black text-slate-950 dark:text-white whitespace-nowrap ${loading ? 'animate-pulse text-slate-300 dark:text-slate-700' : ''}`}>{loading ? '-' : value}</p>
            </div>
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneClass[tone]}`}><Icon size={18} /></span>
        </div>
        <p className="mt-2 truncate text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">{detail}</p>
    </article>
);

const Panel = ({ title, description, icon: Icon, action, children }) => (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/70 p-4 sm:p-5 dark:border-slate-800 dark:bg-slate-900/70">
            <div className="flex min-w-0 flex-1 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-300">
                    <Icon size={18} />
                </span>
                <div className="min-w-0 flex-1">
                    <h2 className="truncate font-black text-slate-900 dark:text-white text-sm sm:text-base">{title}</h2>
                    {description && <p className="truncate text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>}
                </div>
            </div>
            {action && <div className="shrink-0">{action}</div>}
        </header>
        <div className="p-4 sm:p-5">{children}</div>
    </section>
);

const Progress = ({ label, value, total, tone }) => {
    const pct = Math.min(100, Math.round((Number(value || 0) / total) * 100));
    const bar = { cyan: 'bg-cyan-500', emerald: 'bg-emerald-500', amber: 'bg-amber-500', rose: 'bg-rose-500' }[tone];
    return (
        <div>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-xs font-black">
                <span className="text-slate-500 dark:text-slate-400">{label}</span>
                <span className="font-mono text-slate-800 dark:text-slate-200 whitespace-nowrap">{value}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} /></div>
        </div>
    );
};

const MiniStat = ({ label, value, loading }) => (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
        <p className={`mt-1 truncate font-mono text-sm font-black text-slate-900 dark:text-white whitespace-nowrap ${loading ? 'animate-pulse text-slate-300' : ''}`}>{loading ? '-' : value}</p>
    </div>
);

const MixList = ({ title, items, empty }) => {
    const total = items.reduce((sum, item) => sum + Number(item.value || 0), 0);
    return (
        <div>
            <h3 className="mb-3 text-xs font-black uppercase tracking-wider text-slate-400">{title}</h3>
            {items.length ? (
                <div className="space-y-2.5">
                    {items.map(item => {
                        const pct = total ? Math.round((Number(item.value || 0) / total) * 100) : 0;
                        return (
                            <div key={item.label} className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-2.5 text-xs dark:border-slate-800 dark:bg-slate-900">
                                <span className="truncate font-bold text-slate-700 dark:text-slate-300">{item.label}</span>
                                <div className="flex items-center gap-2 font-mono">
                                    <span className="font-bold text-slate-500">{item.value}</span>
                                    <span className="rounded-md bg-white px-1.5 py-0.5 text-[10px] font-black text-teal-700 shadow-2xs dark:bg-slate-800 dark:text-teal-300">{pct}%</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : <p className="text-xs font-bold text-slate-400">{empty}</p>}
        </div>
    );
};

const AlertCard = ({ alert, onOpenTab, isArabic }) => {
    const Icon = alert.icon;
    return (
        <article className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 dark:border-slate-800 dark:bg-slate-900 flex flex-col justify-between">
            <div className="flex items-start justify-between gap-2">
                <div>
                    <span className="font-mono text-xl font-black text-slate-900 dark:text-white">{alert.value}</span>
                    <h4 className="mt-1 text-xs font-black text-slate-800 dark:text-slate-200">{alert.label}</h4>
                    <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{alert.detail}</p>
                </div>
                <span className={`grid h-8 w-8 place-items-center rounded-lg ${toneClass[alert.tone]}`}><Icon size={16} /></span>
            </div>
            {alert.tab && (
                <button
                    type="button"
                    onClick={() => onOpenTab?.(alert.tab)}
                    className="mt-3 text-start text-[11px] font-black text-teal-700 hover:underline dark:text-teal-400"
                >
                    {isArabic ? 'عرض التفاصيل ←' : 'View Details →'}
                </button>
            )}
        </article>
    );
};

const CampaignRow = ({ campaign, copy }) => (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="min-w-0">
            <p className="truncate text-xs font-black text-slate-900 dark:text-white">{campaign.name}</p>
            <p className="text-[10px] text-slate-400">{campaign.channel} · {campaign.status}</p>
        </div>
        <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-black text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
            {campaign.status}
        </span>
    </div>
);

const TaskRow = ({ task, locale, copy }) => (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/70 p-3 dark:border-slate-800 dark:bg-slate-900">
        <div className="min-w-0">
            <p className="truncate text-xs font-black text-slate-900 dark:text-white">{task.patient_name || task.activity_type}</p>
            <p className="text-[10px] text-slate-400">{task.activity_type} · {task.status}</p>
        </div>
        <span className="text-[10px] font-semibold text-slate-500 font-mono">
            {task.due_date ? new Date(task.due_date).toLocaleDateString(locale, { month: 'short', day: 'numeric' }) : '-'}
        </span>
    </div>
);

const Empty = ({ icon: Icon, label }) => (
    <div className="p-8 text-center text-slate-400">
        <Icon size={24} className="mx-auto text-slate-300" />
        <p className="mt-2 text-xs font-bold">{label}</p>
    </div>
);

export default MarketingDashboard;
