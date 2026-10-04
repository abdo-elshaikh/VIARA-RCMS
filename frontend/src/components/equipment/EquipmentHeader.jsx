import React from 'react';
import { Link } from 'react-router-dom';
import { Upload, Download, Plus, RefreshCw, Activity, MoreHorizontal } from 'lucide-react';

/**
 * Action button cluster rendered inside the equipment page header.
 * @param {Object} props
 * @param {Function} props.t - Translation function
 * @param {string} props.safeTab - Resolved active tab id
 * @param {boolean} props.canManageRooms
 * @param {boolean} props.canManageEquipment
 * @param {boolean} props.canManageProcedures
 * @param {boolean} [props.canViewModality]
 * @param {boolean} [props.isArabic]
 * @param {boolean} props.headerFetching
 * @param {Function} props.onImport
 * @param {Function} props.onExport
 * @param {Function} props.onCreateRoom
 * @param {Function} props.onCreateMachine
 * @param {Function} props.onCreateExam
 * @param {Function} props.onRefresh
 */
export const EquipmentHeaderActions = ({
    t,
    safeTab,
    canManageRooms,
    canManageEquipment,
    canManageProcedures,
    canViewModality = false,
    isArabic = false,
    headerFetching,
    onImport,
    onExport,
    onCreateRoom,
    onCreateMachine,
    onCreateExam,
    onRefresh
}) => {
    const menuRef = React.useRef(null);
    const secondaryClass = 'inline-flex h-10 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm transition-all hover:bg-slate-50 disabled:opacity-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200';
    const primaryClass = 'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-teal-600 px-3.5 text-xs font-black text-white shadow-sm shadow-teal-600/20 transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-50';
    const menuItemClass = 'flex min-h-10 w-full items-center gap-2 rounded-lg px-3 text-start text-xs font-bold text-slate-700 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-200 dark:hover:bg-slate-800';
    const primaryAction = safeTab === 'registry'
        ? { label: t('newMachine'), onClick: onCreateMachine, disabled: !canManageEquipment }
        : safeTab === 'procedures'
            ? { label: t('newProcedure'), onClick: onCreateExam, disabled: !canManageProcedures }
            : ['maintenance', 'downtime', 'workstations'].includes(safeTab)
                ? null
                : { label: t('newSuite'), onClick: onCreateRoom, disabled: !canManageRooms };
    const canImportCurrentTab = safeTab === 'workstations' ? false : safeTab === 'registry'
        ? canManageEquipment
        : safeTab === 'procedures'
            ? canManageProcedures
            : canManageRooms;
    const runMenuAction = action => {
        action();
        menuRef.current?.removeAttribute('open');
    };

    return (
        <div className="flex items-center justify-end gap-2">
            {primaryAction && (
                <button type="button" onClick={primaryAction.onClick} disabled={primaryAction.disabled} className={primaryClass}>
                    <Plus size={15} aria-hidden="true" />
                    {primaryAction.label}
                </button>
            )}
            <button type="button" onClick={onRefresh} disabled={headerFetching} className={secondaryClass} title={t('refreshAllAssets')}>
                <RefreshCw size={14} className={headerFetching ? 'animate-spin' : ''} aria-hidden="true" />
                {t('refresh')}
            </button>
            <details ref={menuRef} className="group relative">
                <summary
                    className={`${secondaryClass} list-none cursor-pointer justify-center [&::-webkit-details-marker]:hidden`}
                    aria-label={isArabic ? '\u0627\u0644\u0645\u0632\u064a\u062f \u0645\u0646 \u0627\u0644\u0625\u062c\u0631\u0627\u0621\u0627\u062a' : 'More actions'}
                    title={isArabic ? '\u0627\u0644\u0645\u0632\u064a\u062f \u0645\u0646 \u0627\u0644\u0625\u062c\u0631\u0627\u0621\u0627\u062a' : 'More actions'}
                >
                    <MoreHorizontal size={18} aria-hidden="true" />
                </summary>
                <div className="absolute end-0 top-full z-30 mt-2 grid min-w-52 gap-1 rounded-xl border border-slate-200 bg-white p-1.5 shadow-xl dark:border-slate-700 dark:bg-slate-900">
                    {!['maintenance', 'downtime', 'workstations'].includes(safeTab) && (
                        <button type="button" onClick={() => runMenuAction(() => onImport(safeTab))} disabled={!canImportCurrentTab} className={menuItemClass} title={t('importFromCsv')}>
                            <Upload size={15} className="text-teal-600" aria-hidden="true" />{t('import')}
                        </button>
                    )}
                    <button type="button" onClick={() => runMenuAction(onExport)} className={menuItemClass} title={t('exportData')}>
                        <Download size={15} className="text-cyan-600" aria-hidden="true" />{t('export')}
                    </button>
                    {safeTab !== 'matrix' && safeTab !== 'rooms' && (
                        <button type="button" onClick={() => runMenuAction(onCreateRoom)} disabled={!canManageRooms} className={menuItemClass}>
                            <Plus size={15} aria-hidden="true" />{t('newSuite')}
                        </button>
                    )}
                    {safeTab !== 'registry' && (
                        <button type="button" onClick={() => runMenuAction(onCreateMachine)} disabled={!canManageEquipment} className={menuItemClass}>
                            <Plus size={15} aria-hidden="true" />{t('newMachine')}
                        </button>
                    )}
                    {safeTab !== 'procedures' && (
                        <button type="button" onClick={() => runMenuAction(onCreateExam)} disabled={!canManageProcedures} className={menuItemClass}>
                            <Plus size={15} aria-hidden="true" />{t('newProcedure')}
                        </button>
                    )}
                    {canViewModality && (
                        <Link to="/modality" onClick={() => menuRef.current?.removeAttribute('open')} className={menuItemClass} title={isArabic ? '\u0637\u0627\u0628\u0648\u0631 \u0627\u0644\u0641\u062d\u0635 \u0627\u0644\u0633\u0631\u064a\u0631\u064a' : 'Go to Clinical Modality Queue'}>
                            <Activity size={15} className="text-teal-600 dark:text-teal-400" aria-hidden="true" />
                            {isArabic ? '\u0637\u0627\u0628\u0648\u0631 \u0627\u0644\u0641\u062d\u0635 \u0627\u0644\u0633\u0631\u064a\u0631\u064a' : 'Clinical Modality'}
                        </Link>
                    )}
                </div>
            </details>
        </div>
    );
};
/**
 * Segmented tab navigation bar for the equipment workspace.
 * @param {Object} props
 * @param {Function} props.t - Translation function
 * @param {Array} props.tabs - Tab configuration array
 * @param {string} props.activeTab - Currently active tab id
 * @param {Function} props.onTabChange - Tab change handler
 */
