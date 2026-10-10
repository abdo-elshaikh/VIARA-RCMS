import React, { memo, useRef } from 'react';

const ReceptionTabNav = memo(({ activeTab, cashierPending, scheduleCount = 0, onTabChange, onTabIntent, tabs, t }) => {
    const tabRefs = useRef([]);

    const moveFocus = (event, currentIndex) => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();

        const isRtl = document.documentElement.dir === 'rtl';
        const lastIndex = tabs.length - 1;
        let nextIndex = currentIndex;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = lastIndex;
        if (event.key === 'ArrowRight') nextIndex = (currentIndex + (isRtl ? -1 : 1) + tabs.length) % tabs.length;
        if (event.key === 'ArrowLeft') nextIndex = (currentIndex + (isRtl ? 1 : -1) + tabs.length) % tabs.length;

        const nextTab = tabs[nextIndex];
        if (!nextTab) return;
        tabRefs.current[nextIndex]?.focus();
        onTabChange(nextTab.id);
    };

    return (
    <nav
        data-reception-tabs
        className="!flex w-full gap-1 overflow-x-auto rounded-xl border border-slate-200/90 bg-slate-100 p-1 scrollbar-none dark:border-slate-800 dark:bg-[#070e1a] touch-pan-x"
        aria-label={t('tabs.label', { defaultValue: 'أقسام الاستقبال' })}
        role="tablist"
    >
        {tabs.map((tab, index) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            const badge = tab.id === 'cashier'
                ? cashierPending
                : tab.id === 'schedule'
                    ? scheduleCount
                    : 0;
            const isAttention = tab.id === 'cashier' && cashierPending > 0;

            return (
                <button
                    key={tab.id}
                    type="button"
                    onClick={() => onTabChange(tab.id)}
                    onMouseEnter={() => onTabIntent?.(tab.id)}
                    onFocus={() => onTabIntent?.(tab.id)}
                    onKeyDown={(event) => moveFocus(event, index)}
                    ref={(node) => { tabRefs.current[index] = node; }}
                    id={`reception-tab-${tab.id}`}
                    role="tab"
                    tabIndex={isActive ? 0 : -1}
                    aria-selected={isActive}
                    aria-controls={`reception-panel-${tab.id}`}
                    title={`${tab.label} · Alt+${tab.id === 'schedule' ? '1' : tab.id === 'patients' ? '2' : tab.id === 'cashier' ? '3' : '4'}`}
                    className={`group relative inline-flex min-h-10 sm:min-h-11 min-w-max flex-1 items-center justify-center gap-2 rounded-lg px-2.5 sm:px-3 text-xs font-black transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 ${isActive
                        ? 'bg-white text-teal-800 shadow-sm border border-slate-200/90 dark:border-teal-500/30 dark:bg-[#0b1426] dark:text-teal-300'
                        : 'text-slate-600 hover:bg-white hover:text-slate-900 dark:text-slate-400 dark:hover:bg-[#091222] dark:hover:text-white'
                    }`}
                >
                    {Icon && <Icon size={14} className={isActive ? 'text-teal-600 dark:text-teal-300' : 'text-slate-400 dark:text-slate-500 group-hover:text-teal-600 dark:group-hover:text-teal-300'} />}
                    <span className="truncate">{tab.label}</span>
                    {badge > 0 && (
                        <span className={`grid min-w-5 place-items-center rounded-full px-1.5 py-0.5 text-[10px] font-black ${isActive
                            ? isAttention
                                ? 'bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950/70 dark:text-amber-200 dark:border-amber-800'
                                : 'bg-teal-50 text-teal-800 border border-teal-200 dark:bg-teal-950/60 dark:text-teal-300 dark:border-teal-800'
                            : isAttention
                                ? 'bg-amber-100 text-amber-900 border border-amber-300 dark:bg-amber-950/70 dark:text-amber-200 dark:border-amber-800'
                                : 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}>
                            {badge > 99 ? '99+' : badge}
                        </span>
                    )}
                </button>
            );
        })}
    </nav>
    );
});

ReceptionTabNav.displayName = 'ReceptionTabNav';

export default ReceptionTabNav;
