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
    const copy = useCallback((key, options) => t(`marketing.dashboard.${key}`, options), [t]);
    const user = useSelector(selectCurrentUser);
    const locale = i18n.language?.startsWith('ar') ? 'ar-EG' : 'en-EG';
    const hasSystemRole = hasDeveloperOrAdminRole(user?.role);

    const canCampaigns = hasSystemRole || ['Receptionist', 'Marketing'].includes(user?.role);
    const canTasks = hasSystemRole || ['Receptionist', 'HR', 'Marketing'].includes(user?.role);
    const canFeedback = hasSystemRole || ['Receptionist', 'Marketing'].includes(user?.role);
    const canReferrals = hasSystemRole || ['Accountant', 'Marketing'].includes(user?.role);

    const [rangeDays, setRangeDays] = useState(30);
    const referralRange = useMemo(() => ({
        startDate: isoDate(new Date(Date.now() - rangeDays * DAY)),
        endDate: isoDate(new Date())
    }), [rangeDays]);
    const { data: campaigns = [], isLoading: campaignsLoading } = useGetCampaignsQuery(undefined, { skip: !canCampaigns });
    const { data: segments = [], isLoading: segmentsLoading } = useGetSegmentsQuery(undefined, { skip: !canCampaigns });
    const { data: activities = [], isLoading: tasksLoading } = useGetCrmActivitiesQuery({}, { skip: !canTasks });
    const { data: feedback = [], isLoading: feedbackLoading } = useGetFeedbackQuery(undefined, { skip: !canFeedback });
    const { data: referrals, isLoading: referralsLoading } = useGetReferralAnalyticsQuery(referralRange, { skip: !canReferrals });

    const now = Date.now();
    const number = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }), [locale]);
    const money = useMemo(() => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EGP', maximumFractionDigits: 0 }), [locale]);

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
            tone: feedbackStats.low ? 'amber' : 'emerald',
            tab: 'feedback'
        }
    ], [campaignStats.draft, campaignStats.failed, copy, feedbackStats.low, taskStats.overdue]);

    const recentCampaigns = useMemo(() => [...campaigns]
        .sort((a, b) => new Date(b.updated_at || b.created_at || 0) - new Date(a.updated_at || a.created_at || 0))
        .slice(0, 4), [campaigns]);

    const nextTasks = useMemo(() => activities
        .filter(item => item.status === 'Pending')
        .sort((a, b) => new Date(a.due_date || '2999-12-31') - new Date(b.due_date || '2999-12-31'))
        .slice(0, 5), [activities]);

    const isLoading = campaignsLoading || segmentsLoading || tasksLoading || feedbackLoading || referralsLoading;

    return (
        <div className="space-y-5">
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <Metric icon={Megaphone} label={copy('activeCampaigns')} value={number.format(campaignStats.active)} detail={copy('campaignDetail', { total: campaignStats.total, draft: campaignStats.draft })} tone="pink" loading={campaignsLoading} />
                <Metric icon={Send} label={copy('deliveryHealth')} value={`${campaignStats.health}%`} detail={copy('deliveryDetail', { sent: campaignStats.sent, failed: campaignStats.failed })} tone={campaignStats.failed ? 'amber' : 'emerald'} loading={campaignsLoading} />
                <Metric icon={CalendarClock} label={copy('pendingTasks')} value={number.format(taskStats.pending)} detail={copy('taskDetail', { overdue: taskStats.overdue })} tone={taskStats.overdue ? 'rose' : 'cyan'} loading={tasksLoading} />
                <Metric icon={Star} label={copy('satisfaction')} value={feedbackStats.total ? feedbackStats.average.toFixed(1) : '-'} detail={copy('feedbackDetail', { count: feedbackStats.total, low: feedbackStats.low })} tone="amber" loading={feedbackLoading} />
            </section>

            <section className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(360px,.75fr)]">
                <Panel title={copy('pipelineTitle')} description={copy('pipelineDescription')} icon={BarChart3} action={<button type="button" onClick={() => onOpenTab?.('campaigns')} className="rounded-lg bg-pink-700 px-3 py-2 text-xs font-bold text-white hover:bg-pink-800">{copy('openCampaigns')}</button>}>
                    <div className="space-y-4">
                        <Progress label={copy('queued')} value={campaignStats.queued} total={Math.max(campaignStats.recipients, 1)} tone="cyan" />
                        <Progress label={copy('sent')} value={campaignStats.sent} total={Math.max(campaignStats.recipients, 1)} tone="emerald" />
                        <Progress label={copy('failed')} value={campaignStats.failed} total={Math.max(campaignStats.recipients, 1)} tone="rose" />
                        <Progress label={copy('skipped')} value={campaignStats.skipped} total={Math.max(campaignStats.recipients, 1)} tone="amber" />
                    </div>
                    <div className="mt-5 grid gap-3 sm:grid-cols-3">
                        <MiniStat label={copy('segments')} value={segments.length} loading={segmentsLoading} />
                        <MiniStat label={copy('recipients')} value={campaignStats.recipients} loading={campaignsLoading} />
                        <MiniStat label={copy('budget')} value={money.format(campaignStats.budget)} loading={campaignsLoading} />
                    </div>
                </Panel>

                <Panel title={copy('referralTitle')} description={copy('referralDescription', { days: rangeDays })} icon={Network} action={<button type="button" onClick={() => onOpenTab?.('referrals')} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">{copy('openReferrals')}</button>}>
                    <div className="mb-4 flex rounded-xl bg-slate-100 p-1 dark:bg-slate-900" aria-label={copy('rangeLabel')}>
                        {[7, 30, 90].map(days => (
                            <button key={days} type="button" onClick={() => setRangeDays(days)} className={`min-h-9 flex-1 rounded-lg px-3 text-xs font-black transition ${rangeDays === days ? 'bg-white text-cyan-800 shadow-sm dark:bg-slate-800 dark:text-cyan-300' : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200'}`}>
                                {copy('rangeDays', { count: days })}
                            </button>
                        ))}
                    </div>
                    <div className="grid gap-3">
                        <MiniStat label={copy('referrals30')} value={number.format(referralStats.referrals)} loading={referralsLoading} />
                        <MiniStat label={copy('referralRevenue')} value={money.format(referralStats.revenue)} loading={referralsLoading} />
                        <MiniStat label={copy('topDoctor')} value={referralStats.topDoctor} loading={referralsLoading} />
                        <MiniStat label={copy('topSource')} value={referralStats.topSource} loading={referralsLoading} />
                    </div>
                </Panel>
            </section>

            <section className="grid gap-5 xl:grid-cols-[minmax(360px,.8fr)_minmax(0,1.2fr)]">
                <Panel title={copy('mixTitle')} description={copy('mixDescription')} icon={BarChart3}>
                    <div className="space-y-5">
                        <MixList title={copy('channelMix')} items={channelMix} empty={copy('noChannelMix')} />
                        <MixList title={copy('sourceMix')} items={referralStats.sources.slice(0, 5)} empty={copy('noSourceMix')} />
                    </div>
                </Panel>

                <Panel title={copy('attentionTitle')} description={copy('attentionDescription')} icon={AlertTriangle}>
                    <div className="grid gap-3 sm:grid-cols-2">
                        {alerts.map(alert => <AlertCard key={alert.key} alert={alert} onOpenTab={onOpenTab} />)}
                    </div>
                </Panel>
            </section>

            <section className="grid gap-5 xl:grid-cols-2">
                <Panel title={copy('recentCampaigns')} description={copy('recentCampaignsDescription')} icon={Target}>
                    {recentCampaigns.length ? (
                        <div className="space-y-3">
                            {recentCampaigns.map(campaign => <CampaignRow key={campaign.campaign_id} campaign={campaign} copy={copy} />)}
                        </div>
                    ) : <Empty icon={Megaphone} label={copy('noCampaigns')} />}
                </Panel>

                <Panel title={copy('nextActions')} description={copy('nextActionsDescription')} icon={CheckCircle2} action={<button type="button" onClick={() => onOpenTab?.('tasks')} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800">{copy('openTasks')}</button>}>
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
            <div className="min-w-0">
                <p className="text-[10px] font-black uppercase leading-4 tracking-wider text-slate-400">{label}</p>
                <p className={`mt-2 text-2xl font-black text-slate-950 dark:text-white ${loading ? 'animate-pulse text-slate-300 dark:text-slate-700' : ''}`}>{loading ? '-' : value}</p>
            </div>
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneClass[tone]}`}><Icon size={18} /></span>
        </div>
        <p className="mt-2 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">{detail}</p>
    </article>
);

const Panel = ({ title, description, icon: Icon, action, children }) => (
    <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950">
        <header className="flex flex-col gap-3 border-b border-slate-100 bg-slate-50/70 p-5 dark:border-slate-800 dark:bg-slate-900/70 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-400/10 dark:text-cyan-300"><Icon size={18} /></span>
                <div>
                    <h2 className="font-black text-slate-900 dark:text-white">{title}</h2>
                    <p className="mt-1 text-sm leading-5 text-slate-500 dark:text-slate-400">{description}</p>
                </div>
            </div>
            {action}
        </header>
        <div className="p-5">{children}</div>
    </section>
);

const Progress = ({ label, value, total, tone }) => {
    const pct = Math.min(100, Math.round((Number(value || 0) / total) * 100));
    const bar = { cyan: 'bg-cyan-500', emerald: 'bg-emerald-500', amber: 'bg-amber-500', rose: 'bg-rose-500' }[tone];
    return (
        <div>
            <div className="mb-1.5 flex items-center justify-between gap-3 text-xs font-black">
                <span className="text-slate-500 dark:text-slate-400">{label}</span>
                <span className="text-slate-800 dark:text-slate-200">{value}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} /></div>
        </div>
    );
};

const MiniStat = ({ label, value, loading }) => (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
        <p className={`mt-1 truncate text-sm font-black text-slate-900 dark:text-white ${loading ? 'animate-pulse text-slate-300' : ''}`}>{loading ? '-' : value}</p>
    </div>
);

const MixList = ({ title, items, empty }) => {
    const total = items.reduce((sum, item) => sum + Number(item.value || 0), 0);
    return (
        <div>
            <h3 className="mb-3 text-xs font-black uppercase tracking-wider text-slate-400">{title}</h3>
            {items.length ? (
                <div className="space-y-3">
                    {items.map(item => {
                        const value = Number(item.value || 0);
                        const pct = total ? Math.max(5, Math.round((value / total) * 100)) : 0;
                        return (
                            <div key={item.label}>
                                <div className="mb-1.5 flex items-center justify-between gap-3 text-xs font-bold">
                                    <span className="truncate text-slate-600 dark:text-slate-300">{item.label}</span>
                                    <span className="text-slate-500">{value}</span>
                                </div>
                                <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full rounded-full bg-cyan-500" style={{ width: `${pct}%` }} /></div>
                            </div>
                        );
                    })}
                </div>
            ) : <p className="rounded-xl bg-slate-50 p-4 text-sm font-bold text-slate-400 dark:bg-slate-900">{empty}</p>}
        </div>
    );
};

const AlertCard = ({ alert, onOpenTab }) => {
    const Icon = alert.icon;
    return (
        <button type="button" onClick={() => onOpenTab?.(alert.tab)} className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-start transition hover:border-cyan-200 hover:bg-white hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-cyan-900 dark:hover:bg-slate-950">
            <div className="flex items-start justify-between gap-3">
                <div>
                    <p className="text-sm font-black text-slate-900 dark:text-white">{alert.label}</p>
                    <p className="mt-1 text-xs font-semibold leading-5 text-slate-500 dark:text-slate-400">{alert.detail}</p>
                </div>
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${toneClass[alert.tone]}`}><Icon size={18} /></span>
            </div>
            <p className="mt-3 text-2xl font-black text-slate-950 dark:text-white">{alert.value}</p>
        </button>
    );
};

