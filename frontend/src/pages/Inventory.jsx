import { useSearchParams } from 'react-router-dom';
import { LayoutDashboard, Package, Truck, Users, AlertTriangle, Layers3, Clock, RefreshCw, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import InventoryDashboard from '../components/inventory/InventoryDashboard';
import InventoryCatalog from '../components/inventory/InventoryCatalog';
import SupplierManager from '../components/inventory/SupplierManager';
import PurchaseOrderManager from '../components/inventory/PurchaseOrderManager';
import { selectCurrentUser } from '../store/authSlice';
import PageHeader from '../components/ui/PageHeader';
import { useGetExpiryAlertsQuery, useGetInventoryQuery, useGetStockMovementsQuery } from '../store/api';

const Inventory = () => {
    const [searchParams, setSearchParams] = useSearchParams();
    const { t, i18n } = useTranslation('workspace');
    const user = useSelector(selectCurrentUser);
    const isArabic = i18n.language === 'ar';
    const inventoryQuery = useGetInventoryQuery();
    const alertsQuery = useGetExpiryAlertsQuery();
    const movementsQuery = useGetStockMovementsQuery({ limit: 100 });
    const inventory = Array.isArray(inventoryQuery.data) ? inventoryQuery.data : [];
    const alerts = Array.isArray(alertsQuery.data) ? alertsQuery.data : [];
    const movements = Array.isArray(movementsQuery.data) ? movementsQuery.data : [];
    const lowStock = inventory.filter(item => Number(item.quantity) <= Number(item.min_level)).length;
    const expired = alerts.filter(alert => new Date(alert.expiry_date) < new Date()).length;
    const movementsToday = movements.filter(item => new Date(item.created_at).toDateString() === new Date().toDateString()).length;
    const headerLoading = inventoryQuery.isLoading || alertsQuery.isLoading || movementsQuery.isLoading;
    const headerFetching = inventoryQuery.isFetching || alertsQuery.isFetching || movementsQuery.isFetching;
    const refreshHeader = () => { inventoryQuery.refetch(); alertsQuery.refetch(); movementsQuery.refetch(); };

    const tabs = [
        { id: 'dashboard', icon: LayoutDashboard, label: t('inventory.tabs.dashboard', { defaultValue: 'Dashboard' }) },
        { id: 'catalog', icon: Package, label: t('inventory.tabs.catalog', { defaultValue: 'Stock Catalog' }) },
        { id: 'pos', icon: Truck, label: t('inventory.tabs.pos', { defaultValue: 'Purchase Orders' }) },
        { id: 'suppliers', icon: Users, label: t('inventory.tabs.suppliers', { defaultValue: 'Suppliers' }) },
    ].filter(tab => tab.id !== 'suppliers' || ['Admin', 'Developer'].includes(user?.role));
    const requestedTab = searchParams.get('tab');
    const activeTab = tabs.some((tab) => tab.id === requestedTab) ? requestedTab : 'dashboard';
    const setActiveTab = (tab) => setSearchParams((current) => { const next = new URLSearchParams(current); next.set('tab', tab); return next; }, { replace: true });

    return (
        <main className="mx-auto max-w-[1600px] space-y-6 pb-12">
            <PageHeader
                icon={Package}
                eyebrowIcon={Layers3}
                eyebrow={isArabic ? 'المخزون والمستهلكات الطبية' : 'Inventory & Consumables'}
                title={t('inventory.title', { defaultValue: 'Inventory Management' })}
                description={t('inventory.description', { defaultValue: 'Track clinic stock levels, batches, expiry alerts, purchase orders, and supplier relationships.' })}
                actions={<button type="button" onClick={refreshHeader} disabled={headerFetching} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-300"><RefreshCw size={15} className={headerFetching ? 'animate-spin' : ''} />{isArabic ? 'تحديث المخزون' : 'Refresh inventory'}</button>}
                metrics={[
                    { key: 'items', icon: Package, label: isArabic ? 'أصناف المخزون' : 'Catalog items', value: inventory.length, tone: 'teal', loading: headerLoading, error: inventoryQuery.isError },
                    { key: 'low', icon: AlertTriangle, label: isArabic ? 'مخزون منخفض' : 'Low stock', value: lowStock, tone: lowStock ? 'rose' : 'emerald', loading: headerLoading, error: inventoryQuery.isError },
                    { key: 'expiry', icon: Clock, label: isArabic ? 'تنبيهات الصلاحية' : 'Expiry alerts', value: alerts.length, detail: expired ? `${expired} ${isArabic ? 'منتهي' : 'expired'}` : undefined, tone: alerts.length ? 'amber' : 'emerald', loading: headerLoading, error: alertsQuery.isError },
                    { key: 'movement', icon: TrendingUp, label: isArabic ? 'حركات اليوم' : 'Movements today', value: movementsToday, tone: 'blue', loading: headerLoading, error: movementsQuery.isError },
                ]}
                metricsLabel={isArabic ? 'مؤشرات سجل المخزون' : 'Inventory record indicators'}
            />

            {/* Segmented Tab Strip */}
<div data-workspace-tabs className="rounded-3xl border border-slate-200/80 bg-white/90 p-2 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 lg:hidden">
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
