import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import {
    Activity,
    AlertCircle,
    ArrowLeft,
    ArrowRight,
    BadgeDollarSign,
    Calculator,
    CheckCircle2,
    ClipboardCheck,
    Eye,
    EyeOff,
    Fingerprint,
    HeartPulse,
    HelpCircle,
    KeyRound,
    Languages,
    Lock,
    Mail,
    Moon,
    Radio,
    Server,
    ShieldCheck,
    Stethoscope,
    Sun,
    Terminal,
    Users,
    X,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { api, useLoginMutation, usePasskeyAuthenticationOptionsMutation, usePasskeyAuthenticationVerifyMutation, useGetPublicCenterSettingsQuery } from '../store/api';
import { setCredentials } from '../store/authSlice';
import { selectPreferences, setLanguage, setTheme, updateAllPreferences } from '../store/preferencesSlice';
import { getErrorMessage } from '../utils/getErrorMessage';
import { authenticateWithPasskey, getPasskeyErrorKind, getPasskeySupport } from '../utils/passkeys';
import { VIARA_BRAND } from '../config/brand';
import { resolvePreferredStartPage } from '../utils/startPage';
import './LoginIllustrative.css';

const ROLE_DESTINATIONS = {
    Developer: '/admin',
    Admin: '/admin',
    Radiologist: '/worklist',
    Technician: '/modality',
    Receptionist: '/reception',
    Accountant: '/financials',
    Cashier: '/financials',
    HR: '/admin',
    Insurance_Staff: '/insurance',
    Doctor: '/dashboard',
    Nurse: '/dashboard',
    Patient: '/patient/profile',
};

export default function Login() {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const location = useLocation();
    const preferences = useSelector(selectPreferences);
    const { t, i18n } = useTranslation(['auth', 'common']);
    const prefersReducedMotion = useReducedMotion();

    const isRtl = (typeof i18n.dir === 'function' ? i18n.dir() === 'rtl' : i18n.language === 'ar')
        || preferences.language === 'ar';
    const dark = preferences.theme === 'dark';
    const [login, { isLoading: isApiSubmitting }] = useLoginMutation();
    const [getPasskeyOptions, { isLoading: isPasskeyOptionsLoading }] = usePasskeyAuthenticationOptionsMutation();
    const [verifyPasskey, { isLoading: isPasskeyVerifyLoading }] = usePasskeyAuthenticationVerifyMutation();

    // Fetch public center settings for dynamic helpdesk contact info
    const { data: publicSettings } = useGetPublicCenterSettingsQuery();
    const helpdeskEmail = publicSettings?.support_email || publicSettings?.email || 'it-support@viara.clinic';
    const helpdeskPhone = publicSettings?.hotline || publicSettings?.phone || null;

    // Visual states
    const [selectedRole, setSelectedRole] = useState('Radiologist');
    const [showPassword, setShowPassword] = useState(false);
    const [capsLockActive, setCapsLockActive] = useState(false);
    const [isPasskeyPromptOpen, setIsPasskeyPromptOpen] = useState(false);
    const [showPasswordHelpModal, setShowPasswordHelpModal] = useState(false);
    const {
        register,
        handleSubmit,
        setValue,
        watch,
        formState: { errors },
    } = useForm({
        defaultValues: {
            email: '',
            password: '',
            rememberMe: true,
        },
    });

    const watchedEmail = watch('email', '');
    const isDemoMode = import.meta.env.DEV;

    // Demo role matrix — DEV ONLY. Never shipped in production bundles
    // (tree-shaken when import.meta.env.DEV is false) and gated in the UI,
    // so demo credentials can never surface in a deployed environment.
    // One account per seeded role (backend/seed.js).
    const demoRoles = useMemo(() => (isDemoMode ? [
        {
            role: 'Radiologist',
            label: t('radiologist'),
            email: 'ahmed.hassan@VIARA.com',
            pass: import.meta.env.VITE_DEMO_PASSWORD || '',
            icon: Stethoscope,
            badge: t('clinicalDiagnostic'),
            desc: t('diagnosticWorklistMultiPlanarDicomViewer'),
        },
        {
            role: 'Technician',
            label: t('technologist'),
            email: 'mohamed.tech@VIARA.com',
            pass: import.meta.env.VITE_DEMO_PASSWORD || '',
            icon: Radio,
            badge: t('modalityCommand'),
            desc: t('realTimeScannerQueuesProtocolControl'),
        },
        {
            role: 'Receptionist',
            label: t('receptionist'),
            email: 'reception@VIARA.com',
            pass: import.meta.env.VITE_DEMO_PASSWORD || '',
            icon: Users,
            badge: t('patientCheckIn'),
            desc: t('rapidIntakeAutomatedInsuranceApprovalsAnd'),
        },
        {
            role: 'Nurse',
            label: t('nurse'),
            email: 'heba.nurse@VIARA.com',
            pass: import.meta.env.VITE_DEMO_PASSWORD || '',
            icon: HeartPulse,
            badge: t('clinicalCare'),
            desc: t('preExamPreparationPatientMonitoringAnd'),
        },
        {
            role: 'Cashier',
            label: t('cashier'),
            email: 'cashier@VIARA.com',
            pass: import.meta.env.VITE_DEMO_PASSWORD || '',
            icon: BadgeDollarSign,
            badge: t('paymentsPos'),
            desc: t('feeCollectionInvoicingAndPartialPayments'),
        },
        {
            role: 'Accountant',
            label: t('accountant'),
            email: 'accountant@VIARA.com',
            pass: import.meta.env.VITE_DEMO_PASSWORD || '',
            icon: Calculator,
            badge: t('revenueCycle'),
            desc: t('financialReportingInsuranceClaimsOversightAnd'),
        },
        {
            role: 'Insurance_Staff',
            label: t('insurance'),
            email: 'insurance@VIARA.com',
            pass: import.meta.env.VITE_DEMO_PASSWORD || '',
            icon: ClipboardCheck,
            badge: t('claimsDesk'),
            desc: t('coverageVerificationClaimPreparationAndApproval'),
        },
        {
            role: 'HR',
            label: t('hr'),
            email: 'hr@VIARA.com',
            pass: import.meta.env.VITE_DEMO_PASSWORD || '',
            icon: Activity,
            badge: t('peopleOps'),
            desc: t('employeeRecordsAttendanceAndShiftsLeave'),
        },
        {
            role: 'Admin',
            label: t('administrator'),
            email: 'admin@VIARA.com',
            pass: import.meta.env.VITE_DEMO_PASSWORD || '',
            icon: ShieldCheck,
            badge: t('centerOperations'),
            desc: t('facilityOperationsRevenueCycleSecurityLogs'),
        },
        {
            role: 'Developer',
            label: t('developer'),
            email: 'developer@VIARA.com',
            pass: import.meta.env.VITE_DEMO_PASSWORD || '',
            icon: Terminal,
            badge: t('devSandbox'),
            desc: t('fullDebuggingSandboxApiMockSuites'),
        },
    ] : []), [t, isDemoMode]);

    const currentRoleMeta = useMemo(() => {
        return demoRoles.find((r) => r.role === selectedRole) || demoRoles[0] || null;
    }, [demoRoles, selectedRole]);

    // Production narrative used when the demo role matrix is absent.
    const paneNarrative = currentRoleMeta?.desc || (t('aCompleteDiagnosticImagingWorkspaceFrom'));

    const toggleTheme = () => {
        dispatch(setTheme(dark ? 'light' : 'dark'));
    };

    const toggleLanguage = async () => {
        const next = isRtl ? 'en' : 'ar';
        try {
            await i18n.changeLanguage(next);
        } catch {
            return;
        }
        dispatch(setLanguage(next));
        try {
            localStorage.setItem('VIARA_lang', next);
        } catch {
            // Optional preference persistence.
        }
    };

    const handleSelectRole = (roleItem) => {
        setSelectedRole(roleItem.role);
        setValue('email', roleItem.email);
        setValue('password', roleItem.pass);
    };

    // Auto-select role if passed in navigation state from Landing Page (dev demo only)
    useEffect(() => {
        if (!isDemoMode) return;
        if (location.state?.presetRole) {
            const match = demoRoles.find((r) => r.role.toLowerCase() === String(location.state.presetRole).toLowerCase());
            if (match) {
                setSelectedRole(match.role);
                setValue('email', match.email);
                setValue('password', match.pass);
            }
        }
    }, [location.state, demoRoles, setValue, isDemoMode]);

    const passkeySupport = getPasskeySupport();
    const isPasskeyLoading = isPasskeyPromptOpen || isPasskeyOptionsLoading || isPasskeyVerifyLoading;

    const completeAuthentication = (res, rememberMe) => {
        const token = res?.token || res?.data?.token;
        const user = res?.user || res?.data?.user;
        if (!token || !user) throw new Error('Invalid server authentication payload');
        dispatch(setCredentials({ token, user, rememberMe }));
        if (user.preferences) dispatch(updateAllPreferences(user.preferences));
        toast.success(isRtl ? `مرحباً بك مجدداً ${user.name || user.email}` : `Welcome back, ${user.name || user.email}`);
        const fallbackDestination = ROLE_DESTINATIONS[user.role || selectedRole] || '/dashboard';
        const destination = resolvePreferredStartPage({ user, preferences, fallback: fallbackDestination });
        navigate(location.state?.from?.pathname || destination, { replace: true });
    };

    const handlePasskeySignIn = async () => {
        const email = watchedEmail.trim().toLowerCase();
        if (!email || !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email)) {
            toast.error(t('enterAValidInstitutionalEmailFirst'));
            return;
        }
        if (!passkeySupport.supported) {
            toast.error(passkeySupport.reason === 'insecure'
                ? (t('passkeySignInRequiresASecure'))
                : (t('passkeysAreNotSupportedOnThis')));
            return;
        }
        setIsPasskeyPromptOpen(true);
        try {
            const ceremony = await getPasskeyOptions({ email }).unwrap();
            const response = await authenticateWithPasskey(ceremony.options);
            const result = await verifyPasskey({ ceremonyId: ceremony.ceremonyId, response }).unwrap();
            completeAuthentication(result);
        } catch (error) {
            const kind = getPasskeyErrorKind(error);
            const code = error?.data?.code;
            if (code === 'PASSKEY_ACCOUNT_MISMATCH') {
                toast.error(t('thisPasskeyBelongsToAnotherStaff'));
            } else if (kind !== 'cancelled') {
                toast.error(getErrorMessage(error, t('passkeyVerificationFailed')));
            }
        } finally {
            setIsPasskeyPromptOpen(false);
        }
    };

    const onSubmit = async (formData) => {
        try {
            dispatch(api.util.resetApiState());
            const res = await login({
                email: formData.email.trim().toLowerCase(),
                password: formData.password,
                rememberMe: formData.rememberMe,
            }).unwrap();

            completeAuthentication(res, formData.rememberMe);
        } catch (err) {
            const msg = getErrorMessage(err, t('loginFailedPleaseCheckYourCredentials'));
            toast.error(msg);
        }
    };

    const handleKeyDown = (e) => {
        if (e.getModifierState && e.getModifierState('CapsLock')) {
            setCapsLockActive(true);
        } else {
            setCapsLockActive(false);
        }
    };

    return (
        <main
            className={`viara-login-slide-os ${dark ? 'is-dark' : 'is-light'}`}
            dir={isRtl ? 'rtl' : 'ltr'}
            lang={isRtl ? 'ar' : 'en'}
        >
            {/* Integrated authentication workspace */}
            <motion.div
                className="viara-login-two-tone-card"
                initial={prefersReducedMotion ? false : { opacity: 0, y: 14, scale: 0.99 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
            >
                {/* Brand narrative and role-aware gateway */}
                <section className="viara-login-clay-pane" aria-label="Clinical Roles & System Trust">
                    <div className="viara-login-visual-copy">
                        <span className="viara-login-scene-label">
                            <KeyRound size={13} />
                            {t('roleAwareClinicalAccess')}
                        </span>
                        <h1>
                            <span>{t('yourClinicalWorkspace')}</span>
                            <strong>{t('readyFromSignIn')}</strong>
                        </h1>
                        <p>{paneNarrative}</p>
                    </div>

                    <motion.div
                        className="viara-login-illustration-stage"
                        initial={prefersReducedMotion ? false : { opacity: 0, x: isRtl ? -24 : 24, scale: 0.97 }}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        transition={{ duration: 0.72, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
                    >
                        <span className="viara-login-illustration-halo" aria-hidden="true" />
                        <img
                            src="/images/landing/viara-slide-gateway-vector-v3.png"
                            alt={t('clinicalProfessionalUsingTheSecureViara')}
                            width="1448"
                            height="1086"
                            loading="eager"
                            decoding="async"
                        />
                        <AnimatePresence mode="wait" initial={false}>
                            {currentRoleMeta && (
                                <motion.div
                                    key={currentRoleMeta.role}
                                    className="viara-login-active-role"
                                    initial={prefersReducedMotion ? false : { opacity: 0, y: 8 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -6 }}
                                    transition={{ duration: 0.24 }}
                                >
                                    {React.createElement(currentRoleMeta.icon, { size: 15 })}
                                    <span>
                                        <small>{t('selectedWorkspace')}</small>
                                        <strong>{currentRoleMeta.label}</strong>
                                    </span>
                                    <i>{currentRoleMeta.badge}</i>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>

                    {isDemoMode && (
                        <div className="viara-login-roles-box">
                            <span className="viara-roles-box-label">
                                <span>{t('demoAccessByRoleDevMode')}</span>
                            </span>
                            <div className="viara-role-pill-cluster">
                                {demoRoles.map((item) => {
                                    const Icon = item.icon;
                                    const isActive = selectedRole === item.role;
                                    return (
                                        <button
                                            key={item.role}
                                            type="button"
                                            className={`viara-role-pill-btn ${isActive ? 'is-active' : ''}`}
                                            onClick={() => handleSelectRole(item)}
                                        >
                                            <Icon size={12} />
                                            <span>{item.label}</span>
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    <div className="viara-login-trust-row">
                        <span className="viara-login-trust-item"><ShieldCheck size={12} className="viara-feature-pill-icon" /> HIPAA</span>
                        <span className="viara-login-trust-item"><Lock size={11} /> AES-256</span>
                        <span className="viara-login-trust-item"><Server size={11} /> DICOM 3.0</span>
                    </div>
                </section>

                {/* Focused sign-in form */}
                <section className="viara-login-form-pane" aria-label="Staff Sign In Form">
                    <div className="viara-login-brand-row">
                        <Link
                            to="/"
                            className="viara-login-brand-lockup"
                            aria-label={t('viaraReturnToHome')}
                        >
                            <span className="viara-login-brand-mark" aria-hidden="true">
                                <img
                                    src={VIARA_BRAND.iconUrl || '/logo.png'}
                                    alt=""
                                    width="32"
                                    height="32"
                                    loading="eager"
                                    decoding="async"
                                    onError={(event) => { event.currentTarget.src = VIARA_BRAND.logoUrl || '/logo.png'; }}
                                />
                            </span>
                            <span className="viara-login-brand-copy">
                                <strong>{VIARA_BRAND.name}</strong>
                                <small>{isRtl ? 'تقنية الرعاية الصحية' : VIARA_BRAND.descriptor}</small>
                            </span>
                        </Link>

                        <div className="viara-login-nav-actions">
                            <button
                                type="button"
                                className="viara-util-circle-btn"
                                onClick={toggleLanguage}
                                aria-label={isRtl ? 'Switch to English' : 'Switch to Arabic'}
                                title={t('switchToEnglish')}
                            >
                                <Languages size={13} />
                                <span className="viara-util-btn-lang-code" dir="ltr">{t('en')}</span>
                            </button>
                            <button
                                type="button"
                                className="viara-util-circle-btn"
                                onClick={toggleTheme}
                                aria-label={dark ? 'Light mode' : 'Dark mode'}
                                title={dark ? (t('lightMode')) : (t('darkMode'))}
                            >
                                {dark ? <Sun size={13} /> : <Moon size={13} />}
                            </button>
                            <Link to="/" className="viara-login-inline-back">
                                <ArrowLeft size={14} className={isRtl ? 'rotate-180' : ''} />
                                <span>{t('backToHome')}</span>
                            </Link>
                        </div>
                    </div>

                    <span className="viara-form-eyebrow">
                        <ShieldCheck size={12} />
                        <span>{t('authorizedStaffGateway')}</span>
                    </span>

                    <h2 className="viara-editorial-form-title">{t('staffSignIn')}</h2>
                    <p className="viara-editorial-form-sub">
                        {t('enterYourInstitutionalCredentialsToLaunch')}
                    </p>

                    <form onSubmit={handleSubmit(onSubmit)} className="viara-editorial-form" noValidate>
                        {/* Email Input */}
                        <div className="viara-form-group">
                            <div className="viara-form-label-row">
                                <label htmlFor="staff-email">{t('institutionalEmail')}</label>
                            </div>
                            <div className={`viara-pill-input-box ${errors.email ? 'has-error' : ''}`}>
                                <Mail size={15} className="viara-input-icon" />
                                <input
                                    id="staff-email"
                                    type="email"
                                    autoComplete="username"
                                    placeholder="doctor@VIARA.com"
                                    className="viara-pill-native-input"
                                    {...register('email', {
                                        required: t('emailIsRequired'),
                                        pattern: {
                                            value: /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i,
                                            message: t('invalidEmailAddress'),
                                        },
                                    })}
                                />
                                {watchedEmail && !errors.email && (
                                    <CheckCircle2 size={15} style={{ color: '#10B981', flexShrink: 0 }} />
                                )}
                            </div>
                            {errors.email && (
                                <p style={{ fontSize: '0.72rem', color: 'var(--viara-rose-500)', margin: '2px 0 0' }}>
                                    {errors.email.message}
                                </p>
                            )}

                        </div>

                        {/* Password Input */}
                        <div className="viara-form-group">
                            <div className="viara-form-label-row">
                                <label htmlFor="staff-password">{t('password')}</label>
                                {capsLockActive && (
                                    <span style={{ fontSize: '0.7rem', color: 'var(--viara-amber-500)', display: 'flex', alignItems: 'center', gap: 3 }}>
                                        <AlertCircle size={10} />
                                        {t('capsLockActive')}
                                    </span>
                                )}
                            </div>
                            <div className={`viara-pill-input-box ${errors.password ? 'has-error' : ''}`}>
                                <Lock size={15} className="viara-input-icon" />
                                <input
                                    id="staff-password"
                                    type={showPassword ? 'text' : 'password'}
                                    autoComplete="current-password"
                                    placeholder="••••••••••••"
                                    className="viara-pill-native-input"
                                    onKeyUp={handleKeyDown}
                                    onKeyDown={handleKeyDown}
                                    {...register('password', {
                                        required: t('passwordIsRequired'),
                                    })}
                                />
                                <button
                                    type="button"
                                    style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'grid', placeItems: 'center', padding: '2px' }}
                                    onClick={() => setShowPassword((p) => !p)}
                                    aria-label={showPassword ? 'Hide password' : 'Show password'}
                                >
                                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                                </button>
                            </div>
                            {errors.password && (
                                <p style={{ fontSize: '0.72rem', color: 'var(--viara-rose-500)', margin: '2px 0 0' }}>
                                    {errors.password.message}
                                </p>
                            )}

                        </div>

                        {/* Remember / Help Row */}
                        <div className="viara-form-helpers-row">
                            <label className="viara-remember-box">
                                <input type="checkbox" {...register('rememberMe')} />
                                <span>{t('rememberSession')}</span>
                            </label>

                            <button
                                type="button"
                                className="viara-help-btn"
                                onClick={() => setShowPasswordHelpModal(true)}
                            >
                                <HelpCircle size={12} />
                                <span>{t('needHelp')}</span>
                            </button>
                        </div>

                        {/* Submit Pill Button */}
                        <button
                            type="submit"
                            className="viara-submit-terracotta-btn"
                            disabled={isApiSubmitting || isPasskeyLoading}
                            aria-label={t('signInToClinicalConsole')}
                        >
                            {isApiSubmitting ? (
                                <span>{t('authenticating')}</span>
                            ) : (
                                <>
                                    <ShieldCheck size={16} />
                                    <span>{t('signInToClinicalWorkspace')}</span>
                                    <ArrowRight size={15} className={isRtl ? 'rotate-180' : ''} />
                                </>
                            )}
                        </button>
                    </form>

                    <div className="viara-auth-divider" aria-hidden="true">
                        <span>{t('or')}</span>
                    </div>

                    <button
                        type="button"
                        className="viara-passkey-pill-btn"
                        onClick={handlePasskeySignIn}
                        disabled={isPasskeyLoading || isApiSubmitting || !passkeySupport.supported}
                    >
                        <Fingerprint size={17} />
                        <span>
                            {isPasskeyLoading
                                ? (t('verifyingBiometrics'))
                                : (t('continueWithPasskey'))}
                        </span>
                    </button>

                </section>
            </motion.div>

            {/* Help / Password Recovery Modal */}
            <AnimatePresence>
                {showPasswordHelpModal && (
                    <motion.div
                        className="viara-cmd-backdrop"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onMouseDown={() => setShowPasswordHelpModal(false)}
                    >
                        <motion.div
                            role="dialog"
                            aria-modal="true"
                            aria-label="Clinical Support"
                            className="viara-help-modal-card"
                            initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.95, y: -12 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -12 }}
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            <div className="viara-modal-header">
                                <div className="viara-modal-title">
                                    <ShieldCheck size={18} className="viara-feature-pill-icon" />
                                    <span>{t('clinicalItAccessSupport')}</span>
                                </div>
                                <button
                                    type="button"
                                    className="viara-util-circle-btn"
                                    onClick={() => setShowPasswordHelpModal(false)}
                                    style={{ width: 28, height: 28 }}
                                >
                                    <X size={14} />
                                </button>
                            </div>

                            <p style={{ fontSize: '0.84rem', color: 'var(--text-body)', lineHeight: 1.55 }}>
                                {t('inComplianceWithMedicalDataSecurity')}
                            </p>

                            <div className="viara-support-box">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    <strong style={{ fontSize: '0.82rem', color: 'var(--text-headline)' }}>
                                        {t('radiologyItHelpdesk')}
                                    </strong>
                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                        {helpdeskEmail}{helpdeskPhone ? ` | ${helpdeskPhone}` : ''}
                                    </span>
                                </div>
                                <span className="viara-pill-badge">24/7 STAT</span>
                            </div>
                        </motion.div>
                    </motion.div>
                )}
            </AnimatePresence>
        </main>
    );
}
