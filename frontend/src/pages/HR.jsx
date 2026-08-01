import { useState } from 'react';
import { BadgeCheck, CalendarClock, CalendarOff, ShieldCheck, Target, Users, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import EmployeeDirectory from '../components/hr/EmployeeDirectory';
import ShiftManager from '../components/hr/ShiftManager';
import LeaveManager from '../components/hr/LeaveManager';
import ProductivityReport from '../components/hr/ProductivityReport';
import PageHeader from '../components/ui/PageHeader';

const HR = () => {
    const [activeTab, setActiveTab] = useState('directory');
    const { t } = useTranslation('workspace');

    const tabs = [
        { id: 'directory', icon: Users, label: t('hr.tabs.directory', { defaultValue: 'Employee Directory' }), tone: 'indigo' },
        { id: 'shifts', icon: CalendarClock, label: t('hr.tabs.shifts', { defaultValue: 'Shift Roster' }), tone: 'cyan' },
        { id: 'leave', icon: CalendarOff, label: t('hr.tabs.leave', { defaultValue: 'Leave Requests' }), tone: 'amber' },
        { id: 'productivity', icon: Target, label: t('hr.tabs.productivity', { defaultValue: 'Productivity' }), tone: 'emerald' },
    ];

    return (
        <main className="app-page">
            <div className="mx-auto max-w-screen-2xl space-y-6 pb-12">
                {/* Executive Page Header */}
                <PageHeader
                    icon={Users}
                    eyebrow={t('hr.eyebrow', { defaultValue: 'Staff Management & Operations' })}
                    title={t('hr.title', { defaultValue: 'Human Resources & Roster' })}
                    description={t('hr.description', { defaultValue: 'Manage staff profiles, duty shifts, leave requests, and clinical productivity performance.' })}
                    className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/50 to-indigo-50/40 p-6 shadow-xl shadow-slate-200/30 backdrop-blur-xl dark:border-white/10 dark:from-slate-950 dark:via-slate-900/90 dark:to-indigo-950/20 dark:shadow-none"
                    meta={
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200/80 bg-indigo-50/90 px-3 py-1 text-xs font-bold text-indigo-800 shadow-sm dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300">
                                <ShieldCheck size={13} className="text-indigo-600 dark:text-indigo-400" />
                                Roster Scheduling
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200/80 bg-cyan-50/90 px-3 py-1 text-xs font-bold text-cyan-800 shadow-sm dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300">
                                <BadgeCheck size={13} className="text-cyan-600 dark:text-cyan-400" />
                                Staff Compliance
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/90 px-3 py-1 text-xs font-bold text-emerald-800 shadow-sm dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                                <Zap size={13} className="text-emerald-600 dark:text-emerald-400" />
                                Productivity Insights
                            </span>
                        </div>
                    }
                />

                {/* Segmented Tab Strip */}
                <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 p-3 shadow-lg shadow-slate-200/40 backdrop-blur-xl dark:border-white/10 dark:bg-[#07111f]/80 dark:shadow-none">
                    <nav className="flex space-x-2 overflow-x-auto p-1 scrollbar-none" aria-label="HR Sections">
                        {tabs.map((tab) => {
                            const Icon = tab.icon;
                            const active = activeTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setActiveTab(tab.id)}
                                    aria-current={active ? 'page' : undefined}
                                    className={`group relative flex shrink-0 items-center gap-2.5 rounded-2xl border px-4 py-3 text-xs font-bold transition-all duration-300 ${
                                        active
                                            ? 'border-indigo-400/80 bg-indigo-50/90 text-indigo-950 shadow-md ring-4 ring-indigo-500/15 dark:border-indigo-500/80 dark:bg-indigo-950/40 dark:text-indigo-200 dark:ring-indigo-500/20'
                                            : 'border-slate-200/80 bg-white/70 text-slate-600 hover:border-slate-300 hover:bg-slate-100/80 dark:border-white/5 dark:bg-white/[0.02] dark:text-slate-300 dark:hover:border-white/10 dark:hover:bg-white/5'
                                    }`}
                                >
                                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110 ${
                                        active
                                            ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/20 dark:text-indigo-300'
                                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                    }`}>
                                        <Icon size={16} />
                                    </span>
                                    <span className="block text-xs font-black tracking-tight text-slate-900 dark:text-white">
                                        {tab.label}
                                    </span>
                                    {active && (
                                        <span className="ms-1 flex h-2 w-2 rounded-full bg-indigo-500 shadow-sm shadow-indigo-500/50" />
                                    )}
                                </button>
                            );
                        })}
                    </nav>
                </div>

                {/* Tab Component Views */}
                <div className="transition-all duration-300">
                    {activeTab === 'directory' && <EmployeeDirectory />}
                    {activeTab === 'shifts' && <ShiftManager />}
                    {activeTab === 'leave' && <LeaveManager />}
                    {activeTab === 'productivity' && <ProductivityReport />}
                </div>
            </div>
        </main>
    );
};

export default HR;
