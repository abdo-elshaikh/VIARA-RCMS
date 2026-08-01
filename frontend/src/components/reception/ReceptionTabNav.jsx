import React from 'react';

const ReceptionTabNav = ({ activeTab, cashierPending, onTabChange, tabs, t }) => (
    <div className="sticky top-0 z-20 mx-auto w-full max-w-screen-2xl">
        <nav
            className="flex gap-1 overflow-x-auto rounded-none border border-slate-200/60 bg-white/70 p-1 shadow-sm backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/50"
            aria-label={t('tabs.label')}
        >
            {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;

                return (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => onTabChange(tab.id)}
                        aria-current={isActive ? 'page' : undefined}
                        className={`relative inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-none px-3 text-xs font-black transition sm:flex-1 sm:px-4 sm:text-sm ${isActive
                                ? 'bg-teal-700 text-white shadow-sm dark:bg-teal-500 dark:text-slate-950'
                                : 'text-slate-500 hover:bg-teal-50 hover:text-teal-800 dark:text-slate-400 dark:hover:bg-white/[.06] dark:hover:text-white'
                            }`}
                    >
                        <Icon size={16} aria-hidden="true" />
                        <span>{tab.label}</span>
                        {tab.id === 'cashier' && cashierPending > 0 && (
                            <span className={`flex h-5 min-w-5 items-center justify-center rounded-none px-1 text-[10px] font-black ${isActive ? 'bg-amber-300 text-amber-950' : 'bg-amber-100 text-amber-800'}`}>
                                {cashierPending}
                            </span>
                        )}
                    </button>
                );
            })}
        </nav>
    </div>
);

export default ReceptionTabNav;
