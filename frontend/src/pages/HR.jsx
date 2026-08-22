import { useState } from 'react';
import { BadgeCheck, CalendarClock, CalendarOff, ShieldCheck, Target, Users, Zap, UserCheck, Clock } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import EmployeeDirectory from '../components/hr/EmployeeDirectory';
import ShiftManager from '../components/hr/ShiftManager';
import LeaveManager from '../components/hr/LeaveManager';
import ProductivityReport from '../components/hr/ProductivityReport';
import AttendanceManager from '../components/hr/AttendanceManager';

const HR = () => {
    const [activeTab, setActiveTab] = useState('directory');
    const { t, i18n } = useTranslation('workspace');
    const isArabic = i18n.language === 'ar';

    const tabs = [
        { id: 'directory', icon: Users, label: t('hr.tabs.directory', { defaultValue: 'Employee Directory' }) },
        { id: 'shifts', icon: CalendarClock, label: t('hr.tabs.shifts', { defaultValue: 'Shift Roster' }) },
        { id: 'attendance', icon: Clock, label: t('hr.tabs.attendance', { defaultValue: 'Attendance' }) },
        { id: 'leave', icon: CalendarOff, label: t('hr.tabs.leave', { defaultValue: 'Leave Requests' }) },
        { id: 'productivity', icon: Target, label: t('hr.tabs.productivity', { defaultValue: 'Productivity' }) },
    ];

    const selectTabByOffset = (offset) => {
        const currentIndex = tabs.findIndex(tab => tab.id === activeTab);
        const nextIndex = (currentIndex + offset + tabs.length) % tabs.length;
        setActiveTab(tabs[nextIndex].id);
        requestAnimationFrame(() => document.getElementById(`hr-tab-${tabs[nextIndex].id}`)?.focus());
    };

    const handleTabKeyDown = (event) => {
        if (event.key === 'ArrowRight') {
            event.preventDefault();
            selectTabByOffset(isArabic ? -1 : 1);
        } else if (event.key === 'ArrowLeft') {
            event.preventDefault();
            selectTabByOffset(isArabic ? 1 : -1);
        }
    };

    return (
        <main className="mx-auto max-w-[1600px] space-y-6 pb-12">
            {/* Executive Hero Command Deck */}
            <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-8">
                <div className="pointer-events-none absolute -end-16 -top-16 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl dark:bg-teal-500/5" />
                <div className="pointer-events-none absolute -bottom-16 -start-16 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl dark:bg-sky-500/5" />

                <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4 sm:items-center">
                        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teal-500/20 to-teal-600/30 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/30 shadow-inner">
                            <Users size={26} />
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-300">
                                    <UserCheck size={11} />
                                    <span>{isArabic ? 'إدارة الموارد البشرية والورديات' : 'Staff Operations & Roster'}</span>
                                </span>
                            </div>
                            <h1 className="mt-1 truncate text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">
                                {t('hr.title', { defaultValue: 'Human Resources & Roster' })}
                            </h1>
                            <p className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400 sm:text-sm">
                                {t('hr.description', { defaultValue: 'Manage staff profiles, duty shifts, leave requests, and clinical productivity performance.' })}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-xl border border-teal-500/30 bg-teal-500/10 px-3 py-1.5 text-xs font-black text-teal-700 dark:text-teal-300">
                            <ShieldCheck size={14} />
                            <span>{t('hr.meta.roster', { defaultValue: 'Roster scheduling' })}</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-black text-emerald-700 dark:text-emerald-300">
                            <Zap size={14} />
                            <span>{t('hr.meta.productivity', { defaultValue: 'Productivity insights' })}</span>
                        </span>
                    </div>
                </div>
            </div>

            {/* Segmented Tab Strip */}
            <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-2 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                <nav className="flex gap-2 overflow-x-auto p-1 scrollbar-none" role="tablist" aria-label={t('hr.tabsLabel', { defaultValue: 'HR sections' })}>
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        const active = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                id={`hr-tab-${tab.id}`}
                                role="tab"
                                onClick={() => setActiveTab(tab.id)}
                                onKeyDown={handleTabKeyDown}
                                aria-selected={active}
                                aria-controls={`hr-panel-${tab.id}`}
                                tabIndex={active ? 0 : -1}
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

            <div id={`hr-panel-${activeTab}`} role="tabpanel" aria-labelledby={`hr-tab-${activeTab}`} className="transition-all duration-300">
                {activeTab === 'directory' && <EmployeeDirectory />}
                {activeTab === 'shifts' && <ShiftManager />}
                {activeTab === 'attendance' && <AttendanceManager />}
                {activeTab === 'leave' && <LeaveManager />}
                {activeTab === 'productivity' && <ProductivityReport />}
            </div>
        </main>
    );
};

export default HR;