export const EquipmentTabs = ({ t, tabs, activeTab, onTabChange }) => {
    return (
        <div data-workspace-tabs className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 xl:sticky xl:top-4">
            <div className="hidden border-b border-slate-100 px-4 py-3 dark:border-slate-800 xl:block">
                <p className="text-[10px] font-black uppercase tracking-[.14em] text-slate-400">{t('equipmentSections')}</p>
            </div>
            <nav className="flex gap-1.5 overflow-x-auto p-1.5 scrollbar-none xl:grid xl:grid-cols-1 xl:overflow-visible" role="tablist" aria-label={t('equipmentSections')}>
                {tabs.map((tab) => {
                    const Icon = tab.icon;
                    const active = activeTab === tab.id;

                    return (
                        <button
                            key={tab.id}
                            type="button"
                            role="tab"
                            id={`equipment-tab-${tab.id}`}
                            aria-controls="equipment-tabpanel"
                            aria-selected={active}
                            tabIndex={active ? 0 : -1}
                            onClick={() => {
                                onTabChange(tab.id);
                            }}
                            aria-current={active ? 'page' : undefined}
                            className={`flex min-h-12 min-w-[150px] flex-1 items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-start text-xs font-black transition-all xl:min-w-0 ${
                                active
                                    ? 'border-teal-200 bg-teal-50 text-teal-900 dark:border-teal-900 dark:bg-teal-950/50 dark:text-teal-100'
                                    : 'border-transparent bg-white text-slate-600 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-400 dark:hover:bg-slate-800'
                            }`}
                        >
                            <span className="flex min-w-0 items-center gap-2.5">
                                <Icon size={16} className={active ? 'shrink-0 text-teal-700 dark:text-teal-300' : 'shrink-0 text-slate-400'} aria-hidden="true" />
                                <span className="truncate">{tab.label}</span>
                            </span>
                            {tab.count !== undefined && tab.count !== null && (
                                <span className={`shrink-0 rounded-lg px-2 py-1 text-[10px] font-black tabular-nums ${
                                    active ? 'bg-white text-teal-800 dark:bg-teal-900 dark:text-teal-100' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
                                }`}>
                                    {tab.count}
                                </span>
                            )}
                        </button>
                    );
                })}
            </nav>
        </div>
    );
};

