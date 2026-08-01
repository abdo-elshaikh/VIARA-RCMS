import { useMemo } from 'react';
import { AlertTriangle, Clock, Package, RefreshCw, TrendingDown, TrendingUp } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGetExpiryAlertsQuery, useGetInventoryQuery, useGetStockMovementsQuery } from '../../store/api';

const InventoryDashboard = () => {
    const { t, i18n } = useTranslation('workspace');
    const copy = (key, options) => t(`inventory.dashboard.${key}`, options);
    const locale = i18n.language.startsWith('ar') ? 'ar-EG' : 'en-EG';

    const { data: alerts = [], isLoading: alertsLoading, isError: alertsError, refetch: refetchAlerts } = useGetExpiryAlertsQuery();
    const { data: movements = [], isLoading: movementsLoading, isError: movementsError, refetch: refetchMovements } = useGetStockMovementsQuery({ limit: 10 });
    const { data: inventory = [], isLoading: inventoryLoading, isError: inventoryError, refetch: refetchInventory } = useGetInventoryQuery();

    const lowStockItems = useMemo(
        () => inventory.filter(item => Number(item.quantity) <= Number(item.min_level)).sort((a, b) => (Number(a.quantity) - Number(a.min_level)) - (Number(b.quantity) - Number(b.min_level))),
        [inventory]
    );
    const expiredCount = alerts.filter(alert => new Date(alert.expiry_date) < new Date()).length;
    const movementToday = movements.filter(movement => new Date(movement.created_at).toDateString() === new Date().toDateString()).length;

    const loading = inventoryLoading || alertsLoading || movementsLoading;
    const hasError = inventoryError || alertsError || movementsError;

    const refreshAll = () => {
        refetchInventory();
        refetchAlerts();
        refetchMovements();
    };

    const formatDate = value => value ? new Date(value).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
    const formatDateTime = value => value ? new Date(value).toLocaleString(locale, { dateStyle: 'medium', timeStyle: 'short' }) : '—';

    return (
        <div className="space-y-6">
            {/* Header Refresh Control */}
            <div className="flex justify-end">
                <button
                    type="button"
                    onClick={refreshAll}
                    disabled={loading}
                    className="inline-flex min-h-10 items-center gap-2 rounded-2xl border border-slate-200/80 bg-white px-4 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:opacity-50 dark:border-white/10 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                    <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
                    {copy('refresh')}
                </button>
            </div>

            {hasError && (
                <div role="alert" className="rounded-2xl border border-rose-300/80 bg-rose-50/90 p-4 text-xs font-bold text-rose-900 shadow-sm dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-200">
                    {copy('partialError')}
                </div>
            )}

            {/* Executive KPI Signals */}
            <section className="grid grid-cols-2 gap-4 xl:grid-cols-4" aria-label={copy('summaryLabel')}>
                <Metric icon={AlertTriangle} label={copy('lowStock')} value={lowStockItems.length} tone="rose" loading={inventoryLoading} trend={lowStockItems.length > 0 ? 'Action Req' : 'Optimal'} />
                <Metric icon={Clock} label={copy('expiring')} value={alerts.length} tone="amber" loading={alertsLoading} trend={expiredCount > 0 ? `${expiredCount} Expired` : 'Monitored'} />
                <Metric icon={Package} label={copy('catalogItems')} value={inventory.length} tone="blue" loading={inventoryLoading} trend="Total SKUs" />
                <Metric icon={TrendingUp} label={copy('movementsToday')} value={movementToday} tone="emerald" loading={movementsLoading} trend="Daily Velocity" />
            </section>

            {/* Low Stock & Expiry Panels */}
            <div className="grid items-start gap-6 xl:grid-cols-2">
                <Panel icon={AlertTriangle} title={copy('reorderTitle')} description={copy('reorderDescription')} tone="rose">
                    {inventoryLoading ? (
                        <Loading />
                    ) : lowStockItems.length === 0 ? (
                        <Healthy title={copy('stockHealthy')} description={copy('stockHealthyDescription')} />
                    ) : (
                        <div className="space-y-2.5">
                            {lowStockItems.map(item => (
                                <article key={item.item_id} className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200/70 bg-rose-50/60 p-4 transition-colors dark:border-rose-500/20 dark:bg-rose-950/20">
                                    <div>
                                        <h3 className="text-xs font-black text-slate-900 dark:text-white sm:text-sm">{item.name}</h3>
                                        <p className="mt-1 text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                            {copy('minimum', { value: item.min_level, unit: item.unit || copy('units') })}
                                        </p>
                                    </div>
                                    <div className="text-end">
                                        <p className="font-mono text-xl font-black text-rose-600 dark:text-rose-400">{item.quantity}</p>
                                        <p className="text-[10px] font-bold text-rose-500 dark:text-rose-400">{item.unit || copy('units')}</p>
                                    </div>
                                </article>
                            ))}
                        </div>
                    )}
                </Panel>

                <Panel icon={Clock} title={copy('expiryTitle')} description={copy('expiryDescription')} tone="amber" badge={expiredCount > 0 ? copy('expiredCount', { count: expiredCount }) : undefined}>
                    {alertsLoading ? (
                        <Loading />
                    ) : alerts.length === 0 ? (
                        <Healthy title={copy('expiryHealthy')} description={copy('expiryHealthyDescription')} />
                    ) : (
                        <div className="space-y-2.5">
                            {alerts.map(alert => {
                                const expired = new Date(alert.expiry_date) < new Date();
                                return (
                                    <article
                                        key={alert.batch_id}
                                        className={`rounded-2xl border p-4 transition-colors ${
                                            expired
                                                ? 'border-rose-200/80 bg-rose-50/70 dark:border-rose-500/20 dark:bg-rose-950/20'
                                                : 'border-amber-200/80 bg-amber-50/60 dark:border-amber-500/20 dark:bg-amber-950/20'
                                        }`}
                                    >
                                        <div className="flex items-start justify-between gap-3">
                                            <div>
                                                <h3 className="text-xs font-black text-slate-900 dark:text-white sm:text-sm">{alert.item_name}</h3>
                                                <p className="mt-1 font-mono text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                                                    {alert.lot_number || copy('noLot')} · {alert.quantity} {alert.unit || copy('units')}
                                                </p>
                                            </div>
                                            <span className={`rounded-full px-2.5 py-1 text-[10px] font-black ${
                                                expired
                                                    ? 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300'
                                                    : 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                                            }`}>
                                                {expired ? copy('expired') : formatDate(alert.expiry_date)}
                                            </span>
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    )}
                </Panel>
            </div>

            {/* Stock Movement Log Panel */}
            <Panel icon={TrendingDown} title={copy('movementsTitle')} description={copy('movementsDescription')} tone="blue">
                {movementsLoading ? (
                    <Loading />
                ) : movementsError ? (
                    <p role="alert" className="py-8 text-center text-xs font-bold text-rose-600 dark:text-rose-400">{copy('movementsError')}</p>
                ) : movements.length === 0 ? (
                    <Healthy title={copy('noMovements')} description={copy('noMovementsDescription')} />
                ) : (
                    <>
                        <div className="divide-y divide-slate-100/80 dark:divide-white/5 md:hidden">
                            {movements.map(movement => (
                                <MovementCard key={movement.movement_id} movement={movement} copy={copy} formatDateTime={formatDateTime} />
                            ))}
                        </div>
                        <div className="hidden overflow-x-auto md:block">
                            <table className="w-full min-w-[700px] text-xs">
                                <thead className="border-b border-slate-200/80 bg-slate-50/70 text-slate-500 dark:border-white/5 dark:bg-white/5 dark:text-slate-400">
                                    <tr>
                                        {['item', 'movement', 'reference', 'date', 'quantity'].map(key => (
                                            <th key={key} className={`px-4 py-3.5 text-xs font-black uppercase tracking-wider ${key === 'quantity' ? 'text-end' : 'text-start'}`}>
                                                {copy(key)}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100/80 dark:divide-white/5">
                                    {movements.map(movement => (
                                        <MovementRow key={movement.movement_id} movement={movement} copy={copy} formatDateTime={formatDateTime} />
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </Panel>
        </div>
    );
};

const tones = {
    rose: 'bg-rose-100 text-rose-700 ring-1 ring-rose-200 dark:bg-rose-500/20 dark:text-rose-300 dark:ring-rose-500/30',
    amber: 'bg-amber-100 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-500/20 dark:text-amber-300 dark:ring-amber-500/30',
    blue: 'bg-cyan-100 text-cyan-700 ring-1 ring-cyan-200 dark:bg-cyan-500/20 dark:text-cyan-300 dark:ring-cyan-500/30',
    emerald: 'bg-emerald-100 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-500/20 dark:text-emerald-300 dark:ring-emerald-500/30'
};

const Metric = ({ icon: Icon, label, value, tone, loading, trend }) => (
    <article className="group relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 p-5 shadow-lg shadow-slate-200/30 backdrop-blur-xl transition-all duration-300 hover:-translate-y-1 hover:shadow-xl dark:border-white/10 dark:bg-[#07111f]/80 dark:shadow-none">
        <div className="flex items-center justify-between gap-2">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
            <span className={`flex h-10 w-10 items-center justify-center rounded-2xl shadow-sm transition-transform duration-300 group-hover:scale-110 ${tones[tone]}`}>
                <Icon size={18} />
            </span>
        </div>
        {loading ? (
            <div className="mt-3 h-7 w-20 animate-pulse rounded-xl bg-slate-200/70 dark:bg-white/10" />
        ) : (
            <p className="mt-2 font-mono text-2xl font-black text-slate-900 dark:text-white">{value}</p>
        )}
        {trend && (
            <p className="mt-1.5 truncate text-[11px] font-bold text-slate-500 dark:text-slate-400">
                {trend}
            </p>
        )}
    </article>
);

const Panel = ({ icon: Icon, title, description, tone, badge, children }) => (
    <section className="overflow-hidden rounded-3xl border border-slate-200/80 bg-white/80 shadow-xl shadow-slate-200/30 backdrop-blur-xl dark:border-white/10 dark:bg-[#07111f]/80 dark:shadow-none">
        <header className="flex items-start justify-between gap-3 border-b border-slate-100/80 bg-slate-50/50 p-5 dark:border-white/5 dark:bg-white/5">
            <div className="flex items-start gap-3.5">
                <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl shadow-sm ${tones[tone]}`}>
                    <Icon size={20} />
                </span>
                <div>
                    <h2 className="text-base font-black text-slate-900 dark:text-white sm:text-lg">{title}</h2>
                    <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">{description}</p>
                </div>
            </div>
            {badge && (
                <span className="shrink-0 rounded-full bg-rose-100 px-3 py-1 text-[10px] font-black text-rose-800 dark:bg-rose-500/20 dark:text-rose-300">
                    {badge}
                </span>
            )}
        </header>
        <div className="p-5">{children}</div>
    </section>
);

const MovementBadge = ({ type, copy }) => {
    const badgeStyles = {
        Receive: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300',
        Consume: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300',
        Adjust: 'bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-300'
    };
    return (
        <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-bold ${badgeStyles[type] || badgeStyles.Adjust}`}>
            {copy(`types.${type}`, { defaultValue: type })}
        </span>
    );
};

const MovementCard = ({ movement, copy, formatDateTime }) => (
    <article className="p-4">
        <div className="flex items-start justify-between gap-3">
            <div>
                <h3 className="font-black text-slate-900 dark:text-white text-xs">{movement.item_name}</h3>
                <p className="mt-1 text-[11px] font-medium text-slate-500 dark:text-slate-400">{formatDateTime(movement.created_at)}</p>
            </div>
            <p className={`font-mono text-base font-black ${Number(movement.quantity_change) > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                {Number(movement.quantity_change) > 0 ? '+' : ''}{movement.quantity_change}
            </p>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
            <MovementBadge type={movement.movement_type} copy={copy} />
            <span className="truncate text-xs font-semibold text-slate-500 dark:text-slate-400">{movement.patient_name || movement.reference_type || '—'}</span>
        </div>
    </article>
);

const MovementRow = ({ movement, copy, formatDateTime }) => (
    <tr className="transition-colors hover:bg-slate-50/50 dark:hover:bg-white/[0.02]">
        <td className="px-4 py-3.5 font-bold text-slate-900 dark:text-white">{movement.item_name}</td>
        <td className="px-4 py-3.5"><MovementBadge type={movement.movement_type} copy={copy} /></td>
        <td className="px-4 py-3.5 font-semibold text-slate-600 dark:text-slate-400">{movement.patient_name || movement.reference_type || '—'}</td>
        <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400">{formatDateTime(movement.created_at)}</td>
        <td className={`px-4 py-3.5 text-end font-mono font-black ${Number(movement.quantity_change) > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
            {Number(movement.quantity_change) > 0 ? '+' : ''}{movement.quantity_change}
        </td>
    </tr>
);

const Loading = () => (
    <div className="space-y-2.5">
        {[0, 1, 2].map(item => (
            <div key={item} className="h-14 animate-pulse rounded-2xl bg-slate-100 dark:bg-white/5" />
        ))}
    </div>
);

const Healthy = ({ title, description }) => (
    <div className="py-8 text-center">
        <Package size={34} className="mx-auto text-emerald-500 dark:text-emerald-400" />
        <p className="mt-3 font-black text-slate-900 dark:text-white text-sm">{title}</p>
        <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">{description}</p>
    </div>
);

export default InventoryDashboard;
