import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSelector } from 'react-redux';
import {
    Activity,
    AlertCircle,
    AlertTriangle,
    BadgeCheck,
    BrainCircuit,
    Check,
    CheckCircle2,
    ChevronDown,
    ChevronLeft,
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
    Receipt,
    RefreshCw,
    RotateCcw,
    Save,
    Search,
    ShieldAlert,
    ShieldCheck,
    Sparkles,
    Stethoscope,
    Terminal,
    UserCheck,
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

const ROLE_ICONS = {
    Developer: Terminal,
    Admin: ShieldCheck,
    Radiologist: BrainCircuit,
    Receptionist: UserCheck,
    Cashier: Receipt,
    Technician: Activity,
    Nurse: Stethoscope,
    Accountant: Receipt,
    Insurance_Staff: BadgeCheck,
    HR: UsersRound,
    Marketing: Sparkles,
    Referring_Doctor: Stethoscope,
    Patient: UsersRound
};

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
    const roleScrollRef = useRef(null);

    const scrollRoles = (direction) => {
        if (roleScrollRef.current) {
            const scrollAmount = direction === 'left' ? -220 : 220;
            roleScrollRef.current.scrollBy({ left: scrollAmount, behavior: 'smooth' });
        }
    };

    const isDeveloper = currentUser?.role === 'Developer';
    const canEditRole = useCallback((role) => isDeveloper || !PROTECTED_ROLES.has(role), [isDeveloper]);

    useEffect(() => { setMounted(true); }, []);

    const reveal = (delay = 0) => ({
        className: `transition-all duration-500 ease-out ${mounted ? 'translate-y-0 opacity-100' : 'translate-y-3 opacity-0'} motion-reduce:translate-y-0 motion-reduce:opacity-100`,
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
            setSelectedRole(roles.find((role) => canEditRole(role)) || roles[0] || '');
        }
        if (!roles.includes(compareRole) || compareRole === selectedRole) {
            setCompareRole(roles.find((role) => role !== selectedRole) || '');
        }
    }, [canEditRole, compareRole, roles, selectedRole]);

    useEffect(() => {
        if (dirtyRoles.size === 0) return undefined;
        const warnOnLeave = (event) => {
            event.preventDefault();
            event.returnValue = '';
        };
        window.addEventListener('beforeunload', warnOnLeave);
        return () => window.removeEventListener('beforeunload', warnOnLeave);
    }, [dirtyRoles.size]);

    // Keyboard shortcut Ctrl+S / Cmd+S
    useEffect(() => {
        const handleKeyDown = (event) => {
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
                event.preventDefault();
                if (dirtyRoles.size > 0 && !isUpdating) {
                    setSaveConfirmOpen(true);
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [dirtyRoles, isUpdating]);

    const modules = useMemo(() => Array.from(new Set(allPermissions.map((permission) => permission.module).filter(Boolean))).sort(), [allPermissions]);
    const actions = useMemo(() => Array.from(new Set(allPermissions.map(permissionAction))).sort(), [allPermissions]);

    const filteredPermissions = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        return allPermissions.filter((permission) => {
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
        const moduleName = permission.module || t('rbac.values.other', { defaultValue: 'Other' });
        groups[moduleName] = groups[moduleName] || [];
        groups[moduleName].push(permission);
        return groups;
    }, {}), [filteredPermissions, t]);

    const assignedGrantCount = useMemo(() => roles.reduce((total, role) => (
        total + (localPermissions[role]?.length || 0)
    ), 0), [localPermissions, roles]);

    const changeSummary = useMemo(() => Array.from(dirtyRoles).map((role) => {
        const original = new Set(rolePermissionsData?.[role] || []);
        const current = new Set(localPermissions[role] || []);
        return {
            role,
            added: Array.from(current).filter((id) => !original.has(id)),
            removed: Array.from(original).filter((id) => !current.has(id))
        };
    }), [dirtyRoles, localPermissions, rolePermissionsData]);

    const pendingChangeCount = useMemo(() => changeSummary.reduce((total, change) => total + change.added.length + change.removed.length, 0), [changeSummary]);
    const editableRoleCount = useMemo(() => roles.filter(canEditRole).length, [canEditRole, roles]);

    const selectedPermissionIds = useMemo(() => (localPermissions[selectedRole] || []), [localPermissions, selectedRole]);
    const comparePermissionIds = useMemo(() => (localPermissions[compareRole] || []), [compareRole, localPermissions]);
    const selectedSet = useMemo(() => new Set(selectedPermissionIds), [selectedPermissionIds]);
    const compareSet = useMemo(() => new Set(comparePermissionIds), [comparePermissionIds]);
    const filteredIds = useMemo(() => filteredPermissions.map((permission) => permission.permission_id), [filteredPermissions]);

    const comparison = useMemo(() => ({
        shared: selectedPermissionIds.filter((id) => compareSet.has(id)).length,
        selectedOnly: selectedPermissionIds.filter((id) => !compareSet.has(id)).length,
        compareOnly: comparePermissionIds.filter((id) => !selectedSet.has(id)).length
    }), [comparePermissionIds, compareSet, selectedPermissionIds, selectedSet]);

    const selectedGrantRatio = allPermissions.length > 0 ? Math.round((selectedPermissionIds.length / allPermissions.length) * 100) : 0;
    const selectedCriticalCount = useMemo(() => allPermissions.filter((permission) => (
        selectedSet.has(permission.permission_id) && permissionRisk(permission) === 'critical'
    )).length, [allPermissions, selectedSet]);
    const selectedSensitiveCount = useMemo(() => allPermissions.filter((permission) => (
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
        setLocalPermissions((current) => ({ ...current, [role]: nextIds }));
        setDirtyRoles((current) => {
            const next = new Set(current);
            if (samePermissionSet(nextIds, rolePermissionsData?.[role] || [])) next.delete(role);
            else next.add(role);
            return next;
        });
    };

    const togglePermission = (role, permissionId) => {
        const currentRolePermissions = localPermissions[role] || [];
        setRolePermissionIds(role, currentRolePermissions.includes(permissionId)
            ? currentRolePermissions.filter((id) => id !== permissionId)
            : [...currentRolePermissions, permissionId]);
    };

    const toggleModulePermissions = (moduleName, grantAll) => {
        const modulePermissionIds = (groupedPermissions[moduleName] || []).map((p) => p.permission_id);
        const currentRolePermissions = new Set(localPermissions[selectedRole] || []);
        if (grantAll) {
            modulePermissionIds.forEach((id) => currentRolePermissions.add(id));
        } else {
            modulePermissionIds.forEach((id) => currentRolePermissions.delete(id));
        }
        setRolePermissionIds(selectedRole, Array.from(currentRolePermissions));
        toast.success(grantAll ? `Granted all permissions in ${moduleName}` : `Revoked all permissions in ${moduleName}`);
    };

    const updateVisiblePermissions = (mode) => {
        const current = new Set(localPermissions[selectedRole] || []);
        filteredIds.forEach((id) => (mode === 'grant' ? current.add(id) : current.delete(id)));
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

        const results = await Promise.allSettled(rolesToUpdate.map((role) => (
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
            setDirtyRoles((current) => {
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
            setDirtyRoles((current) => {
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
        const header = [t('rbac.matrix.permission'), t('rbac.matrix.module'), t('rbac.matrix.risk'), ...roles.map((role) => roleLabel(role, t))];
        const rows = allPermissions.map((permission) => [
            permission.name,
            moduleLabel(permission.module, t),
            t(`rbac.risk.${permissionRisk(permission)}`),
            ...roles.map((role) => ((localPermissions[role] || []).includes(permission.permission_id) ? t('rbac.values.granted') : t('rbac.values.notGranted')))
        ]);
        const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
        const url = URL.createObjectURL(new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `VIARA-role-permissions-${new Date().toISOString().slice(0, 10)}.csv`;
        link.click();
        URL.revokeObjectURL(url);
        toast.success(t('rbac.messages.exported'));
    };

    const toggleModuleCollapse = (moduleName) => {
        setCollapsedModules((current) => {
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
        <div className={embedded ? 'space-y-5' : 'space-y-6 pb-28'}>
            {/* VIARA Hero Command Deck */}
            <div className="relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white/90 p-6 shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/90 sm:p-8 space-y-6">
                <div className="pointer-events-none absolute -end-16 -top-16 h-64 w-64 rounded-full bg-teal-500/10 blur-3xl dark:bg-teal-500/5" />
                <div className="pointer-events-none absolute -bottom-16 -start-16 h-64 w-64 rounded-full bg-sky-500/10 blur-3xl dark:bg-sky-500/5" />

                <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
                    <div className="flex items-start gap-4 sm:items-center min-w-0">
                        <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-gradient-to-br from-teal-500/20 to-sky-500/20 text-teal-700 dark:text-teal-300 ring-1 ring-teal-500/30 shadow-inner">
                            <ShieldCheck size={26} strokeWidth={2} />
                        </div>
                        <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider text-teal-700 dark:text-teal-300">
                                    <LockKeyhole size={11} />
                                    <span>{t('rbac.eyebrow', { defaultValue: 'Security Policy Management' })}</span>
                                </span>
                                <StatusPill tone={hasChanges ? 'amber' : 'emerald'}>
                                    {hasChanges
                                        ? t('rbac.values.pendingChanges', { count: pendingChangeCount, defaultValue: `${pendingChangeCount} pending changes` })
                                        : t('rbac.values.saved', { defaultValue: 'Saved' })}
                                </StatusPill>
                            </div>
                            <h1 className="mt-1 truncate text-2xl font-black text-slate-900 dark:text-white sm:text-3xl">
                                {t('rbac.title', { defaultValue: 'Role & Permission Controls (RBAC)' })}
                            </h1>
                            <p className="mt-1 truncate text-xs font-semibold text-slate-500 dark:text-slate-400 sm:text-sm">
                                {t('rbac.description', { defaultValue: 'Manage granular access rights, risk levels, and operational scope across all clinical and administrative roles.' })}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                        <button type="button" onClick={exportMatrix} className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/90 px-4 text-xs font-bold text-slate-700 shadow-2xs backdrop-blur-md transition hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-200 dark:hover:bg-slate-800">
                            <Download size={14} />
                            <span>{t('rbac.actions.export', { defaultValue: 'Export CSV' })}</span>
                        </button>
                        <button
                            type="button"
                            onClick={() => setAuditOpen((current) => !current)}
                            aria-pressed={auditOpen}
                            className={`inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border px-4 text-xs font-bold transition shadow-2xs backdrop-blur-md ${auditOpen ? 'border-teal-600 bg-teal-600 text-white' : 'border-slate-200/80 bg-white/90 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900/90 dark:text-slate-200 dark:hover:bg-slate-800'}`}
                        >
                            <KeyRound size={14} />
                            <span>{t('rbac.actions.auditLogs', { defaultValue: 'Audit Logs' })}</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Admin Protection Notice */}
            <div className="flex items-start gap-3 rounded-xl border border-amber-200/80 bg-amber-50/80 p-3.5 backdrop-blur-md dark:border-amber-900/40 dark:bg-amber-950/30">
                <LockKeyhole size={16} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                <p className="text-xs leading-relaxed text-amber-900 dark:text-amber-200">
                    <span className="font-bold">{t('rbac.adminNotice.title', { defaultValue: 'Role Security Scope' })}: </span>
                    {t('rbac.adminNotice.description', { defaultValue: 'Developer and Admin roles are system-protected to prevent accidental lockout. Modifying protected role permissions requires Developer privileges.' })}
                </p>
            </div>

            {/* Top Metrics Strip */}
            <section style={reveal(40).style} className={`grid grid-cols-2 gap-4 sm:grid-cols-4 ${reveal(40).className}`} aria-label={t('rbac.metrics.label')}>
                <Metric icon={UsersRound} label={t('rbac.metrics.roles', { defaultValue: 'Configured Roles' })} value={roles.length} detail={t('rbac.metrics.rolesDetail')} />
                <Metric icon={KeyRound} label={t('rbac.metrics.permissions', { defaultValue: 'System Permissions' })} value={allPermissions.length} detail={t('rbac.metrics.permissionsDetail')} />
                <Metric icon={Layers3} label={t('rbac.metrics.modules', { defaultValue: 'Functional Modules' })} value={modules.length} detail={t('rbac.metrics.modulesDetail')} />
                <Metric icon={CheckCircle2} label={t('rbac.metrics.grants', { defaultValue: 'Active Grants' })} value={assignedGrantCount} detail={t('rbac.metrics.grantsDetail')} />
            </section>

            {/* Audit Log Drawer */}
            {auditOpen && (
                <section className="rounded-2xl border border-slate-200/80 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3 dark:border-slate-800">
                        <h2 className="text-xs font-black uppercase tracking-wider text-slate-500">{t('rbac.actions.auditLogs', { defaultValue: 'RBAC Policy Audit Log' })}</h2>
                        <button type="button" onClick={() => setAuditOpen(false)} aria-label={t('rbac.filters.clearSearch')} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800">
                            <X size={15} />
                        </button>
                    </div>
                    <div className="max-h-64 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
                        {auditLogs.length === 0 ? (
                            <div className="p-6 text-center text-xs font-medium text-slate-500">{t('rbac.actions.noAuditLogs', { defaultValue: 'No recent permission changes logged.' })}</div>
                        ) : (
                            auditLogs.map((log) => {
                                const dateStr = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                                const isDenied = log.action === 'PERMISSION_DENIED';
                                return (
                                    <div key={log.log_id} className="flex items-center justify-between gap-4 py-2.5 text-xs">
                                        <div className="flex min-w-0 items-center gap-2.5">
                                            <span className={`shrink-0 rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${isDenied ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'}`}>
                                                {log.action.replace('ROLE_PERMISSIONS_', '')}
                                            </span>
                                            <p className="truncate text-slate-600 dark:text-slate-400">
                                                <span className="font-bold text-slate-800 dark:text-slate-200">@{log.username || 'system'}</span>
                                                {log.action === 'ROLE_PERMISSIONS_UPDATED' && ` updated ${roleLabel(log.details?.role, t)} permissions`}
                                                {log.action === 'ROLE_PERMISSIONS_RESET' && ` reset ${roleLabel(log.details?.role, t)} to defaults`}
                                                {log.action === 'ROLE_PERMISSIONS_CLONED' && ` cloned ${roleLabel(log.details?.sourceRole, t)} to ${roleLabel(log.details?.targetRole, t)}`}
                                                {log.action === 'EMERGENCY_ACCESS_GRANTED' && ' requested emergency break-glass'}
                                            </p>
                                        </div>
                                        <span className="shrink-0 font-mono text-[10px] text-slate-400">{dateStr}</span>
                                    </div>
                                );
                            })
                        )}
                    </div>
                </section>
            )}

            {isLoadingPermissions || isLoadingRoles ? (
                <LoadingState />
            ) : isError ? (
                <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                    <EmptyState icon={RefreshCw} variant="error" title={t('rbac.states.errorTitle')} description={t('rbac.states.errorDescription')} actionLabel={t('rbac.actions.retry')} onAction={retry} />
                </section>
            ) : roles.length === 0 || allPermissions.length === 0 ? (
                <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                    <EmptyState icon={ShieldCheck} title={t('rbac.states.emptyTitle')} description={t('rbac.states.emptyDescription')} />
                </section>
            ) : null}

            {/* Top Sticky Navigation Bar - System Roles */}
            {showContent && (
                <div className="sticky top-3 z-30 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 p-2.5 shadow-md backdrop-blur-2xl dark:border-slate-800/80 dark:bg-slate-900/90">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between min-w-0">
                        <div className="flex items-center justify-between sm:justify-start gap-2.5 px-1 shrink-0">
                            <div className="flex items-center gap-2">
                                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                                    <UsersRound size={14} />
                                </span>
                                <span className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-100">
                                    {t('rbac.roles.label', { defaultValue: 'System Roles' })}
                                </span>
                            </div>
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 font-mono text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                {roles.length}
                            </span>
                        </div>

                        {/* Scrollable Role Pills Container with Left/Right Buttons */}
                        <div className="relative flex items-center min-w-0 flex-1 w-full gap-1">
                            <button
                                type="button"
                                onClick={() => scrollRoles('left')}
                                aria-label="Scroll roles left"
                                title="Scroll left"
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                            >
                                <ChevronLeft size={14} className="rtl-flip" />
                            </button>

                            <div
                                ref={roleScrollRef}
                                className="flex items-center gap-1.5 overflow-x-auto py-1 px-1 max-w-full scroll-smooth"
                                style={{
                                    scrollbarWidth: 'thin',
                                    WebkitOverflowScrolling: 'touch'
                                }}
                            >
                                {roles.map((role) => (
                                    <RoleTopBarItem
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

                            <button
                                type="button"
                                onClick={() => scrollRoles('right')}
                                aria-label="Scroll roles right"
                                title="Scroll right"
                                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:bg-slate-100 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
                            >
                                <ChevronRight size={14} className="rtl-flip" />
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {showContent && (
                <section style={reveal(80).style} className={`grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] ${reveal(80).className}`}>

                    {/* Main Permissions Content Area */}
                    <div className="space-y-5 min-w-0">
                        <div className="rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/70">
                            {/* Role Header Banner */}
                            <div className="flex flex-col gap-4 border-b border-slate-100 p-4 dark:border-slate-800 sm:p-5 xl:flex-row xl:items-center xl:justify-between">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2.5">
                                        {React.createElement(ROLE_ICONS[selectedRole] || ShieldCheck, { size: 22, className: 'text-emerald-600 dark:text-emerald-400 shrink-0' })}
                                        <h2 className="truncate text-lg font-black text-slate-900 dark:text-white sm:text-xl">{roleLabel(selectedRole, t)}</h2>
                                        {PROTECTED_ROLES.has(selectedRole) ? <StatusPill tone="amber">{t('rbac.values.protected', { defaultValue: 'Protected' })}</StatusPill> : null}
                                        {dirtyRoles.has(selectedRole) ? <StatusPill tone="amber">{t('rbac.values.modified', { defaultValue: 'Unsaved Changes' })}</StatusPill> : <StatusPill tone="emerald">{t('rbac.values.saved', { defaultValue: 'Saved' })}</StatusPill>}
                                    </div>
                                    <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
                                        {selectedPermissionIds.length}/{allPermissions.length} {t('rbac.values.granted', { defaultValue: 'permissions granted' })} · {selectedGrantRatio}% {t('rbac.values.coverage', { defaultValue: 'coverage ratio' })}
                                    </p>
                                </div>
                                <div className="grid grid-cols-3 gap-2.5 sm:min-w-[280px]">
                                    <MiniRoleStat label={t('rbac.risk.critical', { defaultValue: 'Critical' })} value={selectedCriticalCount} tone={selectedCriticalCount ? 'rose' : 'slate'} />
                                    <MiniRoleStat label={t('rbac.risk.sensitive', { defaultValue: 'Sensitive' })} value={selectedSensitiveCount} tone={selectedSensitiveCount ? 'amber' : 'slate'} />
                                    <MiniRoleStat label={t('rbac.metrics.modules', { defaultValue: 'Modules' })} value={modules.length} />
                                </div>
                            </div>

                            {/* Filter Bar */}
                            <div className="flex flex-wrap items-center gap-2.5 border-b border-slate-100 p-3.5 dark:border-slate-800">
                                <label className="relative min-w-[200px] flex-1">
                                    <span className="sr-only">{t('rbac.filters.searchLabel')}</span>
                                    <Search className="absolute start-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
                                    <input
                                        value={searchQuery}
                                        onChange={(event) => setSearchQuery(event.target.value)}
                                        placeholder={t('rbac.filters.search', { defaultValue: 'Search permission name or description...' })}
                                        className="input-field h-9 w-full ps-9 pe-8 text-xs font-semibold"
                                    />
                                    {searchQuery ? (
                                        <button type="button" onClick={() => setSearchQuery('')} aria-label={t('rbac.filters.clearSearch')} className="absolute inset-y-0 end-2.5 flex items-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200">
                                            <X size={14} />
                                        </button>
                                    ) : null}
                                </label>
                                <FilterSelect value={moduleFilter} onChange={setModuleFilter} ariaLabel={t('rbac.filters.module')}>
                                    <option value="all">{t('rbac.filters.allModules', { defaultValue: 'All Modules' })}</option>
                                    {modules.map((moduleName) => <option key={moduleName} value={moduleName}>{moduleLabel(moduleName, t)}</option>)}
                                </FilterSelect>
                                <FilterSelect value={actionFilter} onChange={setActionFilter} ariaLabel={t('rbac.filters.action')}>
                                    <option value="all">{t('rbac.filters.allActions', { defaultValue: 'All Actions' })}</option>
                                    {actions.map((action) => <option key={action} value={action}>{humanize(action)}</option>)}
                                </FilterSelect>
                                <FilterSelect value={riskFilter} onChange={setRiskFilter} ariaLabel={t('rbac.filters.risk')}>
                                    <option value="all">{t('rbac.filters.allRisks', { defaultValue: 'All Risks' })}</option>
                                    {['standard', 'sensitive', 'critical'].map((risk) => <option key={risk} value={risk}>{t(`rbac.risk.${risk}`, { defaultValue: humanize(risk) })}</option>)}
                                </FilterSelect>
                                <FilterSelect value={grantFilter} onChange={setGrantFilter} ariaLabel={t('rbac.filters.grantStatus')}>
                                    <option value="all">{t('rbac.filters.allGrants', { defaultValue: 'All Grants' })}</option>
                                    <option value="granted">{t('rbac.values.granted', { defaultValue: 'Granted' })}</option>
                                    <option value="notGranted">{t('rbac.values.notGranted', { defaultValue: 'Revoked' })}</option>
                                </FilterSelect>
                                {hasFilters && (
                                    <button type="button" onClick={clearFilters} className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                                        <FilterX size={14} />
                                        {t('rbac.filters.reset', { defaultValue: 'Reset' })}
                                    </button>
                                )}
                            </div>

                            {/* Batch Action Strip */}
                            <div className="flex flex-wrap items-center justify-between gap-3 p-3.5">
                                <span className="text-xs font-semibold text-slate-500 tabular-nums">
                                    Showing {filteredPermissions.length} of {allPermissions.length} permissions
                                </span>
                                <div className="flex flex-wrap items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => updateVisiblePermissions('grant')}
                                        disabled={!canEditRole(selectedRole) || filteredIds.length === 0}
                                        className="inline-flex h-8 items-center gap-1.5 rounded-xl bg-emerald-600 px-3 text-xs font-bold text-white shadow-sm transition hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-40 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400"
                                    >
                                        <Plus size={13} />
                                        {t('rbac.actions.grantVisible', { count: filteredIds.length, defaultValue: `Grant Visible (${filteredIds.length})` })}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => updateVisiblePermissions('revoke')}
                                        disabled={!canEditRole(selectedRole) || filteredIds.length === 0}
                                        className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                                    >
                                        <Minus size={13} />
                                        {t('rbac.actions.revokeVisible', { count: filteredIds.length, defaultValue: `Revoke Visible (${filteredIds.length})` })}
                                    </button>
                                </div>
                            </div>
                        </div>

                        {/* Permission Groups List */}
                        {Object.entries(groupedPermissions).length === 0 ? (
                            <div className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
                                <FilteredEmpty t={t} onReset={clearFilters} />
                            </div>
                        ) : (
                            <div className="space-y-4">
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
                                        onToggleModuleAll={(grantAll) => toggleModulePermissions(moduleName, grantAll)}
                                        t={t}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Right Inspector & Role Comparison Column */}
                    <div className="space-y-5 lg:col-start-2 2xl:col-start-auto 2xl:sticky 2xl:top-4 2xl:self-start">
                        {/* Comparison Inspector */}
                        <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/70">
                            <div className="flex items-center gap-2.5">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                                    <Eye size={16} />
                                </span>
                                <div>
                                    <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">{t('rbac.inspector.title', { defaultValue: 'Role Comparator' })}</h2>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">Diff permissions against baseline role</p>
                                </div>
                            </div>

                            <label className="mt-4 block">
                                <span className="mb-1.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">Compare with baseline role</span>
                                <select
                                    value={compareRole}
                                    onChange={(event) => setCompareRole(event.target.value)}
                                    className="input-field w-full text-xs font-bold"
                                >
                                    {roles.filter((role) => role !== selectedRole).map((role) => <option key={role} value={role}>{roleLabel(role, t)}</option>)}
                                </select>
                            </label>

                            <div className="mt-3.5 grid grid-cols-3 gap-2" aria-label={t('rbac.inspector.comparison')}>
                                <ComparisonStat label={t('rbac.inspector.shared', { defaultValue: 'Shared' })} value={comparison.shared} />
                                <ComparisonStat label={t('rbac.inspector.targetOnly', { defaultValue: `${selectedRole} Only` })} value={comparison.selectedOnly} emphasis />
                                <ComparisonStat label={t('rbac.inspector.sourceOnly', { defaultValue: `${compareRole} Only` })} value={comparison.compareOnly} />
                            </div>

                            <div className="mt-4 grid gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
                                <button
                                    type="button"
                                    onClick={copyComparedRole}
                                    disabled={!canEditRole(selectedRole) || !compareRole}
                                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                                >
                                    <Copy size={14} />
                                    {t('rbac.actions.copyDraft', { defaultValue: `Copy All Permissions from ${compareRole}` })}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setCloneConfirmOpen(true)}
                                    disabled={!canEditRole(selectedRole) || !compareRole}
                                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
                                >
                                    <Save size={14} />
                                    {t('rbac.actions.cloneSaved', { defaultValue: 'Clone & Save Preset' })}
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setResetConfirmOpen(true)}
                                    disabled={!canEditRole(selectedRole)}
                                    className="inline-flex h-9 items-center justify-center gap-1.5 rounded-xl border border-rose-200 bg-rose-50/60 px-3 text-xs font-bold text-rose-700 transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-40 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300 dark:hover:bg-rose-900/50"
                                >
                                    <RotateCcw size={14} />
                                    {t('rbac.actions.reset', { defaultValue: 'Reset Role to System Defaults' })}
                                </button>
                            </div>
                        </div>

                        {/* Pending Changes Summary Box */}
                        <div className="rounded-2xl border border-slate-200/80 bg-white/80 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/70">
                            <div className="flex items-center gap-2.5">
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                                    <AlertCircle size={16} />
                                </span>
                                <div>
                                    <h2 className="text-xs font-black uppercase tracking-wider text-slate-800 dark:text-slate-200">{t('rbac.review.title', { defaultValue: 'Staged Changes' })}</h2>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                        {hasChanges ? `${dirtyRoles.size} roles modified` : 'No unsaved edits'}
                                    </p>
                                </div>
                            </div>
                            <div className="mt-3.5 max-h-44 space-y-2 overflow-y-auto">
                                {changeSummary.length === 0 ? (
                                    <div className="rounded-xl border border-dashed border-slate-200 p-3 text-center text-xs font-medium text-slate-400 dark:border-slate-800">
                                        {t('rbac.review.noChanges', { defaultValue: 'No permission modifications pending.' })}
                                    </div>
                                ) : (
                                    changeSummary.map((change) => (
                                        <div key={change.role} className="flex items-center justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2 text-xs dark:bg-slate-950/40">
                                            <span className="truncate font-bold text-slate-800 dark:text-slate-200">{roleLabel(change.role, t)}</span>
                                            <span className="flex shrink-0 gap-1.5 font-mono text-[10px] font-bold">
                                                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">+{change.added.length}</span>
                                                <span className="rounded bg-rose-100 px-1.5 py-0.5 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">-{change.removed.length}</span>
                                            </span>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    </div>
                </section>
            )}

            {/* Bottom Floating Glass Action Bar */}
            {hasChanges && (
                <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/80 bg-white/90 p-3.5 shadow-2xl backdrop-blur-2xl dark:border-slate-800/80 dark:bg-slate-900/90 md:start-auto md:end-6 md:bottom-6 md:max-w-xl md:rounded-2xl md:border md:p-3">
                    <div className="mx-auto flex max-w-[1600px] items-center justify-between gap-3 md:max-w-none">
                        <div className="hidden px-2 md:block">
                            <p className="text-xs font-bold text-slate-800 dark:text-slate-200">
                                {t('rbac.unsaved.title', { defaultValue: 'Unsaved Role Modifications' })}
                            </p>
                            <p className="text-[10px] font-medium text-slate-400">
                                {t('rbac.unsaved.description', { count: dirtyRoles.size, defaultValue: `${dirtyRoles.size} roles pending update` })}
                            </p>
                        </div>
                        <div className="flex w-full gap-2.5 md:w-auto">
                            <button
                                type="button"
                                onClick={discardChanges}
                                disabled={isUpdating}
                                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 md:flex-none"
                            >
                                <RotateCcw size={15} />
                                {t('rbac.actions.discard', { defaultValue: 'Discard' })}
                            </button>
                            <button
                                type="button"
                                onClick={() => setSaveConfirmOpen(true)}
                                disabled={isUpdating}
                                className="inline-flex flex-[2] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400 md:flex-none"
                            >
                                <Save size={15} />
                                {isUpdating ? t('rbac.actions.saving', { defaultValue: 'Saving...' }) : t('rbac.actions.reviewSave', { defaultValue: 'Save Role Changes' })}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            <ConfirmDialog isOpen={saveConfirmOpen} onClose={() => setSaveConfirmOpen(false)} onConfirm={saveChanges} title={t('rbac.confirm.title', { defaultValue: 'Apply Role Permission Changes' })} message={t('rbac.confirm.message', { count: dirtyRoles.size, defaultValue: `Are you sure you want to update permissions for ${dirtyRoles.size} roles?` })} confirmText={t('rbac.actions.save', { defaultValue: 'Confirm & Save' })} isLoading={isUpdating} />
            <ConfirmDialog isOpen={resetConfirmOpen} onClose={() => setResetConfirmOpen(false)} onConfirm={handleResetRole} title={t('rbac.confirm.resetTitle', { defaultValue: 'Reset Role Permissions' })} message={t('rbac.confirm.resetMessage', { role: roleLabel(selectedRole, t), defaultValue: `Reset ${roleLabel(selectedRole, t)} permissions to system default policy?` })} confirmText={t('rbac.actions.reset', { defaultValue: 'Reset' })} isLoading={isResetting} />
            <ConfirmDialog isOpen={cloneConfirmOpen} onClose={() => setCloneConfirmOpen(false)} onConfirm={handleCloneRole} title={t('rbac.confirm.cloneTitle', { defaultValue: 'Clone Role Permissions' })} message={t('rbac.confirm.cloneMessage', { target: roleLabel(selectedRole, t), source: roleLabel(compareRole, t), defaultValue: `Clone permissions from ${roleLabel(compareRole, t)} to ${roleLabel(selectedRole, t)}?` })} confirmText={t('rbac.actions.clone', { defaultValue: 'Clone & Apply' })} isLoading={isCloning} />
        </div>
    );
};

const Metric = ({ icon: Icon, label, value, detail }) => (
    <div className="flex items-center gap-3.5 rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/70">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <Icon size={19} strokeWidth={2} />
        </span>
        <div className="min-w-0">
            <p className="text-xl font-black tabular-nums leading-none text-slate-900 dark:text-white">{value}</p>
            <p className="mt-1 truncate text-xs font-bold text-slate-600 dark:text-slate-400">{label}</p>
            {detail ? <p className="mt-0.5 hidden truncate text-[10px] text-slate-400 xl:block">{detail}</p> : null}
        </div>
    </div>
);

const StatusPill = ({ tone = 'slate', children }) => {
    const tones = {
        amber: 'bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
        emerald: 'bg-emerald-100 text-emerald-900 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
        rose: 'bg-rose-100 text-rose-900 border-rose-300 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800',
        slate: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700'
    };
    return (
        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-[10px] font-bold ${tones[tone] || tones.slate}`}>
            {children}
        </span>
    );
};

const MiniRoleStat = ({ label, value, tone = 'slate' }) => {
    const tones = {
        amber: 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-300',
        rose: 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-300',
        slate: 'border-slate-200 bg-slate-50 text-slate-800 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300'
    };
    return (
        <div className={`rounded-xl border p-2.5 text-center ${tones[tone] || tones.slate}`}>
            <p className="text-base font-black leading-none tabular-nums">{value}</p>
            <p className="mt-1 truncate text-[9px] font-bold uppercase tracking-wider opacity-75">{label}</p>
        </div>
    );
};

const ComparisonStat = ({ label, value, emphasis }) => (
    <div className={`rounded-xl p-2.5 text-center border ${emphasis ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300' : 'border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300'}`}>
        <p className="text-base font-black tabular-nums">{value}</p>
        <p className="mt-0.5 truncate text-[9px] font-bold uppercase tracking-wider">{label}</p>
    </div>
);

const FilterSelect = ({ value, onChange, ariaLabel, children }) => (
    <select value={value} onChange={(event) => onChange(event.target.value)} aria-label={ariaLabel} className="input-field h-9 min-w-[135px] text-xs font-bold">
        {children}
    </select>
);

const LoadingState = () => (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{[1, 2, 3, 4].map((item) => <Skeleton key={item} height="72px" className="rounded-2xl" />)}</div>
        <Skeleton height="360px" className="mt-6 rounded-2xl" />
    </section>
);

const RoleTopBarItem = ({ role, selected, assigned, total, dirty, onClick, t }) => {
    const Icon = ROLE_ICONS[role] || ShieldCheck;
    return (
        <button
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={onClick}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-xl px-3 py-1.5 text-xs font-bold transition-all ${selected
                    ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20 ring-1 ring-emerald-500'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white'
                }`}
        >
            <Icon size={14} className={selected ? 'text-white' : 'text-slate-400 dark:text-slate-500'} />
            <span>{roleLabel(role, t)}</span>
            {PROTECTED_ROLES.has(role) && <LockKeyhole size={11} className={selected ? 'text-amber-300' : 'text-amber-500'} />}
            {dirty && <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />}
            <span className={`font-mono text-[10px] ${selected ? 'text-emerald-100' : 'text-slate-400'}`}>
                ({assigned})
            </span>
        </button>
    );
};

const PermissionGroup = ({ moduleName, permissions, role, assigned, locked, collapsed, onToggleCollapse, onToggle, onToggleModuleAll, t }) => {
    const granted = permissions.filter((permission) => assigned.includes(permission.permission_id)).length;
    const allModuleGranted = granted === permissions.length;

    return (
        <section className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/90 shadow-sm backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-900/70">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-slate-50/60 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/40">
                <button type="button" onClick={onToggleCollapse} aria-expanded={!collapsed} className="flex min-w-0 items-center gap-2.5 text-start font-bold text-slate-800 dark:text-slate-200">
                    {collapsed ? <ChevronRight size={16} className="shrink-0 rtl-flip text-slate-400" /> : <ChevronDown size={16} className="shrink-0 text-slate-400" />}
                    <span className="truncate text-xs font-black sm:text-sm">{moduleLabel(moduleName, t)}</span>
                </button>

                <div className="flex items-center gap-2 shrink-0">
                    {!locked && (
                        <button
                            type="button"
                            onClick={() => onToggleModuleAll(!allModuleGranted)}
                            className="text-[10px] font-bold text-emerald-700 hover:underline dark:text-emerald-400"
                        >
                            {allModuleGranted ? 'Revoke All' : 'Grant All'}
                        </button>
                    )}
                    <span className="rounded-lg border border-slate-200 bg-white px-2.5 py-0.5 font-mono text-[10px] font-bold text-slate-600 shadow-sm dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300">
                        {granted}/{permissions.length}
                    </span>
                </div>
            </div>

            {!collapsed && (
                <div className="divide-y divide-slate-100 dark:divide-slate-800/60">
                    {permissions.map((permission) => {
                        const checked = assigned.includes(permission.permission_id);
                        return (
                            <div key={permission.permission_id} className="flex items-start justify-between gap-4 px-4 py-3 transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-800/30">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <p className="text-xs font-bold text-slate-900 dark:text-slate-100 sm:text-sm">{permissionLabel(permission, t)}</p>
                                        <RiskBadge permission={permission} t={t} />
                                    </div>
                                    <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{permissionDescription(permission, t)}</p>
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
        className={`relative mt-0.5 inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${checked ? (disabled ? 'bg-slate-400' : 'bg-emerald-600 dark:bg-emerald-500') : 'bg-slate-200 dark:bg-slate-700'}`}
    >
        <span aria-hidden="true" className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${checked ? 'translate-x-4 rtl:-translate-x-4' : 'translate-x-0'}`} />
    </button>
);

const RiskBadge = ({ permission, t }) => {
    const risk = permissionRisk(permission);
    const styles = {
        standard: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700',
        sensitive: 'bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/60',
        critical: 'bg-rose-50 text-rose-800 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/60'
    };
    return (
        <span className={`inline-flex items-center gap-1 shrink-0 rounded-md px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider ${styles[risk]}`}>
            {risk === 'critical' && <AlertTriangle size={10} />}
            {risk === 'sensitive' && <ShieldAlert size={10} />}
            {t(`rbac.risk.${risk}`, { defaultValue: humanize(risk) })}
        </span>
    );
};

const FilteredEmpty = ({ t, onReset }) => (
    <div className="flex flex-col items-center justify-center px-5 py-12 text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-slate-100 text-slate-400 dark:bg-slate-800">
            <AlertCircle size={22} />
        </span>
        <h3 className="mt-4 text-sm font-bold text-slate-900 dark:text-white">{t('rbac.states.filteredTitle', { defaultValue: 'No permissions match filters' })}</h3>
        <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400">{t('rbac.states.filteredDescription', { defaultValue: 'Try clearing your search query or adjusting module/risk filters.' })}</p>
        <button type="button" onClick={onReset} className="mt-4 inline-flex h-9 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            <FilterX size={14} />
            {t('rbac.filters.reset', { defaultValue: 'Clear All Filters' })}
        </button>
    </div>
);

const roleLabel = (role, t) => t(`rbac.roles.${role}`, { defaultValue: humanize(role) });
const moduleLabel = (module, t) => t(`rbac.modules.${module || 'Other'}`, { defaultValue: humanize(module || t('rbac.values.other', { defaultValue: 'Other' })) });
const permissionLabel = (permission, t) => {
    const [action, ...resourceParts] = String(permission?.name || '').split('_');
    const resource = resourceParts.join('_');
    return t('rbac.values.permissionLabel', {
        action: t(`rbac.permissionActions.${action}`, { defaultValue: humanize(action) }),
        resource: t(`rbac.permissionResources.${resource}`, { defaultValue: humanize(resource) }),
        defaultValue: humanize(permission?.name)
    });
};
const permissionDescription = (permission, t) => permission.description || t('rbac.values.noDescription', { defaultValue: 'No description specified' });
const permissionAction = (permission) => String(permission?.name || '').split('_')[0] || 'OTHER';
const permissionRisk = (permission) => {
    const name = String(permission?.name || '');
    if (/^(DELETE|MERGE|FINALIZE|AMEND|ISSUE_REFUNDS|CLOSE_|MANAGE_ROLES|MANAGE_USERS|MANAGE_BACKUPS|MANAGE_SETTINGS|MANAGE_INTEGRATIONS|ANONYMIZE)/.test(name)) return 'critical';
    if (/^(CREATE|EDIT|PERFORM|WRITE|REVIEW|APPROVE|DELIVER|PROCESS|MANAGE|EXPORT|ADJUST|RECEIVE|APPLY|DOWNLOAD|OVERRIDE|RECONCILE|IMPORT|UPLOAD)/.test(name)) return 'sensitive';
    return 'standard';
};
const samePermissionSet = (first = [], second = []) => first.length === second.length && first.every((id) => second.includes(id));
const csvCell = (value) => {
    let text = String(value ?? '');
    if (/^[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
};
const humanize = (value) => String(value || '').replace(/_/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());

export default RoleManagement;