const CampaignRow = ({ campaign, copy }) => (
    <div className="rounded-xl border border-slate-100 p-3 dark:border-slate-800">
        <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-900 dark:text-white">{campaign.name}</p>
                <p className="mt-1 line-clamp-1 text-xs font-semibold text-slate-500 dark:text-slate-400">{campaign.message_body || campaign.segment_name || copy('noMessage')}</p>
            </div>
            <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[10px] font-black text-slate-600 dark:bg-slate-800 dark:text-slate-300">{campaign.status || 'Draft'}</span>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center text-[11px] font-bold text-slate-500">
            <span>{copy('queued')}: {campaign.queued_count || 0}</span>
            <span>{copy('sent')}: {campaign.sent_count || 0}</span>
            <span>{copy('failed')}: {campaign.failed_count || 0}</span>
        </div>
    </div>
);

const TaskRow = ({ task, locale, copy }) => {
    const due = task.due_date ? new Date(task.due_date) : null;
    const overdue = due && due.getTime() < Date.now();
    return (
        <div className="flex items-start gap-3 rounded-xl border border-slate-100 p-3 dark:border-slate-800">
            <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${overdue ? toneClass.rose : toneClass.cyan}`}>
                {overdue ? <AlertTriangle size={15} /> : <CalendarClock size={15} />}
            </span>
            <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-900 dark:text-white">{task.patient_name || copy('unknownPatient')}</p>
                <p className="mt-0.5 text-xs font-semibold text-slate-500 dark:text-slate-400">{task.activity_type || copy('task')} · {due ? due.toLocaleDateString(locale, { day: '2-digit', month: 'short' }) : copy('noDueDate')}</p>
            </div>
        </div>
    );
};

const Empty = ({ icon: Icon, label }) => (
    <div className="flex min-h-36 flex-col items-center justify-center rounded-xl bg-slate-50 text-center dark:bg-slate-900">
        <Icon size={28} className="text-slate-300 dark:text-slate-600" />
        <p className="mt-3 text-sm font-bold text-slate-500 dark:text-slate-400">{label}</p>
    </div>
);

export default MarketingDashboard;
