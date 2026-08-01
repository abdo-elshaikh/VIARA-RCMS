import { useState } from 'react';
import { CheckCircle2, KeyRound, Lock, QrCode, ShieldCheck } from 'lucide-react';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { useEnable2FAMutation, useSetup2FAMutation } from '../store/api';
import { selectCurrentUser } from '../store/authSlice';
import { Button, Input, PageHeader } from '../components/ui';

const SecuritySettings = () => {
    const { t } = useTranslation('governance');
    const user = useSelector(selectCurrentUser);
    const [setup2FA, { isLoading: isSettingUp }] = useSetup2FAMutation();
    const [enable2FA, { isLoading: isEnabling }] = useEnable2FAMutation();
    const [qrCodeUrl, setQrCodeUrl] = useState('');
    const [verificationCode, setVerificationCode] = useState('');
    const [setupStarted, setSetupStarted] = useState(false);
    const enabled = Boolean(user?.is_2fa_enabled || user?.is2FAEnabled);

    const cancelSetup = () => {
        setSetupStarted(false);
        setQrCodeUrl('');
        setVerificationCode('');
    };

    const handleSetup = async () => {
        try {
            const response = await setup2FA().unwrap();
            setQrCodeUrl(response.qrCodeUrl);
            setSetupStarted(true);
        } catch (error) {
            toast.error(error?.data?.error || t('security.setupError'));
        }
    };

    const handleEnable = async (event) => {
        event.preventDefault();
        if (verificationCode.length !== 6) return;
        try {
            await enable2FA({ token: verificationCode }).unwrap();
            toast.success(t('security.enabledSuccess'));
            cancelSetup();
        } catch (error) {
            toast.error(error?.data?.error || t('security.invalidCode'));
        }
    };

    return (
        <div className="mx-auto max-w-4xl space-y-6">
            <PageHeader icon={ShieldCheck} title={t('security.title')} description={t('security.description')} />

            <section className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#0b1426] shadow-sm">
                <div className="flex flex-col gap-5 border-b border-slate-100 dark:border-slate-800 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                    <div className="flex items-start gap-4"><span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-400"><Lock size={22} /></span><div><h2 className="font-bold text-slate-900 dark:text-white">{t('security.twoFactor')}</h2><p className="mt-1 max-w-xl text-sm leading-6 text-slate-500">{t('security.twoFactorDescription')}</p></div></div>
                    <span className={`inline-flex self-start items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold ${enabled ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 ring-1 ring-emerald-100 dark:ring-emerald-900/50' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400 ring-1 ring-amber-100 dark:ring-amber-900/50'}`}>{enabled ? <CheckCircle2 size={14} /> : <KeyRound size={14} />}{enabled ? t('security.enabled') : t('security.notEnabled')}</span>
                </div>

                {!setupStarted ? (
                    <div className="p-5 sm:p-7">
                        <div className="rounded-xl border border-indigo-100 dark:border-indigo-900/50 bg-indigo-50/70 dark:bg-indigo-900/20 p-4 text-sm text-indigo-900 dark:text-indigo-300">{t('security.recommended')}</div>
                        {!enabled && <Button onClick={handleSetup} loading={isSettingUp} className="mt-5">{isSettingUp ? t('security.generating') : t('security.setup')}</Button>}
                    </div>
                ) : (
                    <form onSubmit={handleEnable} className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[280px_1fr]" noValidate>
                        <section className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 p-5">
                            <h3 className="font-bold text-slate-900 dark:text-white">{t('security.scanTitle')}</h3>
                            <p className="mt-2 text-sm leading-6 text-slate-500">{t('security.scanDescription')}</p>
                            <div className="mt-5 flex min-h-52 items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-[#0b1426] p-3 shadow-sm">{qrCodeUrl ? <img src={qrCodeUrl} alt={t('security.qrAlt')} className="h-48 w-48" /> : <QrCode size={52} className="text-slate-300" />}</div>
                        </section>
                        <section className="flex flex-col justify-center rounded-2xl border border-slate-200 dark:border-slate-800 p-5 sm:p-6">
                            <h3 className="font-bold text-slate-900 dark:text-white">{t('security.codeTitle')}</h3>
                            <p className="mt-2 text-sm leading-6 text-slate-500">{t('security.codeDescription')}</p>
                            <Input label={t('security.codeLabel')} value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder={t('security.codePlaceholder')} helperText={t('security.codeHelp')} inputMode="numeric" autoComplete="one-time-code" className="font-mono text-lg tracking-[.35em] ltr-embed" containerClassName="mt-5" required />
                            <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end"><Button variant="ghost" onClick={cancelSetup} disabled={isEnabling}>{t('security.cancel')}</Button><Button type="submit" loading={isEnabling} disabled={verificationCode.length !== 6}>{isEnabling ? t('security.verifying') : t('security.verify')}</Button></div>
                        </section>
                    </form>
                )}
            </section>
        </div>
    );
};

export default SecuritySettings;
