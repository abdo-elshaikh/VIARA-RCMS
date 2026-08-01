import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import {
    AlertCircle,
    CheckCircle2,
    ChevronDown,
    ChevronRight,
    Copy,
    Download,
    Eye,
    FilterX,
    KeyRound,
    Layers3,
    LockKeyhole,
    Minus,
    Plus,
    RefreshCw,
    RotateCcw,
    Save,
    Search,
    ShieldCheck,
    UsersRound,
    X
} from 'lucide-react';
import toast from 'react-hot-toast';
import {
    useGetAllPermissionsQuery,
    useGetRolePermissionsQuery,
    useUpdateRolePermissionsMutation,
    useResetRolePermissionsMutation,
    useCloneRolePermissionsMutation,
    useGetRbacAuditLogsQuery
} from '../store/api';
import { selectCurrentUser } from '../store/authSlice';
import { ConfirmDialog, EmptyState, PageHeader, Skeleton } from '../components/ui';

const roleOrder = ['Developer', 'Admin', 'Radiologist', 'Receptionist', 'Cashier', 'Technician', 'Nurse', 'Accountant', 'Insurance_Staff', 'HR', 'Marketing', 'Referring_Doctor', 'Patient'];
const PROTECTED_ROLES = new Set(['Developer', 'Admin']);

