import { useMemo, useState } from 'react';
import { useSelector } from 'react-redux';
import { Activity, AlertTriangle, Cpu, Server, ShieldCheck, Wrench, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import EquipmentRegistry from '../components/equipment/EquipmentRegistry';
import MaintenanceManager from '../components/equipment/MaintenanceManager';
import DowntimeManager from '../components/equipment/DowntimeManager';
import PageHeader from '../components/ui/PageHeader';
import { selectCurrentUser } from '../store/authSlice';
import { hasDeveloperOrAdminRole } from '../utils/roles';

const Equipment = () => {
    const [activeTab, setActiveTab] = useState('registry');
    const { t } = useTranslation('workspace');
    const user = useSelector(selectCurrentUser);
    const canViewMaintenance = hasDeveloperOrAdminRole(user?.role) || user?.role === 'Technician';

    const tabs = useMemo(() => [
        { id: 'registry', icon: Server, label: t('equipment.tabs.registry', { defaultValue: 'Equipment Registry' }), visible: true },
        { id: 'maintenance', icon: Wrench, label: t('equipment.tabs.maintenance', { defaultValue: 'Maintenance Schedule' }), visible: canViewMaintenance },
        { id: 'downtime', icon: AlertTriangle, label: t('equipment.tabs.downtime', { defaultValue: 'Downtime Logs' }), visible: true },
    ].filter(tab => tab.visible), [canViewMaintenance, t]);

    const safeTab = activeTab === 'maintenance' && !canViewMaintenance ? 'registry' : activeTab;

    return (
        <main className="app-page">
            <div className="mx-auto max-w-screen-2xl space-y-6 pb-12">
                {/* Modern Executive Page Header */}
                <PageHeader
                    icon={Server}
                    eyebrow={t('equipment.eyebrow', { defaultValue: 'Biomedical & Modality Asset Management' })}
                    title={t('equipment.title', { defaultValue: 'Equipment & Maintenance' })}
                    description={t('equipment.description', { defaultValue: 'Monitor scanner health, DICOM modalities, preventive maintenance logs, and downtime incidents across the center.' })}
                    className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/50 to-indigo-50/40 p-6 shadow-xl shadow-slate-200/30 backdrop-blur-xl dark:border-white/10 dark:from-slate-950 dark:via-slate-900/90 dark:to-indigo-950/20 dark:shadow-none"
                    meta={
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-indigo-200/80 bg-indigo-50/90 px-3 py-1 text-xs font-bold text-indigo-800 shadow-sm dark:border-indigo-500/20 dark:bg-indigo-500/10 dark:text-indigo-300">
                                <Cpu size={13} className="text-indigo-600 dark:text-indigo-400" />
                                Modality Monitoring
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/90 px-3 py-1 text-xs font-bold text-emerald-800 shadow-sm dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                                <ShieldCheck size={13} className="text-emerald-600 dark:text-emerald-400" />
                                Preventative Care
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200/80 bg-amber-50/90 px-3 py-1 text-xs font-bold text-amber-800 shadow-sm dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-300">
                                <Zap size={13} className="text-amber-600 dark:text-amber-400" />
                                Downtime Tracking
                            </span>
                        </div>
                    }
                />

                {/* Segmented Tab Strip */}
                <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 p-3 shadow-lg shadow-slate-200/40 backdrop-blur-xl dark:border-white/10 dark:bg-[#07111f]/80 dark:shadow-none">
                    <nav className="flex space-x-2 overflow-x-auto p-1 scrollbar-none" aria-label="Equipment Sections">
                        {tabs.map((tab) => {
                            const Icon = tab.icon;
                            const active = safeTab === tab.id;
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
                    {safeTab === 'registry' && <EquipmentRegistry />}
                    {safeTab === 'maintenance' && <MaintenanceManager />}
                    {safeTab === 'downtime' && <DowntimeManager />}
                </div>
            </div>
        </main>
    );
};

export default Equipment;
