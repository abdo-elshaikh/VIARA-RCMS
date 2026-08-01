import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { useTranslation } from '../../node_modules/react-i18next';
import {
    AlertCircle,
    ArrowLeft,
    ArrowRight,
    Eye,
    EyeOff,
    FileText,
    Loader2,
    LockKeyhole,
} from 'lucide-react';
import { usePatientLoginMutation, useGetPublicCenterSettingsQuery } from '../store/api';
import { setCredentials } from '../store/authSlice';
import { getErrorMessage } from '../utils/getErrorMessage';
import { normalizeCenterSettings } from '../utils/centerSettings';
import { PortalAuthShell } from '../components/portal/layout/PortalAuthShell';

const PatientLogin = () => {
    const [searchParams] = useSearchParams();
    const initialMrn = searchParams.get('mrn') || '';
    const { register, handleSubmit, formState: { errors }, setValue } = useForm({
        defaultValues: { mrn: initialMrn, password: '' },
    });
    const [login, { isLoading }] = usePatientLoginMutation();
    const [errorMsg, setErrorMsg] = useState<string | null>(null);
    const [showPassword, setShowPassword] = useState(false);
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation(['auth', 'common', 'landing']);
    const language = (i18n.resolvedLanguage || i18n.language || 'en').split('-')[0];
    const isRtl = language === 'ar';
    const { data: publicSettings } = useGetPublicCenterSettingsQuery(undefined);
    const centerSettings = normalizeCenterSettings(publicSettings || {}, language);
    const centerName = [centerSettings.center_name, centerSettings.branch_name].filter(Boolean).join(' · ') || 'RCMS';
    const centerInitials = String(centerSettings.center_name || 'RCMS').trim().slice(0, 4).toUpperCase();
    const benefits = t('patient.benefits', { returnObjects: true });
    const displayBenefits = Array.isArray(benefits)
        ? benefits
        : [
            isRtl ? 'عرض التقارير الطبية والصور بدقة عالية' : 'View medical records securely',
            isRtl ? 'حجز وإدارة المواعيد أونلاين' : 'Book and manage appointments',
            isRtl ? 'التواصل المباشر مع فريق المركز' : 'Message the center directly',
        ];

    useEffect(() => {
        if (initialMrn) setValue('mrn', initialMrn, { shouldDirty: false });
    }, [initialMrn, setValue]);

    useEffect(() => {
        const previousTitle = document.title;
        document.title = `${t('patient.signIn', 'Patient sign in')} | ${centerName}`;
        return () => { document.title = previousTitle; };
    }, [centerName, t]);

    const onSubmit = async (data: any) => {
        setErrorMsg(null);
        try {
            const result = await login({ mrn: data.mrn.trim(), password: data.password }).unwrap();
            dispatch(setCredentials({ ...result }));
            navigate('/patient/dashboard');
        } catch (error) {
            setErrorMsg(getErrorMessage(error, t('patient.error')));
        }
    };

    const inputClass = 'peer h-14 w-full rounded-2xl border border-border bg-surface/90 text-sm font-medium text-foreground outline-none shadow-sm transition-all placeholder:text-transparent hover:border-primary-300 hover:bg-surface focus:border-primary-600 focus:bg-surface focus:ring-4 focus:ring-primary-600/10 dark:hover:border-primary-300/50';

    return (
        <PortalAuthShell
            role="patient"
            language={language}
            centerName={centerName}
            centerLogo={centerSettings.logo_url}
            centerInitials={centerInitials}
            title={t('patient.signIn', 'Welcome back')}
            subtitle={t('patient.formHint', 'Use the medical record number provided by the center to securely access your care.')}
            benefits={displayBenefits as string[]}
        >
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-6" noValidate>
                {errorMsg && (
                    <div role="alert" className="flex items-start gap-3 rounded-2xl border border-rose-200/50 bg-rose-50/80 p-4 text-xs font-semibold text-rose-700 backdrop-blur-sm dark:border-rose-500/20 dark:bg-rose-500/10 dark:text-rose-300 animate-in fade-in slide-in-from-top-2">
                        <AlertCircle size={18} className="mt-0.5 shrink-0 text-rose-600 dark:text-rose-400" />
                        <span>{errorMsg}</span>
                    </div>
                )}

                <div className="space-y-5">
                    <label className="group relative block">
                        <FileText className="absolute start-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-primary-600 dark:group-focus-within:text-primary-300" />
                        <input
                            {...register('mrn', { required: t('errors.mrnRequired', 'Medical record number is required.') })}
                            type="text"
                            placeholder={t('patient.mrnPlaceholder', 'e.g. PAT-12345')}
                            className={`${inputClass} text-left ${isRtl ? 'pe-12 ps-4' : 'ps-12 pe-4'} pt-4`}
                            dir="ltr"
                            autoComplete="username"
                            autoCapitalize="characters"
                            spellCheck="false"
                        />
                        <span className={`pointer-events-none absolute ${isRtl ? 'right-12' : 'left-12'} top-4 -translate-y-2.5 text-[11px] font-bold text-slate-500 transition-all peer-placeholder-shown:translate-y-0 peer-placeholder-shown:text-sm peer-placeholder-shown:font-medium peer-focus:-translate-y-2.5 peer-focus:text-[11px] peer-focus:font-bold peer-focus:text-primary-600 dark:text-slate-400 dark:peer-focus:text-primary-300`}>
                            {t('patient.mrn', 'Medical record number')}
                        </span>
                        {errors.mrn && <span className="absolute -bottom-5 start-1 text-[11px] font-semibold text-rose-500 dark:text-rose-400 animate-in fade-in">{errors.mrn.message}</span>}
                    </label>

                    <label className="group relative block">
                        <LockKeyhole className="absolute start-4 top-1/2 z-10 h-5 w-5 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-primary-600 dark:group-focus-within:text-primary-300" />
                        <input
                            {...register('password', { required: t('errors.passwordRequired', 'Password is required.') })}
                            type={showPassword ? 'text' : 'password'}
                            placeholder={t('patient.passwordPlaceholder', 'Enter your password')}
                            className={`${inputClass} text-left ${isRtl ? 'pr-12 pl-12' : 'pl-12 pr-12'} pt-4`}
                            dir="ltr"
                            autoComplete="current-password"
                        />
                        <span className={`pointer-events-none absolute ${isRtl ? 'right-12' : 'left-12'} top-4 -translate-y-2.5 text-[11px] font-bold text-slate-500 transition-all peer-placeholder-shown:translate-y-0 peer-placeholder-shown:text-sm peer-placeholder-shown:font-medium peer-focus:-translate-y-2.5 peer-focus:text-[11px] peer-focus:font-bold peer-focus:text-primary-600 dark:text-slate-400 dark:peer-focus:text-primary-300`}>
                            {t('patient.password', 'Password')}
                        </span>
                        <button
                            type="button"
                            onClick={() => setShowPassword((value) => !value)}
                            className="absolute end-3 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-slate-400 transition-all hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200 z-10"
                            aria-label={showPassword ? t('login.hidePassword', 'Hide password') : t('login.showPassword', 'Show password')}
                        >
                            {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                        </button>
                        {errors.password && <span className="absolute -bottom-5 start-1 text-[11px] font-semibold text-rose-500 dark:text-rose-400 animate-in fade-in">{errors.password.message}</span>}
                    </label>
                </div>

                <div className="pt-2">
                    <button
                        type="submit"
                        disabled={isLoading}
                        className="relative group flex min-h-14 w-full items-center justify-center gap-2.5 overflow-hidden rounded-2xl bg-gradient-to-r from-primary-600 to-primary-900 px-6 text-sm font-bold text-white shadow-xl shadow-primary-900/20 transition-all hover:-translate-y-0.5 hover:from-primary-500 hover:to-primary-800 hover:shadow-primary-900/30 focus:outline-none disabled:pointer-events-none disabled:opacity-65"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/20 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 ease-in-out"></div>
                        {isLoading ? (
                            <><Loader2 className="h-4.5 w-4.5 animate-spin" />{t('patient.verifying', 'Verifying securely…')}</>
                        ) : (
                            <>
                                <span className="relative z-10">{t('patient.submit', 'Continue to portal')}</span>
                                {isRtl ? <ArrowLeft className="relative z-10 h-4 w-4 transition-transform group-hover:-translate-x-1" /> : <ArrowRight className="relative z-10 h-4 w-4 transition-transform group-hover:translate-x-1" />}
                            </>
                        )}
                    </button>
                </div>

                <div className="mt-4 text-center">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        {isRtl ? 'هل تواجه مشكلة في تسجيل الدخول؟ اتصل بالخط الساخن' : 'Need assistance signing in? Call hotline'}{' '}
                        <a href="tel:19144" className="font-bold text-primary-700 hover:underline dark:text-primary-300" dir="ltr">19144</a>
                    </p>
                </div>
            </form>
        </PortalAuthShell>
    );
};

export default PatientLogin;
