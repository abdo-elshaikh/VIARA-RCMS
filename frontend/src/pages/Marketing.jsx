import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { BadgeCheck, BarChart3, CheckSquare, Megaphone, MessageCircle, Network, ShieldCheck, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import CampaignManager from '../components/crm/CampaignManager';
import TaskBoard from '../components/crm/TaskBoard';
import FeedbackDashboard from '../components/crm/FeedbackDashboard';
import ReferralsTab from '../components/marketing/ReferralsTab';
import MarketingDashboard from '../components/marketing/MarketingDashboard';
import { selectCurrentUser } from '../store/authSlice';
import { hasDeveloperOrAdminRole } from '../utils/roles';

const Marketing = () => {
    const [activeTab, setActiveTab] = useState('dashboard');
    const { t, i18n } = useTranslation('workspace');
    const isArabic = i18n.language === 'ar';
    const user = useSelector(selectCurrentUser);
    const hasSystemRole = hasDeveloperOrAdminRole(user?.role);
    
    const canViewCampaigns = hasSystemRole || ['Receptionist', 'Marketing'].includes(user?.role);
    const canViewTasks = hasSystemRole || ['Receptionist', 'HR', 'Marketing'].includes(user?.role);
    const canViewFeedback = hasSystemRole || ['Receptionist', 'Marketing'].includes(user?.role);
    const canViewReferrals = hasSystemRole || ['Accountant', 'Marketing'].includes(user?.role);
    const canViewDashboard = canViewCampaigns || canViewTasks || canViewFeedback || canViewReferrals;

    const tabs = useMemo(() => [
        { id: 'dashboard', icon: BarChart3, label: t('marketing.tabs.dashboard', 'Dashboard'), visible: canViewDashboard },
        { id: 'campaigns', icon: Megaphone, label: t('marketing.tabs.campaigns', 'Campaigns'), visible: canViewCampaigns },
        { id: 'tasks', icon: CheckSquare, label: t('marketing.tabs.tasks', 'Tasks'), visible: canViewTasks },
        { id: 'feedback', icon: MessageCircle, label: t('marketing.tabs.feedback', 'Feedback'), visible: canViewFeedback },
        { id: 'referrals', icon: Network, label: t('marketing.tabs.referrals', 'Referrals'), visible: canViewReferrals },
    ].filter(tab => tab.visible), [canViewCampaigns, canViewDashboard, canViewFeedback, canViewReferrals, canViewTasks, t]);
    
    const safeTab = tabs.some(tab => tab.id === activeTab) ? activeTab : tabs[0]?.id;

    return (
        <main className="mx-auto max-w-[1600px] space-y-6 pb-12">
            {/* Executive Hero Command Deck */}
            <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-8">
                <div className="pointer-events-none absolute -end-16 -top-16 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl dark:bg-teal-500/5" />
                <div className="pointer-events-none absolute -bottom-16 -start-16 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl dark:bg-sky-500/5" />

                <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4 sm:items-center">
                        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teal-500/20 to-teal-600/30 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/30 shadow-inner">
                            <Megaphone size={26} />
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-300">
                                    <Network size={11} />
                                    <span>{isArabic ? 'التسويق وتنمية العلاقات والتحويلات' : 'Growth & Patient Engagement'}</span>
                                </span>
                            </div>
                            <h1 className="mt-1 truncate text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">
                                {t('marketing.title', { defaultValue: 'Marketing & CRM' })}
                            </h1>
                            <p className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400 sm:text-sm">
                                {t('marketing.description', { defaultValue: 'Track promotional campaigns, patient feedback, CRM task workflows, and referral channels.' })}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-xl border border-teal-500/30 bg-teal-500/10 px-3 py-1.5 text-xs font-black text-teal-700 dark:text-teal-300">
                            <BadgeCheck size={14} />
                            <span>{isArabic ? 'تفاعل وملاحظات المرضى' : 'Patient Feedback'}</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-black text-emerald-700 dark:text-emerald-300">
                            <Zap size={14} />
                            <span>{isArabic ? 'تحليلات النمو' : 'Growth Analytics'}</span>
                        </span>
                    </div>
                </div>
            </div>

            {/* Segmented Tab Strip */}
            <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-2 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                <nav className="flex gap-2 overflow-x-auto p-1 scrollbar-none" aria-label="Marketing Sections">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        const active = safeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTab(tab.id)}
                                aria-current={active ? 'page' : undefined}
                                className={`flex shrink-0 items-center gap-2.5 rounded-2xl border px-4 py-2.5 text-xs font-black transition-all ${
                                    active
                                        ? 'border-teal-500/40 bg-teal-600 text-white shadow-sm shadow-teal-600/20'
                                        : 'border-transparent bg-slate-50 text-slate-600 hover:bg-slate-100 dark:bg-slate-950/40 dark:text-slate-400 dark:hover:bg-slate-800'
                                }`}
                            >
                                <Icon size={16} />
                                <span>{tab.label}</span>
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
        </main>
    );
};

export default Marketing;
