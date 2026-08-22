import React from 'react';

const ReceptionTabNav = ({ activeTab, cashierPending, onTabChange, tabs, t }) => (
    <div className="sticky top-0 z-20 mx-auto w-full">
        <nav
            className="flex gap-1.5 overflow-x-auto rounded-3xl border border-slate-200/80 bg-white/90 p-1.5 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90"
            aria-label={t('tabs.label')}
            role="tablist"
        >
            {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;

                return (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => onTabChange(tab.id)}
                        id={`reception-tab-${tab.id}`}
                        role="tab"
                        aria-selected={isActive}
                        aria-controls={`reception-panel-${tab.id}`}
                        className={`relative inline-flex min-h-10 shrink-0 items-center justify-center gap-2 rounded-2xl px-5 text-xs font-black transition-all duration-200 focus-visible:outline-hidden sm:flex-1 ${
                            isActive
                                ? 'bg-teal-600 text-white shadow-sm shadow-teal-600/20 dark:bg-teal-600 dark:text-white'
                                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-white'
                        }`}
                    >
                        {Icon && <Icon size={16} aria-hidden="true" className={isActive ? 'text-white' : 'text-slate-400 dark:text-slate-500'} />}
                        <span>{tab.label}</span>
                        {tab.id === 'cashier' && cashierPending > 0 && (
                            <span className={`flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-black ${
                                isActive ? 'bg-amber-400 text-amber-950' : 'bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300'
                            }`}>
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
