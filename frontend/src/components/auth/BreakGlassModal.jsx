import { useEffect, useMemo, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { Clock3, KeyRound, ShieldAlert, ShieldCheck, ShieldOff } from 'lucide-react';
import toast from 'react-hot-toast';
import {
    useGetBreakGlassStatusQuery,
    useRequestBreakGlassMutation,
    useRevokeBreakGlassMutation,
} from '../../store/api';
import { clearEmergencyAccess, selectCurrentUser, setAccessToken } from '../../store/authSlice';
import { isEmergencyAccessActive } from '../../utils/effectivePermissions';
import Modal from '../ui/Modal';
import Button from '../ui/Button';

const fieldClass = 'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-red-500 focus:ring-4 focus:ring-red-500/10 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500';

const BreakGlassModal = ({ isOpen, onClose }) => {
    const [reason, setReason] = useState('');
    const [currentPassword, setCurrentPassword] = useState('');
    const [revokeReason, setRevokeReason] = useState('');
    const [requestBreakGlass, { isLoading }] = useRequestBreakGlassMutation();
    const [revokeBreakGlass, { isLoading: isRevoking }] = useRevokeBreakGlassMutation();
    const { data: serverStatus, isFetching: isChecking, refetch } = useGetBreakGlassStatusQuery(undefined, {
        skip: !isOpen,
        pollingInterval: isOpen ? 15000 : 0,
    });
    const user = useSelector(selectCurrentUser);
    const dispatch = useDispatch();
    const { t, i18n } = useTranslation('system');

    const locallyActive = isEmergencyAccessActive(user);
    const active = Boolean(serverStatus?.active || locallyActive);
    const expiresAt = serverStatus?.expiresAt || (locallyActive ? user.breakGlassExpiry : null);
    const permissions = serverStatus?.permissions || (locallyActive ? user.elevatedPermissions : []);
    const formattedExpiry = useMemo(() => {
        if (!expiresAt) return '';
        const parsed = new Date(expiresAt);
        if (Number.isNaN(parsed.getTime())) return '';
        return new Intl.DateTimeFormat(i18n.language?.startsWith('ar') ? 'ar-EG' : 'en-EG', {
            dateStyle: 'medium', timeStyle: 'short',
        }).format(parsed);
    }, [expiresAt, i18n.language]);

    useEffect(() => {
        if (!isOpen) {
            setReason('');
            setCurrentPassword('');
            setRevokeReason('');
        }
    }, [isOpen]);

    useEffect(() => {
        if (isOpen && serverStatus && !serverStatus.active && locallyActive) dispatch(clearEmergencyAccess());
    }, [dispatch, isOpen, locallyActive, serverStatus]);

    const handleSubmit = async (event) => {
        event.preventDefault();
        try {
            const response = await requestBreakGlass({ reason: reason.trim(), currentPassword }).unwrap();
            dispatch(setAccessToken(response.token));
            toast.success(t('breakGlass.success', {
                defaultValue: 'Emergency access activated for {{minutes}} minutes',
                minutes: response.durationMinutes,
            }));
            setReason('');
            setCurrentPassword('');
            await refetch();
        } catch (error) {
            const code = error?.data?.code;
            const fallback = code === 'BREAK_GLASS_REAUTH_FAILED'
                ? t('breakGlass.invalidPassword', { defaultValue: 'Current password is incorrect' })
                : code === 'BREAK_GLASS_ALREADY_ACTIVE'
                    ? t('breakGlass.alreadyActive', { defaultValue: 'Emergency access is already active' })
                    : t('breakGlass.error', { defaultValue: 'Emergency access could not be activated' });
            toast.error(fallback);
        }
    };

    const handleRevoke = async (event) => {
        event.preventDefault();
        try {
            const response = await revokeBreakGlass(revokeReason.trim()).unwrap();
            if (response.token) dispatch(setAccessToken(response.token));
            dispatch(clearEmergencyAccess());
            toast.success(t('breakGlass.revokeSuccess', { defaultValue: 'Emergency access revoked' }));
            setRevokeReason('');
            await refetch();
            onClose();
        } catch {
            toast.error(t('breakGlass.revokeError', { defaultValue: 'Emergency access could not be revoked' }));
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={t('breakGlass.title')} size="sm">
            {active ? (
                <form onSubmit={handleRevoke} className="space-y-5">
                    <div className="rounded-2xl border border-amber-300/70 bg-amber-50 p-4 dark:border-amber-500/30 dark:bg-amber-500/10">
                        <div className="flex items-start gap-3">
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300"><ShieldCheck size={20} aria-hidden="true" /></span>
                            <div className="min-w-0">
                                <p className="text-sm font-bold text-amber-950 dark:text-amber-100">{t('breakGlass.activeTitle', { defaultValue: 'Emergency access is active' })}</p>
                                {formattedExpiry && <p className="mt-1 flex items-center gap-1.5 text-xs text-amber-800 dark:text-amber-200"><Clock3 size={14} aria-hidden="true" />{t('breakGlass.expiresAt', { defaultValue: 'Expires {{date}}', date: formattedExpiry })}</p>}
                            </div>
                        </div>
                        {permissions.length > 0 && <div className="mt-3 flex flex-wrap gap-1.5" aria-label={t('breakGlass.permissions', { defaultValue: 'Granted permissions' })}>{permissions.map((permission) => <span key={permission} className="rounded-lg border border-amber-200 bg-white/70 px-2 py-1 font-mono text-[10px] font-semibold text-amber-900 dark:border-amber-500/30 dark:bg-slate-950/30 dark:text-amber-100">{permission}</span>)}</div>}
                    </div>
                    <label className="block">
                        <span className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">{t('breakGlass.revokeReason', { defaultValue: 'Reason for ending emergency access' })}</span>
                        <textarea value={revokeReason} onChange={(event) => setRevokeReason(event.target.value)} className={`${fieldClass} h-24 resize-none`} minLength={10} maxLength={500} required />
                        <span className="mt-1.5 block text-xs text-slate-500 dark:text-slate-400">{revokeReason.trim().length}/500 · {t('breakGlass.revokeMinimum', { defaultValue: 'Minimum 10 characters' })}</span>
                    </label>
                    <div className="flex justify-end gap-3 border-t border-slate-100 pt-5 dark:border-slate-800">
                        <Button type="button" variant="ghost" onClick={onClose}>{t('breakGlass.cancel')}</Button>
                        <Button type="submit" variant="danger" loading={isRevoking} disabled={revokeReason.trim().length < 10}><ShieldOff size={16} aria-hidden="true" />{t('breakGlass.revoke', { defaultValue: 'End emergency access' })}</Button>
                    </div>
                </form>
            ) : (
                <form onSubmit={handleSubmit} className="space-y-5" aria-busy={isChecking}>
                    <div className="flex items-start gap-4 rounded-2xl border border-red-200 bg-red-50 p-4 dark:border-red-500/30 dark:bg-red-500/10">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-300"><ShieldAlert size={20} aria-hidden="true" /></span>
                        <div><p className="text-sm font-bold text-red-900 dark:text-red-100">{t('breakGlass.protocol')}</p><p className="mt-1 text-sm leading-6 text-red-800/80 dark:text-red-200/80">{t('breakGlass.description')}</p></div>
                    </div>
                    <label className="block">
                        <span className="mb-2 block text-sm font-bold text-slate-700 dark:text-slate-200">{t('breakGlass.reason')} <span className="text-red-500">*</span></span>
                        <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t('breakGlass.placeholder')} className={`${fieldClass} h-28 resize-none`} required minLength={20} maxLength={1000} autoFocus />
                        <span className="mt-1.5 block text-xs text-slate-500 dark:text-slate-400">{reason.trim().length}/1000 · {t('breakGlass.minimum')}</span>
                    </label>
                    <label className="block">
                        <span className="mb-2 flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200"><KeyRound size={15} aria-hidden="true" />{t('breakGlass.currentPassword', { defaultValue: 'Current password' })} <span className="text-red-500">*</span></span>
                        <input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} className={fieldClass} autoComplete="current-password" required />
                    </label>
                    <div className="flex justify-end gap-3 border-t border-slate-100 pt-5 dark:border-slate-800">
                        <Button type="button" variant="ghost" onClick={onClose}>{t('breakGlass.cancel')}</Button>
                        <Button type="submit" variant="danger" loading={isLoading} disabled={reason.trim().length < 20 || !currentPassword}>{isLoading ? t('breakGlass.processing') : t('breakGlass.submit')}</Button>
                    </div>
                </form>
            )}
        </Modal>
    );
};

export default BreakGlassModal;
