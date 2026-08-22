import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import {
    AlertCircle,
    CheckCircle2,
    Clock,
    KeyRound,
    Fingerprint,
    LogOut,
    Monitor,
    QrCode,
    RefreshCw,
    ShieldAlert,
    ShieldCheck,
    Smartphone
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useDispatch } from 'react-redux';
import {
    useChangePasswordMutation,
    useEnable2FAMutation,
    useGetProfileQuery,
    useGetProfileSessionsQuery,
    useRevokeProfileSessionMutation,
    useSetup2FAMutation
    , useGetPasskeysQuery
    , usePasskeyRegistrationOptionsMutation
    , usePasskeyRegistrationVerifyMutation
    , useRenamePasskeyMutation
    , useRevokePasskeyMutation
} from '../../store/api';
import { logOut } from '../../store/authSlice';
import { getErrorMessage } from '../../utils/getErrorMessage';
import { formatRelativeTime } from '../../utils/dateFormat';
import { getPasskeyErrorKind, getPasskeySupport, registerPasskey } from '../../utils/passkeys';

const emptyPwd = { currentPassword: '', newPassword: '', confirmPassword: '' };
const panel = 'rounded-2xl border border-slate-200/80 bg-white shadow-sm backdrop-blur-xl dark:border-slate-800 dark:bg-slate-900/50';
const input = 'w-full rounded-xl border border-slate-200/80 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 outline-none transition-all focus:border-[var(--VIARA-accent)] focus:ring-4 focus:ring-[rgba(var(--VIARA-accent-rgb),0.12)] disabled:bg-slate-100 disabled:text-slate-400 dark:border-slate-800 dark:bg-slate-950/50 dark:text-white dark:focus:border-[var(--VIARA-accent)] dark:focus:ring-[rgba(var(--VIARA-accent-rgb),0.16)]';

