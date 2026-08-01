import React, { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Network } from 'lucide-react';
import ReferralsTab from '../components/marketing/ReferralsTab';

const TAB_ICONS = {
    referrals: Network,
};

const MarketingDashboard = () => {
    const { t } = useTranslation('admin');
    const [activeTab, setActiveTab] = useState('referrals');

    const tabs = useMemo(() => [
        { id: 'referrals', label: t('marketing.tabs.referrals', 'Referrals'), icon: TAB_ICONS.referrals },
    ], [t]);

    const activeComponent = useMemo(() => {
        switch (activeTab) {
            case 'referrals':
                return <ReferralsTab />;
            default:
                return <ReferralsTab />;
        }
    }, [activeTab]);

    return (
        <main className="mx-auto max-w-[1500px] space-y-6 pb-10">
            {/* Tab Navigation */}
            <div className="sticky top-0 z-20 -mx-4 border-b border-slate-200/60 bg-white/70 px-4 pt-3 backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/70 sm:mx-0 sm:rounded-2xl sm:border sm:px-6 sm:pt-4 shadow-sm">
                <nav className="-mb-px flex gap-6 overflow-x-auto" aria-label="Tabs">
                    {tabs.map((tab) => {
                        const active = activeTab === tab.id;
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.id}
                                onClick={() => setActiveTab(tab.id)}
                                className={`group inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-1 pb-4 text-sm font-black transition-colors ${
                                    active 
                                    ? 'border-cyan-500 text-cyan-600 dark:border-cyan-400 dark:text-cyan-400'
                                    : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-slate-200'
                                }`}
                            >
                                <Icon size={18} className={`${active ? 'text-cyan-500 dark:text-cyan-400' : 'text-slate-400 group-hover:text-slate-500 dark:text-slate-500 dark:group-hover:text-slate-400'}`} />
                                {tab.label}
                            </button>
                        );
                    })}
                </nav>
            </div>

            {/* Tab Content */}
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-500">
                {activeComponent}
            </div>
        </main>
    );
};

export default MarketingDashboard;