const RoleManagement = ({ embedded = false }) => {
    const { t } = useTranslation('admin');
    const currentUser = useSelector(selectCurrentUser);
    const {
        data: allPermissions = [],
        isLoading: isLoadingPermissions,
        isError: isPermissionsError,
        refetch: refetchPermissions
    } = useGetAllPermissionsQuery();
    const {
        data: rolePermissionsData,
        isLoading: isLoadingRoles,
        isError: isRolesError,
        refetch: refetchRoles
    } = useGetRolePermissionsQuery();
    const [updateRolePermissions, { isLoading: isUpdating }] = useUpdateRolePermissionsMutation();
    const [resetRolePermissions, { isLoading: isResetting }] = useResetRolePermissionsMutation();
    const [cloneRolePermissions, { isLoading: isCloning }] = useCloneRolePermissionsMutation();
    const { data: auditLogs = [], refetch: refetchAuditLogs } = useGetRbacAuditLogsQuery();

    const [localPermissions, setLocalPermissions] = useState({});
    const [dirtyRoles, setDirtyRoles] = useState(new Set());
    const [searchQuery, setSearchQuery] = useState('');
    const [moduleFilter, setModuleFilter] = useState('all');
    const [actionFilter, setActionFilter] = useState('all');
    const [riskFilter, setRiskFilter] = useState('all');
    const [grantFilter, setGrantFilter] = useState('all');
    const [selectedRole, setSelectedRole] = useState('Radiologist');
    const [compareRole, setCompareRole] = useState('Receptionist');
    const [collapsedModules, setCollapsedModules] = useState(new Set());
    const [saveConfirmOpen, setSaveConfirmOpen] = useState(false);
    const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
    const [cloneConfirmOpen, setCloneConfirmOpen] = useState(false);
    const [auditOpen, setAuditOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const isDeveloper = currentUser?.role === 'Developer';
    const canEditRole = useCallback(role => isDeveloper || !PROTECTED_ROLES.has(role), [isDeveloper]);

    useEffect(() => { setMounted(true); }, []);

    const reveal = (delay = 0) => ({
        className: `transition-all duration-700 ease-out ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'} motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none`,
        style: { transitionDelay: `${delay}ms` },
    });

    const roles = useMemo(() => {
        const available = Object.keys(rolePermissionsData || {});
        return available.sort((first, second) => {
            const firstIndex = roleOrder.indexOf(first);
            const secondIndex = roleOrder.indexOf(second);
            if (firstIndex === -1 && secondIndex === -1) return first.localeCompare(second);
            if (firstIndex === -1) return 1;
            if (secondIndex === -1) return -1;
            return firstIndex - secondIndex;
        });
    }, [rolePermissionsData]);

    useEffect(() => {
        if (rolePermissionsData && dirtyRoles.size === 0) {
            setLocalPermissions(rolePermissionsData);
        }
    }, [dirtyRoles.size, rolePermissionsData]);

    useEffect(() => {
        if (!roles.includes(selectedRole)) {
            setSelectedRole(roles.find(role => canEditRole(role)) || roles[0] || '');
        }
        if (!roles.includes(compareRole) || compareRole === selectedRole) {
            setCompareRole(roles.find(role => role !== selectedRole) || '');
        }
    }, [canEditRole, compareRole, roles, selectedRole]);

    useEffect(() => {
        if (dirtyRoles.size === 0) return undefined;
        const warnOnLeave = event => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', warnOnLeave);
        return () => window.removeEventListener('beforeunload', warnOnLeave);
    }, [dirtyRoles.size]);

    const modules = useMemo(() => Array.from(new Set(allPermissions.map(permission => permission.module).filter(Boolean))).sort(), [allPermissions]);
    const actions = useMemo(() => Array.from(new Set(allPermissions.map(permissionAction))).sort(), [allPermissions]);

    const filteredPermissions = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return allPermissions.filter(permission => {
            if (moduleFilter !== 'all' && permission.module !== moduleFilter) return false;
            if (actionFilter !== 'all' && permissionAction(permission) !== actionFilter) return false;
            if (riskFilter !== 'all' && permissionRisk(permission) !== riskFilter) return false;
            const isGranted = (localPermissions[selectedRole] || []).includes(permission.permission_id);
            if (grantFilter === 'granted' && !isGranted) return false;
            if (grantFilter === 'notGranted' && isGranted) return false;
            if (!query) return true;
            return [permission.name, permission.description, permission.module]
                .filter(Boolean)
                .join(' ')
                .toLowerCase()
                .includes(query);
        });
    }, [actionFilter, allPermissions, grantFilter, localPermissions, moduleFilter, riskFilter, searchQuery, selectedRole]);

    const groupedPermissions = useMemo(() => filteredPermissions.reduce((groups, permission) => {
        const moduleName = permission.module || t('rbac.values.other');
        groups[moduleName] = groups[moduleName] || [];
        groups[moduleName].push(permission);
        return groups;
    }, {}), [filteredPermissions, t]);

    const assignedGrantCount = useMemo(() => roles.reduce((total, role) => (
        total + (localPermissions[role]?.length || 0)
    ), 0), [localPermissions, roles]);

    const changeSummary = useMemo(() => Array.from(dirtyRoles).map(role => {
        const original = new Set(rolePermissionsData?.[role] || []);
        const current = new Set(localPermissions[role] || []);
        return {
            role,
            added: Array.from(current).filter(id => !original.has(id)),
            removed: Array.from(original).filter(id => !current.has(id))
        };
    }), [dirtyRoles, localPermissions, rolePermissionsData]);
    const pendingChangeCount = useMemo(() => changeSummary.reduce((total, change) => total + change.added.length + change.removed.length, 0), [changeSummary]);
    const editableRoleCount = useMemo(() => roles.filter(canEditRole).length, [canEditRole, roles]);

    const allPermissionIds = useMemo(() => allPermissions.map(permission => permission.permission_id), [allPermissions]);
    const selectedPermissionIds = useMemo(() => (localPermissions[selectedRole] || []), [localPermissions, selectedRole]);
    const comparePermissionIds = useMemo(() => (localPermissions[compareRole] || []), [compareRole, localPermissions]);
    const selectedSet = useMemo(() => new Set(selectedPermissionIds), [selectedPermissionIds]);
    const compareSet = useMemo(() => new Set(comparePermissionIds), [comparePermissionIds]);
    const filteredIds = useMemo(() => filteredPermissions.map(permission => permission.permission_id), [filteredPermissions]);
    const comparison = useMemo(() => ({
        shared: selectedPermissionIds.filter(id => compareSet.has(id)).length,
        selectedOnly: selectedPermissionIds.filter(id => !compareSet.has(id)).length,
        compareOnly: comparePermissionIds.filter(id => !selectedSet.has(id)).length
    }), [comparePermissionIds, compareSet, selectedPermissionIds, selectedSet]);
    const selectedGrantRatio = allPermissions.length > 0 ? Math.round((selectedPermissionIds.length / allPermissions.length) * 100) : 0;
    const selectedCriticalCount = useMemo(() => allPermissions.filter(permission => (
        selectedSet.has(permission.permission_id) && permissionRisk(permission) === 'critical'
    )).length, [allPermissions, selectedSet]);
    const selectedSensitiveCount = useMemo(() => allPermissions.filter(permission => (
        selectedSet.has(permission.permission_id) && permissionRisk(permission) === 'sensitive'
    )).length, [allPermissions, selectedSet]);

    const hasChanges = dirtyRoles.size > 0;
    const hasFilters = Boolean(searchQuery || moduleFilter !== 'all' || actionFilter !== 'all' || riskFilter !== 'all' || grantFilter !== 'all');
    const isError = isPermissionsError || isRolesError;

    const setRolePermissionIds = (role, permissionIds) => {
        if (!canEditRole(role)) {
            toast.error(t('rbac.messages.protectedLocked', 'Only a Developer can edit protected role permissions.'));
            return;
        }
        const nextIds = Array.from(new Set(permissionIds));
        setLocalPermissions(current => ({ ...current, [role]: nextIds }));
        setDirtyRoles(current => {
            const next = new Set(current);
            if (samePermissionSet(nextIds, rolePermissionsData?.[role] || [])) next.delete(role);
            else next.add(role);
            return next;
        });
    };

    const togglePermission = (role, permissionId) => {
        const currentRolePermissions = localPermissions[role] || [];
        setRolePermissionIds(role, currentRolePermissions.includes(permissionId)
            ? currentRolePermissions.filter(id => id !== permissionId)
            : [...currentRolePermissions, permissionId]);
    };

    const updateVisiblePermissions = mode => {
        const current = new Set(localPermissions[selectedRole] || []);
        filteredIds.forEach(id => mode === 'grant' ? current.add(id) : current.delete(id));
        setRolePermissionIds(selectedRole, Array.from(current));
        toast.success(t(`rbac.messages.${mode}Visible`, { count: filteredIds.length, role: roleLabel(selectedRole, t) }));
    };

    const copyComparedRole = () => {
        if (!compareRole || !canEditRole(selectedRole)) return;
        setRolePermissionIds(selectedRole, comparePermissionIds);
        toast.success(t('rbac.messages.copied', { source: roleLabel(compareRole, t), target: roleLabel(selectedRole, t) }));
    };

    const saveChanges = async () => {
        const rolesToUpdate = Array.from(dirtyRoles).filter(canEditRole);
        if (rolesToUpdate.length === 0) {
            setSaveConfirmOpen(false);
            return;
        }

        const results = await Promise.allSettled(rolesToUpdate.map(role => (
            updateRolePermissions({ role, permissionIds: localPermissions[role] || [] }).unwrap()
        )));
        const failedRoles = rolesToUpdate.filter((_, index) => results[index].status === 'rejected');

        if (failedRoles.length > 0) {
            setDirtyRoles(new Set(failedRoles));
            toast.error(t('rbac.messages.partialFailure', { count: failedRoles.length }));
        } else {
            const refreshed = await refetchRoles();
            if (refreshed.data) setLocalPermissions(refreshed.data);
            setDirtyRoles(new Set());
            toast.success(t('rbac.messages.saved'));
        }
        setSaveConfirmOpen(false);
    };

    const discardChanges = () => {
        setLocalPermissions(rolePermissionsData || {});
        setDirtyRoles(new Set());
        toast(t('rbac.messages.discarded'), { icon: '↺' });
    };

    const handleResetRole = async () => {
        if (!canEditRole(selectedRole)) return;
        try {
            await resetRolePermissions(selectedRole).unwrap();
            const refreshed = await refetchRoles();
            if (refreshed.data) setLocalPermissions(refreshed.data);
            setDirtyRoles(current => {
                const next = new Set(current);
                next.delete(selectedRole);
                return next;
            });
            refetchAuditLogs();
            toast.success(t('rbac.messages.resetSuccess'));
            setResetConfirmOpen(false);
        } catch (error) {
            toast.error(error.data?.error || 'Failed to reset role permissions');
        }
    };

    const handleCloneRole = async () => {
        if (!canEditRole(selectedRole) || !compareRole) return;
        try {
            await cloneRolePermissions({ targetRole: selectedRole, sourceRole: compareRole }).unwrap();
            const refreshed = await refetchRoles();
            if (refreshed.data) setLocalPermissions(refreshed.data);
            setDirtyRoles(current => {
                const next = new Set(current);
                next.delete(selectedRole);
                return next;
            });
            refetchAuditLogs();
            toast.success(t('rbac.messages.cloneSuccess'));
            setCloneConfirmOpen(false);
        } catch (error) {
            toast.error(error.data?.error || 'Failed to clone role permissions');
        }
    };

    const clearFilters = () => {
        setSearchQuery('');
        setModuleFilter('all');
        setActionFilter('all');
        setRiskFilter('all');
        setGrantFilter('all');
    };

    const exportMatrix = () => {
        const header = [t('rbac.matrix.permission'), t('rbac.matrix.module'), t('rbac.matrix.risk'), ...roles.map(role => roleLabel(role, t))];
        const rows = allPermissions.map(permission => [
            permission.name,
            moduleLabel(permission.module, t),
            t(`rbac.risk.${permissionRisk(permission)}`),
            ...roles.map(role => (localPermissions[role] || []).includes(permission.permission_id) ? t('rbac.values.granted') : t('rbac.values.notGranted'))
        ]);
        const csv = [header, ...rows].map(row => row.map(csvCell).join(',')).join('\n');
        const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `rcms-role-permissions-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        toast.success(t('rbac.messages.exported'));
    };

    const toggleModuleCollapse = moduleName => {
        setCollapsedModules(current => {
            const next = new Set(current);
            if (next.has(moduleName)) next.delete(moduleName);
            else next.add(moduleName);
            return next;
        });
    };

    const retry = () => {
        refetchPermissions();
        refetchRoles();
    };

    const showContent = !isLoadingPermissions && !isLoadingRoles && !isError && roles.length > 0 && allPermissions.length > 0;

    return (
        <div className={embedded ? 'space-y-4' : 'space-y-5 pb-6'}>
            {embedded ? (
                <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/50 sm:p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex min-w-0 items-start gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cyan-50 text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300">
                                <ShieldCheck size={18} aria-hidden="true" />
                            </span>
                            <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h2 className="text-base font-black text-slate-950 dark:text-white">
                                        {t('rbac.values.policyWorkspace', { defaultValue: 'Role & Permission Management' })}
                                    </h2>
                                    <StatusPill tone={hasChanges ? 'amber' : 'emerald'}>
                                        {hasChanges
                                            ? t('rbac.values.pendingChanges', { count: pendingChangeCount, defaultValue: `${pendingChangeCount} pending changes` })
                                            : t('rbac.values.saved', { defaultValue: 'Saved' })}
                                    </StatusPill>
                                </div>
                                <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                                    {t('rbac.values.roleCoverage', { editable: editableRoleCount, total: roles.length, defaultValue: `${editableRoleCount} editable roles · ${roles.length} system roles` })}
                                </p>
                            </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 shrink-0">
                            <button type="button" onClick={exportMatrix} className="inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800">
                                <Download size={14} />{t('rbac.actions.export')}
                            </button>
                            <button type="button" onClick={() => setAuditOpen(current => !current)} aria-pressed={auditOpen} className={`inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border px-3.5 text-xs font-bold transition ${auditOpen ? 'border-slate-950 bg-slate-950 text-white dark:border-slate-100 dark:bg-slate-100 dark:text-slate-950' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800'}`}>
                                <KeyRound size={14} />{t('rbac.actions.auditLogs')}
                            </button>
                        </div>
                    </div>
                </section>
            ) : (
                <PageHeader
                    icon={ShieldCheck}
                    eyebrowIcon={LockKeyhole}
                    eyebrow={t('rbac.eyebrow')}
                    title={t('rbac.title')}
                    description={t('rbac.description')}
                    actions={(
                        <div className="flex flex-wrap items-center gap-2 self-start sm:self-center">
                            <button type="button" onClick={exportMatrix} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-teal-300">
                                <Download size={14} />{t('rbac.actions.export')}
                            </button>
                            <button type="button" onClick={() => setAuditOpen(current => !current)} aria-pressed={auditOpen} className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors ${auditOpen ? 'border-slate-950 bg-slate-950 text-white dark:border-white dark:bg-white dark:text-slate-950' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50 hover:text-teal-700 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-teal-300'}`}>
                                <KeyRound size={14} />{t('rbac.actions.auditLogs')}
                            </button>
                        </div>
                    )}
                />
            )}

            {/* Admin protection notice */}
            <div className="flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/40 dark:bg-amber-950/20">
                <LockKeyhole size={15} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-500" />
                <p className="text-xs leading-relaxed text-amber-800 dark:text-amber-400">
                    <span className="font-bold">{t('rbac.adminNotice.title')}: </span>
                    {t('rbac.adminNotice.description')}
                    {!embedded ? <span className="ms-1.5 text-amber-700/70 dark:text-amber-500/60">{t('rbac.adminNotice.policyScope')}</span> : null}
                </p>
            </div>

            {/* Metrics strip */}
            <section style={reveal(80).style} className={`grid grid-cols-2 gap-3 sm:grid-cols-4 ${reveal(80).className}`} aria-label={t('rbac.metrics.label')}>
                <Metric icon={UsersRound} label={t('rbac.metrics.roles')} value={roles.length} detail={t('rbac.metrics.rolesDetail')} />
                <Metric icon={KeyRound} label={t('rbac.metrics.permissions')} value={allPermissions.length} detail={t('rbac.metrics.permissionsDetail')} />
                <Metric icon={Layers3} label={t('rbac.metrics.modules')} value={modules.length} detail={t('rbac.metrics.modulesDetail')} />
                <Metric icon={CheckCircle2} label={t('rbac.metrics.grants')} value={assignedGrantCount} detail={t('rbac.metrics.grantsDetail')} />
            </section>

            {/* Audit log drawer */}
            {auditOpen && (
                <section className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800/60 px-4 py-3">
                        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">{t('rbac.actions.auditLogs')}</h2>
                        <button type="button" onClick={() => setAuditOpen(false)} aria-label={t('rbac.filters.clearSearch')} className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"><X size={15} /></button>
                    </div>
                    <div className="max-h-64 divide-y divide-slate-100 dark:divide-slate-800/60 overflow-auto">
                        {auditLogs.length === 0 ? (
                            <div className="p-6 text-center text-xs font-medium text-slate-500">{t('rbac.actions.noAuditLogs')}</div>
                        ) : auditLogs.map(log => {
                            const dateStr = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                            const isDenied = log.action === 'PERMISSION_DENIED';
                            return (
                                <div key={log.log_id} className="flex items-center justify-between gap-4 px-4 py-2.5 text-xs">
                                    <div className="flex min-w-0 items-center gap-2.5">
                                            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${isDenied ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400' : 'bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400'}`}>
                                            {log.action.replace('ROLE_PERMISSIONS_', '')}
                                        </span>
                                        <p className="truncate text-slate-600 dark:text-slate-400">
                                            <span className="font-bold text-slate-700 dark:text-slate-300">@{log.username || 'system'}</span>
                                            {log.action === 'ROLE_PERMISSIONS_UPDATED' && ` updated ${roleLabel(log.details?.role, t)} permissions`}
                                            {log.action === 'ROLE_PERMISSIONS_RESET' && ` reset ${roleLabel(log.details?.role, t)} to defaults`}
                                            {log.action === 'ROLE_PERMISSIONS_CLONED' && ` cloned ${roleLabel(log.details?.sourceRole, t)} to ${roleLabel(log.details?.targetRole, t)}`}
                                            {log.action === 'EMERGENCY_ACCESS_GRANTED' && ' requested emergency break-glass'}
                                        </p>
                                    </div>
                                    <span className="shrink-0 tabular-nums text-[10px] text-slate-400">{dateStr}</span>
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            {isLoadingPermissions || isLoadingRoles ? (
                <LoadingState />
            ) : isError ? (
                <section className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"><EmptyState icon={RefreshCw} variant="error" title={t('rbac.states.errorTitle')} description={t('rbac.states.errorDescription')} actionLabel={t('rbac.actions.retry')} onAction={retry} /></section>
            ) : roles.length === 0 || allPermissions.length === 0 ? (
                <section className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"><EmptyState icon={ShieldCheck} title={t('rbac.states.emptyTitle')} description={t('rbac.states.emptyDescription')} /></section>
            ) : null}

            {showContent && (
                <section style={reveal(160).style} className={`grid gap-4 lg:grid-cols-[230px_minmax(0,1fr)] 2xl:grid-cols-[250px_minmax(0,1fr)_300px] ${reveal(160).className}`}>

                    {/* Role rail */}
                    <div className="rounded-2xl border border-slate-200/60 bg-white/70 shadow-sm backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/50 lg:sticky lg:top-4 lg:self-start">
                        <div className="border-b border-slate-200/60 px-4 py-3 dark:border-slate-800/60">
                            <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('rbac.roles.label')}</h2>
                            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                                {t('rbac.values.roleCount', { count: roles.length, defaultValue: '{{count}} roles' })}
                            </p>
                        </div>
                        <div className="flex gap-2 overflow-x-auto p-2 lg:flex-col lg:overflow-visible" role="tablist" aria-label={t('rbac.roles.label')}>
                            {roles.map(role => (
                                <RoleRailItem
                                    key={role}
                                    role={role}
                                    selected={selectedRole === role}
                                    assigned={localPermissions[role]?.length || 0}
                                    total={allPermissions.length}
                                    dirty={dirtyRoles.has(role)}
                                    onClick={() => setSelectedRole(role)}
                                    t={t}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Main: filters + permission list */}
                    <div className="space-y-4 min-w-0">
                        <div className="rounded-2xl border border-slate-200/60 bg-white/70 shadow-sm backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/50">
                            <div className="flex flex-col gap-4 border-b border-slate-200/60 p-4 dark:border-slate-800/65 xl:flex-row xl:items-center xl:justify-between">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <h2 className="truncate text-lg font-black text-slate-950 dark:text-white">{roleLabel(selectedRole, t)}</h2>
                                        {PROTECTED_ROLES.has(selectedRole) ? <StatusPill tone="amber">{t('rbac.values.protected', { defaultValue: 'Protected' })}</StatusPill> : null}
                                        {dirtyRoles.has(selectedRole) ? <StatusPill tone="amber">{t('rbac.values.modified')}</StatusPill> : <StatusPill tone="emerald">{t('rbac.values.saved', { defaultValue: 'Saved' })}</StatusPill>}
                                    </div>
                                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                                        {selectedPermissionIds.length}/{allPermissions.length} {t('rbac.values.granted').toLowerCase()} - {selectedGrantRatio}% {t('rbac.values.coverage', { defaultValue: 'coverage' })}
                                    </p>
                                </div>
                                <div className="grid grid-cols-3 gap-2 sm:min-w-80">
                                    <MiniRoleStat label={t('rbac.risk.critical')} value={selectedCriticalCount} tone={selectedCriticalCount ? 'rose' : 'slate'} />
                                    <MiniRoleStat label={t('rbac.risk.sensitive')} value={selectedSensitiveCount} tone={selectedSensitiveCount ? 'amber' : 'slate'} />
                                    <MiniRoleStat label={t('rbac.metrics.modules')} value={modules.length} />
                                </div>
                            </div>

                            <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 p-3 dark:border-slate-800">
                                <label className="relative min-w-[180px] flex-1">
                                    <span className="sr-only">{t('rbac.filters.searchLabel')}</span>
                                    <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" size={15} />
                                    <input
                                        value={searchQuery}
                                        onChange={event => setSearchQuery(event.target.value)}
                                        placeholder={t('rbac.filters.search')}
                                        className="h-9 w-full rounded-xl border border-slate-200 bg-white ps-9 pe-8 text-xs font-semibold text-slate-900 outline-none transition-all placeholder:text-slate-400 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-white"
                                    />
                                    {searchQuery && <button type="button" onClick={() => setSearchQuery('')} aria-label={t('rbac.filters.clearSearch')} className="absolute inset-y-0 end-2 flex items-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-300"><X size={14} /></button>}
                                </label>
                                <FilterSelect value={moduleFilter} onChange={setModuleFilter} ariaLabel={t('rbac.filters.module')}>
                                    <option value="all">{t('rbac.filters.allModules')}</option>
                                    {modules.map(moduleName => <option key={moduleName} value={moduleName}>{moduleLabel(moduleName, t)}</option>)}
                                </FilterSelect>
                                <FilterSelect value={actionFilter} onChange={setActionFilter} ariaLabel={t('rbac.filters.action')}>
                                    <option value="all">{t('rbac.filters.allActions')}</option>
                                    {actions.map(action => <option key={action} value={action}>{humanize(action)}</option>)}
                                </FilterSelect>
                                <FilterSelect value={riskFilter} onChange={setRiskFilter} ariaLabel={t('rbac.filters.risk')}>
                                    <option value="all">{t('rbac.filters.allRisks')}</option>
                                    {['standard', 'sensitive', 'critical'].map(risk => <option key={risk} value={risk}>{t(`rbac.risk.${risk}`)}</option>)}
                                </FilterSelect>
                                <FilterSelect value={grantFilter} onChange={setGrantFilter} ariaLabel={t('rbac.filters.grantStatus')}>
                                    <option value="all">{t('rbac.filters.allGrants')}</option>
                                    <option value="granted">{t('rbac.values.granted')}</option>
                                    <option value="notGranted">{t('rbac.values.notGranted')}</option>
                                </FilterSelect>
                                {hasFilters && (
                                    <button type="button" onClick={clearFilters} className="inline-flex h-9 items-center gap-1.5 rounded-xl px-2.5 text-xs font-semibold text-slate-500 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:hover:bg-slate-800 dark:hover:text-white">
                                        <FilterX size={14} />{t('rbac.filters.reset')}
                                    </button>
                                )}
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5">
                                <span className="text-xs font-medium text-slate-500 tabular-nums">{t('rbac.filters.results', { shown: filteredPermissions.length, total: allPermissions.length })}</span>
                                <div className="flex flex-wrap items-center gap-2">
                                    <button type="button" onClick={() => updateVisiblePermissions('grant')} disabled={!canEditRole(selectedRole) || filteredIds.length === 0} className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-cyan-700 px-3 text-xs font-bold text-white transition hover:bg-cyan-800 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-cyan-600 dark:hover:bg-cyan-500">
                                        <Plus size={13} />{t('rbac.actions.grantVisible', { count: filteredIds.length })}
                                    </button>
                                    <button type="button" onClick={() => updateVisiblePermissions('revoke')} disabled={!canEditRole(selectedRole) || filteredIds.length === 0} className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 transition hover:bg-slate-50 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">
                                        <Minus size={13} />{t('rbac.actions.revokeVisible', { count: filteredIds.length })}
                                    </button>
                                </div>
                            </div>
                            {!canEditRole(selectedRole) && (
                                <div className="mx-3 mb-3 flex items-center gap-2 rounded-lg bg-amber-50/60 dark:bg-amber-900/10 px-3 py-2 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                                    <LockKeyhole size={13} />{t('rbac.inspector.adminProtected')}
                                </div>
                            )}
                        </div>

                        {Object.entries(groupedPermissions).length === 0 ? (
                            <div className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
                                <FilteredEmpty t={t} onReset={clearFilters} />
                            </div>
                        ) : (
                            <div className="space-y-3">
                                {Object.entries(groupedPermissions).map(([moduleName, permissions]) => (
                                    <PermissionGroup
                                        key={moduleName}
                                        moduleName={moduleName}
                                        permissions={permissions}
                                        role={selectedRole}
                                        assigned={localPermissions[selectedRole] || []}
                                        locked={!canEditRole(selectedRole)}
                                        collapsed={collapsedModules.has(moduleName) && !searchQuery}
                                        onToggleCollapse={() => toggleModuleCollapse(moduleName)}
                                        onToggle={togglePermission}
                                        t={t}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Side panel: compare, review, actions */}
                    <div className="space-y-4 lg:col-start-2 2xl:col-start-auto 2xl:sticky 2xl:top-4 2xl:self-start">
                        <div className="rounded-2xl border border-slate-200/60 bg-white/70 shadow-sm backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/50 p-4">
                            <div className="flex items-center gap-2.5">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"><Eye size={16} /></span>
                                <div>
                                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">{t('rbac.inspector.title')}</h2>
                                    <p className="text-[11px] text-slate-400">{t('rbac.inspector.comparison')}</p>
                                </div>
                            </div>
                            <p className="mt-2 text-xs leading-relaxed text-slate-500">{t('rbac.inspector.description')}</p>

                            <label className="mt-4 block">
                                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-widest text-slate-500">{t('rbac.inspector.compareRole')}</span>
                                <select value={compareRole} onChange={event => setCompareRole(event.target.value)} className="h-9 w-full appearance-none rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-800 outline-none transition-all focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
                                    {roles.filter(role => role !== selectedRole).map(role => <option key={role} value={role}>{roleLabel(role, t)}</option>)}
                                </select>
                            </label>

                            <div className="mt-3 grid grid-cols-3 gap-1.5" aria-label={t('rbac.inspector.comparison')}>
                                <ComparisonStat label={t('rbac.inspector.shared')} value={comparison.shared} />
                                <ComparisonStat label={t('rbac.inspector.targetOnly')} value={comparison.selectedOnly} emphasis />
                                <ComparisonStat label={t('rbac.inspector.sourceOnly')} value={comparison.compareOnly} />
                            </div>

                            <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                                <button type="button" onClick={copyComparedRole} disabled={!canEditRole(selectedRole) || !compareRole} className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">
                                    <Copy size={13} />{t('rbac.actions.copyDraft', { defaultValue: 'Copy draft' })}
                                </button>
                                <button type="button" onClick={() => setCloneConfirmOpen(true)} disabled={!canEditRole(selectedRole) || !compareRole} className="inline-flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">
                                    <Save size={13} />{t('rbac.actions.cloneSaved', { defaultValue: 'Clone saved' })}
                                </button>
                                <button type="button" onClick={() => setResetConfirmOpen(true)} disabled={!canEditRole(selectedRole)} className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50/50 px-2.5 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300 dark:hover:bg-rose-900/50">
                                    <RotateCcw size={13} />{t('rbac.actions.reset')}
                                </button>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200/60 bg-white/70 shadow-sm backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/50 p-4">
                            <div className="flex items-center gap-2.5">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"><AlertCircle size={16} /></span>
                                <div>
                                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-500">{t('rbac.review.title')}</h2>
                                    <p className="text-[11px] text-slate-400">{hasChanges ? t('rbac.review.pending', { count: dirtyRoles.size }) : t('rbac.review.clean')}</p>
                                </div>
                            </div>
                            <div className="mt-3 max-h-44 space-y-1.5 overflow-auto">
                                {changeSummary.length === 0 ? (
                                    <div className="rounded-lg border border-dashed border-slate-200 p-3 text-center text-xs font-medium text-slate-500 dark:border-slate-800">{t('rbac.review.noChanges')}</div>
                                ) : changeSummary.map(change => (
                                    <div key={change.role} className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-2 dark:bg-slate-950/60">
                                        <span className="truncate text-xs font-bold text-slate-700 dark:text-slate-300">{roleLabel(change.role, t)}</span>
                                        <span className="flex shrink-0 gap-1 text-[10px] font-bold tabular-nums">
                                            <span className="rounded bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 px-1.5 py-0.5">+{change.added.length}</span>
                                            <span className="rounded bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 px-1.5 py-0.5">-{change.removed.length}</span>
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {hasChanges && (
                <section className="sticky bottom-4 z-30 rounded-2xl border border-slate-200/60 bg-white/80 p-4 text-slate-900 shadow-lg backdrop-blur-xl dark:border-slate-850/60 dark:bg-slate-900/90 dark:text-white sm:flex sm:items-center sm:justify-between sm:gap-5 animate-in slide-in-from-bottom duration-300" aria-live="polite">
                    <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"><AlertCircle size={16} /></span>
                        <div>
                            <p className="text-sm font-bold">{t('rbac.unsaved.title')}</p>
                            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{t('rbac.unsaved.description', { count: dirtyRoles.size })}</p>
                        </div>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:mt-0 sm:flex">
                        <button type="button" onClick={discardChanges} disabled={isUpdating} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-3.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-200 dark:hover:bg-slate-800">
                            <RotateCcw size={14} />{t('rbac.actions.discard')}
                        </button>
                        <button type="button" onClick={() => setSaveConfirmOpen(true)} disabled={isUpdating} className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg bg-gradient-to-r from-slate-900 to-slate-950 px-4 text-xs font-semibold text-white hover:brightness-110 active:scale-[0.98] disabled:opacity-50 dark:from-white dark:to-slate-100 dark:text-slate-950">
                            <Save size={14} />{isUpdating ? t('rbac.actions.saving') : t('rbac.actions.reviewSave')}
                        </button>
                    </div>
                </section>
            )}

            <ConfirmDialog isOpen={saveConfirmOpen} onClose={() => setSaveConfirmOpen(false)} onConfirm={saveChanges} title={t('rbac.confirm.title')} message={t('rbac.confirm.message', { count: dirtyRoles.size })} confirmText={t('rbac.actions.save')} isLoading={isUpdating} />
            <ConfirmDialog isOpen={resetConfirmOpen} onClose={() => setResetConfirmOpen(false)} onConfirm={handleResetRole} title={t('rbac.confirm.resetTitle')} message={t('rbac.confirm.resetMessage', { role: roleLabel(selectedRole, t) })} confirmText={t('rbac.actions.reset')} isLoading={isResetting} />
            <ConfirmDialog isOpen={cloneConfirmOpen} onClose={() => setCloneConfirmOpen(false)} onConfirm={handleCloneRole} title={t('rbac.confirm.cloneTitle')} message={t('rbac.confirm.cloneMessage', { target: roleLabel(selectedRole, t), source: roleLabel(compareRole, t) })} confirmText={t('rbac.actions.clone')} isLoading={isCloning} />
        </div>
    );
};

const Metric = ({ icon: Icon, label, value, detail }) => (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200/60 bg-white/70 shadow-sm backdrop-blur-xl dark:border-slate-800/60 dark:bg-slate-900/50 p-4">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400">
            <Icon size={17} strokeWidth={1.75} />
        </span>
        <div className="min-w-0">
            <p className="text-lg font-bold tabular-nums leading-tight text-slate-900 dark:text-white">{value}</p>
            <p className="truncate text-[11px] font-semibold text-slate-500">{label}</p>
            {detail ? <p className="mt-0.5 hidden truncate text-[10px] text-slate-400 xl:block">{detail}</p> : null}
        </div>
    </div>
);

const StatusPill = ({ tone = 'slate', children }) => {
    const tones = {
        amber: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900/60',
        emerald: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-900/60',
        rose: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-900/60',
        slate: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'
    };
    return (
        <span className={`inline-flex h-6 items-center rounded-md px-2 text-[11px] font-bold ring-1 ${tones[tone] || tones.slate}`}>
            {children}
        </span>
    );
};

const MiniRoleStat = ({ label, value, tone = 'slate' }) => {
    const tones = {
        amber: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-300',
        rose: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/20 dark:text-rose-300',
        slate: 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300'
    };
    return (
        <div className={`rounded-lg border px-3 py-2 ${tones[tone] || tones.slate}`}>
            <p className="text-base font-black leading-none tabular-nums">{value}</p>
            <p className="mt-1 truncate text-[10px] font-bold uppercase tracking-wide opacity-75">{label}</p>
        </div>
    );
};

const ComparisonStat = ({ label, value, emphasis }) => (
    <div className={`rounded-lg px-2 py-2 text-center ${emphasis ? 'bg-teal-50 text-teal-700 dark:bg-teal-900/20 dark:text-teal-400' : 'bg-slate-50 text-slate-600 dark:bg-slate-900/40 dark:text-slate-400'}`}>
        <p className="text-base font-black tabular-nums">{value}</p>
        <p className="mt-0.5 truncate text-[9px] font-bold uppercase tracking-wide">{label}</p>
    </div>
);

const FilterSelect = ({ value, onChange, ariaLabel, children }) => (
    <select value={value} onChange={event => onChange(event.target.value)} aria-label={ariaLabel} className="h-9 min-w-[130px] cursor-pointer appearance-none rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-semibold text-slate-700 outline-none transition-all focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/10 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200">
        {children}
    </select>
);

const LoadingState = () => (
    <section className="rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{[1, 2, 3, 4].map(item => <Skeleton key={item} height="72px" className="rounded-lg" />)}</div>
        <Skeleton height="320px" className="mt-4 rounded-lg" />
    </section>
);

const RoleRailItem = ({ role, selected, assigned, total, dirty, onClick, t }) => {
    const ratio = total > 0 ? Math.round((assigned / total) * 100) : 0;
    return (
        <button
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={onClick}
            className={`group flex w-full shrink-0 flex-col gap-1.5 rounded-xl px-3.5 py-2.5 text-start transition-all lg:shrink ${selected ? 'border-s-4 border-cyan-600 bg-cyan-50/80 text-cyan-950 shadow-sm dark:bg-cyan-950/40 dark:text-cyan-200' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-700 dark:text-slate-300'}`}
        >
            <span className="flex items-center gap-2">
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${selected ? 'bg-cyan-600 dark:bg-cyan-400' : 'bg-slate-300 dark:bg-slate-700'}`} />
                <span className={`min-w-0 flex-1 truncate text-sm font-bold ${selected ? 'text-cyan-900 dark:text-cyan-200' : 'text-slate-700 dark:text-slate-300'}`}>{roleLabel(role, t)}</span>
                {PROTECTED_ROLES.has(role) && <LockKeyhole size={12} className="shrink-0 text-amber-500" />}
                {dirty && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500" aria-label={t('rbac.values.modified')} />}
            </span>
            <span className="flex items-center gap-2">
                <span className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                    <span className={`block h-full rounded-full ${selected ? 'bg-cyan-600 dark:bg-cyan-400' : 'bg-slate-300 dark:bg-slate-600'}`} style={{ width: `${ratio}%` }} />
                </span>
                <span className="shrink-0 text-[10px] font-semibold tabular-nums text-slate-400">{assigned}/{total}</span>
            </span>
        </button>
    );
};

const PermissionGroup = ({ moduleName, permissions, role, assigned, locked, collapsed, onToggleCollapse, onToggle, t }) => {
    const granted = permissions.filter(permission => assigned.includes(permission.permission_id)).length;
    return (
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/50">
            <button type="button" onClick={onToggleCollapse} aria-expanded={!collapsed} className="flex w-full items-center justify-between gap-3 bg-slate-50/50 px-4 py-3 text-start transition-colors hover:bg-slate-100 dark:bg-slate-955/40 dark:hover:bg-slate-900/40">
                <span className="flex min-w-0 items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-200">
                    {collapsed ? <ChevronRight size={16} className="shrink-0 rtl-flip text-slate-400" /> : <ChevronDown size={16} className="shrink-0 text-slate-400" />}
                    <span className="truncate">{moduleLabel(moduleName, t)}</span>
                </span>
                <span className="shrink-0 rounded-lg border border-slate-200 bg-white px-2.5 py-0.5 text-[10px] font-bold tabular-nums text-slate-500 dark:border-slate-700 dark:bg-slate-900">
                    {t('rbac.values.grantCount', { assigned: granted, total: permissions.length })}
                </span>
            </button>
            {!collapsed && (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {permissions.map(permission => {
                        const checked = assigned.includes(permission.permission_id);
                        return (
                            <div key={permission.permission_id} className="flex items-start justify-between gap-4 px-4 py-3 transition-colors hover:bg-slate-50/60 dark:hover:bg-slate-800/30">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-sm font-bold text-slate-900 dark:text-slate-200">{permissionLabel(permission, t)}</p>
                                        <RiskBadge permission={permission} t={t} />
                                    </div>
                                    <p className="mt-0.5 text-xs leading-5 text-slate-500">{permissionDescription(permission, t)}</p>
                                </div>
                                <PermissionToggle checked={checked} disabled={locked} onChange={() => onToggle(role, permission.permission_id)} label={t('rbac.values.toggleLabel', { permission: permissionLabel(permission, t), role: roleLabel(role, t) })} />
                            </div>
                        );
                    })}
                </div>
            )}
        </section>
    );
};

const PermissionToggle = ({ checked, disabled, onChange, label }) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={onChange}
        disabled={disabled}
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${checked ? disabled ? 'bg-slate-400' : 'bg-cyan-600 dark:bg-cyan-500' : 'bg-slate-200 dark:bg-slate-700'}`}
    >
        <span aria-hidden="true" className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${checked ? 'translate-x-4 rtl:-translate-x-4' : 'translate-x-0'}`} />
    </button>
);

const RiskBadge = ({ permission, t }) => {
    const risk = permissionRisk(permission);
    const styles = {
        standard: 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400',
        sensitive: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
        critical: 'bg-rose-50 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400'
    };
    return <span className={`shrink-0 rounded px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${styles[risk]}`}>{t(`rbac.risk.${risk}`)}</span>;
};

const FilteredEmpty = ({ t, onReset }) => (
    <div className="flex flex-col items-center justify-center px-5 py-14 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-slate-400 dark:bg-slate-800"><AlertCircle size={22} /></span>
        <h3 className="mt-4 text-sm font-bold text-slate-900 dark:text-white">{t('rbac.states.filteredTitle')}</h3>
        <p className="mt-1.5 text-sm text-slate-500">{t('rbac.states.filteredDescription')}</p>
        <button type="button" onClick={onReset} className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-700 px-3.5 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800">
            <FilterX size={14} />{t('rbac.filters.reset')}
        </button>
    </div>
);

const roleLabel = (role, t) => t(`rbac.roles.${role}`, { defaultValue: humanize(role) });
const moduleLabel = (module, t) => t(`rbac.modules.${module || 'Other'}`, { defaultValue: humanize(module || t('rbac.values.other')) });
const permissionLabel = (permission, t) => {
    const [action, ...resourceParts] = String(permission?.name || '').split('_');
    const resource = resourceParts.join('_');
    return t('rbac.values.permissionLabel', {
        action: t(`rbac.permissionActions.${action}`, { defaultValue: humanize(action) }),
        resource: t(`rbac.permissionResources.${resource}`, { defaultValue: humanize(resource) })
    });
};
const permissionDescription = (permission, t) => permission.description || t('rbac.values.noDescription');
const permissionAction = permission => String(permission?.name || '').split('_')[0] || 'OTHER';
const permissionRisk = permission => {
    const name = String(permission?.name || '');
    if (/^(DELETE|MERGE|FINALIZE|AMEND|ISSUE_REFUNDS|CLOSE_|MANAGE_ROLES|MANAGE_USERS|MANAGE_BACKUPS|MANAGE_SETTINGS|MANAGE_INTEGRATIONS|ANONYMIZE)/.test(name)) return 'critical';
    if (/^(CREATE|EDIT|PERFORM|WRITE|REVIEW|APPROVE|DELIVER|PROCESS|MANAGE|EXPORT|ADJUST|RECEIVE|APPLY|DOWNLOAD|OVERRIDE|RECONCILE|IMPORT|UPLOAD)/.test(name)) return 'sensitive';
    return 'standard';
};
const samePermissionSet = (first = [], second = []) => first.length === second.length && first.every(id => second.includes(id));
const csvCell = value => {
    let text = String(value ?? '');
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
};
const humanize = value => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, character => character.toUpperCase());

export default RoleManagement;
