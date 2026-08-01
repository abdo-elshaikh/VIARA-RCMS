import { useState } from 'react';
import { BadgeCheck, LayoutDashboard, Package, ShieldCheck, Truck, Users, Zap } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import InventoryDashboard from '../components/inventory/InventoryDashboard';
import InventoryCatalog from '../components/inventory/InventoryCatalog';
import SupplierManager from '../components/inventory/SupplierManager';
import PurchaseOrderManager from '../components/inventory/PurchaseOrderManager';
import PageHeader from '../components/ui/PageHeader';

const Inventory = () => {
    const [activeTab, setActiveTab] = useState('dashboard');
    const { t } = useTranslation('workspace');

    const tabs = [
        { id: 'dashboard', icon: LayoutDashboard, label: t('inventory.tabs.dashboard', { defaultValue: 'Dashboard' }), tone: 'cyan' },
        { id: 'catalog', icon: Package, label: t('inventory.tabs.catalog', { defaultValue: 'Stock Catalog' }), tone: 'emerald' },
        { id: 'pos', icon: Truck, label: t('inventory.tabs.pos', { defaultValue: 'Purchase Orders' }), tone: 'indigo' },
        { id: 'suppliers', icon: Users, label: t('inventory.tabs.suppliers', { defaultValue: 'Suppliers' }), tone: 'amber' },
    ];

    return (
        <main className="app-page">
            <div className="mx-auto max-w-screen-2xl space-y-6 pb-12">
                {/* Modernized Page Header */}
                <PageHeader
                    icon={Package}
                    eyebrow={t('inventory.eyebrow', { defaultValue: 'Inventory & Consumables' })}
                    title={t('inventory.title', { defaultValue: 'Inventory Management' })}
                    description={t('inventory.description', { defaultValue: 'Track clinic stock levels, batches, expiry alerts, purchase orders, and supplier relationships.' })}
                    className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50/50 to-cyan-50/40 p-6 shadow-xl shadow-slate-200/30 backdrop-blur-xl dark:border-white/10 dark:from-slate-950 dark:via-slate-900/90 dark:to-cyan-950/20 dark:shadow-none"
                    meta={
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200/80 bg-teal-50/90 px-3 py-1 text-xs font-bold text-teal-800 shadow-sm dark:border-teal-500/20 dark:bg-teal-500/10 dark:text-teal-300">
                                <ShieldCheck size={13} className="text-teal-600 dark:text-teal-400" />
                                FEFO Batch Tracking
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-200/80 bg-cyan-50/90 px-3 py-1 text-xs font-bold text-cyan-800 shadow-sm dark:border-cyan-500/20 dark:bg-cyan-500/10 dark:text-cyan-300">
                                <BadgeCheck size={13} className="text-cyan-600 dark:text-cyan-400" />
                                Automated Alerts
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/90 px-3 py-1 text-xs font-bold text-emerald-800 shadow-sm dark:border-emerald-500/20 dark:bg-emerald-500/10 dark:text-emerald-300">
                                <Zap size={13} className="text-emerald-600 dark:text-emerald-400" />
                                Real-time Ledger
                            </span>
                        </div>
                    }
                />

                {/* Segmented Tab Strip */}
                <div className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 p-3 shadow-lg shadow-slate-200/40 backdrop-blur-xl dark:border-white/10 dark:bg-[#07111f]/80 dark:shadow-none">
                    <nav className="flex space-x-2 overflow-x-auto p-1 scrollbar-none" aria-label="Inventory Sections">
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
                                            ? 'border-cyan-400/80 bg-cyan-50/90 text-cyan-950 shadow-md ring-4 ring-cyan-500/15 dark:border-cyan-500/80 dark:bg-cyan-950/40 dark:text-cyan-200 dark:ring-cyan-500/20'
                                            : 'border-slate-200/80 bg-white/70 text-slate-600 hover:border-slate-300 hover:bg-slate-100/80 dark:border-white/5 dark:bg-white/[0.02] dark:text-slate-300 dark:hover:border-white/10 dark:hover:bg-white/5'
                                    }`}
                                >
                                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition-transform duration-300 group-hover:scale-110 ${
                                        active
                                            ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-500/20 dark:text-cyan-300'
                                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                    }`}>
                                        <Icon size={16} />
                                    </span>
                                    <span className="block text-xs font-black tracking-tight text-slate-900 dark:text-white">
                                        {tab.label}
                                    </span>
                                    {active && (
                                        <span className="ms-1 flex h-2 w-2 rounded-full bg-cyan-500 shadow-sm shadow-cyan-500/50" />
                                    )}
                                </button>
                            );
                        })}
                    </nav>
                </div>

                {/* Tab Views Container */}
                <div className="transition-all duration-300">
                    {activeTab === 'dashboard' && <InventoryDashboard />}
                    {activeTab === 'catalog' && <InventoryCatalog />}
                    {activeTab === 'pos' && <PurchaseOrderManager />}
                    {activeTab === 'suppliers' && <SupplierManager />}
                </div>
            </div>
        </main>
    );
};

export default Inventory;
