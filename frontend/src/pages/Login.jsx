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
    Home,
    KeyRound,
    Languages,
    Loader2,
    Lock,
    LogIn,
    Mail,
    Moon,
    Phone,
    ScanLine,
    Search,
    Shield,
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
    useGetPublicCenterSettingsQuery,
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
import { resolvePreferredStartPage } from '../utils/startPage';
import LandingServiceHealthModal from './LandingServiceHealthModal';
import './LoginIllustrative.css';
import './LoginReference.css';

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

const COPY = {
    ar: {
        title: 'أهلًا بعودتك',
        subtitle: 'سجّل دخولك للمتابعة إلى مساحة عملك.',
        email: 'البريد الإلكتروني',
        password: 'كلمة المرور',
        remember: 'تذكرني على هذا الجهاز',
        help: 'تحتاج مساعدة؟',
        signIn: 'تسجيل الدخول',
        authenticating: 'جارٍ تسجيل الدخول...',
        or: 'أو',
        passkey: 'الدخول بمفتاح مرور',
        verifying: 'جارٍ التحقق من مفتاح المرور...',
        back: 'العودة للرئيسية',
        home: 'الرئيسية',
        services: 'الخدمات',
        serviceHealth: 'حالة الخدمات والنظام',
        sideTag: 'بوابة الكوادر السريرية والإدارية',
        sideTitle: 'الأشعة الحديثة،',
        sideAccent: 'برؤية جديدة لك.',
        sideDescription:
            'توحّد مسارات المرضى، ودقة التشخيص، والذكاء التشغيلي في مساحة عمل آمنة واحدة.',
        telemetryNode: 'محطة العمل التشخيصية',
        telemetryStatus: 'متصل بالخادم الآمن',
        telemetryPill: 'مشفر بالكامل',
        telemetryPacs: 'ربط أنظمة PACS',
        telemetryPacsVal: 'متزامن وفوري',
        telemetryAi: 'المساعد الذكي',
        telemetryAiVal: 'v2.4 نشط',
        telemetrySecurity: 'مستوى الأمان',
        telemetrySecurityVal: 'TLS 1.3 / HIPAA',
        showPassword: 'إظهار كلمة المرور',
        hidePassword: 'إخفاء كلمة المرور',
        caps: 'مفتاح Caps Lock مفعّل',
        emailRequired: 'أدخل بريدك الإلكتروني.',
        invalidEmail: 'أدخل بريدًا إلكترونيًا صحيحًا.',
        passwordRequired: 'أدخل كلمة المرور.',
        loginFailed: 'تعذر تسجيل الدخول. راجع بياناتك وحاول مرة أخرى.',
        network: 'تعذر الاتصال بالخادم. تحقق من الاتصال وحاول مرة أخرى.',
        rateLimit: 'محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.',
        invalidCredentials: 'البريد الإلكتروني أو كلمة المرور غير صحيحة.',
        welcome: 'أهلًا بعودتك،',
        light: 'المظهر الفاتح',
        dark: 'المظهر الداكن',
        helpTitle: 'مساعدة تسجيل الدخول',
        helpDescription:
            'للمساعدة في استعادة الوصول إلى حسابك، تواصل مع مسؤول النظام أو فريق الدعم في مركزك.',
        noContact:
            'بيانات التواصل غير متاحة حاليًا. يرجى التواصل مباشرةً مع مسؤول النظام.',
        close: 'إغلاق',
        unsupported:
            'مفتاح المرور غير متاح في هذا المتصفح. يمكنك الدخول بكلمة المرور.',
        insecure:
            'يتطلب مفتاح المرور اتصال HTTPS آمنًا. يمكنك الدخول بكلمة المرور.',
        passkeyHint:
            'أدخل بريدك الإلكتروني أولًا، ثم استخدم مفتاح المرور المسجّل لحسابك.',
        mismatch: 'مفتاح المرور لا يطابق الحساب. تحقق من البريد الإلكتروني.',
        passkeyFailed:
            'تعذر التحقق من مفتاح المرور. حاول مجددًا أو استخدم كلمة المرور.',
        sceneAlt: 'Radiologist reviewing studies in a modern, intelligent workspace',
        demoAccounts: 'حسابات تجريبية',
        demoSubtitle: 'اختر حسابًا لتعبئة بياناته أو للدخول الفوري.',
        demoPasswordLabel: 'كلمة المرور المشتركة:',
        demoSearchPlaceholder: 'ابحث بالاسم أو الدور أو البريد...',
        demoCopyPassword: 'نسخ كلمة المرور',
        demoPasswordCopied: 'تم نسخ كلمة المرور',
        useAccount: 'تعبئة فقط',
        signInShort: 'دخول سريع',
        copy: 'نسخ',
        demoNoResults: 'لا توجد حسابات مطابقة للبحث',
        allCategories: 'الكل',
        clinicalCat: 'سريري وطبي',
        operationsCat: 'تشغيلي ومالي',
        adminCat: 'إدارة ونظم',
    },
    en: {
        title: 'Welcome back',
        subtitle: 'Sign in to continue to your workspace.',
        email: 'Email address',
        password: 'Password',
        remember: 'Remember me on this device',
        help: 'Need help?',
        signIn: 'Sign in',
        authenticating: 'Signing you in...',
        or: 'or',
        passkey: 'Sign in with a passkey',
        verifying: 'Verifying your passkey...',
        back: 'Back to home',
        home: 'Home',
        services: 'Services',
        serviceHealth: 'System & Service Health',
        sideTag: 'Clinical & Administrative Gateway',
        sideTitle: 'Modern Radiology,',
        sideAccent: 'reimagined for you.',
        sideDescription:
            'Connecting patient workflows, diagnostic precision, and operational intelligence in one secure workspace.',
        telemetryNode: 'Diagnostic Workstation',
        telemetryStatus: 'Connected to Secure Node',
        telemetryPill: 'End-to-End Encrypted',
        telemetryPacs: 'PACS Integration',
        telemetryPacsVal: 'Synced & Active',
        telemetryAi: 'AI Diagnostic Copilot',
        telemetryAiVal: 'v2.4 Online',
        telemetrySecurity: 'Security Protocol',
        telemetrySecurityVal: 'TLS 1.3 / HIPAA',
        showPassword: 'Show password',
        hidePassword: 'Hide password',
        caps: 'Caps Lock is on',
        emailRequired: 'Enter your email address.',
        invalidEmail: 'Enter a valid email address.',
        passwordRequired: 'Enter your password.',
        loginFailed: 'Unable to sign in. Check your details and try again.',
        network:
            'Unable to reach the server. Check your connection and try again.',
        rateLimit: 'Too many attempts. Please wait a moment and try again.',
        invalidCredentials: 'The email address or password is incorrect.',
        welcome: 'Welcome back,',
        light: 'Light appearance',
        dark: 'Dark appearance',
        helpTitle: 'Sign-in support',
        helpDescription:
            'For help restoring access to your account, contact your center’s system administrator or support team.',
        noContact:
            'Contact details are currently unavailable. Please contact your system administrator directly.',
        close: 'Close',
        unsupported:
            'Passkeys are unavailable in this browser. You can sign in with your password.',
        insecure:
            'Passkeys require a secure HTTPS connection. You can sign in with your password.',
        passkeyHint:
            'Enter your email first, then use the passkey registered to your account.',
        mismatch:
            'This passkey does not match the account. Check your email address.',
        passkeyFailed:
            'Passkey verification failed. Try again or use your password.',
        sceneAlt:
            'A radiologist reviewing studies in a modern, intelligent workspace',
        demoAccounts: 'Demo Accounts',
        demoSubtitle: 'Pick an account to fill the form or sign in instantly.',
        demoPasswordLabel: 'Shared password:',
        demoSearchPlaceholder: 'Search by name, role, or email...',
        demoCopyPassword: 'Copy password',
        demoPasswordCopied: 'Password copied',
        useAccount: 'Fill only',
        signInShort: 'Quick Sign In',
        copy: 'Copy',
        demoNoResults: 'No demo accounts match your search',
        allCategories: 'All',
        clinicalCat: 'Clinical',
        operationsCat: 'Operations',
        adminCat: 'Administration',
    },
};

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
    const preferences = useSelector(selectPreferences);
    const { i18n } = useTranslation(['auth', 'common']);
    const isRtl = i18n.dir() === 'rtl';
    const c = COPY[isRtl ? 'ar' : 'en'];
    const dark = preferences.theme === 'dark';
    const DirectionArrow = isRtl ? ArrowLeft : ArrowRight;
    const BackArrow = isRtl ? ArrowRight : ArrowLeft;

    const [login, { isLoading: isApiSubmitting }] = useLoginMutation();
    const [getPasskeyOptions, { isLoading: isPasskeyOptionsLoading }] =
        usePasskeyAuthenticationOptionsMutation();
    const [verifyPasskey, { isLoading: isPasskeyVerifyLoading }] =
        usePasskeyAuthenticationVerifyMutation();
    const { data: publicSettings } = useGetPublicCenterSettingsQuery();

    const helpdeskEmail =
        publicSettings?.support_email || publicSettings?.email;
    const helpdeskPhone = publicSettings?.hotline || publicSettings?.phone;

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
    const [imageFailed, setImageFailed] = useState(false);
    const [languageBusy, setLanguageBusy] = useState(false);
    const [demoSearch, setDemoSearch] = useState('');
    const [demoCategory, setDemoCategory] = useState('all');
    const [copiedField, setCopiedField] = useState(null);

    const helpDialogRef = useRef(null);
    const helpTriggerRef = useRef(null);
    const demoDialogRef = useRef(null);
    const demoTriggerRef = useRef(null);
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
        if (!helpOpen) return undefined;
        const dialog = helpDialogRef.current;
        const trigger = helpTriggerRef.current;
        if (dialog && !dialog.open) dialog.showModal();
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            if (dialog && dialog.open) dialog.close();
            document.body.style.overflow = previousOverflow;
            trigger?.focus();
        };
    }, [helpOpen]);

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
            toast.error('Copy failed');
        }
    };

    const fillAndLoginDemo = (account) => {
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
        setValue('email', account.email, { shouldValidate: true });
        setValue('password', DEMO_PASSWORD, { shouldValidate: true });
        clearErrors();
        setServerError('');
        setDemoOpen(false);
        toast.success(isRtl ? `تمت تعبئة بيانات: ${account.nameAr}` : `Filled: ${account.nameEn}`);
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
            className={`vlogin ${dark ? 'vlogin--dark' : ''}`}
            dir={isRtl ? 'rtl' : 'ltr'}
            lang={isRtl ? 'ar' : 'en'}
        >
            {/* Ambient Background Glow matching Landing Page */}
            <div className="vlogin__ambient" aria-hidden="true">
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
                        onClick={() => setServiceModalOpen(true)}
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
                                initial={{ rotate: -90, opacity: 0, scale: 0.7 }}
                                animate={{ rotate: 0, opacity: 1, scale: 1 }}
                                exit={{ rotate: 90, opacity: 0, scale: 0.7 }}
                                transition={{ duration: 0.22 }}
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
                        <Languages size={15} aria-hidden="true" />
                    </button>

                    <span className="vlogin__util-sep" aria-hidden="true" />

                    {/* Back to Home CTA */}
                    <Link to="/" className="vlogin__header-home" aria-label={c.back} title={c.back}>
                        <BackArrow size={15} aria-hidden="true" />
                        <span>{c.home}</span>
                    </Link>
                </div>
            </header>

            {/* ════════════════════════════════════════════════
                MAIN STAGE (Card with Form & Medical Showcase)
                ════════════════════════════════════════════════ */}
            <div className="vlogin__body">
                <div className="vlogin__card">
                    {/* Visual Showcase Side (Desktop Medical Intelligence) */}
                    <aside className="vlogin__visual" aria-label={c.sceneAlt}>
                        {!imageFailed ? (
                            <img
                                className="vlogin__scene"
                                src="/images/viara/login-backdrop-premium.jpg"
                                alt=""
                                width="1086"
                                height="1448"
                                decoding="async"
                                onError={() => setImageFailed(true)}
                            />
                        ) : (
                            <div className="vlogin__scene" style={{ background: 'var(--vlp-deep)' }} />
                        )}
                        <div className="vlogin__visual-overlay" />

                        {/* Top Visual Headline */}
                        <div className="vlogin__visual-header">
                            <div className="vlogin__visual-tag">
                                <i aria-hidden="true" />
                                <span>{c.sideTag}</span>
                            </div>
                            <h2 className="vlogin__visual-title">
                                {isRtl ? 'إدارة أكثر سلاسة' : 'Simpler management'}
                                <span>{isRtl ? 'لمراكز الأشعة.' : 'for radiology centers.'}</span>
                            </h2>
                            <p className="vlogin__visual-desc">{isRtl ? 'من استقبال المريض إلى تسليم التقرير، كل خدمات مركزك في مساحة عمل واحدة.' : 'From patient reception to report delivery, bring your center together in one workspace.'}</p>
                            <div className="vlogin__benefits">
                                {[
                                    [Activity, 'متابعة التقارير', 'Report tracking'],
                                    [Users, 'المرضى والمواعيد', 'Patients & appointments'],
                                    [ShieldCheck, 'إدارة الصلاحيات', 'Access management'],
                                    [Building2, 'خدمات المركز', 'Center services'],
                                ].map(([Icon, ar, en]) => <div key={en}><span><Icon size={26} aria-hidden="true" /></span><strong>{isRtl ? ar : en}</strong></div>)}
                            </div>
                        </div>

                        <div className="vlogin__journey" aria-label={isRtl ? 'رحلة العمل' : 'Your workflow'}>
                            {[
                                [Users, 'استقبال المريض', 'Patient reception'],
                                [ScanLine, 'إجراء الفحص', 'Imaging'],
                                [Check, 'اعتماد التقرير', 'Report approval'],
                            ].map(([Icon, ar, en], index) => (
                                <div key={en}><Icon size={23} aria-hidden="true" /><span><small>0{index + 1}</small><strong>{isRtl ? ar : en}</strong></span></div>
                            ))}
                        </div>

                        {/* Floating Diagnostic Telemetry Card (matching Landing Worklist Card) */}
                        <div className="vlogin__telemetry-card">
                            <div className="vlogin__telemetry-top">
                                <div className="vlogin__telemetry-node">
                                    <div className="vlogin__telemetry-icon">
                                        <Activity size={17} />
                                    </div>
                                    <div className="vlogin__telemetry-node-text">
                                        <strong>{c.telemetryNode}</strong>
                                        <span>{c.telemetryStatus}</span>
                                    </div>
                                </div>
                                <div className="vlogin__telemetry-badge">
                                    <Shield size={12} />
                                    <span>{c.telemetryPill}</span>
                                </div>
                            </div>
                            <div className="vlogin__telemetry-grid">
                                <div className="vlogin__telemetry-item">
                                    <span className="vlogin__telemetry-label">{c.telemetryPacs}</span>
                                    <span className="vlogin__telemetry-val">{c.telemetryPacsVal}</span>
                                </div>
                                <div className="vlogin__telemetry-item">
                                    <span className="vlogin__telemetry-label">{c.telemetryAi}</span>
                                    <span className="vlogin__telemetry-val">{c.telemetryAiVal}</span>
                                </div>
                                <div className="vlogin__telemetry-item">
                                    <span className="vlogin__telemetry-label">{c.telemetrySecurity}</span>
                                    <span className="vlogin__telemetry-val">{c.telemetrySecurityVal}</span>
                                </div>
                            </div>
                        </div>
                    </aside>

                    {/* Authentication Form Side */}
                    <section
                        className="vlogin__form-pane"
                        aria-labelledby="viara-login-title"
                    >
                        <div className="vlogin__form-inner">
                            <div className="vlogin__form-header">
                                <div className="vlogin__form-brand">
                                    {!brandFailed && <img src={VIARA_BRAND.iconUrl || VIARA_BRAND.logoUrl || '/logo.png'} alt="" onError={() => setBrandFailed(true)} />}
                                    <strong dir="ltr">{brandName}</strong>
                                </div>
                                <div className="vlogin__eyebrow">
                                    <span>{c.title}</span>
                                </div>
                                <h1 id="viara-login-title">{isRtl ? 'تسجيل الدخول' : 'Sign in'}</h1>
                                <p className="vlogin__subtitle">{c.subtitle}</p>
                            </div>

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
                                    <button
                                        ref={helpTriggerRef}
                                        type="button"
                                        className="vlogin__help-btn"
                                        onClick={() => setHelpOpen(true)}
                                    >
                                        {c.help}
                                    </button>
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

                            {/* Portal Bridge: Friendly routing for patients and referring physicians */}
                            <div className="vlogin__portal-bridge">
                                <span>{isRtl ? 'هل أنت مريض أو طبيب محوّل؟' : 'Are you a patient or referring doctor?'}</span>
                                <Link to="/portal" className="vlogin__portal-bridge-link">
                                    <span>{isRtl ? 'بوابة النتائج والتقارير' : 'Patient & Doctor Portal'}</span>
                                    <DirectionArrow size={14} aria-hidden="true" />
                                </Link>
                            </div>
                        </div>
                    </section>
                </div>
            </div>

            {/* ════════════════════════════════════════════════
                SERVICE HEALTH MODAL (Same as Landing Page)
                ════════════════════════════════════════════════ */}
            <footer className="vlogin__page-footer">
                <span dir="ltr">© {new Date().getFullYear()} {brandName}</span>
                <span>{isRtl ? 'جميع الحقوق محفوظة' : 'All rights reserved'}</span>
                <span className="vlogin__footer-line" aria-hidden="true" />
            </footer>

            {serviceModalOpen && (
                <LandingServiceHealthModal
                    onClose={() => setServiceModalOpen(false)}
                    isRtl={isRtl}
                />
            )}

            {/* ════════════════════════════════════════════════
                DEV MODE: MODERN DEMO ACCOUNTS DRAWER
                ════════════════════════════════════════════════ */}
            {import.meta.env.DEV && (
                <dialog
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

            {/* ════════════════════════════════════════════════
                ACCESSIBLE SUPPORT / HELP MODAL
                ════════════════════════════════════════════════ */}
            <dialog
                ref={helpDialogRef}
                className="vlogin__dialog"
                aria-labelledby="viara-login-help-title"
                aria-describedby="viara-login-help-description"
                onKeyDown={(event) => {
                    if (event.key !== 'Tab') return;
                    const controls = Array.from(
                        event.currentTarget.querySelectorAll(
                            'button:not(:disabled), a[href]',
                        ),
                    );
                    const first = controls[0];
                    const last = controls[controls.length - 1];
                    if (event.shiftKey && document.activeElement === first) {
                        event.preventDefault();
                        last?.focus();
                    } else if (
                        !event.shiftKey &&
                        document.activeElement === last
                    ) {
                        event.preventDefault();
                        first?.focus();
                    }
                }}
                onCancel={() => setHelpOpen(false)}
                onClose={() => setHelpOpen(false)}
                onClick={(event) => {
                    if (event.target === event.currentTarget) setHelpOpen(false);
                }}
            >
                <div className="vlogin__dialog-card">
                    <div className="vlogin__dialog-head">
                        <div className="vlogin__dialog-head-title">
                            <div className="vlogin__dialog-head-icon">
                                <ShieldCheck size={20} />
                            </div>
                            <div>
                                <h2 id="viara-login-help-title">{c.helpTitle}</h2>
                                <p>{brandName} Support</p>
                            </div>
                        </div>
                        <button
                            type="button"
                            className="vlogin__dialog-close"
                            onClick={() => setHelpOpen(false)}
                            aria-label={c.close}
                        >
                            <X size={18} />
                        </button>
                    </div>

                    <div className="vlogin__dialog-body">
                        <p
                            id="viara-login-help-description"
                            style={{ margin: '0 0 16px', lineHeight: 1.7, color: 'var(--vlp-muted)', fontSize: '13.5px' }}
                        >
                            {c.helpDescription}
                        </p>

                        <div className="vlogin__help-content">
                            {helpdeskEmail && (
                                <div className="vlogin__help-card">
                                    <div className="vlogin__help-card-icon">
                                        <Mail size={18} />
                                    </div>
                                    <div className="vlogin__help-card-info">
                                        <strong>{isRtl ? 'البريد الإلكتروني للدعم الفني' : 'Technical Support Email'}</strong>
                                        <a href={`mailto:${helpdeskEmail}`} dir="ltr">
                                            {helpdeskEmail}
                                        </a>
                                    </div>
                                </div>
                            )}

                            {helpdeskPhone && (
                                <div className="vlogin__help-card">
                                    <div className="vlogin__help-card-icon">
                                        <Phone size={18} />
                                    </div>
                                    <div className="vlogin__help-card-info">
                                        <strong>{isRtl ? 'الخط الساخن للمركز' : 'Center Support Hotline'}</strong>
                                        <a
                                            href={`tel:${String(helpdeskPhone).replace(/[^+\d]/g, '')}`}
                                            dir="ltr"
                                        >
                                            {helpdeskPhone}
                                        </a>
                                    </div>
                                </div>
                            )}

                            {!helpdeskEmail && !helpdeskPhone && (
                                <p style={{ color: 'var(--vlp-muted)', fontSize: '13px' }}>{c.noContact}</p>
                            )}
                        </div>
                    </div>
                </div>
            </dialog>
        </main>
    );
}