const SecuritySettings = () => {
    const { t } = useTranslation(['settings', 'common']);
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const [changePassword, { isLoading: isSavingPwd }] = useChangePasswordMutation();
    const { data: profile } = useGetProfileQuery();
    const { data: sessionData, isLoading: sessionsLoading, isError: sessionsError, isFetching: sessionsRefreshing, refetch } = useGetProfileSessionsQuery();
    const [revokeSession] = useRevokeProfileSessionMutation();
    const [setup2FA] = useSetup2FAMutation();
    const [enable2FA] = useEnable2FAMutation();
    const { data: passkeyData, isLoading: passkeysLoading } = useGetPasskeysQuery();
    const [getRegistrationOptions] = usePasskeyRegistrationOptionsMutation();
    const [verifyRegistration] = usePasskeyRegistrationVerifyMutation();
    const [renamePasskey] = useRenamePasskeyMutation();
    const [revokePasskey] = useRevokePasskeyMutation();

    const [pwdForm, setPwdForm] = useState(emptyPwd);
    const [revokingId, setRevokingId] = useState(null);
    const [qrCodeUrl, setQrCodeUrl] = useState(null);
    const [setupKey, setSetupKey] = useState(null);
    const [otp, setOtp] = useState('');
    const [show2FA, setShow2FA] = useState(false);
    const [isProc2FA, setIsProc2FA] = useState(false);
    const [passkeyForm, setPasskeyForm] = useState({ label: '', currentPassword: '' });
    const [isPasskeyBusy, setIsPasskeyBusy] = useState(false);

    const sessions = sessionData?.sessions || [];
    const passkeys = passkeyData?.passkeys || [];
    const passkeySupport = getPasskeySupport();
    const is2FAEnabled = profile?.is2FAEnabled || false;
    const pwdFilled = pwdForm.currentPassword && pwdForm.newPassword && pwdForm.confirmPassword;
    const strength = strengthOf(pwdForm.newPassword);
    const strengthMeta = STRENGTH_META[strength];

    const updatePwd = (field, value) => setPwdForm(previous => ({ ...previous, [field]: value }));

    const handleSavePwd = async () => {
        if (pwdForm.newPassword !== pwdForm.confirmPassword) {
            toast.error(t('settings.errors.passwordMismatch'));
            return;
        }
        if (pwdForm.newPassword.length < 8) {
            toast.error(t('settings.errors.passwordTooShort', 'New password must be at least 8 characters.'));
            return;
        }
        if (pwdForm.currentPassword === pwdForm.newPassword) {
            toast.error(t('settings.errors.passwordSameAsCurrent', 'New password must be different from the current password.'));
            return;
        }
        try {
            await changePassword({ currentPassword: pwdForm.currentPassword, newPassword: pwdForm.newPassword }).unwrap();
            setPwdForm(emptyPwd);
            toast.success(t('settings.success.passwordSaved', 'Password changed.'));
            dispatch(logOut());
            navigate('/login', { replace: true });
        } catch (error) {
            toast.error(getErrorMessage(error, t('settings.errors.passwordSaveFailed')));
        }
    };

    const handleRevoke = async id => {
        setRevokingId(id);
        try {
            await revokeSession(id).unwrap();
            toast.success(t('settings.sessions.revoked'));
        } catch (error) {
            toast.error(getErrorMessage(error, t('settings.sessions.revokeFailed')));
        } finally {
            setRevokingId(null);
        }
    };

    const handleToggle2FA = async () => {
        if (is2FAEnabled) {
            toast('To disable 2FA, contact an administrator.', { icon: '!' });
            return;
        }
        setIsProc2FA(true);
        try {
            const result = await setup2FA().unwrap();
            setQrCodeUrl(result.qrCode);
            setSetupKey(result.secret);
            setShow2FA(true);
        } catch (error) {
            toast.error(getErrorMessage(error, 'Failed to setup 2FA.'));
        } finally {
            setIsProc2FA(false);
        }
    };

    const handleVerify2FA = async () => {
        if (!otp || otp.length < 6) {
            toast.error('Please enter a valid 6-digit code.');
            return;
        }
        setIsProc2FA(true);
        try {
            await enable2FA({ token: otp }).unwrap();
            setShow2FA(false);
            setOtp('');
            toast.success('Two-Factor Authentication enabled!');
        } catch (error) {
            toast.error(getErrorMessage(error, 'Invalid code.'));
        } finally {
            setIsProc2FA(false);
        }
    };

    const handleRegisterPasskey = async () => {
        if (!passkeySupport.supported) {
            toast.error(passkeySupport.reason === 'insecure' ? 'Passkeys require HTTPS.' : 'Passkeys are not supported on this device.');
            return;
        }
        if (!passkeyForm.label.trim() || !passkeyForm.currentPassword) {
            toast.error('Enter a device label and your current password.');
            return;
        }
        setIsPasskeyBusy(true);
        try {
            const ceremony = await getRegistrationOptions({ currentPassword: passkeyForm.currentPassword }).unwrap();
            const response = await registerPasskey(ceremony.options);
            await verifyRegistration({ ceremonyId: ceremony.ceremonyId, label: passkeyForm.label.trim(), response }).unwrap();
            setPasskeyForm({ label: '', currentPassword: '' });
            toast.success('Passkey registered.');
        } catch (error) {
            if (getPasskeyErrorKind(error) !== 'cancelled') toast.error(getErrorMessage(error, 'Passkey registration failed.'));
        } finally {
            setIsPasskeyBusy(false);
        }
    };

    const handleRenamePasskey = async passkey => {
        const label = window.prompt('Passkey name', passkey.label);
        if (!label?.trim() || label.trim() === passkey.label) return;
        try {
            await renamePasskey({ id: passkey.id, label: label.trim() }).unwrap();
            toast.success('Passkey renamed.');
        } catch (error) { toast.error(getErrorMessage(error, 'Could not rename passkey.')); }
    };

    const handleRevokePasskey = async passkey => {
        if (!window.confirm(`Remove “${passkey.label}”?`)) return;
        const currentPassword = passkeys.length === 1 ? window.prompt('Enter your current password to remove your final passkey') : '';
        if (passkeys.length === 1 && !currentPassword) return;
        try {
            await revokePasskey({ id: passkey.id, currentPassword }).unwrap();
            toast.success('Passkey removed.');
        } catch (error) { toast.error(getErrorMessage(error, 'Could not remove passkey.')); }
    };

    return (
        <div className="space-y-4">
            <section className={`${panel} p-4 sm:p-5`}>
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                            <ShieldAlert size={18} aria-hidden="true" />
                        </span>
                        <div>
                            <h2 className="text-base font-black text-slate-950 dark:text-white">{t('settings.securityTab', 'Security settings')}</h2>
                            <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">{t('settings.securityDesc', 'Manage your password, two-factor authentication, and active sessions.')}</p>
                        </div>
                    </div>
                    <StatusBadge enabled={is2FAEnabled} />
                </div>
            </section>

            <section className={`${panel} overflow-hidden`}>
                <PanelHead icon={KeyRound} title={t('settings.password', 'Password')} description={t('settings.passwordDesc', 'Change your password with current-password confirmation.')} />
                <div className="p-4 sm:p-5">
                    <div className="grid gap-4 md:grid-cols-3">
                        <PasswordField label={t('settings.currentPassword', 'Current password')} value={pwdForm.currentPassword} onChange={value => updatePwd('currentPassword', value)} disabled={isSavingPwd} />
                        <PasswordField label={t('settings.newPassword', 'New password')} value={pwdForm.newPassword} onChange={value => updatePwd('newPassword', value)} disabled={isSavingPwd} />
                        <PasswordField label={t('settings.confirmPassword', 'Confirm password')} value={pwdForm.confirmPassword} onChange={value => updatePwd('confirmPassword', value)} disabled={isSavingPwd} />
                    </div>
                    {pwdForm.newPassword ? (
                        <div className="mt-4">
                            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                                <div className={`h-full rounded-full transition-all ${strengthMeta.color} ${strengthMeta.width}`} />
                            </div>
                            <p className="mt-1.5 text-xs font-bold text-slate-500 dark:text-slate-400">Password strength: {strengthMeta.label}</p>
                        </div>
                    ) : null}
                    <div className="mt-6 flex flex-col-reverse gap-2 border-t border-slate-200 pt-4 dark:border-slate-800 sm:flex-row sm:justify-end">
                        <button type="button" onClick={() => setPwdForm(emptyPwd)} disabled={isSavingPwd} className="min-h-10 rounded-lg px-4 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-100 disabled:opacity-40 dark:text-slate-300 dark:hover:bg-slate-800">
                            {t('common:cancel', 'Cancel')}
                        </button>
                        <button type="button" onClick={handleSavePwd} disabled={!pwdFilled || isSavingPwd} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-teal-700 px-5 text-sm font-bold text-white transition-colors hover:bg-teal-800 disabled:opacity-40 dark:bg-teal-600 dark:hover:bg-teal-500">
                            {isSavingPwd ? t('common:saving', 'Saving...') : t('settings.changePasswordBtn', 'Change password')}
                        </button>
                    </div>
                </div>
            </section>

            <section className={`${panel} overflow-hidden`}>
                <PanelHead icon={Fingerprint} title="Passkeys" description="Sign in with your fingerprint, face, device PIN, or security key. Biometric data stays on your device." />
                <div className="space-y-4 p-4 sm:p-5">
                    {!passkeySupport.supported ? <p className="rounded-lg bg-amber-50 p-3 text-sm font-semibold text-amber-800 dark:bg-amber-950/30 dark:text-amber-200">{passkeySupport.reason === 'insecure' ? 'Passkey management requires HTTPS.' : 'This browser does not support passkeys.'}</p> : null}
                    <div className="grid gap-3 md:grid-cols-2">
                        <label className="block"><span className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">Device label</span><input value={passkeyForm.label} maxLength={80} onChange={event => setPasskeyForm(previous => ({ ...previous, label: event.target.value }))} placeholder="e.g. Windows Hello workstation" className={input} /></label>
                        <PasswordField label="Current password" value={passkeyForm.currentPassword} onChange={value => setPasskeyForm(previous => ({ ...previous, currentPassword: value }))} disabled={isPasskeyBusy} />
                    </div>
                    <div className="flex justify-end"><button type="button" onClick={handleRegisterPasskey} disabled={isPasskeyBusy || !passkeySupport.supported} className="min-h-10 rounded-lg bg-teal-700 px-5 text-sm font-bold text-white disabled:opacity-40 dark:bg-teal-600">{isPasskeyBusy ? 'Waiting for device...' : 'Add passkey'}</button></div>
                    <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                        {passkeysLoading ? <SessionSkeleton /> : null}
                        {!passkeysLoading && passkeys.length === 0 ? <p className="p-5 text-center text-sm text-slate-500">No passkeys registered.</p> : null}
                        {passkeys.map(passkey => <div key={passkey.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-bold text-slate-950 dark:text-white">{passkey.label}</p><p className="mt-1 text-xs text-slate-500">{passkey.backedUp ? 'Synced passkey' : 'Device-bound passkey'} · Added {formatRelativeTime(passkey.createdAt)}{passkey.lastUsedAt ? ` · Used ${formatRelativeTime(passkey.lastUsedAt)}` : ''}</p></div><div className="flex gap-2"><button type="button" onClick={() => handleRenamePasskey(passkey)} className="min-h-9 rounded-lg border border-slate-200 px-3 text-xs font-bold dark:border-slate-700">Rename</button><button type="button" onClick={() => handleRevokePasskey(passkey)} className="min-h-9 rounded-lg border border-rose-200 px-3 text-xs font-bold text-rose-600 dark:border-rose-900">Remove</button></div></div>)}
                    </div>
                </div>
            </section>

            <section className={`${panel} overflow-hidden`}>
                <div className="p-4 sm:p-5">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex items-start gap-3">
                            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${is2FAEnabled ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'}`}>
                                <ShieldCheck size={19} aria-hidden="true" />
                            </span>
                            <div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <h2 className="text-sm font-black text-slate-950 dark:text-white">Two-Factor Authentication</h2>
                                    {is2FAEnabled ? <Pill tone="emerald"><CheckCircle2 size={12} /> Enabled</Pill> : <Pill tone="amber">Recommended</Pill>}
                                </div>
                                <p className="mt-1 max-w-xl text-sm leading-6 text-slate-500 dark:text-slate-400">Add an authenticator-code requirement when signing in.</p>
                            </div>
                        </div>
                        <button onClick={handleToggle2FA} disabled={isProc2FA || is2FAEnabled} className={`min-h-10 shrink-0 rounded-lg px-4 text-sm font-bold transition-colors disabled:opacity-50 ${is2FAEnabled ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-900/60' : 'bg-teal-700 text-white hover:bg-teal-800 dark:bg-teal-600 dark:hover:bg-teal-500'}`}>
                            {isProc2FA ? 'Processing...' : is2FAEnabled ? 'Configured' : 'Enable 2FA'}
                        </button>
                    </div>

                    {show2FA ? (
                        <div className="mt-5 rounded-lg border border-teal-200 bg-teal-50 p-4 dark:border-teal-900/60 dark:bg-teal-950/20">
                            <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                                <div className="flex h-36 w-36 shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-slate-200 dark:bg-slate-950 dark:ring-slate-800">
                                    {qrCodeUrl ? <img src={qrCodeUrl} alt="2FA QR Code" className="h-full w-full rounded-lg p-2" /> : <QrCode size={44} className="text-slate-300" />}
                                </div>
                                <div className="flex-1 space-y-4">
                                    <div>
                                        <p className="text-sm font-black text-slate-950 dark:text-white">1. Scan the QR code</p>
                                        <p className="mt-1 text-xs leading-5 text-slate-600 dark:text-slate-300">Use your authenticator app or manually enter this key:</p>
                                        <code className="mt-2 inline-block rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-teal-700 ring-1 ring-teal-200 dark:bg-slate-950 dark:text-teal-300 dark:ring-teal-900/60">{setupKey || 'Loading...'}</code>
                                    </div>
                                    <div>
                                        <p className="mb-2 text-sm font-black text-slate-950 dark:text-white">2. Enter the 6-digit code</p>
                                        <input type="text" maxLength="6" placeholder="000000" value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, ''))} className={`${input} max-w-[180px] text-center text-lg font-black tracking-[0.35em]`} />
                                    </div>
                                    <div className="flex gap-2">
                                        <button type="button" onClick={() => { setShow2FA(false); setOtp(''); }} className="min-h-10 rounded-lg px-4 text-sm font-bold text-slate-600 hover:bg-white/60 dark:text-slate-300 dark:hover:bg-slate-900">
                                            {t('common:cancel', 'Cancel')}
                                        </button>
                                        <button type="button" onClick={handleVerify2FA} disabled={isProc2FA || otp.length < 6} className="min-h-10 rounded-lg bg-teal-700 px-5 text-sm font-bold text-white hover:bg-teal-800 disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-500">
                                            {isProc2FA ? 'Verifying...' : 'Verify and enable'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ) : null}
                </div>
            </section>

            <section className={`${panel} overflow-hidden`}>
                <PanelHead
                    icon={Monitor}
                    title={t('settings.sessions.title', 'Active sessions')}
                    description={t('settings.sessions.description', 'Devices currently signed in to your account.')}
                    action={(
                        <button type="button" onClick={refetch} disabled={sessionsRefreshing} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800">
                            <RefreshCw size={13} className={sessionsRefreshing ? 'animate-spin' : ''} />
                            Refresh
                        </button>
                    )}
                />
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {sessionsLoading ? [1, 2].map(item => <SessionSkeleton key={item} />) : null}
                    {!sessionsLoading && sessionsError ? (
                        <div className="flex flex-col items-center py-10 text-center">
                            <AlertCircle size={28} className="text-rose-400" />
                            <p className="mt-3 text-sm font-bold text-slate-800 dark:text-slate-200">{t('settings.sessions.errorTitle')}</p>
                            <button onClick={refetch} className="mt-2 text-xs font-bold text-teal-700 hover:underline">{t('settings.sessions.retry')}</button>
                        </div>
                    ) : null}
                    {!sessionsLoading && !sessionsError && sessions.length === 0 ? (
                        <p className="p-8 text-center text-sm font-medium text-slate-400">{t('settings.sessions.empty')}</p>
                    ) : null}
                    {!sessionsLoading && !sessionsError && sessions.map(session => (
                        <SessionRow key={session.id} session={session} revoking={revokingId === session.id} onRevoke={() => handleRevoke(session.id)} t={t} />
                    ))}
                </div>
            </section>
        </div>
    );
};

const PanelHead = ({ icon: Icon, title, description, action }) => (
    <header className="flex flex-col gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/50 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <Icon size={17} aria-hidden="true" />
            </span>
            <div className="min-w-0">
                <h2 className="text-sm font-black text-slate-950 dark:text-white">{title}</h2>
                <p className="mt-0.5 text-xs leading-5 text-slate-500 dark:text-slate-400">{description}</p>
            </div>
        </div>
        {action}
    </header>
);

const PasswordField = ({ label, value, onChange, disabled }) => (
    <label className="block">
        <span className="mb-1.5 block text-xs font-bold text-slate-600 dark:text-slate-300">{label}</span>
        <input type="password" value={value} onChange={event => onChange(event.target.value)} disabled={disabled} dir="ltr" className={input} />
    </label>
);

const StatusBadge = ({ enabled }) => (
    <div className="min-w-44">
        <div className="flex justify-between text-xs font-bold text-slate-500 dark:text-slate-400">
            <span>Account security</span>
            <span className={enabled ? 'text-emerald-600 dark:text-emerald-300' : 'text-amber-600 dark:text-amber-300'}>{enabled ? 'Strong' : 'Moderate'}</span>
        </div>
        <div className="mt-2 h-1.5 rounded-full bg-slate-100 dark:bg-slate-800">
            <div className={`h-1.5 rounded-full ${enabled ? 'w-full bg-emerald-500' : 'w-1/2 bg-amber-500'}`} />
        </div>
    </div>
);

const Pill = ({ tone, children }) => (
    <span className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-bold ${tone === 'emerald' ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-900/60' : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900/60'}`}>
        {children}
    </span>
);

const SessionRow = ({ session, revoking, onRevoke, t }) => {
    const { browser, platform, mobile } = describeAgent(session.userAgent, t);
    const Icon = mobile ? Smartphone : Monitor;
    return (
        <div className="flex flex-col gap-4 p-4 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${session.isCurrent ? 'bg-teal-50 text-teal-700 dark:bg-teal-950/30 dark:text-teal-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-300'}`}>
                    <Icon size={19} aria-hidden="true" />
                </span>
                <div>
                    <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-slate-950 dark:text-white">
                        {platform}
                        {session.isCurrent ? <span className="rounded-md bg-teal-50 px-2 py-0.5 text-xs font-bold text-teal-700 dark:bg-teal-950/30 dark:text-teal-300">{t('settings.sessions.thisDevice')}</span> : null}
                    </p>
                    <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">{browser} - {session.ipAddress || t('settings.sessions.unknownIp')}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs font-medium text-slate-400">
                        <Clock size={12} aria-hidden="true" />
                        {session.isCurrent ? 'Active now' : formatRelativeTime(session.lastActiveAt)}
                    </p>
                </div>
            </div>
            {!session.isCurrent ? (
                <button onClick={onRevoke} disabled={revoking} className="inline-flex min-h-9 shrink-0 items-center justify-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 text-sm font-bold text-rose-600 transition-colors hover:bg-rose-100 disabled:opacity-50 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-300">
                    <LogOut size={15} aria-hidden="true" />
                    {revoking ? t('common:saving', 'Saving...') : t('settings.sessions.revoke')}
                </button>
            ) : null}
        </div>
    );
};

