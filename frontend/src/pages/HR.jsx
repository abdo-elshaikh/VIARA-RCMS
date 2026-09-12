import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { BadgeCheck, CalendarClock, CalendarOff, RefreshCw, ShieldCheck, Target, Users, UserCheck, Clock, Sparkles } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import EmployeeDirectory from '../components/hr/EmployeeDirectory';
import ShiftManager from '../components/hr/ShiftManager';
import LeaveManager from '../components/hr/LeaveManager';
import ProductivityReport from '../components/hr/ProductivityReport';
import AttendanceManager from '../components/hr/AttendanceManager';
import CredentialsManager from '../components/hr/CredentialsManager';
import PageHeader from '../components/ui/PageHeader';
import { useGetAttendanceQuery, useGetEmployeeProfilesQuery, useGetLeaveRequestsQuery, useGetStaffCredentialsQuery } from '../store/api';

const dateInput = date => {
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 10);
};

const HR = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const { t, i18n } = useTranslation('workspace');
    const isArabic = i18n.language.startsWith('ar');
    const currentDate = useMemo(() => dateInput(new Date()), []);
    
    const profilesQuery = useGetEmployeeProfilesQuery();
    const leavesQuery = useGetLeaveRequestsQuery({});
    const attendanceQuery = useGetAttendanceQuery({ startDate: currentDate, endDate: currentDate, limit: 500 });
    const credentialsQuery = useGetStaffCredentialsQuery({ expiringWithinDays: 30 });
    
    const profiles = Array.isArray(profilesQuery.data) ? profilesQuery.data : [];
    const leaves = Array.isArray(leavesQuery.data) ? leavesQuery.data : [];
    const attendance = Array.isArray(attendanceQuery.data) ? attendanceQuery.data : [];
    
    const activeProfiles = profiles.filter(profile => profile.is_active !== false).length;
    const completeProfiles = profiles.filter(profile => profile.employee_id && profile.department && profile.job_title && profile.hire_date).length;
    const pendingLeaves = leaves.filter(leave => leave.status === 'Pending').length;
    const clockedIn = attendance.filter(record => record.clock_in && !record.clock_out && record.status !== 'Absent').length;
    const expiringCredentials = Array.isArray(credentialsQuery.data)
        ? credentialsQuery.data.filter((row) => new Date(row.expires_at) >= new Date()).length
        : 0;
    
    const headerLoading = profilesQuery.isLoading || leavesQuery.isLoading || attendanceQuery.isLoading;
    const headerFetching = profilesQuery.isFetching || leavesQuery.isFetching || attendanceQuery.isFetching;
    const headerError = profilesQuery.isError || leavesQuery.isError || attendanceQuery.isError;

    const refreshHeader = () => {
        profilesQuery.refetch();
        leavesQuery.refetch();
        attendanceQuery.refetch();
    };

    const tabs = [
        { id: 'directory', icon: Users, label: t('hr.tabs.directory', { defaultValue: 'Employee Directory' }), count: null },
        { id: 'shifts', icon: CalendarClock, label: t('hr.tabs.shifts', { defaultValue: 'Shift Roster' }), count: null },
        { id: 'attendance', icon: Clock, label: t('hr.tabs.attendance', { defaultValue: 'Attendance' }), count: clockedIn > 0 ? clockedIn : null, countTone: 'emerald' },
        { id: 'leave', icon: CalendarOff, label: t('hr.tabs.leave', { defaultValue: 'Leave Requests' }), count: pendingLeaves > 0 ? pendingLeaves : null, countTone: 'amber' },
        { id: 'credentials', icon: BadgeCheck, label: t('hr.tabs.credentials', { defaultValue: 'Credentials' }), count: expiringCredentials > 0 ? expiringCredentials : null, countTone: 'amber' },
        { id: 'productivity', icon: Target, label: t('hr.tabs.productivity', { defaultValue: 'Productivity' }), count: null },
    ];
    const requestedTab = searchParams.get('tab');
    const activeTab = tabs.some((tab) => tab.id === requestedTab) ? requestedTab : 'directory';
    const setActiveTab = (tab) => setSearchParams((current) => { const next = new URLSearchParams(current); next.set('tab', tab); return next; }, { replace: true });

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
        <main className="mx-auto max-w-[1540px] space-y-4 pb-12">
            <PageHeader
                icon={Users}
                eyebrowIcon={ShieldCheck}
                eyebrow={t('hr.eyebrow')}
                title={t('hr.title')}
                description={t('hr.description')}
                meta={
                    <span className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-bold shadow-xs ${headerError ? 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'border-teal-500/30 bg-teal-500/10 text-teal-700 dark:text-teal-300'}`}>
                        <span className={`relative flex h-2 w-2`}>
                            <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${headerError ? 'bg-amber-400' : 'bg-teal-400'}`} />
                            <span className={`relative inline-flex h-2 w-2 rounded-full ${headerError ? 'bg-amber-500' : 'bg-teal-500'}`} />
                        </span>
                        {headerError ? t('hr.header.partial') : t('hr.header.live')}
                    </span>
                }
                actions={
                    <button
                        type="button"
                        onClick={refreshHeader}
                        disabled={headerFetching}
                        className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-4 text-xs font-black text-slate-700 shadow-sm transition hover:border-teal-500/40 hover:text-teal-700 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-teal-500/40"
                    >
                        <RefreshCw size={15} className={headerFetching ? 'animate-spin text-teal-600' : ''} />
                        {t('hr.header.refresh')}
                    </button>
                }
                metrics={[
                    { key: 'profiles', icon: Users, label: t('hr.directory.staffCount'), value: profiles.length, tone: 'teal', loading: headerLoading },
                    { key: 'active', icon: UserCheck, label: t('hr.directory.activeStaff'), value: activeProfiles, tone: 'emerald', loading: headerLoading },
                    { key: 'complete', icon: BadgeCheck, label: t('hr.directory.completeProfiles'), value: completeProfiles, tone: 'blue', loading: headerLoading },
                    { key: 'leave', icon: CalendarOff, label: t('hr.leave.pending'), value: pendingLeaves, tone: pendingLeaves > 0 ? 'amber' : 'emerald', loading: headerLoading },
                    { key: 'attendance', icon: Clock, label: t('hr.header.clockedIn'), value: clockedIn, detail: t('hr.header.today'), tone: 'violet', loading: headerLoading },
                ]}
                metricsLabel={t('hr.header.metricsLabel')}
            />

            {/* Segmented Modern Tab Strip */}
