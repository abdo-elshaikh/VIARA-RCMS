import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { BadgeCheck, BarChart3, CheckSquare, Megaphone, MessageCircle, Network, ShieldCheck, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import CampaignManager from '../components/crm/CampaignManager';
import TaskBoard from '../components/crm/TaskBoard';
import FeedbackDashboard from '../components/crm/FeedbackDashboard';
import ReferralsTab from '../components/marketing/ReferralsTab';
import MarketingDashboard from '../components/marketing/MarketingDashboard';
import PageHeader from '../components/ui/PageHeader';
import { selectCurrentUser } from '../store/authSlice';
import { hasDeveloperOrAdminRole } from '../utils/roles';

const Marketing = () => {
    const [activeTab, setActiveTab] = useState('dashboard');
    const { t } = useTranslation('workspace');
    const user = useSelector(selectCurrentUser);
    const hasSystemRole = hasDeveloperOrAdminRole(user?.role);
    
    const canViewCampaigns = hasSystemRole || ['Receptionist', 'Marketing'].includes(user?.role);
    const canViewTasks = hasSystemRole || ['Receptionist', 'HR', 'Marketing'].includes(user?.role);
    const canViewFeedback = hasSystemRole || ['Receptionist', 'Marketing'].includes(user?.role);
    const canViewReferrals = hasSystemRole || ['Accountant', 'Marketing'].includes(user?.role);
    const canViewDashboard = canViewCampaigns || canViewTasks || canViewFeedback || canViewReferrals;

    const tabs = useMemo(() => [
        { id: 'dashboard', icon: BarChart3, label: t('marketing.tabs.dashboard', 'Dashboard'), visible: canViewDashboard, tone: 'rose' },
        { id: 'campaigns', icon: Megaphone, label: t('marketing.tabs.campaigns', 'Campaigns'), visible: canViewCampaigns, tone: 'indigo' },
        { id: 'tasks', icon: CheckSquare, label: t('marketing.tabs.tasks', 'Tasks'), visible: canViewTasks, tone: 'cyan' },
        { id: 'feedback', icon: MessageCircle, label: t('marketing.tabs.feedback', 'Feedback'), visible: canViewFeedback, tone: 'amber' },
        { id: 'referrals', icon: Network, label: t('marketing.tabs.referrals', 'Referrals'), visible: canViewReferrals, tone: 'emerald' },
    ].filter(tab => tab.visible), [canViewCampaigns, canViewDashboard, canViewFeedback, canViewReferrals, canViewTasks, t]);
    
    const safeTab = tabs.some(tab => tab.id === activeTab) ? activeTab : tabs[0]?.id;

    return (
        <main className="app-page">
            <div className="mx-auto max-w-screen-2xl space-y-6 pb-12">
                {/* Executive Page Header */}
                <PageHeader
                    icon={Megaphone}
                    eyebrow={t('marketing.eyebrow', { defaultValue: 'Growth & Patient Engagement' })}
                    title={t('marketing.title', { defaultValue: 'Marketing & CRM' })}
                    description={t('marketing.description', { defaultValue: 'Track promotional campaigns, patient feedback, CRM task workflows, and referral channels.' })}
                    className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/50 to-rose-50/40 p-6 shadow-xl shadow-slate-200/30 backdrop-blur-xl dark:border-white/10 dark:from-slate-950 dark:via-slate-900/90 dark:to-rose-950/20 dark:shadow-none"
                    meta={
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-rose-200/80 bg-rose-50/90 px-3 py-1 text-xs font-bold text-rose-800 shadow-sm dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300">
                                <Megaphone size={13} className="text-rose-600 dark:text-rose-400" />
                                Campaign Tracking
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200/80 bg-cyan-50/90 px-3 py-1 text-xs font-bold text-cyan-800 shadow-sm dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300">
                                <BadgeCheck size={13} className="text-cyan-600 dark:text-cyan-400" />
                                Patient Feedback
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/90 px-3 py-1 text-xs font-bold text-emerald-800 shadow-sm dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                                <Zap size={13} className="text-emerald-600 dark:text-emerald-400" />
                                Growth Analytics
                            </span>
                        </div>
                    }
                />

                {/* Segmented Tab Strip */}
                <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 p-3 shadow-lg shadow-slate-200/40 backdrop-blur-xl dark:border-white/10 dark:bg-[#07111f]/80 dark:shadow-none">
                    <nav className="flex space-x-2 overflow-x-auto p-1 scrollbar-none" aria-label="Marketing Sections">
                        {tabs.map((tab) => {
                            const Icon = tab.icon;
                            const active = safeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setActiveTab(tab.id)}
                                    aria-current={active ? 'page' : undefined}
                                    className={`group relative flex shrink-0 items-center gap-2.5 rounded-2xl border px-4 py-3 text-xs font-bold transition-all duration-300 ${
                                        active
                                            ? 'border-rose-400/80 bg-rose-50/90 text-rose-950 shadow-md ring-4 ring-rose-500/15 dark:border-rose-500/80 dark:bg-rose-950/40 dark:text-rose-200 dark:ring-rose-500/20'
                                            : 'border-slate-200/80 bg-white/70 text-slate-600 hover:border-slate-300 hover:bg-slate-100/80 dark:border-white/5 dark:bg-white/[0.02] dark:text-slate-300 dark:hover:border-white/10 dark:hover:bg-white/5'
                                    }`}
                                >
                                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110 ${
                                        active
                                            ? 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300'
                                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                    }`}>
                                        <Icon size={16} />
                                    </span>
                                    <span className="block text-xs font-black tracking-tight text-slate-900 dark:text-white">
                                        {tab.label}
                                    </span>
                                    {active && (
                                        <span className="ms-1 flex h-2 w-2 rounded-full bg-rose-500 shadow-sm shadow-rose-500/50" />
                                    )}
                                </button>
                            );
                        })}
                    </nav>
                </div>

                {/* Tab Component Views */}
                <div className="transition-all duration-300">
                    {safeTab === 'dashboard' && <MarketingDashboard onOpenTab={setActiveTab} />}
                    {safeTab === 'campaigns' && <CampaignManager />}
                    {safeTab === 'tasks' && <TaskBoard />}
                    {safeTab === 'feedback' && <FeedbackDashboard />}
                    {safeTab === 'referrals' && <ReferralsTab />}
                </div>
            </div>
        </main>
    );
};

export default Marketing;
