import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import {
    Activity,
    AlertCircle,
    ArrowLeft,
    ArrowRight,
    Building2,
    Check,
    Copy,
    Eye,
    EyeOff,
    Fingerprint,
    FileText,
    Globe,
    KeyRound,
    Loader2,
    Lock,
    LogIn,
    Mail,
    Moon,
    ScanLine,
    Search,
    ShieldCheck,
    Sparkles,
    Sun,
    UserCheck,
    Users,
    X,
    Zap,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
    api,
    useLoginMutation,
    usePasskeyAuthenticationOptionsMutation,
    usePasskeyAuthenticationVerifyMutation,
    useForgotPasswordMutation,
    useResetPasswordMutation,
} from '../store/api';
import { setCredentials } from '../store/authSlice';
import {
    selectPreferences,
    setLanguage,
    setTheme,
    updateAllPreferences,
} from '../store/preferencesSlice';
import { getErrorMessage } from '../utils/getErrorMessage';
import {
    authenticateWithPasskey,
    getPasskeyErrorKind,
    getPasskeySupport,
} from '../utils/passkeys';
import { VIARA_BRAND } from '../config/brand';
import usePageTitle from '../hooks/usePageTitle';
import usePublicAppearance from '../hooks/usePublicAppearance';
import PublicDialog from '../components/public/PublicDialog';
import PublicSupportDialog from '../components/public/PublicSupportDialog';
import PublicConnectionNotice from '../components/public/PublicConnectionNotice';
import { resolvePreferredStartPage } from '../utils/startPage';
import LandingServiceHealthModal from './LandingServiceHealthModal';
import '../styles/LoginIllustrative.css';
import '../styles/LoginReference.css';
import '../styles/LoginModern.css';
import '../styles/LoginReferenceDesign.css';

const ROLE_DESTINATIONS = {
    Developer: '/admin',
    Admin: '/admin',
    Radiologist: '/worklist',
    Technician: '/modality',
    Receptionist: '/reception',
    Accountant: '/financials',
    Cashier: '/reception?tab=billing',
    HR: '/admin',
    Insurance_Staff: '/insurance',
    Doctor: '/dashboard',
    Nurse: '/dashboard',
    Patient: '/patient/profile',
};

const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD || 'ViaraAdmin@2026';

const DEMO_ACCOUNTS = import.meta.env.DEV
    ? [
        {
            id: 'radiologist',
            role: 'Radiologist',
            category: 'clinical',
            nameAr: 'د. أليس مورغان',
            nameEn: 'Dr. Alice Morgan',
            titleAr: 'طبيب الأشعة التشخيصية',
            titleEn: 'Consultant Radiologist',
            email: 'alice@viara.com',
            badgeColor: 'emerald',
            icon: Activity,
        },
        {
            id: 'technician',
            role: 'Technician',
            category: 'clinical',
            nameAr: 'م. محمد علي',
            nameEn: 'Mohamed Ali',
            titleAr: 'فني أشعة أول',
            titleEn: 'Senior Radiographer',
            email: 'tech@viara.com',
            badgeColor: 'cyan',
            icon: ScanLine,
        },
        {
            id: 'nurse',
            role: 'Nurse',
            category: 'clinical',
            nameAr: 'سارة محمود',
            nameEn: 'Sarah Mahmoud',
            titleAr: 'تمريض الرعاية والفرز',
            titleEn: 'Clinical Nurse',
            email: 'nurse@viara.com',
            badgeColor: 'teal',
            icon: Zap,
        },
        {
            id: 'receptionist',
            role: 'Receptionist',
            category: 'operations',
            nameAr: 'فاطمة أحمد',
            nameEn: 'Fatima Ahmed',
            titleAr: 'مسؤول الاستقبال والحجوزات',
            titleEn: 'Front Desk Specialist',
            email: 'reception@viara.com',
            badgeColor: 'amber',
            icon: Users,
        },
        {
            id: 'cashier',
            role: 'Cashier',
            category: 'operations',
            nameAr: 'عمر خالد',
            nameEn: 'Omar Khaled',
            titleAr: 'أمين الصندوق والتحصيل',
            titleEn: 'Cashier & Billing',
            email: 'cashier@viara.com',
            badgeColor: 'orange',
            icon: Building2,
        },
        {
            id: 'accountant',
            role: 'Accountant',
            category: 'operations',
            nameAr: 'كريم مصطفى',
            nameEn: 'Karim Mostafa',
            titleAr: 'المحاسب المالي',
            titleEn: 'Financial Accountant',
            email: 'accountant@viara.com',
            badgeColor: 'indigo',
            icon: Building2,
        },
        {
            id: 'hr',
            role: 'HR',
            category: 'admin',
            nameAr: 'هدى إبراهيم',
            nameEn: 'Hoda Ibrahim',
            titleAr: 'مسؤول الموارد البشرية',
            titleEn: 'HR Specialist',
            email: 'hr@viara.com',
            badgeColor: 'purple',
            icon: UserCheck,
        },
        {
            id: 'admin',
            role: 'Admin',
            category: 'admin',
            nameAr: 'عبد الرحمن الشريف',
            nameEn: 'Abdelrahman Elsharif',
            titleAr: 'مدير النظام الشامل',
            titleEn: 'System Administrator',
            email: 'admin@viara.com',
            badgeColor: 'rose',
            icon: ShieldCheck,
        },
        {
            id: 'developer',
            role: 'Developer',
            category: 'admin',
            nameAr: 'مهندس المنظومة التقنية',
            nameEn: 'Platform Engineer',
            titleAr: 'مهندس التطوير والنظم',
            titleEn: 'Lead Platform Engineer',
            email: 'developer@viara.com',
            badgeColor: 'blue',
            icon: ShieldCheck,
        },
    ]
    : [];