<div data-workspace-tabs className="rounded-2xl border border-slate-200/80 bg-white/90 p-1.5 shadow-sm backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/90 lg:hidden">
                <nav className="flex gap-1.5 overflow-x-auto p-0.5 scrollbar-none" role="tablist" aria-label={t('hr.tabsLabel', { defaultValue: 'HR sections' })}>
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
                                className={`group relative flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-black transition-all ${
                                    active
                                        ? 'bg-teal-600 text-white shadow-sm shadow-teal-600/25 dark:bg-teal-600 dark:text-white'
                                        : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200'
                                }`}
                            >
                                <Icon size={16} className={`shrink-0 transition-transform group-hover:scale-110 ${active ? 'text-white' : 'text-slate-400 dark:text-slate-500'}`} />
                                <span>{tab.label}</span>
                                {tab.count !== null && (
                                    <span className={`ms-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-black ${
                                        active
                                            ? 'bg-white/20 text-white ring-1 ring-white/30'
                                            : tab.countTone === 'amber'
                                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                                    }`}>
                                        {tab.count}
                                    </span>
                                )}
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
                {activeTab === 'credentials' && <CredentialsManager />}
                {activeTab === 'productivity' && <ProductivityReport />}
            </div>
        </main>
    );
};

export default HR;