const SessionSkeleton = () => (
    <div className="flex items-center gap-4 p-4">
        <div className="h-10 w-10 shrink-0 animate-pulse rounded-lg bg-slate-100 dark:bg-slate-800" />
        <div className="flex-1 space-y-2">
            <div className="h-3 w-32 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
            <div className="h-2.5 w-48 animate-pulse rounded bg-slate-100 dark:bg-slate-800" />
        </div>
    </div>
);

const describeAgent = (ua, t) => {
    const value = ua || '';
    const browser = /Edg\//i.test(value) ? 'Edge' : /Firefox\//i.test(value) ? 'Firefox' : /Chrome\//i.test(value) ? 'Chrome' : /Safari\//i.test(value) ? 'Safari' : t('settings.sessions.unknownBrowser');
    const platform = /Windows/i.test(value) ? 'Windows' : /Mac/i.test(value) ? 'macOS' : /Android/i.test(value) ? 'Android' : /iPhone|iPad/i.test(value) ? 'iOS' : /Linux/i.test(value) ? 'Linux' : t('settings.sessions.unknownDevice');
    const mobile = /Android|iPhone|iPad|Mobile/i.test(value);
    return { browser, platform, mobile };
};

const strengthOf = password => {
    if (!password) return 0;
    let score = 0;
    if (password.length >= 8) score++;
    if (/[A-Z]/.test(password)) score++;
    if (/[0-9]/.test(password)) score++;
    if (/[^A-Za-z0-9]/.test(password)) score++;
    return score;
};

const STRENGTH_META = [
    { label: 'Empty', color: 'bg-slate-300', width: 'w-0' },
    { label: 'Weak', color: 'bg-rose-500', width: 'w-1/4' },
    { label: 'Fair', color: 'bg-amber-500', width: 'w-2/4' },
    { label: 'Good', color: 'bg-teal-500', width: 'w-3/4' },
    { label: 'Strong', color: 'bg-emerald-500', width: 'w-full' }
];

export default SecuritySettings;