function getReturnDestination(from) {
    const destination =
        typeof from === 'string'
            ? from
            : from?.pathname
                ? `${from.pathname}${from.search || ''}${from.hash || ''}`
                : '';
    if (
        !destination.startsWith('/') ||
        destination.startsWith('//') ||
        destination.includes('\\') ||
        [...destination].some((ch) => ch.codePointAt(0) <= 0x20)
    )
        return null;
    if (/^\/login(?:[/?#]|$)/.test(destination)) return null;
    return destination;
}

export default function Login() {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const location = useLocation();

    // ── Password Reset via URL token ───────────────────────────────────────────
    const urlSearchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);
    const urlResetToken = urlSearchParams.get('resetToken') || '';
    const urlResetEmail = urlSearchParams.get('email') || '';
    const preferences = useSelector(selectPreferences);
    const { i18n, t } = useTranslation(['auth', 'common']);
    const isRtl = i18n.dir() === 'rtl';
    const c = t('publicLogin', { returnObjects: true });
    usePageTitle(c.signIn);
    const { dark, reduceMotion } = usePublicAppearance();
    const DirectionArrow = isRtl ? ArrowLeft : ArrowRight;
    const BackArrow = isRtl ? ArrowRight : ArrowLeft;

    const [login, { isLoading: isApiSubmitting }] = useLoginMutation();
    const [getPasskeyOptions, { isLoading: isPasskeyOptionsLoading }] =
        usePasskeyAuthenticationOptionsMutation();
    const [verifyPasskey, { isLoading: isPasskeyVerifyLoading }] =
        usePasskeyAuthenticationVerifyMutation();
    const [forgotPasswordMutation, { isLoading: isSendingResetLink }] = useForgotPasswordMutation();
    const [resetPasswordMutation, { isLoading: isResettingPassword }] = useResetPasswordMutation();

    const [selectedRole, setSelectedRole] = useState('Radiologist');
    const [showPassword, setShowPassword] = useState(false);
    const [capsLockActive, setCapsLockActive] = useState(false);
    const [isPasskeyPromptOpen, setIsPasskeyPromptOpen] = useState(false);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [helpOpen, setHelpOpen] = useState(false);
    const [demoOpen, setDemoOpen] = useState(false);
    const [serviceModalOpen, setServiceModalOpen] = useState(false);
    const [serverError, setServerError] = useState('');
    const [brandFailed, setBrandFailed] = useState(false);
    // Forgot / Reset password dialog state
    const [forgotOpen, setForgotOpen] = useState(false);
    const [forgotEmail, setForgotEmail] = useState('');
    const [forgotSent, setForgotSent] = useState(false);
    const [forgotError, setForgotError] = useState('');
    const [resetNewPw, setResetNewPw] = useState('');
    const [resetConfirmPw, setResetConfirmPw] = useState('');
    const [resetError, setResetError] = useState('');
    const [resetSuccess, setResetSuccess] = useState(false);
    const [showResetPw, setShowResetPw] = useState(false);
    const [languageBusy, setLanguageBusy] = useState(false);
    const [demoSearch, setDemoSearch] = useState('');
    const [demoCategory, setDemoCategory] = useState('all');
    const [copiedField, setCopiedField] = useState(null);

    const forgotEmailRef = useRef(null);
    const resetPasswordRef = useRef(null);
    const demoDialogRef = useRef(null);
    const demoTriggerRef = useRef(null);
    const serviceTriggerRef = useRef(null);
    const supportTriggerRef = useRef(null);
    const authenticationLock = useRef(false);
    const appliedPresetRef = useRef(false);

    const {
        register,
        handleSubmit,
        setValue,
        getValues,
        setError,
        clearErrors,
        setFocus,
        formState: { errors },
    } = useForm({
        mode: 'onTouched',
        reValidateMode: 'onChange',
        defaultValues: { email: '', password: '', rememberMe: false },
    });

    const passkeySupport = getPasskeySupport();
    const isPasskeyLoading =
        isPasskeyPromptOpen ||
        isPasskeyOptionsLoading ||
        isPasskeyVerifyLoading;
    const busy = isSubmitting || isApiSubmitting || isPasskeyLoading;
    const passkeyNote = passkeySupport.supported
        ? c.passkeyHint
        : passkeySupport.reason === 'insecure'
            ? c.insecure
            : c.unsupported;
    const brandName = VIARA_BRAND.name || 'VIARA';

    useEffect(() => {
        if (!resetSuccess || urlResetToken) return undefined;
        const frame = window.requestAnimationFrame(() => setFocus('email'));
        return () => window.cancelAnimationFrame(frame);
    }, [resetSuccess, urlResetToken, setFocus]);

    useEffect(() => {
        if (!demoOpen) return undefined;
        const dialog = demoDialogRef.current;
        const trigger = demoTriggerRef.current;
        if (dialog && !dialog.open) dialog.showModal();
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            if (dialog && dialog.open) dialog.close();
            document.body.style.overflow = previousOverflow;
            trigger?.focus();
        };
    }, [demoOpen]);

    useEffect(() => {
        if (!import.meta.env.DEV || appliedPresetRef.current) return;
        if (!location.state?.presetRole) return;
        const match = DEMO_ACCOUNTS.find(
            (account) =>
                account.role.toLowerCase() ===
                String(location.state.presetRole).toLowerCase(),
        );
        if (!match) return;
        appliedPresetRef.current = true;
        setSelectedRole(match.role);
        setValue('email', match.email);
        setValue('password', DEMO_PASSWORD);
    }, [location.state, setValue]);

    const toggleLanguage = async () => {
        if (languageBusy) return;
        const next = isRtl ? 'en' : 'ar';
        setLanguageBusy(true);
        try {
            await i18n.changeLanguage(next);
            dispatch(setLanguage(next));
            clearErrors();
            setServerError('');
            try {
                localStorage.setItem('VIARA_lang', next);
            } catch {
                /* Optional persistence */
            }
        } catch {
            /* Retain current language on error */
        } finally {
            setLanguageBusy(false);
        }
    };

    const completeAuthentication = (res, rememberMe) => {
        const token = res?.token || res?.data?.token;
        const user = res?.user || res?.data?.user;
        if (!token || !user) throw new Error(c.loginFailed);

        dispatch(api.util.resetApiState());
        dispatch(setCredentials({ token, user, rememberMe }));
        if (user.preferences) dispatch(updateAllPreferences(user.preferences));
        toast.success(`${c.welcome} ${user.name || user.email}`);
        setValue('password', '');
        const fallback =
            ROLE_DESTINATIONS[user.role || selectedRole] || '/dashboard';
        const destination = resolvePreferredStartPage({
            user,
            preferences: { ...preferences, ...user.preferences },
            fallback,
        });
        navigate(getReturnDestination(location.state?.from) || destination, {
            replace: true,
        });
    };

    const onSubmit = async (formData) => {
        if (authenticationLock.current) return;
        authenticationLock.current = true;
        setIsSubmitting(true);
        setServerError('');
        try {
            const res = await login({
                email: formData.email.trim().toLowerCase(),
                password: formData.password,
                rememberMe: formData.rememberMe,
            }).unwrap();
            completeAuthentication(res, formData.rememberMe);
        } catch (error) {
            const status = error?.status || error?.originalStatus;
            setServerError(
                status === 'FETCH_ERROR' || status === 'TIMEOUT_ERROR'
                    ? c.network
                    : [502, 503, 504].includes(status)
                        ? (c.connectionUnavailable || c.network)
                        : status === 429
                            ? c.rateLimit
                            : status === 401
                                ? c.invalidCredentials
                                : getErrorMessage(error, c.loginFailed),
            );
        } finally {
            authenticationLock.current = false;
            setIsSubmitting(false);
        }
    };

    const handlePasskeySignIn = async () => {
        if (authenticationLock.current) return;
        const email = getValues('email').trim().toLowerCase();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setError('email', {
                type: 'validate',
                message: email ? c.invalidEmail : c.emailRequired,
            });
            setFocus('email');
            return;
        }
        if (!passkeySupport.supported) {
            setServerError(passkeyNote);
            return;
        }
        const rememberMe = getValues('rememberMe');
        authenticationLock.current = true;
        setIsPasskeyPromptOpen(true);
        setServerError('');
        clearErrors();
        try {
            const ceremony = await getPasskeyOptions({ email }).unwrap();
            const response = await authenticateWithPasskey(ceremony.options);
            const result = await verifyPasskey({
                ceremonyId: ceremony.ceremonyId,
                response,
            }).unwrap();
            completeAuthentication(result, rememberMe);
        } catch (error) {
            const kind = getPasskeyErrorKind(error);
            if (error?.data?.code === 'PASSKEY_ACCOUNT_MISMATCH')
                setServerError(c.mismatch);
            else if (kind !== 'cancelled')
                setServerError(getErrorMessage(error, c.passkeyFailed));
        } finally {
            authenticationLock.current = false;
            setIsPasskeyPromptOpen(false);
        }
    };

    const copyToClipboard = async (text, fieldKey, toastMsg) => {
        try {
            if (navigator?.clipboard?.writeText) {
                await navigator.clipboard.writeText(text);
            } else {
                const el = document.createElement('textarea');
                el.value = text;
                el.style.position = 'fixed';
                el.style.opacity = '0';
                document.body.appendChild(el);
                el.select();
                document.execCommand('copy');
                document.body.removeChild(el);
            }
            setCopiedField(fieldKey);
            toast.success(toastMsg);
            setTimeout(() => setCopiedField(null), 2500);
        } catch {
            toast.error(c.copyFailed);
        }
    };

    const fillAndLoginDemo = (account) => {
        setSelectedRole(account.role);
        setValue('email', account.email, { shouldValidate: true });
        setValue('password', DEMO_PASSWORD, { shouldValidate: true });
        clearErrors();
        setServerError('');
        setDemoOpen(false);
        onSubmit({
            email: account.email,
            password: DEMO_PASSWORD,
            rememberMe: getValues('rememberMe') || false,
        });
    };

    const fillOnlyDemo = (account, event) => {
        event.stopPropagation();
        setSelectedRole(account.role);
        setValue('email', account.email, { shouldValidate: true });
        setValue('password', DEMO_PASSWORD, { shouldValidate: true });
        clearErrors();
        setServerError('');
        setDemoOpen(false);
        toast.success(isRtl ? `تمت تعبئة بيانات: ${account.nameAr}` : `Filled: ${account.nameEn}`);
    };

    // ── Forgot Password handlers ───────────────────────────────────────────────
    const handleForgotOpen = () => {
        // Pre-fill email from the login form if already typed
        const emailInForm = getValues('email')?.trim() || '';
        setForgotEmail(emailInForm);
        setForgotSent(false);
        setForgotError('');
        setForgotOpen(true);
    };

    const openServices = (event) => {
        serviceTriggerRef.current = event.currentTarget;
        setServiceModalOpen(true);
    };
    const openSupport = (event) => {
        supportTriggerRef.current = event?.currentTarget || serviceTriggerRef.current;
        setHelpOpen(true);
    };

    const handleForgotSubmit = async (e) => {
        e.preventDefault();
        setForgotError('');
        const email = forgotEmail.trim().toLowerCase();
        if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            setForgotError(c.forgotInvalidEmail);
            return;
        }
        try {
            await forgotPasswordMutation({ email }).unwrap();
            setForgotSent(true);
        } catch {
            setForgotError(c.forgotFailed);
        }
    };

    // ── Reset Password with token (from URL) ──────────────────────────────────
    const handleResetPasswordSubmit = async (e) => {
        e.preventDefault();
        setResetError('');
        if (resetNewPw.length < 8 || !/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/.test(resetNewPw)) {
            setResetError(c.passwordTooWeak);
            return;
        }
        if (resetNewPw !== resetConfirmPw) {
            setResetError(c.passwordMismatch);
            return;
        }
        try {
            await resetPasswordMutation({ token: urlResetToken, email: urlResetEmail, newPassword: resetNewPw }).unwrap();
            setResetSuccess(true);
            setResetNewPw('');
            setResetConfirmPw('');
            setShowResetPw(false);
            // Clean the URL so the token isn't reused
            navigate('/login', { replace: true });
        } catch (err) {
            setResetError(getErrorMessage(err, c.resetFailed));
        }
    };

    const filteredAccounts = useMemo(() => {
        return DEMO_ACCOUNTS.filter((acc) => {
            const matchesCat = demoCategory === 'all' || acc.category === demoCategory;
            if (!matchesCat) return false;
            if (!demoSearch.trim()) return true;
            const q = demoSearch.toLowerCase().trim();
            return (
                acc.nameAr.toLowerCase().includes(q) ||
                acc.nameEn.toLowerCase().includes(q) ||
                acc.email.toLowerCase().includes(q) ||
                acc.role.toLowerCase().includes(q) ||
                acc.titleAr.toLowerCase().includes(q) ||
                acc.titleEn.toLowerCase().includes(q)
            );
        });
    }, [demoSearch, demoCategory]);

    return (
        <main
            className={`vlogin${import.meta.env.DEV ? ' vlogin--developer' : ''}${dark ? ' vlogin--dark' : ''}${reduceMotion ? ' vlogin--reduce-motion' : ''}`}
            dir={isRtl ? 'rtl' : 'ltr'}
            lang={isRtl ? 'ar' : 'en'}
        >
            {/* Ambient Background Glow matching Landing Page */}
            <div className="vlogin__ambient" aria-hidden="true">
                <div className="vlogin__ambient-backdrop" />
                <div className="vlogin__ambient-orb-1" />
                <div className="vlogin__ambient-orb-2" />
            </div>

            {/* ════════════════════════════════════════════════
                UNIFIED STICKY HEADER (Aligned with Landing Page)
                ════════════════════════════════════════════════ */}
            <header className="vlogin__header" role="banner">
                {/* Brand Logo & Name */}
                <Link to="/" className="vlogin__header-brand" aria-label={brandName}>
                    {!brandFailed ? (
                        <img
                            src={VIARA_BRAND.iconUrl || VIARA_BRAND.logoUrl || '/logo.png'}
                            alt=""
                            width="38"
                            height="38"
                            onError={() => setBrandFailed(true)}
                        />
                    ) : (
                        <span className="vlogin__header-brand-fallback" aria-hidden="true">
                            V
                        </span>
                    )}
                    <span className="vlogin__brand-lockup">
                        <strong dir="ltr">{brandName}</strong>
                        <small>{isRtl ? 'نظام متكامل لإدارة مراكز الأشعة' : 'Connected radiology management'}</small>
                    </span>
                </Link>

                {/* Header Action Utilities */}
                <div className="vlogin__header-actions">
                    {/* Live Service Health Check (same modal as Landing Page) */}
                    <button
                        type="button"
                        className="vlogin__util-service"
                        onClick={openServices}
                        aria-label={c.serviceHealth}
                        title={c.serviceHealth}
                    >
                        <Activity size={15} aria-hidden="true" />
                        <span>{c.services}</span>
                        <i aria-hidden="true" />
                    </button>

                    {/* Dev Mode Demo Accounts Trigger */}
                    {import.meta.env.DEV && (
                        <button
                            type="button"
                            ref={demoTriggerRef}
                            onClick={() => setDemoOpen(true)}
                            className="vlogin__util-demo"
                            aria-label={c.demoAccounts}
                            title={c.demoAccounts}
                        >
                            <Sparkles size={14} aria-hidden="true" />
                            <span>{c.demoAccounts}</span>
                            <span className="vlogin__util-demo-count" aria-hidden="true">
                                {DEMO_ACCOUNTS.length}
                            </span>
                        </button>
                    )}

                    {/* Theme Toggle (Sun / Moon with smooth spring) */}
                    <button
                        type="button"
                        className="vlogin__util-icon"
                        onClick={() => dispatch(setTheme(dark ? 'light' : 'dark'))}
                        aria-label={dark ? c.light : c.dark}
                        title={dark ? c.light : c.dark}
                    >
                        <AnimatePresence mode="wait" initial={false}>
                            <motion.span
                                key={dark ? 'sun' : 'moon'}
                                initial={reduceMotion ? false : { rotate: -90, opacity: 0, scale: 0.7 }}
                                animate={{ rotate: 0, opacity: 1, scale: 1 }}
                                exit={reduceMotion ? { opacity: 0 } : { rotate: 90, opacity: 0, scale: 0.7 }}
                                transition={{ duration: reduceMotion ? 0 : 0.22 }}
                                style={{ display: 'flex' }}
                            >
                                {dark ? <Sun size={18} /> : <Moon size={18} />}
                            </motion.span>
                        </AnimatePresence>
                    </button>

                    {/* Language Switcher */}
                    <button
                        type="button"
                        className="vlogin__util-lang"
                        onClick={toggleLanguage}
                        disabled={languageBusy}
                        title={isRtl ? 'Switch to English' : '\u0627\u0644\u062a\u0628\u062f\u064a\u0644 \u0625\u0644\u0649 \u0627\u0644\u0639\u0631\u0628\u064a\u0629'}
                        aria-label={isRtl ? 'Switch to English' : 'التبديل إلى العربية'}
                    >
                        <Globe size={18} aria-hidden="true" /><span>{isRtl ? 'العربية' : 'English'}</span>
                    </button>

                    <span className="vlogin__util-sep" aria-hidden="true" />

                    {/* Back to Home CTA */}
                    <Link to="/" className="vlogin__header-home" aria-label={c.back} title={c.back}>
                        <BackArrow size={15} aria-hidden="true" />
                        <span>{c.home}</span>
                    </Link>
                </div>
            </header>
            <PublicConnectionNotice onSupport={openSupport} />

            {/* ════════════════════════════════════════════════
                MAIN STAGE (Card with Form & Medical Showcase)
                ════════════════════════════════════════════════ */}
            <div className="vlogin__body">
                <div className="vlogin__card">
                    {/* Visual Showcase Side (Desktop Medical Intelligence) */}
                    <aside className="vlogin__visual" aria-label={c.sceneAlt}>
                        {/* Top Visual Headline */}
                        <div className="vlogin__visual-header">
                            <div className="vlogin__visual-tag">
                                <span>{isRtl ? 'بوابة الدخول إلى النظام' : 'Your connected workspace'}</span>
                            </div>
                            <h2 className="vlogin__visual-title">
                                {isRtl ? 'إدارة أكثر سلاسة' : 'Simpler management'}
                                <span>{isRtl ? 'لمراكز الأشعة.' : 'for radiology centers.'}</span>
                            </h2>
                            <p className="vlogin__visual-desc"><strong>{isRtl ? 'من استقبال المريض إلى تسليم التقرير،' : 'From patient reception to report delivery,'}</strong><br />{isRtl ? 'كل خدمات مركزك في منصة عمل واحدة.' : 'all your center’s services in one workspace.'}</p>
                            <div className="vlogin__benefits">
                                {[
                                    [Activity, 'متابعة التشغيل', 'Operations overview'],
                                    [Users, 'المرضى والمواعيد', 'Patients & appointments'],
                                    [ShieldCheck, 'إدارة الصلاحيات', 'Access management'],
                                    [Building2, 'تقارير دقيقة وسريعة', 'Clear, connected reports'],
                                ].map(([Icon, ar, en]) => <div key={en}><span><Icon size={22} aria-hidden="true" /></span><strong>{isRtl ? ar : en}</strong></div>)}
                            </div>
                            <div className="vlogin__scene-summary" aria-label={isRtl ? 'منظومة عمل متكاملة' : 'One connected workflow'}>
                                {[
                                    [Building2, 'RIS + PACS', 'مركزك في منصة واحدة', 'Your center, connected'],
                                    [Users, 'RBAC', 'مساحة عمل لكل دور', 'A workspace for every role'],
                                    [FileText, 'DICOM', 'من الفحص إلى التقرير', 'From imaging to reporting'],
                                ].map(([Icon, value, ar, en]) => (
                                    <div key={en}>
                                        <span className="vlogin__scene-summary-icon"><Icon size={26} aria-hidden="true" /></span>
                                        <span><strong dir="ltr">{value}</strong><small>{isRtl ? ar : en}</small></span>
                                    </div>
                                ))}
                            </div>
                        </div>

                    </aside>

                    {/* Authentication Form Side */}
                    <section
                        className="vlogin__form-pane"
                        aria-labelledby="viara-login-title"
                    >
                        <div className="vlogin__form-inner">
                            <div className="vlogin__form-brand" aria-label={brandName}>
                                {!brandFailed && (
                                    <img
                                        src={VIARA_BRAND.iconUrl || VIARA_BRAND.logoUrl || '/logo.png'}
                                        alt=""
                                        width="44"
                                        height="44"
                                        onError={() => setBrandFailed(true)}
                                    />
                                )}
                                <span dir="ltr">{brandName}</span>
                            </div>
                            <p className="vlogin__form-descriptor">{isRtl ? 'نظام متكامل لإدارة مراكز الأشعة' : 'Connected radiology management'}</p>
                            <div className="vlogin__form-header">
                                <h1 id="viara-login-title">{isRtl ? 'مرحبًا بعودتك' : 'Welcome back'}</h1>
                                <p className="vlogin__subtitle">{c.subtitle}</p>
                            </div>

                            {resetSuccess && (
                                <div className="vlogin__reset-success" role="status">
                                    <Check size={22} aria-hidden="true" />
                                    <div><strong>{c.resetSuccessTitle}</strong><p>{c.resetPasswordSuccess}</p></div>
                                    <button type="button" onClick={() => { setResetSuccess(false); window.requestAnimationFrame(() => setFocus('email')); }}>{c.continueSignIn}</button>
                                </div>
                            )}

                            <form
                                onSubmit={handleSubmit(onSubmit)}
                                noValidate
                                aria-busy={busy}
                            >
                                {/* Email Field */}
                                <div className="vlogin__field">
                                    <label htmlFor="staff-email">{c.email}</label>
                                    <div
                                        className={`vlogin__input-wrap ${errors.email ? 'vlogin__input-wrap--invalid' : ''}`}
                                    >
                                        <Mail className="vlogin__input-icon" size={19} aria-hidden="true" />
                                        <input
                                            id="staff-email"
                                            type="email"
                                            inputMode="email"
                                            autoComplete="username"
                                            autoCapitalize="none"
                                            spellCheck={false}
                                            dir="ltr"
                                            placeholder="name@center.com"
                                            readOnly={busy}
                                            aria-invalid={Boolean(errors.email)}
                                            aria-describedby={
                                                errors.email
                                                    ? 'staff-email-error'
                                                    : undefined
                                            }
                                            {...register('email', {
                                                setValueAs: (value) => value.trim(),
                                                required: c.emailRequired,
                                                pattern: {
                                                    value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
                                                    message: c.invalidEmail,
                                                },
                                            })}
                                        />
                                    </div>
                                    {errors.email && (
                                        <p
                                            className="vlogin__field-error"
                                            id="staff-email-error"
                                            role="alert"
                                        >
                                            <AlertCircle size={14} aria-hidden="true" />
                                            <span>{errors.email.message}</span>
                                        </p>
                                    )}
                                </div>

                                {/* Password Field */}
                                <div className="vlogin__field">
                                    <label htmlFor="staff-password">
                                        <span>{c.password}</span>
                                    </label>
                                    <div
                                        className={`vlogin__input-wrap ${errors.password ? 'vlogin__input-wrap--invalid' : ''}`}
                                    >
                                        <Lock className="vlogin__input-icon" size={19} aria-hidden="true" />
                                        <input
                                            id="staff-password"
                                            type={showPassword ? 'text' : 'password'}
                                            autoComplete="current-password"
                                            dir="ltr"
                                            placeholder="••••••••"
                                            readOnly={busy}
                                            aria-invalid={Boolean(errors.password)}
                                            aria-describedby={
                                                [
                                                    errors.password
                                                        ? 'staff-password-error'
                                                        : '',
                                                    capsLockActive
                                                        ? 'staff-caps-warning'
                                                        : '',
                                                ]
                                                    .filter(Boolean)
                                                    .join(' ') || undefined
                                            }
                                            {...register('password', {
                                                required: c.passwordRequired,
                                                onBlur: () => setCapsLockActive(false),
                                            })}
                                            onKeyDown={(event) =>
                                                setCapsLockActive(
                                                    Boolean(
                                                        event.getModifierState?.(
                                                            'CapsLock',
                                                        ),
                                                    ),
                                                )
                                            }
                                            onKeyUp={(event) =>
                                                setCapsLockActive(
                                                    Boolean(
                                                        event.getModifierState?.(
                                                            'CapsLock',
                                                        ),
                                                    ),
                                                )
                                            }
                                        />
                                        <button
                                            className="vlogin__eye"
                                            type="button"
                                            onClick={() => setShowPassword((value) => !value)}
                                            aria-label={
                                                showPassword
                                                    ? c.hidePassword
                                                    : c.showPassword
                                            }
                                            aria-pressed={showPassword}
                                        >
                                            {showPassword ? (
                                                <EyeOff size={19} />
                                            ) : (
                                                <Eye size={19} />
                                            )}
                                        </button>
                                    </div>
                                    {errors.password && (
                                        <p
                                            className="vlogin__field-error"
                                            id="staff-password-error"
                                            role="alert"
                                        >
                                            <AlertCircle size={14} aria-hidden="true" />
                                            <span>{errors.password.message}</span>
                                        </p>
                                    )}
                                    {capsLockActive && (
                                        <p
                                            className="vlogin__caps"
                                            id="staff-caps-warning"
                                            role="status"
                                        >
                                            <AlertCircle size={13} aria-hidden="true" />
                                            <span>{c.caps}</span>
                                        </p>
                                    )}
                                </div>

                                {/* Helpers Row */}
                                <div className="vlogin__helpers">
                                    <label className="vlogin__remember">
                                        <input
                                            type="checkbox"
                                            disabled={busy}
                                            {...register('rememberMe')}
                                        />
                                        <span>{c.remember}</span>
                                    </label>
                                    <div className="vlogin__recovery-actions">
                                        <button
                                            type="button"
                                            className="vlogin__help-btn"
                                            onClick={handleForgotOpen}
                                            style={{ fontWeight: 700 }}
                                        >
                                            {c.forgotPassword}
                                        </button>
                                    </div>
                                </div>

                                {/* Server Error Banner */}
                                {serverError && (
                                    <div className="vlogin__server-error" role="alert">
                                        <AlertCircle size={18} aria-hidden="true" />
                                        <span>{serverError}</span>
                                    </div>
                                )}

                                {/* Primary Submit Button */}
                                <button
                                    type="submit"
                                    className="vlogin__submit"
                                    disabled={busy}
                                >
                                    {isSubmitting || isApiSubmitting ? (
                                        <>
                                            <Loader2
                                                size={20}
                                                className="vlogin__spinner"
                                                aria-hidden="true"
                                            />
                                            <span>{c.authenticating}</span>
                                        </>
                                    ) : (
                                        <>
                                            <span>{c.signIn}</span>
                                            <DirectionArrow
                                                size={19}
                                                className="vlogin__submit-arrow"
                                                aria-hidden="true"
                                            />
                                        </>
                                    )}
                                </button>
                            </form>

                            {/* Divider */}
                            <div className="vlogin__divider" aria-hidden="true">
                                <span>{c.or}</span>
                            </div>

                            {/* Passkey Biometric Button */}
                            <button
                                type="button"
                                className="vlogin__passkey"
                                onClick={handlePasskeySignIn}
                                disabled={busy || !passkeySupport.supported}
                                aria-describedby="viara-passkey-note"
                            >
                                {isPasskeyLoading ? (
                                    <Loader2
                                        className="vlogin__spinner"
                                        size={21}
                                        aria-hidden="true"
                                    />
                                ) : (
                                    <Fingerprint size={22} aria-hidden="true" />
                                )}
                                <span>
                                    {isPasskeyLoading ? c.verifying : c.passkey}
                                </span>
                            </button>
                            <p id="viara-passkey-note" className="vlogin__passkey-note">
                                {passkeyNote}
                            </p>
                            <div className="vlogin__security-note"><span><ShieldCheck size={30} strokeWidth={1.7} aria-hidden="true" /></span><div><strong>{isRtl ? 'وصول آمن إلى مساحة عملك' : 'Secure access to your workspace'}</strong><small>{isRtl ? 'صلاحيات حسب الدور لحماية بيانات المرضى' : 'Role-based access to protect patient information'}</small></div></div>
                        </div>
                    </section>
                    {import.meta.env.DEV && (
                        <section className="vlogin__developer-panel" dir={isRtl ? 'rtl' : 'ltr'} aria-labelledby="viara-demo-panel-title">
                            <div className="vlogin__developer-head">
                                <span className="vlogin__developer-icon"><Sparkles size={20} aria-hidden="true" /></span>
                                <div>
                                    <h2 id="viara-demo-panel-title">{c.demoAccounts}</h2>
                                    <p>{isRtl ? 'اختر الدور لتعبئة بيانات الدخول.' : 'Choose a role to fill the sign-in form.'}</p>
                                </div>
                                <span className="vlogin__developer-badge">DEV</span>
                            </div>
                            <div className="vlogin__developer-controls">
                                <label className="vlogin__developer-select">
                                    <span className="vlogin__sr-only">{isRtl ? 'الحساب التجريبي' : 'Demo account'}</span>
                                    <select value={selectedRole} onChange={event => setSelectedRole(event.target.value)} disabled={busy}>
                                        {DEMO_ACCOUNTS.map(account => <option key={account.id} value={account.role}>{isRtl ? account.titleAr : account.titleEn}</option>)}
                                    </select>
                                </label>
                                <button type="button" className="vlogin__developer-fill" disabled={busy} onClick={event => {
                                    const account = DEMO_ACCOUNTS.find(account => account.role === selectedRole);
                                    if (account) fillOnlyDemo(account, event);
                                }}><UserCheck size={16} aria-hidden="true" />{isRtl ? 'تعبئة النموذج' : 'Fill form'}</button>
                            </div>
                            <button type="button" className="vlogin__developer-browse" disabled={busy} aria-haspopup="dialog" aria-controls="viara-demo-dialog" onClick={event => {
                                demoTriggerRef.current = event.currentTarget;
                                setDemoOpen(true);
                            }}>{isRtl ? `عرض كل الحسابات (${DEMO_ACCOUNTS.length})` : `Browse all accounts (${DEMO_ACCOUNTS.length})`}<DirectionArrow size={14} aria-hidden="true" /></button>
                        </section>
                    )}
                </div>
            </div>

            {/* ════════════════════════════════════════════════
                SERVICE HEALTH MODAL (Same as Landing Page)
                ════════════════════════════════════════════════ */}
            <footer className="vlogin__page-footer">
                <span dir="ltr">© {new Date().getFullYear()} {brandName}</span>
                <span>{isRtl ? 'جميع الحقوق محفوظة' : 'All rights reserved'}</span>
                <span className="vlogin__footer-line" aria-hidden="true" />
                <button type="button" onClick={openSupport}>{c.help}</button>
                <button type="button" onClick={openServices}>{c.serviceHealth}</button>
                {import.meta.env.DEV && <button type="button" onClick={(event) => { demoTriggerRef.current = event.currentTarget; setDemoOpen(true); }}>{isRtl ? 'معاينة التطوير' : 'Developer preview'}</button>}
            </footer>

            {serviceModalOpen && (
                <LandingServiceHealthModal
                    onClose={() => setServiceModalOpen(false)}
                    onSupport={() => { setServiceModalOpen(false); openSupport(); }}
                    isRtl={isRtl}
                />
            )}

            {/* ════════════════════════════════════════════════
                DEV MODE: MODERN DEMO ACCOUNTS DRAWER
                ════════════════════════════════════════════════ */}
            {import.meta.env.DEV && (
                <dialog
                    id="viara-demo-dialog"
                    ref={demoDialogRef}
                    className="vlogin__dialog"
                    aria-labelledby="viara-login-demo-title"
                    onCancel={() => setDemoOpen(false)}
                    onClose={() => setDemoOpen(false)}
                    onClick={(event) => {
                        if (event.target === event.currentTarget) setDemoOpen(false);
                    }}
                >
                    <div className="vlogin__dialog-card vlogin__dialog-card--demo">
                        <div className="vlogin__sheet-handle" aria-hidden="true" />
                        <div className="vlogin__dialog-head">
                            <div className="vlogin__dialog-head-title">
                                <div className="vlogin__dialog-head-icon">
                                    <Sparkles size={20} />
                                </div>
                                <div>
                                    <h2 id="viara-login-demo-title">{c.demoAccounts}</h2>
                                    <p>{c.demoSubtitle}</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                className="vlogin__dialog-close"
                                onClick={() => setDemoOpen(false)}
                                aria-label={c.close}
                            >
                                <X size={18} />
                            </button>
                        </div>

                        <div className="vlogin__dialog-body">
                            {/* Shared Password Box */}
                            <div className="vlogin__demo-pwd-box">
                                <div className="vlogin__demo-pwd-info">
                                    <KeyRound size={15} color="var(--vlp-green)" />
                                    <span>{c.demoPasswordLabel}</span>
                                    <code dir="ltr">{DEMO_PASSWORD}</code>
                                </div>
                                <button
                                    type="button"
                                    className="vlogin__demo-copy-btn"
                                    aria-label={c.demoCopyPassword}
                                    title={c.demoCopyPassword}
                                    onClick={() =>
                                        copyToClipboard(
                                            DEMO_PASSWORD,
                                            'password',
                                            c.demoPasswordCopied,
                                        )
                                    }
                                >
                                    {copiedField === 'password' ? (
                                        <Check size={14} color="#10b981" />
                                    ) : (
                                        <Copy size={14} />
                                    )}
                                    <span>
                                        {copiedField === 'password'
                                            ? c.demoPasswordCopied
                                            : c.demoCopyPassword}
                                    </span>
                                </button>
                            </div>

                            {/* Search & Category Filter */}
                            <div className="vlogin__demo-controls">
                                <div className="vlogin__demo-search">
                                    <Search size={16} />
                                    <input
                                        type="text"
                                        value={demoSearch}
                                        onChange={(e) => setDemoSearch(e.target.value)}
                                        placeholder={c.demoSearchPlaceholder}
                                        dir={isRtl ? 'rtl' : 'ltr'}
                                    />
                                    {demoSearch && (
                                        <button
                                            type="button"
                                            onClick={() => setDemoSearch('')}
                                            style={{ border: 0, background: 'none' }}
                                        >
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>
                                <div className="vlogin__demo-tabs">
                                    <button
                                        type="button"
                                        className={`vlogin__demo-tab ${demoCategory === 'all' ? 'vlogin__demo-tab--active' : ''}`}
                                        onClick={() => setDemoCategory('all')}
                                    >
                                        {c.allCategories} ({DEMO_ACCOUNTS.length})
                                    </button>
                                    <button
                                        type="button"
                                        className={`vlogin__demo-tab ${demoCategory === 'clinical' ? 'vlogin__demo-tab--active' : ''}`}
                                        onClick={() => setDemoCategory('clinical')}
                                    >
                                        {c.clinicalCat}
                                    </button>
                                    <button
                                        type="button"
                                        className={`vlogin__demo-tab ${demoCategory === 'operations' ? 'vlogin__demo-tab--active' : ''}`}
                                        onClick={() => setDemoCategory('operations')}
                                    >
                                        {c.operationsCat}
                                    </button>
                                    <button
                                        type="button"
                                        className={`vlogin__demo-tab ${demoCategory === 'admin' ? 'vlogin__demo-tab--active' : ''}`}
                                        onClick={() => setDemoCategory('admin')}
                                    >
                                        {c.adminCat}
                                    </button>
                                </div>
                            </div>

                            {/* Accounts List */}
                            <ul className="vlogin__demo-list">
                                {filteredAccounts.map((account) => {
                                    const Icon = account.icon;
                                    return (
                                        <li key={account.id}>
                                            <div className="vlogin__demo-item">
                                                <button
                                                    type="button"
                                                    className="vlogin__demo-main-btn"
                                                    onClick={() => fillAndLoginDemo(account)}
                                                    disabled={busy}
                                                    aria-label={
                                                        isRtl
                                                            ? `${account.nameAr}، ${account.titleAr}`
                                                            : `${account.nameEn}, ${account.titleEn}`
                                                    }
                                                >
                                                    <span
                                                        className={`vlogin__demo-avatar vlogin__demo-avatar--${account.badgeColor}`}
                                                        aria-hidden="true"
                                                    >
                                                        <Icon size={19} />
                                                    </span>
                                                    <span className="vlogin__demo-info">
                                                        <strong>
                                                            {isRtl ? account.nameAr : account.nameEn}
                                                        </strong>
                                                        <span>
                                                            {isRtl ? account.titleAr : account.titleEn}
                                                        </span>
                                                        <code dir="ltr">{account.email}</code>
                                                    </span>
                                                    <span className="vlogin__demo-login-chip">
                                                        <LogIn size={13} />
                                                        <span>{c.signInShort}</span>
                                                    </span>
                                                </button>
                                                <div className="vlogin__demo-actions">
                                                    <button
                                                        type="button"
                                                        className="vlogin__demo-copy-btn"
                                                        onClick={(e) => fillOnlyDemo(account, e)}
                                                        title={c.useAccount}
                                                        aria-label={`${c.useAccount}: ${isRtl ? account.nameAr : account.nameEn}`}
                                                    >
                                                        <UserCheck size={15} aria-hidden="true" />
                                                    </button>
                                                </div>
                                            </div>
                                        </li>
                                    );
                                })}
                                {filteredAccounts.length === 0 && (
                                    <li style={{ padding: '24px', textAlign: 'center', color: 'var(--vlp-muted)' }}>
                                        {c.demoNoResults}
                                    </li>
                                )}
                            </ul>
                        </div>
                    </div>
                </dialog>
            )}

            {forgotOpen && (
                <PublicDialog title={forgotSent ? c.forgotSentTitle : c.forgotPasswordTitle} titleId="viara-forgot-title" closeLabel={c.close} initialFocusRef={forgotEmailRef} onClose={() => setForgotOpen(false)}>
                    {forgotSent ? (
                        <div className="vlogin__recovery-success">
                            <Check size={28} aria-hidden="true" />
                            <p role="status">{c.forgotSentDesc}</p>
                            <button type="button" className="vlogin__submit" onClick={() => setForgotOpen(false)}>{c.forgotBackToLogin}</button>
                        </div>
                    ) : (
                        <form onSubmit={handleForgotSubmit} noValidate className="vlogin__recovery-form" aria-busy={isSendingResetLink}>
                            <p>{c.forgotPasswordDesc}</p>
                            <label htmlFor="forgot-email">{c.forgotEmailLabel}</label>
                            <input ref={forgotEmailRef} id="forgot-email" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} dir="ltr" value={forgotEmail} readOnly={isSendingResetLink} aria-invalid={Boolean(forgotError)} aria-describedby={forgotError ? 'forgot-email-error' : undefined} onChange={(event) => { setForgotEmail(event.target.value); setForgotError(''); }} placeholder="name@center.com" />
                            {forgotError && <p id="forgot-email-error" className="public-dialog__error" role="alert">{forgotError}</p>}
                            <button type="submit" className="vlogin__submit" disabled={isSendingResetLink}>
                                {isSendingResetLink && <Loader2 size={18} className="vlogin__spinner" aria-hidden="true" />}
                                {isSendingResetLink ? c.forgotSending : c.forgotSendLink}
                            </button>
                            <button type="button" className="public-dialog__secondary" onClick={() => setForgotOpen(false)}>{c.forgotBackToLogin}</button>
                        </form>
                    )}
                </PublicDialog>
            )}

            {urlResetToken && !resetSuccess && (
                <PublicDialog title={c.resetPasswordTitle} titleId="viara-reset-title" closeLabel={c.close} initialFocusRef={resetPasswordRef} onClose={() => navigate('/login', { replace: true })}>
                    <form onSubmit={handleResetPasswordSubmit} noValidate className="vlogin__recovery-form" aria-busy={isResettingPassword}>
                        <p id="reset-password-rules">{c.passwordRules}</p>
                        <label htmlFor="reset-new-pw">{c.newPasswordLabel}</label>
                        <div className="vlogin__recovery-password">
                            <input ref={resetPasswordRef} id="reset-new-pw" type={showResetPw ? 'text' : 'password'} dir="ltr" autoComplete="new-password" value={resetNewPw} readOnly={isResettingPassword} aria-invalid={Boolean(resetError)} aria-describedby={`reset-password-rules${resetError ? ' reset-password-error' : ''}`} onChange={(event) => { setResetNewPw(event.target.value); setResetError(''); }} />
                            <button type="button" className="vlogin__eye" onClick={() => setShowResetPw(value => !value)} aria-pressed={showResetPw} aria-label={showResetPw ? c.hidePassword : c.showPassword}>{showResetPw ? <EyeOff size={20} /> : <Eye size={20} />}</button>
                        </div>
                        <label htmlFor="reset-confirm-pw">{c.confirmPasswordLabel}</label>
                        <input id="reset-confirm-pw" type={showResetPw ? 'text' : 'password'} dir="ltr" autoComplete="new-password" value={resetConfirmPw} readOnly={isResettingPassword} aria-invalid={Boolean(resetError)} aria-describedby={resetError ? 'reset-password-error' : undefined} onChange={(event) => { setResetConfirmPw(event.target.value); setResetError(''); }} />
                        {resetError && <p id="reset-password-error" className="public-dialog__error" role="alert">{resetError}</p>}
                        <button type="submit" className="vlogin__submit" disabled={isResettingPassword}>
                            {isResettingPassword && <Loader2 size={18} className="vlogin__spinner" aria-hidden="true" />}
                            {isResettingPassword ? c.resetPasswordSaving : c.resetPasswordBtn}
                        </button>
                        <button type="button" className="public-dialog__secondary" onClick={() => navigate('/login', { replace: true })}>{c.forgotBackToLogin}</button>
                    </form>
                </PublicDialog>
            )}
            {helpOpen && <PublicSupportDialog onClose={() => setHelpOpen(false)} returnFocusRef={supportTriggerRef} />}
        </main>
    );
}
