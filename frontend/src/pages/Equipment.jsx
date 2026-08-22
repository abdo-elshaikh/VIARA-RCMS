import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { Activity, AlertTriangle, Cpu, Server, ShieldCheck, Wrench, Zap, CheckCircle2, Clock3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import EquipmentRegistry from '../components/equipment/EquipmentRegistry';
import MaintenanceManager from '../components/equipment/MaintenanceManager';
import DowntimeManager from '../components/equipment/DowntimeManager';
import { selectCurrentUser } from '../store/authSlice';
import { hasDeveloperOrAdminRole } from '../utils/roles';

const Equipment = () => {
    const [activeTab, setActiveTab] = useState('registry');
    const { t, i18n } = useTranslation('workspace');
    const isArabic = i18n.language === 'ar';
    const user = useSelector(selectCurrentUser);
    const canViewMaintenance = hasDeveloperOrAdminRole(user?.role) || user?.role === 'Technician';

    const tabs = useMemo(() => [
        { id: 'registry', icon: Server, label: t('equipment.tabs.registry', { defaultValue: 'Equipment Registry' }), visible: true },
        { id: 'maintenance', icon: Wrench, label: t('equipment.tabs.maintenance', { defaultValue: 'Maintenance Schedule' }), visible: canViewMaintenance },
        { id: 'downtime', icon: AlertTriangle, label: t('equipment.tabs.downtime', { defaultValue: 'Downtime Logs' }), visible: true },
    ].filter(tab => tab.visible), [canViewMaintenance, t]);

    const safeTab = activeTab === 'maintenance' && !canViewMaintenance ? 'registry' : activeTab;

    return (
        <main className="mx-auto max-w-[1600px] space-y-6 pb-12">
            {/* Executive Hero Command Deck */}
            <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-8">
                <div className="pointer-events-none absolute -end-16 -top-16 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl dark:bg-teal-500/5" />
                <div className="pointer-events-none absolute -bottom-16 -start-16 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl dark:bg-sky-500/5" />

                <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4 sm:items-center">
                        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teal-500/20 to-teal-600/30 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/30 shadow-inner">
                            <Server size={26} />
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-300">
                                    <Cpu size={11} />
                                    <span>{isArabic ? 'إدارة الأصول الطبية الحيوية' : 'Biomedical Asset Management'}</span>
                                </span>
                            </div>
                            <h1 className="mt-1 truncate text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">
                                {t('equipment.title', { defaultValue: 'Equipment & Maintenance' })}
                            </h1>
                            <p className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400 sm:text-sm">
                                {t('equipment.description', { defaultValue: 'Monitor scanner health, DICOM modalities, preventive maintenance logs, and downtime incidents across the center.' })}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-black text-emerald-700 dark:text-emerald-300">
                            <ShieldCheck size={14} />
                            <span>{isArabic ? 'صيانة وقائية نشطة' : 'Preventative Care'}</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-1.5 text-xs font-black text-amber-700 dark:text-amber-300">
                            <Zap size={14} />
                            <span>{isArabic ? 'متابعة الأعطال الفورية' : 'Live Downtime Tracking'}</span>
                        </span>
                    </div>
                </div>
            </div>

            {/* Telemetry Metric Strip */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                    { label: isArabic ? 'إجمالي أجهزة الفحص' : 'Total Modalities', value: '14', icon: Cpu, tone: 'teal' },
                    { label: isArabic ? 'نسبة الجاهزية التشغيلية' : 'Operational Uptime', value: '99.4%', icon: CheckCircle2, tone: 'emerald' },
                    { label: isArabic ? 'الأجهزة قيد الفحص الآن' : 'Active In Exam', value: '8', icon: Activity, tone: 'sky' },
                    { label: isArabic ? 'صيانات مجدولة قادمة' : 'Scheduled Maintenance', value: '2', icon: Clock3, tone: 'amber' },
                ].map(m => {
                    const Icon = m.icon;
                    return (
                        <div key={m.label} className="flex items-center gap-3.5 rounded-3xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-teal-500/10 text-teal-700 dark:text-teal-300 border border-teal-500/30">
                                <Icon size={20} />
                            </div>
                            <div className="min-w-0">
                                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500 truncate">{m.label}</p>
                                <p className="mt-0.5 truncate text-xl font-black text-slate-900 dark:text-white tabular-nums">{m.value}</p>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Segmented Tab Navigation */}
            <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-2 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                <nav className="flex gap-2 overflow-x-auto p-1 scrollbar-none" aria-label="Equipment Sections">
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
                {safeTab === 'registry' && <EquipmentRegistry />}
                {safeTab === 'maintenance' && <MaintenanceManager />}
                {safeTab === 'downtime' && <DowntimeManager />}
            </div>
        </main>
    );
};

export default Equipment;
