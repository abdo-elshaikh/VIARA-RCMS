import { useState } from 'react';
import { BadgeCheck, LayoutDashboard, Package, ShieldCheck, Truck, Users, Zap, AlertTriangle, Layers3 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import InventoryDashboard from '../components/inventory/InventoryDashboard';
import InventoryCatalog from '../components/inventory/InventoryCatalog';
import SupplierManager from '../components/inventory/SupplierManager';
import PurchaseOrderManager from '../components/inventory/PurchaseOrderManager';
import { selectCurrentUser } from '../store/authSlice';

const Inventory = () => {
    const [activeTab, setActiveTab] = useState('dashboard');
    const { t, i18n } = useTranslation('workspace');
    const user = useSelector(selectCurrentUser);
    const isArabic = i18n.language === 'ar';

    const tabs = [
        { id: 'dashboard', icon: LayoutDashboard, label: t('inventory.tabs.dashboard', { defaultValue: 'Dashboard' }) },
        { id: 'catalog', icon: Package, label: t('inventory.tabs.catalog', { defaultValue: 'Stock Catalog' }) },
        { id: 'pos', icon: Truck, label: t('inventory.tabs.pos', { defaultValue: 'Purchase Orders' }) },
        { id: 'suppliers', icon: Users, label: t('inventory.tabs.suppliers', { defaultValue: 'Suppliers' }) },
    ].filter(tab => tab.id !== 'suppliers' || ['Admin', 'Developer'].includes(user?.role));

    return (
        <main className="mx-auto max-w-[1600px] space-y-6 pb-12">
            {/* Executive Hero Command Deck */}
            <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-8">
                <div className="pointer-events-none absolute -end-16 -top-16 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl dark:bg-teal-500/5" />
                <div className="pointer-events-none absolute -bottom-16 -start-16 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl dark:bg-sky-500/5" />

                <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4 sm:items-center">
                        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teal-500/20 to-teal-600/30 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/30 shadow-inner">
                            <Package size={26} />
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-300">
                                    <Layers3 size={11} />
                                    <span>{isArabic ? 'المخزون والمستهلكات الطبية' : 'Inventory & Consumables'}</span>
                                </span>
                            </div>
                            <h1 className="mt-1 truncate text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">
                                {t('inventory.title', { defaultValue: 'Inventory Management' })}
                            </h1>
                            <p className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400 sm:text-sm">
                                {t('inventory.description', { defaultValue: 'Track clinic stock levels, batches, expiry alerts, purchase orders, and supplier relationships.' })}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-xl border border-teal-500/30 bg-teal-500/10 px-3 py-1.5 text-xs font-black text-teal-700 dark:text-teal-300">
                            <ShieldCheck size={14} />
                            <span>{isArabic ? 'تتبع الصلاحية FEFO' : 'FEFO Expiry Tracking'}</span>
                        </span>
                        <span className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5 text-xs font-black text-emerald-700 dark:text-emerald-300">
                            <Zap size={14} />
                            <span>{isArabic ? 'سجل فوري متزامن' : 'Live Inventory Sync'}</span>
                        </span>
                    </div>
                </div>
            </div>

            {/* Segmented Tab Strip */}
            <div className="rounded-3xl border border-slate-200/80 bg-white/90 p-2 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90">
                <nav className="flex gap-2 overflow-x-auto p-1 scrollbar-none" aria-label="Inventory Sections">
                    {tabs.map((tab) => {
                        const Icon = tab.icon;
                        const active = activeTab === tab.id;
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

            {/* Tab Views Container */}
            <div className="transition-all duration-300">
                {activeTab === 'dashboard' && <InventoryDashboard />}
                {activeTab === 'catalog' && <InventoryCatalog />}
                {activeTab === 'pos' && <PurchaseOrderManager />}
                {activeTab === 'suppliers' && <SupplierManager />}
            </div>
        </main>
    );
};

export default Inventory;
