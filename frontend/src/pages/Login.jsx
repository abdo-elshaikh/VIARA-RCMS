import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useNavigate } from 'react-router-dom';
import { useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import {
    Activity,
    AlertCircle,
    ArrowLeft,
    ArrowRight,
    CheckCircle2,
    Clock3,
    Eye,
    EyeOff,
    Fingerprint,
    HeartPulse,
    KeyRound,
    LockKeyhole,
    Mail,
    Moon,
    Radio,
    ShieldCheck,
    Sun,
    UserRound,
} from 'lucide-react';
import toast from 'react-hot-toast';
import { useLoginMutation, useGetPublicCenterSettingsQuery } from '../store/api';
import { setCredentials } from '../store/authSlice';
import { setTheme, updateAllPreferences } from '../store/preferencesSlice';
import { getErrorMessage } from '../utils/getErrorMessage';
import { getPatientPortalLoginUrl } from '../utils/portalUrls';
import LanguageToggle from '../components/ui/LanguageToggle';
import { normalizeCenterSettings } from '../utils/centerSettings';
import loginRadiologyBackground from '../assets/login-radiology-background.png';

const ROLE_DESTINATIONS = {
    Developer: '/admin',
    Admin: '/admin',
    Radiologist: '/worklist',
    Receptionist: '/reception',
    Accountant: '/financials',
    HR: '/hr',
    Technician: '/modality',
    Nurse: '/nurse',
    Insurance_Staff: '/insurance',
    Marketing: '/marketing',
};

const WORKSPACE_SIGNALS = [
    { icon: ShieldCheck, labelKey: 'brand.signals.secureAccess' },
    { icon: Radio, labelKey: 'brand.signals.pacsReady' },
    { icon: Activity, labelKey: 'brand.signals.liveOperations' },
];

const TRUST_CHIPS = [
    { icon: ShieldCheck, labelKey: 'login.trust.encrypted' },
    { icon: Clock3, labelKey: 'login.trust.alwaysOn' },
    { icon: UserRound, labelKey: 'login.trust.staffOnly' },
];

const Login = () => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const { t, i18n } = useTranslation(['auth', 'common']);
    const isRtl = i18n.dir() === 'rtl';
    const patientPortalLoginUrl = getPatientPortalLoginUrl();
    const { data: publicSettings } = useGetPublicCenterSettingsQuery();
    const centerSettings = useMemo(() => normalizeCenterSettings(publicSettings || {}), [publicSettings]);
    const centerName = [centerSettings.center_name, centerSettings.branch_name].filter(Boolean).join(' - ') || 'RCMS';
    const centerInitials = String(centerSettings.center_name || 'RCMS').trim().slice(0, 4).toUpperCase();
    const [login, { isLoading }] = useLoginMutation();
    const [errorMsg, setErrorMsg] = useState(null);
    const [showPassword, setShowPassword] = useState(false);
    const [rememberMe, setRememberMe] = useState(false);
    const [shakeError, setShakeError] = useState(false);
    const [capsLockActive, setCapsLockActive] = useState(false);
    const [isDark, setIsDark] = useState(() => document.documentElement.classList.contains('dark'));
    const emailInputRef = useRef(null);
    const errorRef = useRef(null);

    const {
        register,
        handleSubmit,
        watch,
        clearErrors,
        formState: { errors },
    } = useForm({
        defaultValues: { email: '', password: '' },
        mode: 'onTouched',
        reValidateMode: 'onChange',
        shouldFocusError: true,
    });

    const emailValue = watch('email');
    const passwordValue = watch('password');
    const emailReg = register('email', {
        required: t('errors.emailRequired', { defaultValue: 'Email is required' }),
        pattern: {
            value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
            message: t('errors.emailInvalid', { defaultValue: 'Enter a valid email address.' }),
        },
        onChange: () => {
            if (errorMsg) setErrorMsg(null);
            if (errors.email) clearErrors('email');
        },
        setValueAs: (value) => String(value || '').trim(),
    });
    const passwordReg = register('password', {
        required: t('errors.passwordRequired', { defaultValue: 'Password is required' }),
        onChange: () => {
            if (errorMsg) setErrorMsg(null);
            if (errors.password) clearErrors('password');
        },
    });

    useEffect(() => {
        const observer = new MutationObserver(() => {
            setIsDark(document.documentElement.classList.contains('dark'));
        });
        observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    useEffect(() => {
        const id = window.setTimeout(() => emailInputRef.current?.focus(), 120);
        return () => window.clearTimeout(id);
    }, []);

    useEffect(() => {
        if (errorMsg) errorRef.current?.focus();
    }, [errorMsg]);

    const toggleTheme = () => dispatch(setTheme(isDark ? 'light' : 'dark'));

    const resolveDestination = (user) => {
        const preferredStartPage = user?.preferences?.startPage;
        const isSafeStartPage = typeof preferredStartPage === 'string'
            && preferredStartPage.startsWith('/')
            && !preferredStartPage.startsWith('//');
        return isSafeStartPage ? preferredStartPage : (ROLE_DESTINATIONS[user?.role] || '/dashboard');
    };

    const onSubmit = async (data) => {
        setErrorMsg(null);
        setShakeError(false);
        try {
            const result = await login({
                email: String(data.email || '').trim().toLowerCase(),
                password: data.password,
                rememberMe,
            }).unwrap();

            dispatch(setCredentials({ user: result.user, token: result.token }));

            if (result.user?.preferences && typeof result.user.preferences === 'object') {
                dispatch(updateAllPreferences(result.user.preferences));
                if (result.user.preferences.language && result.user.preferences.language !== i18n.resolvedLanguage) {
                    await i18n.changeLanguage(result.user.preferences.language);
                }
            }

            if (result.user?.mustChangePassword) {
                navigate('/settings?tab=security');
                return;
            }

            navigate(resolveDestination(result.user));
        } catch (error) {
            const message = error?.status === 401
                ? t('errors.invalidLogin', { defaultValue: 'Invalid email or password.' })
                : getErrorMessage(error, t('errors.invalidCredentials', { defaultValue: 'Invalid credentials provided.' }));
            setErrorMsg(message);
            setShakeError(true);
            window.setTimeout(() => setShakeError(false), 560);
        }
    };

    return (
        <main
            dir={isRtl ? 'rtl' : 'ltr'}
            lang={isRtl ? 'ar' : 'en'}
            className={`auth-page relative min-h-[100svh] overflow-x-hidden bg-white text-slate-950 selection:bg-cyan-200/50 dark:text-slate-100 dark:selection:bg-cyan-500/25 ${isRtl ? 'font-arabic' : 'font-sans'}`}
        >
            <AuthStyles />
            <div className="grid min-h-[100svh] lg:grid-cols-[minmax(0,1.08fr)_minmax(430px,0.92fr)]">
                <BrandStory
                    t={t}
                    centerName={centerName}
                    centerInitials={centerInitials}
                    logoUrl={centerSettings.logo_url}
                />

                <section className="auth-login-shell relative flex min-h-[100svh] items-start justify-center overflow-hidden bg-white px-5 pb-8 pt-24 sm:px-8 sm:pb-10 lg:items-center lg:px-10 lg:py-20 xl:px-12">
                    <div className="absolute inset-0 lg:hidden" aria-hidden="true">
                        <img
                            src={loginRadiologyBackground}
                            alt=""
                            className="h-full w-full object-cover object-[58%_center]"
                        />
                        <div className="absolute inset-0 bg-slate-950/55 backdrop-blur-[1px]" />
                    </div>

                    <Toolbar t={t} isRtl={isRtl} isDark={isDark} toggleTheme={toggleTheme} />

                    <div className="auth-form-wrap auth-rise relative z-10 w-full max-w-[460px]" style={{ animationDelay: '60ms' }}>
                        <LoginOverlay
                            t={t}
                            isRtl={isRtl}
                            isDark={isDark}
                            centerName={centerName}
                            centerInitials={centerInitials}
                            logoUrl={centerSettings.logo_url}
                            onSubmit={handleSubmit(onSubmit)}
                            errorMsg={errorMsg}
                            errorRef={errorRef}
                            errors={errors}
                            emailReg={emailReg}
                            passwordReg={passwordReg}
                            emailInputRef={emailInputRef}
                            emailValue={emailValue}
                            passwordValue={passwordValue}
                            showPassword={showPassword}
                            setShowPassword={setShowPassword}
                            rememberMe={rememberMe}
                            setRememberMe={setRememberMe}
                            capsLockActive={capsLockActive}
                            setCapsLockActive={setCapsLockActive}
                            isLoading={isLoading}
                            shakeError={shakeError}
                            patientPortalLoginUrl={patientPortalLoginUrl}
                        />
                    </div>
                </section>
            </div>
        </main>
    );
};

const Toolbar = ({ t, isRtl, isDark, toggleTheme }) => (
    <header className="auth-rise absolute inset-x-0 top-0 z-20 flex justify-center px-3 pt-3 sm:pt-5 lg:justify-end lg:px-8">
        <div className="auth-toolbar flex w-full max-w-max items-center gap-0.5 border border-slate-200 bg-white/90 p-1 shadow-[0_12px_38px_-22px_rgba(15,23,42,.55)] backdrop-blur-xl sm:gap-1 sm:p-1.5">
            <Link
                to="/"
                className="flex h-9 items-center gap-2 px-3 text-[13px] font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40 sm:h-10"
            >
                {isRtl ? <ArrowRight size={15} strokeWidth={2.25} /> : <ArrowLeft size={15} strokeWidth={2.25} />}
            </Link>

            <div className="auth-toolbar-divider mx-0.5 h-4 w-px bg-slate-200" aria-hidden="true" />

            <button
                type="button"
                onClick={toggleTheme}
                aria-label={t(isDark ? 'nav.lightMode' : 'nav.darkMode', { ns: 'common', defaultValue: isDark ? 'Switch to light mode' : 'Switch to dark mode' })}
                className="flex h-9 w-9 items-center justify-center text-slate-500 transition hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40 sm:h-10 sm:w-10"
            >
                {isDark ? <Sun size={16} strokeWidth={2} /> : <Moon size={16} strokeWidth={2} />}
            </button>

            <div className="auth-toolbar-divider mx-0.5 h-4 w-px bg-slate-200" aria-hidden="true" />

            <LanguageToggle
                variant="light"
                className="!h-9 !border-0 !bg-transparent hover:!bg-slate-100 sm:!h-10"
            />
        </div>
    </header>
);

const BrandStory = ({ t, centerName, centerInitials, logoUrl }) => (
    <section className="auth-brand-story auth-rise relative hidden min-h-[100svh] overflow-hidden text-white lg:flex">
        <img
            src={loginRadiologyBackground}
            alt=""
            className="absolute inset-0 h-full w-full object-cover object-[42%_center]"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950/82 via-slate-950/42 to-cyan-950/20" />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950/55 via-transparent to-transparent" />

        <div className="auth-brand-content relative z-10 flex w-full flex-col justify-between px-14 py-12 xl:px-20">
            <BrandMark centerName={centerName} centerInitials={centerInitials} logoUrl={logoUrl} />

            <div className="auth-brand-copy mx-auto max-w-xl text-center">
                <div className="auth-kicker mb-8 inline-flex items-center gap-2 border border-white/20 bg-white/10 px-4 py-2 text-[11px] font-black uppercase tracking-[0.08em] text-cyan-100 backdrop-blur-md">
                    <Fingerprint size={14} strokeWidth={2.25} />
                    {t('login.secureWorkspace')}
                </div>
                <h2 className="auth-brand-title text-[3rem] font-black leading-[1.08] text-white xl:text-[3.75rem]">
                    {t('brand.welcome')}{' '}
                    <span className="block">{centerName}</span>
                </h2>
                <p className="auth-brand-subtitle mx-auto mt-5 max-w-lg text-base font-semibold leading-7 text-white/82">
                    {t('brand.subtitle')}
                </p>
            </div>

            <ul className="flex list-none justify-center gap-2.5 p-0">
                {WORKSPACE_SIGNALS.map(({ icon: Icon, labelKey }) => (
                    <li
                        key={labelKey}
                        className="auth-chip inline-flex items-center gap-2 border border-white/15 bg-white/10 px-3.5 py-2 text-xs font-semibold text-white backdrop-blur-md"
                    >
                        <Icon size={13} className="text-cyan-200" strokeWidth={2.25} />
                        {t(labelKey)}
                    </li>
                ))}
            </ul>
        </div>
    </section>
);

const LoginOverlay = ({
    t,
    isRtl,
    isDark,
    centerName,
    centerInitials,
    logoUrl,
    onSubmit,
    errorMsg,
    errorRef,
    errors,
    emailReg,
    passwordReg,
    emailInputRef,
    emailValue,
    passwordValue,
    showPassword,
    setShowPassword,
    rememberMe,
    setRememberMe,
    capsLockActive,
    setCapsLockActive,
    isLoading,
    shakeError,
    patientPortalLoginUrl,
}) => (
    <div
        aria-labelledby="staff-login-title"
        className={`auth-panel relative overflow-hidden border border-slate-200/90 bg-white/95 p-5 text-slate-950 shadow-[0_28px_90px_-38px_rgba(15,23,42,.8)] backdrop-blur-xl transition duration-300 sm:p-6 xl:p-7 ${shakeError ? 'auth-shake' : ''}`}
    >
        <div
            className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/45 to-transparent lg:hidden"
            aria-hidden="true"
        />

        <div className="mb-5 flex items-center gap-3 lg:hidden">
            <BrandLogoCompact centerInitials={centerInitials} logoUrl={logoUrl} />
            <span className="min-w-0">
                <span className="block truncate text-sm font-bold text-slate-950">{centerName}</span>
                <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-cyan-600">Radiology Management System</span>
            </span>
        </div>

        <header className="auth-form-header mb-4 border-b border-slate-200 pb-4">
            <div className="auth-form-kicker inline-flex items-center gap-2 border border-cyan-100 bg-cyan-50 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.05em] text-cyan-700">
                <Fingerprint size={12} strokeWidth={2.25} />
                {t('login.secureWorkspace')}
            </div>
            <h1 id="staff-login-title" className="mt-3 text-[1.65rem] font-black leading-tight text-slate-950 sm:text-[1.9rem]">
                {t('login.title')}
            </h1>
            <p className="mt-1.5 text-sm leading-6 text-slate-500">
                {t('login.formHint')}
            </p>
        </header>

        <div className="auth-security-grid mb-5 grid grid-cols-2 gap-2 border border-slate-200 bg-slate-50 p-2">
            <SecuritySignal icon={ShieldCheck} label={t('login.secureSession')} />
            <SecuritySignal icon={Clock3} label={t('login.auditReady')} />
        </div>

        <form onSubmit={onSubmit} className="space-y-3.5" noValidate aria-busy={isLoading}>
            {errorMsg && (
                <div
                    ref={errorRef}
                    role="alert"
                    tabIndex={-1}
                    className="auth-error flex gap-3 border border-rose-200 bg-rose-50 p-3.5 text-sm font-semibold leading-5 text-rose-700 outline-none dark:border-rose-500/30 dark:bg-rose-950/20 dark:text-rose-200"
                >
                    <LockKeyhole size={17} className="mt-0.5 shrink-0 text-rose-500" strokeWidth={2} />
                    <span>{errorMsg}</span>
                </div>
            )}

            <TextField
                id="email"
                type="email"
                icon={Mail}
                label={t('login.email')}
                placeholder={t('login.emailPlaceholder', { defaultValue: 'user@rcms.com' })}
                autoComplete="username"
                inputMode="email"
                inputDir="ltr"
                value={emailValue}
                error={errors.email?.message}
                autoCapitalize="none"
                autoCorrect="off"
                inputRef={(node) => {
                    emailInputRef.current = node;
                }}
                registration={emailReg}
            />

            <TextField
                id="password"
                type={showPassword ? 'text' : 'password'}
                icon={LockKeyhole}
                label={t('login.password')}
                placeholder="••••••••"
                autoComplete="current-password"
                inputDir="ltr"
                value={passwordValue}
                error={errors.password?.message}
                hint={capsLockActive ? t('login.capsLockOn') : ''}
                hintTone="warning"
                registration={passwordReg}
                onKeyEvent={(event) => setCapsLockActive(Boolean(event.getModifierState?.('CapsLock')))}
                onBlur={() => setCapsLockActive(false)}
                trailing={(
                    <button
                        type="button"
                        tabIndex={0}
                        onClick={() => setShowPassword((v) => !v)}
                        className="flex h-8 w-8 items-center justify-center text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40 dark:text-slate-500 dark:hover:bg-white/10 dark:hover:text-slate-100"
                        aria-label={t(showPassword ? 'login.hidePassword' : 'login.showPassword')}
                        aria-pressed={showPassword}
                    >
                        {showPassword ? <EyeOff size={16} strokeWidth={2} /> : <Eye size={16} strokeWidth={2} />}
                    </button>
                )}
            />

            <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-0.5">
                <label className="group inline-flex cursor-pointer items-center gap-2.5 text-sm font-medium text-slate-600 transition hover:text-slate-900">
                    <span className="relative flex h-4 w-4 items-center justify-center">
                        <input
                            type="checkbox"
                            checked={rememberMe}
                            onChange={(e) => setRememberMe(e.target.checked)}
                            className="peer h-4 w-4 cursor-pointer appearance-none border border-slate-300 bg-white transition checked:border-emerald-500 checked:bg-emerald-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/40 dark:border-slate-600 dark:bg-[#101b2b] dark:checked:border-emerald-400 dark:checked:bg-emerald-500"
                        />
                        <CheckCircle2
                            size={12}
                            strokeWidth={3}
                            className="pointer-events-none absolute text-white opacity-0 peer-checked:opacity-100"
                        />
                    </span>
                    {t('login.rememberMe')}
                </label>
                <button
                    type="button"
                    onClick={() => toast(t('login.forgotPasswordToast'), {
                        icon: <KeyRound size={15} />,
                        style: {
                            borderRadius: 0,
                            background: isDark ? '#0a1219' : '#fff',
                            color: isDark ? '#e2e8f0' : '#0f172a',
                            fontSize: '13px',
                        },
                    })}
                    className="text-sm font-semibold text-cyan-700 transition hover:text-cyan-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-400/40 dark:text-cyan-300 dark:hover:text-cyan-100"
                >
                    {t('login.forgotPassword')}
                </button>
            </div>

            <button
                type="submit"
                disabled={isLoading}
                className="auth-btn group relative mt-1 flex min-h-[46px] w-full items-center justify-center gap-2 overflow-hidden bg-gradient-to-b from-emerald-500 to-teal-500 px-5 text-sm font-bold text-white shadow-[0_14px_28px_-16px_rgba(16,185,129,.8)] transition duration-200 hover:-translate-y-px hover:from-emerald-400 hover:to-teal-500 hover:shadow-[0_18px_34px_-18px_rgba(16,185,129,.85)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50 focus-visible:ring-offset-2 focus-visible:ring-offset-white active:translate-y-0 disabled:pointer-events-none disabled:opacity-60 dark:focus-visible:ring-offset-[#08111e]"
            >
                {isLoading && (
                    <span className="auth-sheen absolute inset-y-0 w-2/5 bg-gradient-to-r from-transparent via-white/35 to-transparent" aria-hidden="true" />
                )}
                <span className="relative z-10 flex items-center gap-2">
                    {isLoading ? (
                        <>
                            <span className="inline-block h-4 w-4 animate-spin border-2 border-white/35 border-t-white" aria-hidden="true" />
                            <span>{t('status.verifying', { ns: 'common', defaultValue: 'Verifying...' })}</span>
                        </>
                    ) : (
                        <>
                            {t('actions.signIn', { ns: 'common', defaultValue: 'Sign in' })}
                            <ArrowRight
                                size={16}
                                strokeWidth={2.5}
                                className={`transition-transform duration-200 ${isRtl ? 'rotate-180 group-hover:-translate-x-0.5' : 'group-hover:translate-x-0.5'}`}
                            />
                        </>
                    )}
                </span>
            </button>
        </form>

        <div className="auth-divider my-4 flex items-center gap-3" role="separator">
            <span className="h-px flex-1 bg-slate-200" />
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-slate-400">
                {t('login.patientAccess')}
            </span>
            <span className="h-px flex-1 bg-slate-200" />
        </div>

        <a
            href={patientPortalLoginUrl}
            className="auth-portal-btn flex min-h-[42px] w-full items-center justify-center gap-2.5 border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 shadow-sm transition duration-200 hover:-translate-y-px hover:border-rose-200 hover:bg-rose-50 hover:text-rose-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/30 dark:border-slate-700 dark:bg-[#0d1726] dark:text-slate-200 dark:hover:border-rose-400/35 dark:hover:bg-rose-950/20 dark:hover:text-rose-100"
        >
            <HeartPulse size={16} className="text-rose-400" strokeWidth={2} />
            {t('login.goToPatientPortal')}
        </a>

    </div>
);

const BrandMark = ({ centerName, centerInitials, logoUrl, compact = false }) => (
    <Link to="/" aria-label={centerName} className="group inline-flex min-w-0 items-center gap-3 text-white">
        <span className={`relative flex shrink-0 items-center justify-center border border-white/50 bg-white text-slate-950 shadow-lg shadow-black/20 transition duration-200 group-hover:scale-[1.03] ${compact ? 'h-10 w-10' : 'h-11 w-11 sm:h-12 sm:w-12'}`}>
            {logoUrl ? (
                <img src={logoUrl} alt="" className="h-7 w-7 object-contain sm:h-8 sm:w-8" />
            ) : (
                <span className="font-mono text-[10px] font-black tracking-tight sm:text-[11px]">{centerInitials}</span>
            )}
            <span className="absolute -end-0.5 -top-0.5 h-2.5 w-2.5 bg-emerald-400 ring-[2.5px] ring-[#071018]" aria-hidden="true" />
        </span>
        <span className="min-w-0">
            <span className={`block truncate font-bold tracking-tight ${compact ? 'text-sm' : 'text-base'}`}>{centerName}</span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.08em] text-cyan-400/80">Radiology Management System</span>
        </span>
    </Link>
);

const BrandLogoCompact = ({ centerInitials, logoUrl }) => (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center border border-slate-200 bg-white text-slate-950 shadow-lg shadow-slate-950/10">
        {logoUrl ? (
            <img src={logoUrl} alt="" className="h-6 w-6 object-contain" />
        ) : (
            <span className="font-mono text-[10px] font-black tracking-tight">{centerInitials}</span>
        )}
    </span>
);

const SecuritySignal = ({ icon: Icon, label }) => (
    <div className="auth-security-signal flex min-h-9 min-w-0 items-center justify-center gap-2 border border-cyan-100 bg-white px-2.5 text-[11px] font-bold text-cyan-800">
        <Icon size={13} className="shrink-0 text-cyan-500" strokeWidth={2.25} />
        <span className="truncate">{label}</span>
    </div>
);

const TextField = ({
    id,
    icon: Icon,
    label,
    placeholder,
    type,
    autoComplete,
    inputMode,
    inputDir,
    autoCapitalize,
    autoCorrect,
    value,
    error,
    hint,
    hintTone = 'default',
    registration,
    inputRef,
    onKeyEvent,
    onBlur,
    trailing,
}) => {
    const hasValue = Boolean(value);
    const { ref: registrationRef, ...registrationProps } = registration || {};
    const setInputRef = (node) => {
        registrationRef?.(node);
        inputRef?.(node);
    };

    return (
        <div>
            <label htmlFor={id} className="mb-1.5 block text-[12px] font-semibold text-slate-700">
                {label}
            </label>
            <div
                className={`auth-field group relative grid min-h-[50px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2.5 border bg-slate-50 px-3 transition duration-150 ${error
                    ? 'border-rose-300 bg-rose-50/70 ring-2 ring-rose-100 dark:border-rose-500/45 dark:bg-rose-950/20 dark:ring-rose-500/10'
                    : hasValue
                        ? 'border-slate-300 bg-white dark:border-slate-600 dark:bg-[#101b2b]'
                        : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:bg-[#0d1726] dark:hover:border-slate-600'
                } focus-within:!border-cyan-500 focus-within:!bg-white focus-within:!ring-2 focus-within:!ring-cyan-100 dark:focus-within:!border-cyan-400/70 dark:focus-within:!bg-[#101d2e] dark:focus-within:!ring-cyan-400/10`}
            >
                <span className="auth-field-icon flex h-9 w-9 items-center justify-center border border-slate-200 bg-white">
                    <Icon
                        size={16}
                        strokeWidth={2}
                        className={`transition ${error ? 'text-rose-500' : 'text-slate-400 group-focus-within:text-cyan-600'}`}
                    />
                </span>
                <input
                    id={id}
                    type={type}
                    autoComplete={autoComplete}
                    inputMode={inputMode}
                    dir={inputDir}
                    autoCapitalize={autoCapitalize}
                    autoCorrect={autoCorrect}
                    spellCheck={false}
                    placeholder={placeholder}
                    aria-invalid={error ? 'true' : 'false'}
                    aria-describedby={[error ? `${id}-error` : null, hint ? `${id}-hint` : null].filter(Boolean).join(' ') || undefined}
                    className="h-11 min-w-0 bg-transparent text-start text-sm font-semibold text-slate-950 outline-none placeholder:text-slate-400 dark:text-slate-50 dark:placeholder:text-slate-500"
                    onKeyDown={onKeyEvent}
                    onKeyUp={onKeyEvent}
                    {...registrationProps}
                    onBlur={(event) => {
                        registrationProps.onBlur?.(event);
                        onBlur?.(event);
                    }}
                    ref={setInputRef}
                />
                <div className="flex min-w-9 items-center justify-center gap-0.5">
                    {trailing}
                    {hasValue && !error && (
                        <CheckCircle2 size={15} className="text-emerald-500" strokeWidth={2.25} aria-hidden="true" />
                    )}
                    {!trailing && !hasValue && <span className="w-4" aria-hidden="true" />}
                </div>
            </div>
            {error && (
                <p id={`${id}-error`} className="auth-field-error mt-1.5 flex items-center gap-1.5 text-xs font-medium text-rose-400" role="alert">
                    <AlertCircle size={12} className="shrink-0" aria-hidden="true" />
                    {error}
                </p>
            )}
            {!error && hint && (
                <p
                    id={`${id}-hint`}
                    className={`mt-1.5 flex items-center gap-1.5 text-xs font-medium ${hintTone === 'warning' ? 'text-amber-600' : 'text-slate-500'
                        }`}
                >
                    <AlertCircle size={12} className="shrink-0" aria-hidden="true" />
                    {hint}
                </p>
            )}
        </div>
    );
};

const TrustChip = ({ icon: Icon, label }) => (
    <div className="auth-trust-chip flex min-h-8 min-w-0 items-center justify-center gap-1.5 border border-slate-200 bg-white px-2 text-[10px] font-semibold text-slate-500 shadow-sm transition hover:border-cyan-200 hover:bg-cyan-50 hover:text-cyan-700">
        <Icon size={12} className="shrink-0 text-cyan-500" strokeWidth={2.25} />
        <span className="truncate">{label}</span>
    </div>
);

const AuthStyles = () => (
    <style>{`
        @keyframes auth-rise {
            from { opacity: 0; transform: translateY(14px); }
            to { opacity: 1; transform: translateY(0); }
        }
        @keyframes auth-shake {
            0%, 100% { transform: translateX(0); }
            20% { transform: translateX(-5px); }
            40% { transform: translateX(4px); }
            60% { transform: translateX(-3px); }
            80% { transform: translateX(2px); }
        }
        @keyframes auth-sheen {
            from { transform: translateX(-160%) skewX(-12deg); }
            to { transform: translateX(160%) skewX(-12deg); }
        }
        @keyframes auth-scan {
            0% { transform: translateY(-100%); opacity: 0; }
            8% { opacity: .55; }
            85% { opacity: .15; }
            100% { transform: translateY(100svh); opacity: 0; }
        }
        @keyframes auth-live-dot {
            0%, 100% { box-shadow: 0 0 0 0 rgba(52,211,153,.45); }
            55% { box-shadow: 0 0 0 5px rgba(52,211,153,0); }
        }
        @keyframes auth-glow-pulse {
            0%, 100% { opacity: .45; }
            50% { opacity: .7; }
        }
        .auth-page,
        .auth-page *,
        .auth-page *::before,
        .auth-page *::after {
            border-radius: 0 !important;
        }
        .auth-page {
            background:
                linear-gradient(90deg, #f8fafc 0%, #ffffff 48%, #f8fafc 100%);
        }
        .auth-login-shell {
            scrollbar-gutter: stable;
        }
        .dark .auth-page {
            background:
                linear-gradient(90deg, #050b14 0%, #0a1320 48%, #07111d 100%);
            color: #e5edf7;
        }
        .dark .auth-login-shell {
            background:
                radial-gradient(circle at 18% 18%, rgba(34,211,238,.12), transparent 32%),
                linear-gradient(180deg, #07111d 0%, #0a1422 54%, #050b14 100%);
        }
        .auth-toolbar,
        .auth-panel,
        .auth-field,
        .auth-security-grid,
        .auth-security-signal,
        .auth-error,
        .auth-btn,
        .auth-portal-btn,
        .auth-chip,
        .auth-trust-chip,
        .auth-form-kicker,
        .auth-kicker {
            position: relative;
        }
        .auth-toolbar {
            box-shadow: 0 16px 44px -30px rgba(15,23,42,.65), inset 0 -2px 0 rgba(6,182,212,.14);
        }
        .dark .auth-toolbar {
            background: rgba(8,17,30,.9);
            border-color: rgba(148,163,184,.24);
            box-shadow: 0 18px 48px -28px rgba(0,0,0,.86), inset 0 -2px 0 rgba(34,211,238,.18);
        }
        .dark .auth-toolbar :where(a, button) {
            color: #cbd5e1;
        }
        .dark .auth-toolbar :where(a, button):hover {
            background: rgba(148,163,184,.12);
            color: #f8fafc;
        }
        .dark .auth-toolbar-divider {
            background: rgba(148,163,184,.24);
        }
        .auth-panel {
            background:
                linear-gradient(180deg, rgba(255,255,255,.96), rgba(248,250,252,.9));
            border-color: rgba(203,213,225,.85);
            box-shadow:
                0 30px 86px -44px rgba(15,23,42,.82),
                inset 3px 0 0 rgba(6,182,212,.22);
        }
        .dark .auth-panel {
            background:
                linear-gradient(180deg, rgba(14,25,42,.97), rgba(8,17,30,.94));
            border-color: rgba(148,163,184,.22);
            color: #e5edf7;
            box-shadow:
                0 34px 90px -40px rgba(0,0,0,.95),
                inset 3px 0 0 rgba(34,211,238,.26),
                inset 0 1px 0 rgba(255,255,255,.05);
        }
        [dir="rtl"] .auth-panel {
            box-shadow:
                0 30px 86px -44px rgba(15,23,42,.82),
                inset -3px 0 0 rgba(6,182,212,.22);
        }
        .dark [dir="rtl"] .auth-panel {
            box-shadow:
                0 34px 90px -40px rgba(0,0,0,.95),
                inset -3px 0 0 rgba(34,211,238,.26),
                inset 0 1px 0 rgba(255,255,255,.05);
        }
        .auth-panel::after {
            content: "";
            position: absolute;
            inset-inline-end: 1rem;
            bottom: 1rem;
            width: 2.75rem;
            height: 2.75rem;
            border-inline-end: 2px solid rgba(6,182,212,.42);
            border-bottom: 2px solid rgba(6,182,212,.42);
            pointer-events: none;
        }
        .dark .auth-panel::after {
            border-color: rgba(34,211,238,.34);
        }
        .auth-toolbar::before,
        .auth-error::before,
        .auth-btn::before,
        .auth-portal-btn::before,
        .auth-form-kicker::before,
        .auth-kicker::before {
            content: "";
            position: absolute;
            inset-inline-start: -1px;
            top: -1px;
            width: .75rem;
            height: .75rem;
            border-inline-start: 2px solid rgba(6,182,212,.38);
            border-top: 2px solid rgba(6,182,212,.38);
            pointer-events: none;
        }
        .auth-field {
            box-shadow: inset 3px 0 0 rgba(6,182,212,.14), inset 0 1px 0 rgba(6,182,212,.06);
        }
        .dark .auth-field {
            border-color: rgba(148,163,184,.2);
            background: #0d1726;
            box-shadow: inset 3px 0 0 rgba(34,211,238,.16), inset 0 1px 0 rgba(255,255,255,.035);
        }
        [dir="rtl"] .auth-field {
            box-shadow: inset -3px 0 0 rgba(6,182,212,.14), inset 0 1px 0 rgba(6,182,212,.06);
        }
        .dark [dir="rtl"] .auth-field {
            box-shadow: inset -3px 0 0 rgba(34,211,238,.16), inset 0 1px 0 rgba(255,255,255,.035);
        }
        .auth-field:focus-within {
            box-shadow: inset 3px 0 0 rgba(8,145,178,.42), inset 0 1px 0 rgba(6,182,212,.08);
        }
        .dark .auth-field:focus-within {
            box-shadow: inset 3px 0 0 rgba(34,211,238,.5), inset 0 1px 0 rgba(255,255,255,.05);
        }
        [dir="rtl"] .auth-field:focus-within {
            box-shadow: inset -3px 0 0 rgba(8,145,178,.42), inset 0 1px 0 rgba(6,182,212,.08);
        }
        .dark [dir="rtl"] .auth-field:focus-within {
            box-shadow: inset -3px 0 0 rgba(34,211,238,.5), inset 0 1px 0 rgba(255,255,255,.05);
        }
        .auth-field-icon {
            box-shadow: inset 0 -2px 0 rgba(6,182,212,.08);
        }
        .dark .auth-field-icon,
        .dark .auth-portal-btn,
        .dark .auth-trust-chip,
        .dark .auth-security-signal {
            background: rgba(15,26,43,.92);
            border-color: rgba(148,163,184,.2);
        }
        .dark .auth-field :where(input) {
            color: #f8fafc;
        }
        .dark .auth-field :where(input)::placeholder {
            color: #64748b;
        }
        .dark .auth-page :where(label, h1, .text-slate-950, .text-slate-900) {
            color: #f8fafc;
        }
        .dark .auth-page :where(.text-slate-700, .text-slate-600) {
            color: #cbd5e1;
        }
        .dark .auth-page :where(.text-slate-500, .text-slate-400) {
            color: #94a3b8;
        }
        .auth-security-grid,
        .auth-security-signal,
        .auth-portal-btn,
        .auth-trust-chip {
            box-shadow: inset 0 1px 0 rgba(6,182,212,.08);
        }
        .auth-security-grid {
            background:
                linear-gradient(180deg, #f8fafc, #ffffff);
        }
        .dark .auth-security-grid {
            background:
                linear-gradient(180deg, rgba(15,26,43,.92), rgba(8,17,30,.88));
            border-color: rgba(148,163,184,.2);
        }
        .auth-security-signal {
            background: #ffffff;
        }
        .dark .auth-security-signal {
            color: #a5f3fc;
        }
        .auth-form-header {
            background: linear-gradient(180deg, rgba(255,255,255,.8), rgba(248,250,252,.42));
            margin-inline: -1.5rem;
            padding-inline: 1.5rem;
        }
        .dark .auth-form-header {
            background: linear-gradient(180deg, rgba(15,26,43,.76), rgba(8,17,30,.3));
            border-color: rgba(148,163,184,.2);
        }
        .dark .auth-form-kicker {
            background: rgba(8,145,178,.14);
            border-color: rgba(34,211,238,.2);
            color: #a5f3fc;
        }
        @media (min-width: 640px) {
            .auth-form-header {
                margin-inline: -2rem;
                padding-inline: 2rem;
            }
        }
        .auth-brand-story::before,
        .auth-brand-story::after {
            content: "";
            position: absolute;
            z-index: 12;
            width: 4rem;
            height: 4rem;
            pointer-events: none;
            border-color: rgba(103,232,249,.52);
        }
        .auth-brand-story::before {
            inset-inline-start: 2rem;
            top: 2rem;
            border-inline-start-width: 2px;
            border-top-width: 2px;
        }
        .auth-brand-story::after {
            inset-inline-end: 2rem;
            bottom: 2rem;
            border-inline-end-width: 2px;
            border-bottom-width: 2px;
        }
        .auth-background {
            filter: saturate(.7) contrast(1.05) brightness(.88);
            transform: scale(1.008);
        }
        .auth-overlay {
            background:
                linear-gradient(110deg, rgba(2,6,23,.97) 0%, rgba(4,18,30,.82) 42%, rgba(2,6,23,.58) 100%),
                linear-gradient(180deg, rgba(2,6,23,.15), rgba(2,6,23,.94));
        }
        [dir="rtl"] .auth-overlay {
            background:
                linear-gradient(250deg, rgba(2,6,23,.97) 0%, rgba(4,18,30,.82) 42%, rgba(2,6,23,.58) 100%),
                linear-gradient(180deg, rgba(2,6,23,.15), rgba(2,6,23,.94));
        }
        .auth-grid {
            background-image:
                linear-gradient(rgba(148,163,184,.05) 1px, transparent 1px),
                linear-gradient(90deg, rgba(148,163,184,.05) 1px, transparent 1px);
            background-size: 52px 52px;
            mask-image: radial-gradient(ellipse 80% 70% at 50% 40%, black 20%, transparent 75%);
        }
        .auth-panel-glow {
            background: radial-gradient(ellipse 60% 50% at 50% 50%, rgba(34,211,238,.12), transparent 70%);
            animation: auth-glow-pulse 6s ease-in-out infinite;
        }
        .auth-panel::before {
            content: "";
            position: absolute;
            inset: 0;
            pointer-events: none;
            box-shadow: inset 0 1px 0 rgba(255,255,255,.6);
        }
        .auth-rise { animation: auth-rise .6s cubic-bezier(.16,1,.3,1) both; }
        .auth-shake { animation: auth-shake .48s cubic-bezier(.36,.07,.19,.97) both; }
        .auth-sheen { animation: auth-sheen 1.5s ease-in-out infinite; }
        .auth-scan { animation: auth-scan 9s ease-in-out infinite; }
        .auth-live-dot { animation: auth-live-dot 2s ease-in-out infinite; }
        .auth-btn::after {
            content: "";
            position: absolute;
            inset: 0;
            box-shadow: inset 0 1px 0 rgba(255,255,255,.18), inset 0 -2px 0 rgba(15,23,42,.16);
            pointer-events: none;
        }
        .auth-field-error {
            animation: auth-rise .25s ease-out both;
        }
        .auth-chip {
            animation: auth-rise .5s cubic-bezier(.16,1,.3,1) both;
        }
        .auth-trust-chip {
            animation: auth-rise .5s cubic-bezier(.16,1,.3,1) both;
        }
        .auth-portal-btn {
            box-shadow: inset 0 1px 0 rgba(255,255,255,.03);
        }
        .dark .auth-divider :where(.bg-slate-200) {
            background: rgba(148,163,184,.2);
        }
        .dark .auth-error::before {
            border-color: rgba(251,113,133,.45);
        }
        .dark .auth-btn {
            box-shadow: 0 18px 36px -20px rgba(16,185,129,.72);
        }
        .dark .auth-portal-btn {
            box-shadow: inset 0 1px 0 rgba(255,255,255,.04);
        }
        .dark .auth-portal-btn:hover {
            background: rgba(136,19,55,.2);
        }
        .dark .auth-page :where(.peer:checked ~ svg) {
            color: #ffffff;
        }
        .auth-footer {
            box-shadow: inset 0 1px 0 rgba(255,255,255,.02);
        }
        @media (min-width: 1024px) and (max-height: 900px) {
            .auth-login-shell {
                align-items: flex-start;
                overflow-y: auto;
                padding-top: 7.25rem;
                padding-bottom: 1.5rem;
            }
            .auth-form-wrap {
                max-width: 440px;
            }
            .auth-panel {
                padding: 1.35rem !important;
            }
            .auth-form-header {
                margin-bottom: .9rem;
                padding-bottom: .9rem;
            }
            .auth-form-header h1 {
                margin-top: .7rem;
                font-size: 1.55rem;
            }
            .auth-form-header p {
                margin-top: .35rem;
                line-height: 1.45;
            }
            .auth-panel form > :not([hidden]) ~ :not([hidden]) {
                margin-top: .78rem;
            }
            .auth-field {
                min-height: 46px;
            }
            .auth-field input {
                height: 2.55rem;
            }
            .auth-field-icon {
                height: 2rem;
                width: 2rem;
            }
            .auth-btn {
                min-height: 42px;
            }
            .auth-divider {
                margin-block: .8rem;
            }
            .auth-portal-btn {
                min-height: 40px;
            }
            .auth-brand-content {
                padding-top: 2rem;
                padding-bottom: 2rem;
            }
            .auth-brand-copy {
                max-width: 34rem;
            }
            .auth-kicker {
                margin-bottom: 1.25rem;
            }
            .auth-brand-title {
                font-size: clamp(2.4rem, 4vw, 3.25rem);
            }
            .auth-brand-subtitle {
                margin-top: 1rem;
                font-size: .95rem;
                line-height: 1.65;
            }
        }
        @media (min-width: 1024px) and (max-height: 760px) {
            .auth-login-shell {
                padding-top: 6rem;
            }
            .auth-toolbar {
                transform: scale(.92);
                transform-origin: top right;
            }
            [dir="rtl"] .auth-toolbar {
                transform-origin: top left;
            }
            .auth-brand-title {
                font-size: clamp(2rem, 3.6vw, 2.75rem);
            }
            .auth-brand-subtitle,
            .auth-chip {
                font-size: .78rem;
            }
        }
        @media (max-width: 1023px) {
            .auth-login-shell {
                overflow-y: auto;
            }
            .auth-panel {
                max-height: none;
            }
        }
        @media (max-width: 480px) {
            .auth-login-shell {
                padding-inline: 1rem;
                padding-top: 5.75rem;
                padding-bottom: 1rem;
            }
            .auth-toolbar {
                max-width: calc(100vw - 1.5rem);
            }
            .auth-toolbar :where(a) {
                padding-inline: .65rem;
            }
            .auth-panel {
                padding: 1rem !important;
            }
            .auth-form-header {
                margin-inline: -1rem;
                padding-inline: 1rem;
            }
            .auth-form-header h1 {
                font-size: 1.45rem;
            }
            .auth-field {
                grid-template-columns: auto minmax(0,1fr) auto;
                gap: .5rem;
                padding-inline: .65rem;
            }
            .auth-divider {
                gap: .6rem;
            }
            .auth-divider span:nth-child(2) {
                font-size: .56rem;
            }
        }
        @media (prefers-reduced-motion: reduce) {
            .auth-rise, .auth-shake, .auth-sheen, .auth-scan, .auth-live-dot, .auth-panel-glow, .auth-chip, .auth-trust-chip, .auth-field-error {
                animation: none !important;
                opacity: 1 !important;
            }
            .auth-background { transform: none; }
            .auth-btn::after { display: none; }
        }
    `}</style>
);

export default Login;
