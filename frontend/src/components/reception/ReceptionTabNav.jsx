import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const ReceptionTabNav = ({ activeTab, cashierPending, scheduleCount = 0, onTabChange, tabs, t }) => (
<div data-workspace-tabs className="sticky top-0 z-20 mx-auto w-full">
        <nav
            className="flex gap-1 overflow-x-auto scrollbar-none touch-pan-x rounded-2xl border border-slate-200/80 bg-white/90 p-1 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90"
            aria-label={t('tabs.label')}
            role="tablist"
        >
            {tabs.map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                const hasCashierBadge = tab.id === 'cashier' && cashierPending > 0;
                const hasScheduleBadge = tab.id === 'schedule' && scheduleCount > 0;

                return (
                    <button
                        key={tab.id}
                        type="button"
                        onClick={() => onTabChange(tab.id)}
                        id={`reception-tab-${tab.id}`}
                        role="tab"
                        aria-selected={isActive}
                        aria-controls={`reception-panel-${tab.id}`}
                        className={`relative inline-flex min-h-[2.6rem] shrink-0 items-center justify-center gap-2 rounded-xl px-5 text-xs font-black transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 sm:flex-1 ${
                            isActive
                                ? 'bg-teal-600 text-white shadow-md shadow-teal-600/25 dark:bg-teal-600 dark:text-white'
                                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/80 dark:hover:text-white'
                        }`}
                    >
                        {/* Active indicator bar */}
                        {isActive && (
                            <motion.span
                                layoutId="reception-tab-active"
                                className="absolute inset-0 rounded-xl bg-teal-600"
                                transition={{ type: 'spring', bounce: 0.2, duration: 0.35 }}
                                style={{ zIndex: -1 }}
                            />
                        )}

                        {Icon && (
                            <Icon
                                size={15}
                                aria-hidden="true"
                                className={`transition-colors ${isActive ? 'text-white/90' : 'text-slate-400 dark:text-slate-500'}`}
                            />
                        )}
                        <span className="relative z-10">{tab.label}</span>

                        {/* Schedule count badge */}
                        {hasScheduleBadge && (
                            <span
                                className={`relative z-10 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-black leading-none ${
                                    isActive
                                        ? 'bg-white/20 text-white'
                                        : 'bg-teal-100 text-teal-800 dark:bg-teal-900/60 dark:text-teal-300'
                                }`}
                            >
                                {scheduleCount}
                            </span>
                        )}

                        {/* Cashier pending badge */}
                        {hasCashierBadge && (
                            <span
                                className={`relative z-10 flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-black leading-none ${
                                    isActive
                                        ? 'bg-amber-400 text-amber-950'
                                        : 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                }`}
                            >
                                {cashierPending}
                                {/* Pulsing ring for attention when not active */}
                                {!isActive && (
                                    <span className="absolute -top-px -end-px h-2 w-2 rounded-full bg-amber-500 ring-1 ring-white dark:ring-slate-900 animate-pulse" />
                                )}
                            </span>
                        )}
                    </button>
                );
            })}
        </nav>
    </div>
);

export default ReceptionTabNav;
