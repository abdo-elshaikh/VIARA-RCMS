import React, { Suspense, useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { selectCurrentToken, selectCurrentUser, selectIsAuthenticated, rehydrateUser, logOut, setAccessToken, permissionsUpdated } from './store/authSlice';
import ErrorBoundary from './components/ErrorBoundary';
import { api, rehydrateSession, useGetPreferencesQuery } from './store/api';
import Modal from './components/ui/Modal';
import { DEFAULT_PREFERENCES, selectPreferences, updateAllPreferences } from './store/preferencesSlice';
import { getRouteRoles } from './config/routes';
import {
    getDoctorPortalDashboardUrl,
    getDoctorPortalHomeUrl,
    getDoctorPortalLoginUrl,
    getPatientPortalDashboardUrl,
    getPatientPortalHomeUrl,
    getPatientPortalLoginUrl,
} from './utils/portalUrls';
import { VIARA_BRAND } from './config/brand';
import { applyThemePalette, resolveBrandColor } from './utils/themePalette';
import { getEffectiveSessionTimeout, getSessionTimeoutSchedule } from './utils/sessionTimeout';
import { checkBackendHealth } from './utils/backendHealth';
import { isOnboardingComplete } from './utils/onboardingState';
import { lazyWithRetry } from './utils/lazyWithRetry';
import AppLayout from './components/dashboard/AppLayout';
import FeatureLocked from './components/FeatureLocked';
import { useLicense, featureAllowed } from './hooks/useLicense';
import Offline from './pages/Offline';
import ToastHub from './components/ui/ToastHub';

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const getCsrfToken = () => {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
};

// Lazy-loaded pages for code splitting with retry resilience
const Login = lazyWithRetry(() => import('./pages/Login'), 'Login');
const Help = lazyWithRetry(() => import('./pages/Help'), 'Help');
const DashboardHome = lazyWithRetry(() => import('./pages/DashboardHome'), 'DashboardHome');
const Admin = lazyWithRetry(() => import('./pages/Admin'), 'Admin');
const Users = lazyWithRetry(() => import('./pages/Users'), 'Users');
const UserDetailPage = lazyWithRetry(() => import('./pages/UserDetailPage'), 'UserDetailPage');
const UserActivityTracking = lazyWithRetry(() => import('./pages/UserActivityTracking'), 'UserActivityTracking');
const Financials = lazyWithRetry(() => import('./pages/Financials'), 'Financials');
const Payroll = lazyWithRetry(() => import('./pages/Payroll'), 'Payroll');
const Insurance = lazyWithRetry(() => import('./pages/Insurance'), 'Insurance');
const Worklist = lazyWithRetry(() => import('./pages/Worklist'), 'Worklist');
const ReportEditorPage = lazyWithRetry(() => import('./pages/ReportEditorPage'), 'ReportEditorPage');
const PacsViewer = lazyWithRetry(() => import('./pages/PacsViewer'), 'PacsViewer');
const PacsReconciliation = lazyWithRetry(() => import('./pages/PacsReconciliation'), 'PacsReconciliation');
const Reception = lazyWithRetry(() => import('./pages/Reception'), 'Reception');
const Patients = lazyWithRetry(() => import('./pages/Patients'), 'Patients');
const PatientDetailPage = lazyWithRetry(() => import('./pages/PatientDetailPage'), 'PatientDetailPage');
const ReferringDoctors = lazyWithRetry(() => import('./pages/ReferringDoctors'), 'ReferringDoctors');
const DoctorDetailPage = lazyWithRetry(() => import('./pages/DoctorDetailPage'), 'DoctorDetailPage');
const Appointments = lazyWithRetry(() => import('./pages/Appointments'), 'Appointments');
const BookAppointment = lazyWithRetry(() => import('./pages/BookAppointment'), 'BookAppointment');
const HR = lazyWithRetry(() => import('./pages/HR'), 'HR');
const Marketing = lazyWithRetry(() => import('./pages/Marketing'), 'Marketing');
const AnalyticsDashboard = lazyWithRetry(() => import('./pages/AnalyticsDashboard'), 'AnalyticsDashboard');
const ReferralAnalytics = lazyWithRetry(() => import('./pages/ReferralAnalytics'), 'ReferralAnalytics');

const Modality = lazyWithRetry(() => import('./pages/Modality'), 'Modality');
const Nurse = lazyWithRetry(() => import('./pages/Nurse'), 'Nurse');
const Inventory = lazyWithRetry(() => import('./pages/Inventory'), 'Inventory');
const Equipment = lazyWithRetry(() => import('./pages/Equipment'), 'Equipment');
const Unauthorized = lazyWithRetry(() => import('./pages/Unauthorized'), 'Unauthorized');
const NotFound = lazyWithRetry(() => import('./pages/NotFound'), 'NotFound');
const Settings = lazyWithRetry(() => import('./pages/Settings'), 'Settings');
const Profile = lazyWithRetry(() => import('./pages/Profile'), 'Profile');
const Notifications = lazyWithRetry(() => import('./pages/Notifications'), 'Notifications');
const PendingRequests = lazyWithRetry(() => import('./pages/PendingRequests'), 'PendingRequests');
const Landing = lazyWithRetry(() => import('./pages/Landing'), 'Landing');
const DisplayBoard = lazyWithRetry(() => import('./pages/DisplayBoard'), 'DisplayBoard');
const DisplayBoardControl = lazyWithRetry(() => import('./pages/DisplayBoardControl'), 'DisplayBoardControl');
const CommunicationCenter = lazyWithRetry(() => import('./components/communications/CommunicationCenter'), 'CommunicationCenter');
const CaseReports = lazyWithRetry(() => import('./pages/CaseReports'), 'CaseReports');
const CaseDetailsPage = lazyWithRetry(() => import('./pages/CaseDetailsPage'), 'CaseDetailsPage');
const EndOfDayReview = lazyWithRetry(() => import('./pages/EndOfDayReview'), 'EndOfDayReview');
const Onboarding = lazyWithRetry(() => import('./pages/Onboarding'), 'Onboarding');

const PrintSticker = lazyWithRetry(() => import('./components/print/PrintSticker'), 'PrintSticker');
const PrintReceipt = lazyWithRetry(() => import('./components/print/PrintReceipt'), 'PrintReceipt');
const PrintBookingSlip = lazyWithRetry(() => import('./components/print/PrintBookingSlip'), 'PrintBookingSlip');
const PrintInvoice = lazyWithRetry(() => import('./components/print/PrintInvoice'), 'PrintInvoice');

// Loading component for Suspense
const PageLoader = () => {
    const { t } = useTranslation('common');
    return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--VIARA-canvas)]">
            <div className="text-center">
                <div className="inline-block h-10 w-10 animate-spin rounded-full border-[3px] border-solid border-cyan-700 border-e-transparent"></div>
                <p className="mt-4 text-sm font-medium text-slate-500">{t('status.loading')}</p>
            </div>
        </div>
    );
};

const ExternalRedirect = ({ to }) => {
    useEffect(() => {
        window.location.replace(to);
    }, [to]);

    return <PageLoader />;
};

const timeToMinutes = (value, fallback) => {
    const source = String(value || fallback || '00:00');
    const [hours, minutes] = source.split(':').map((part) => Number(part));
    if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return 0;
    return (hours * 60) + minutes;
};

const isWithinQuietHours = (preferences) => {
    if (!preferences?.notificationQuietHours) return false;

    const now = new Date();
    const current = (now.getHours() * 60) + now.getMinutes();
    const start = timeToMinutes(preferences.notificationQuietStart, '22:00');
    const end = timeToMinutes(preferences.notificationQuietEnd, '07:00');

    if (start === end) return true;
    if (start < end) return current >= start && current < end;
    return current >= start || current < end;
};

const showDesktopNotification = ({ title, body, tag, preferences, critical = false }) => {
    if (typeof window === 'undefined' || !('Notification' in window)) return;
    if (!preferences?.desktopNotifications || Notification.permission !== 'granted') return;
    if (isWithinQuietHours(preferences) && !(critical && preferences.criticalNotificationBypass)) return;

    try {
        const notification = new Notification(title, { body, tag, silent: false });
        notification.onclick = () => {
            window.focus();
            notification.close();
        };
    } catch {
        // Browser notification failures should not interrupt realtime updates.
    }
};

const ProtectedRoute = ({ children, allowedRoles = [] }) => {
    const user = useSelector(selectCurrentUser);
    const isAuthenticated = useSelector(selectIsAuthenticated);
    const location = useLocation();

    // Check authentication
    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    // Force password change on first login
    if (user?.mustChangePassword && location.pathname !== '/profile') {
        return <Navigate to="/profile?section=security" replace />;
    }

    // Check role permission if allowedRoles is specified
    const developerCanEnterAdminArea = user?.role === 'Developer' && allowedRoles.includes('Admin');
    if (allowedRoles.length > 0 && user && !allowedRoles.includes(user.role) && !developerCanEnterAdminArea) {
        return <Navigate to="/unauthorized" state={{ from: location }} replace />;
    }

    return children;
};

const LicenseGate = ({ feature, children }) => {
    const { allowedModules, loading } = useLicense();
    if (loading) {
        return children;
    }
    if (feature && !featureAllowed(allowedModules, feature)) {
        return <FeatureLocked feature={feature} />;
    }
    return children;
};

const RoleAwareDashboard = () => {
    const user = useSelector(selectCurrentUser);
    // First run on a fresh install: send new operators through the setup
    // wizard before the empty dashboard. The marker is written by the wizard
    // on finish (or skip), so this only ever fires once per browser.
    if (!isOnboardingComplete()) {
        return <Navigate to="/onboarding" replace />;
    }
    return user?.role === 'Marketing' ? <Marketing /> : <DashboardHome />;
};

const RoleAwareAnalytics = () => {
    const user = useSelector(selectCurrentUser);
    return user?.role === 'Marketing' ? <ReferralAnalytics /> : <AnalyticsDashboard />;
};

const ConnectivityWatcher = () => {
    const navigate = useNavigate();
    const checkingRef = useRef(false);
    const navigateRef = useRef(navigate);
    navigateRef.current = navigate;
    const location = useLocation();

    useEffect(() => {
        if (location.pathname !== '/offline') {
            sessionStorage.setItem('lastOnlinePath', `${location.pathname}${location.search}${location.hash}`);
        }
    }, [location]);

    useEffect(() => {
        let mounted = true;
        const goOffline = (reason) => {
            const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
            // Public pages keep their content and form inputs; their inline notice reports availability.
            if (['/', '/landing', '/login'].includes(window.location.pathname)) return;
            // If the user is on an active workspace route, keep them in place so their in-progress inputs,
            // open drawers, and reports are not destroyed; AppLayout's NetworkStatusBanner notifies them non-destructively.
            const isPublicRoute = ['/', '/landing', '/login', '/onboarding', '/offline'].includes(window.location.pathname);
            if (!isPublicRoute) {
                return;
            }
            if (window.location.pathname !== '/offline') {
                navigateRef.current(`/offline?reason=${reason}`, {
                    replace: true,
                    state: { from: currentPath }
                });
            }
        };

        const checkAvailability = async () => {
            if (checkingRef.current || !mounted) return;
            checkingRef.current = true;
            try {
                const result = await checkBackendHealth();
                if (!mounted) return;
                window.dispatchEvent(new CustomEvent('VIARA_PUBLIC_CONNECTION', { detail: { available: result.backendAvailable } }));
                if (!result.online) {
                    goOffline('network');
                    return;
                }
                if (!result.backendAvailable) {
                    goOffline('backend');
                    return;
                }
                if (window.location.pathname === '/offline') {
                    const returnPath = window.history.state?.usr?.from
                        || sessionStorage.getItem('lastOnlinePath')
                        || '/dashboard';
                    navigateRef.current(returnPath, { replace: true });
                }
            } finally {
                checkingRef.current = false;
            }
        };

        const handleOffline = () => goOffline('network');
        const handleOnline = () => { void checkAvailability(); };
        const initialCheck = window.setTimeout(() => { void checkAvailability(); }, 1200);
        const healthInterval = window.setInterval(() => {
            if (!document.hidden) void checkAvailability();
        }, 20000);

        window.addEventListener('offline', handleOffline);
        window.addEventListener('online', handleOnline);
        if (!navigator.onLine) handleOffline();

        return () => {
            mounted = false;
            window.clearTimeout(initialCheck);
            window.clearInterval(healthInterval);
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('online', handleOnline);
        };
    }, []);

    return null;
};

const SessionTimeout = ({ t }) => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const location = useLocation();
    const isAuthenticated = useSelector(selectIsAuthenticated);
    const preferences = useSelector(selectPreferences);
    const [showWarning, setShowWarning] = useState(false);
    const [isExtending, setIsExtending] = useState(false);
    const [timerGeneration, setTimerGeneration] = useState(0);
    const warningTimerRef = useRef(null);
    const expiryTimerRef = useRef(null);
    const warningOpenRef = useRef(false);

    useEffect(() => {
        warningOpenRef.current = showWarning;
    }, [showWarning]);

    useEffect(() => {
        const effectiveTimeout = getEffectiveSessionTimeout(
            preferences?.sessionTimeout,
            preferences?.organizationSessionTimeout
        );
        const scheduleConfig = getSessionTimeoutSchedule(effectiveTimeout, DEFAULT_PREFERENCES.sessionTimeout);

        if (!isAuthenticated || !scheduleConfig) {
            setShowWarning(false);
            return undefined;
        }

        const { expiryMs, warningMs } = scheduleConfig;
        const clearTimers = () => {
            window.clearTimeout(warningTimerRef.current);
            window.clearTimeout(expiryTimerRef.current);
        };
        const expire = async () => {
            const from = `${location.pathname}${location.search}${location.hash}`;
            sessionStorage.setItem('VIARA-return-path', from);
            try {
                await dispatch(api.endpoints.logout.initiate()).unwrap();
            } catch {
                // Local sign-out must still complete when the session is already unavailable.
            }
            dispatch(logOut());
            navigate('/login', { replace: true, state: { from } });
            toast.error(t('session.expired'));
        };
        const schedule = () => {
            clearTimers();
            setShowWarning(false);
            warningTimerRef.current = window.setTimeout(() => setShowWarning(true), warningMs);
            expiryTimerRef.current = window.setTimeout(expire, expiryMs);
        };
        let lastActivityTime = 0;
        const handleActivity = () => {
            const now = Date.now();
            if (now - lastActivityTime < 10000) return;
            lastActivityTime = now;
            if (!warningOpenRef.current) schedule();
        };

        schedule();
        const events = ['mousedown', 'keypress', 'scroll', 'touchstart'];
        events.forEach((event) => document.addEventListener(event, handleActivity, { passive: true }));
        return () => {
            clearTimers();
            events.forEach((event) => document.removeEventListener(event, handleActivity));
        };
    }, [dispatch, isAuthenticated, location.hash, location.pathname, location.search, navigate, preferences?.organizationSessionTimeout, preferences?.sessionTimeout, t, timerGeneration]);

    const extendSession = async () => {
        setIsExtending(true);
        try {
            const result = await dispatch(api.endpoints.refreshSession.initiate()).unwrap();
            if (result?.token) dispatch(setAccessToken(result.token));
            setShowWarning(false);
            setTimerGeneration((value) => value + 1);
        } catch (error) {
            toast.error(t('session.extendFailed'));
        } finally {
            setIsExtending(false);
        }
    };

    return (
        <Modal isOpen={showWarning} onClose={extendSession} title={t('session.warningTitle')} size="sm">
            <div className="space-y-4">
                <p className="text-sm leading-6 text-slate-600 dark:text-slate-300" role="status">{t('session.warningMessage')}</p>
                <div className="flex justify-end gap-3">
                    <button type="button" onClick={extendSession} disabled={isExtending} className="ds-button ds-button-primary ds-button-md font-bold">
                        {isExtending ? t('status.updating') : t('session.staySignedIn')}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

const App = () => {
    const dispatch = useDispatch();
    const { t, i18n } = useTranslation('common');
    const isAuthenticated = useSelector(selectIsAuthenticated);
    const currentUser = useSelector(selectCurrentUser);
    const preferences = useSelector((state) => state.preferences);
    const [isRehydrated, setIsRehydrated] = useState(false);
    const [permissionsHydrated, setPermissionsHydrated] = useState(false);

    // Backfill effective permissions for sessions that were restored without
    // a permission list (e.g. legacy persisted users), so route/nav permission
    // gates operate on real data instead of failing open forever.
    useEffect(() => {
        if (!isAuthenticated) {
            setPermissionsHydrated(false);
            return undefined;
        }
        if (permissionsHydrated) return undefined;
        setPermissionsHydrated(true);
        if (!api.endpoints?.getMyPermissions?.initiate) return undefined;
        let cancelled = false;
        const result = dispatch(api.endpoints.getMyPermissions.initiate(undefined));
        Promise.resolve(typeof result?.unwrap === 'function' ? result.unwrap() : result)
            .then((data) => {
                if (!cancelled && Array.isArray(data?.permissions)) {
                    dispatch(permissionsUpdated(data.permissions));
                }
        })
            .catch(() => {});
        return () => { cancelled = true; };
    }, [dispatch, isAuthenticated, permissionsHydrated]);

    // Apply global UI preferences
    useEffect(() => {
        if (!preferences) return;
        const root = document.documentElement;
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
        const mergedPreferences = { ...DEFAULT_PREFERENCES, ...preferences };

        const applyTheme = () => {
            const dark = mergedPreferences.theme === 'dark' || (mergedPreferences.theme === 'system' && systemTheme.matches);
            root.classList.toggle('dark', dark);
            root.dataset.resolvedTheme = dark ? 'dark' : 'light';
            root.dataset.theme = dark ? 'dark' : 'light';
            root.style.colorScheme = dark ? 'dark' : 'light';
            applyThemePalette(root, {
                brandColor: resolveBrandColor(mergedPreferences),
                mode: dark ? 'dark' : 'light',
                colorOverrides: mergedPreferences.colorOverrides,
            });
        };
        applyTheme();
        systemTheme.addEventListener?.('change', applyTheme);

        root.classList.toggle('density-compact', mergedPreferences.density === 'compact');
        root.classList.toggle('density-spacious', mergedPreferences.density === 'spacious');
        root.classList.toggle('motion-reduced', mergedPreferences.motion === 'reduced');
        root.classList.toggle('high-contrast', Boolean(mergedPreferences.highContrast));
        root.classList.toggle('settings-sidebar-compact', Boolean(mergedPreferences.compactSidebar));
        root.dataset.density = mergedPreferences.density;
        root.dataset.fontScale = mergedPreferences.fontScale;
        root.dataset.fontFamily = mergedPreferences.fontFamily;
        root.dataset.borderRadius = mergedPreferences.borderRadius;
        root.setAttribute('data-primary-color', mergedPreferences.primaryColor);
        return () => systemTheme.removeEventListener?.('change', applyTheme);
    }, [preferences]);

    useEffect(() => {
        const displayLanguage = window.location.pathname === '/display'
            ? new URLSearchParams(window.location.search).get('lang')
            : null;
        const language = ['ar', 'en'].includes(displayLanguage)
            ? displayLanguage
            : preferences?.language;
        if (!language) return;
        const activeLanguage = (i18n.resolvedLanguage || i18n.language || 'en').split('-')[0];
        if (language !== activeLanguage) {
            i18n.changeLanguage(language);
        }
    }, [i18n, preferences?.language]);

    // Rehydrate the in-memory access token from the HttpOnly refresh cookie.
    useEffect(() => {
        let active = true;

        dispatch(rehydrateSession())
            .then((token) => {
                if (active) dispatch(rehydrateUser(token));
            })
            .catch(() => {
                if (active) dispatch(logOut());
            })
            .finally(() => {
                if (active) setIsRehydrated(true);
            });

        return () => {
            active = false;
        };
    }, [dispatch]);

    // Fetch preferences from backend if authenticated
    const { data: serverPreferences } = useGetPreferencesQuery(undefined, {
        skip: !isAuthenticated,
    });

    useEffect(() => {
        if (serverPreferences && Object.keys(serverPreferences).length > 0) {
            dispatch(updateAllPreferences(serverPreferences));
        }
    }, [serverPreferences, dispatch]);

    const currentToken = useSelector(selectCurrentToken);
    const currentUserId = currentUser?.user_id || currentUser?.userId;
    const currentUserIdRef = useRef(currentUserId);
    const preferencesRef = useRef(preferences);

    useEffect(() => {
        currentUserIdRef.current = currentUserId;
    }, [currentUserId]);

    useEffect(() => {
        preferencesRef.current = preferences;
    }, [preferences]);

    // Global Real-time SSE Connection
    useEffect(() => {
        if (!isAuthenticated) return;

        const token = currentToken;
        if (!token) return;

        let eventSource;
        let isCancelled = false;
        let reconnectTimer;
        let reconnectAttempt = 0;
        let logoutTimer;

        const scheduleReconnect = () => {
            if (isCancelled || reconnectTimer) return;
            const delay = Math.min(30000, 1000 * (2 ** reconnectAttempt));
            reconnectAttempt += 1;
            reconnectTimer = window.setTimeout(() => {
                reconnectTimer = undefined;
                connect();
            }, delay);
        };

        // Every reconnect exchanges the access token for a new single-use SSE token.
        const connect = () => {
            if (isCancelled) return;
            const csrfToken = getCsrfToken();
            fetch(`${API_BASE_URL}/realtime/session`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Authorization': `Bearer ${token}`,
                ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
            }
            })
            .then(res => {
                if (!res.ok) throw new Error(`SSE session request failed (${res.status})`);
                return res.json();
            })
            .then(sseSession => {
                if (isCancelled || !sseSession?.token) return;
                const source = new EventSource(`${API_BASE_URL}/realtime/stream?token=${encodeURIComponent(sseSession.token)}`);
                eventSource = source;

                source.onmessage = (event) => {
                    try {
                        const parsed = JSON.parse(event.data);

                        if (parsed.type === 'PING') return;
                        if (parsed.type === 'CONNECTED') {
                            reconnectAttempt = 0;
                            toast.dismiss('sse-disconnected');
                            window.dispatchEvent(new CustomEvent('SSE_CONNECTION_STATUS', { detail: { connected: true } }));
                            return;
                        }

                        const { event: sseEvent, data } = parsed;
                        const notificationPreferences = preferencesRef.current || {};
                        const activeUserId = currentUserIdRef.current;

                        if (sseEvent === 'FORCE_LOGOUT') {
                            const countdownSeconds = Math.max(0, Number(data?.logoutInSeconds) || 10);
                            const deadline = Date.now() + countdownSeconds * 1000;
                            const noticeId = `force-logout-${activeUserId || 'current'}`;
                            window.dispatchEvent(new CustomEvent('VIARA_FORCE_LOGOUT_WARNING', {
                                detail: { message: data?.message, deadline }
                            }));
                            toast.error(`${data?.message || t('auth.forceLogout', 'This account was opened on another device. You will be signed out in')} ${countdownSeconds} ${t('auth.seconds', 'seconds')}.`, {
                                id: noticeId,
                                duration: countdownSeconds * 1000
                            });
                            const showCountdown = () => {
                                if (isCancelled) return;
                                const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
                                if (remaining <= 0) {
                                    toast.dismiss(noticeId);
                                    dispatch(api.util.resetApiState());
                                    dispatch(logOut());
                                    toast.error(t('auth.forceLogoutComplete', 'You have been signed out because this account was opened on another device.'), { duration: 7000 });
                                    return;
                                }
                                logoutTimer = window.setTimeout(showCountdown, 1000);
                            };
                            showCountdown();
                            return;
                        }

                        if (sseEvent === 'PERMISSIONS_CHANGED') {
                            // An RBAC policy change just landed. Invalidate cached
                            // RBAC data and live-sync this user's effective
                            // permissions so nav/pages update without re-login.
                            dispatch(api.util.invalidateTags(['RBAC']));
                            if (api.endpoints?.getMyPermissions?.initiate) {
                                const result = dispatch(api.endpoints.getMyPermissions.initiate(undefined));
                                Promise.resolve(typeof result?.unwrap === 'function' ? result.unwrap() : result)
                                    .then((data) => {
                                        if (Array.isArray(data?.permissions)) {
                                            dispatch(permissionsUpdated(data.permissions));
                                        }
                                    })
                                    .catch(() => {});
                            }
                            return;
                        }

                        if (sseEvent === 'NEW_NOTIFICATION') {
                            // Re-fetch the personal inbox so visibility and read state are
                            // resolved by the server rather than guessed from the event.
                            dispatch(api.util.invalidateTags(['Notifications']));
                            const critical = data.priority === 'Critical' || data.status === 'Failed' || /critical|urgent|failed|safety/i.test(`${data.event_type || ''} ${data.subject || ''}`);
                            const quiet = isWithinQuietHours(notificationPreferences);
                            if (!quiet || (critical && notificationPreferences.criticalNotificationBypass)) {
                                toast.success(notificationPreferences?.desktopNotificationPreview
                                    ? (data.content || data.subject || 'New notification received')
                                    : 'New notification received', {
                                    duration: 5000
                                });
                            }
                            if (notificationPreferences?.desktopSystemNotifications !== false) {
                                showDesktopNotification({
                                    title: notificationPreferences?.desktopNotificationPreview
                                        ? (data.subject || `${VIARA_BRAND.name} notification`)
                                        : `${VIARA_BRAND.name} notification`,
                                    body: notificationPreferences?.desktopNotificationPreview
                                        ? (data.content || data.event_type || 'New system notification received')
                                        : 'New system notification received',
                                    tag: `VIARA-notification-${data.notification_id || Date.now()}`,
                                    preferences: notificationPreferences,
                                    critical
                                });
                            }
                        } else if (sseEvent === 'NOTIFICATION_LOG_UPDATE') {
                            dispatch(api.util.invalidateTags(['Notifications', 'NotificationJobs']));
                        } else if (
                            sseEvent === 'NEW_STAFF_MESSAGE' ||
                            sseEvent === 'NEW_PATIENT_MESSAGE_ALERT' ||
                            sseEvent === 'NEW_PATIENT_MESSAGE_UPDATE' ||
                            sseEvent === 'NEW_DOCTOR_MESSAGE_ALERT' ||
                            sseEvent === 'NEW_DOCTOR_MESSAGE_UPDATE' ||
                            sseEvent === 'STAFF_MESSAGES_READ' ||
                            sseEvent === 'USER_PRESENCE'
                        ) {
                            if (sseEvent === 'USER_PRESENCE') {
                                // Online/offline changes only refresh the users
                                // list — no toasts, no message refetch churn.
                                dispatch(api.util.invalidateTags(['StaffUsers']));
                                window.dispatchEvent(new CustomEvent('SSE_REALTIME_MESSAGE', { detail: { event: sseEvent, data } }));
                                return;
                            }
                            dispatch(api.util.invalidateTags([
                                'ChatMessages', 'StaffUsers', 'PatientConversations', 'DoctorConversations', 'ChatUnread'
                            ]));

                            window.dispatchEvent(new CustomEvent('SSE_REALTIME_MESSAGE', { detail: { event: sseEvent, data } }));

                            const isIncoming = sseEvent === 'NEW_PATIENT_MESSAGE_ALERT' ||
                                sseEvent === 'NEW_DOCTOR_MESSAGE_ALERT' ||
                                (sseEvent === 'NEW_STAFF_MESSAGE' && String(data.sender_id) !== String(activeUserId));

                            if (isIncoming) {
                                const quiet = isWithinQuietHours(notificationPreferences);
                                const critical = /urgent|critical|safety/i.test(`${data.subject || ''} ${data.body || ''}`);
                                if (!quiet || (critical && notificationPreferences.criticalNotificationBypass)) {
                                    toast(notificationPreferences?.desktopNotificationPreview
                                        ? (data.body || 'New message received')
                                        : 'New message received', {
                                        duration: 4000
                                    });
                                }
                                if (notificationPreferences?.desktopMessageNotifications !== false) {
                                    const title = sseEvent.includes('PATIENT')
                                        ? 'New patient message'
                                        : sseEvent.includes('DOCTOR')
                                            ? 'New doctor inquiry'
                                            : data.sender_name || 'New staff message';
                                    showDesktopNotification({
                                        title,
                                        body: notificationPreferences?.desktopNotificationPreview
                                            ? (data.body || 'New message received')
                                            : 'New message received',
                                        tag: `VIARA-message-${data.message_id || Date.now()}`,
                                        preferences: notificationPreferences
                                    });
                                }
                            }
                        } else if (
                            sseEvent === 'NEW_CHAT_CHANNEL' ||
                            sseEvent === 'CHAT_CHANNEL_UPDATED' ||
                            sseEvent === 'CHAT_CHANNEL_DELETED' ||
                            sseEvent === 'CHANNEL_MEMBERS_UPDATED'
                        ) {
                            dispatch(api.util.invalidateTags(['ChatChannels', 'ChatMessages']));
                        } else if (
                            sseEvent === 'CLINICAL_TASK_CLAIMED' ||
                            sseEvent === 'CLINICAL_TASK_ASSIGNED' ||
                            sseEvent === 'CLINICAL_TASK_RELEASED' ||
                            sseEvent === 'CLINICAL_TASK_COMPLETED' ||
                            sseEvent === 'CLINICAL_TASK_UPDATED' ||
                            sseEvent === 'RECEPTION_TASK_CLAIMED' ||
                            sseEvent === 'RECEPTION_TASK_RELEASED' ||
                            sseEvent === 'RECEPTION_TASK_TRANSFERRED' ||
                            sseEvent === 'RECEPTION_TASK_COMPLETED' ||
                            sseEvent === 'RECEPTION_WORK_ITEM_UPDATED' ||
                            sseEvent === 'QUEUE_UPDATED' ||
                            sseEvent === 'QUEUE_TRANSITION'
                        ) {
                            dispatch(api.util.invalidateTags(['Queue', 'Appointments', 'Dashboard', 'CaseReports', 'ReceptionTasks', 'DisplayBoard']));
                            window.dispatchEvent(new CustomEvent('SSE_RECEPTION_UPDATE', { detail: { event: sseEvent, data } }));
                        }
                    } catch (err) {
                        console.error('Failed to parse SSE payload', err);
                    }
                };

                source.onerror = (error) => {
                    console.error('SSE connection error:', error);
                    if (isCancelled) return;
                    window.dispatchEvent(new CustomEvent('SSE_CONNECTION_STATUS', { detail: { connected: false } }));
                    source.close();
                    if (eventSource === source) eventSource = undefined;
                    toast.error(t('sse.disconnected', 'Live updates disconnected. Attempting to reconnect...'), {
                        id: 'sse-disconnected',
                    });
                    scheduleReconnect();
                };
            })
            .catch(err => {
                if (isCancelled) return;
                window.dispatchEvent(new CustomEvent('SSE_CONNECTION_STATUS', { detail: { connected: false } }));
                console.error('Failed to establish SSE session', err);
                toast.error(t('sse.disconnected', 'Live updates disconnected. Attempting to reconnect...'), {
                    id: 'sse-disconnected',
                });
                scheduleReconnect();
            });
        };

        connect();

        return () => {
            isCancelled = true;
            if (logoutTimer) window.clearTimeout(logoutTimer);
            window.dispatchEvent(new CustomEvent('SSE_CONNECTION_STATUS', { detail: { connected: false } }));
            if (reconnectTimer) window.clearTimeout(reconnectTimer);
            if (eventSource) {
                eventSource.close();
            }
        };
    }, [isAuthenticated, currentToken, dispatch, t]);

    if (!isRehydrated) return <PageLoader />;

    return (
        <ErrorBoundary>
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <ConnectivityWatcher />
                <SessionTimeout t={t} />
                <Toaster
                    position="top-center"
                    reverseOrder={false}
                    toastOptions={{
                        duration: 4000,
                        style: {
                            background: 'var(--VIARA-surface)',
                            color: 'var(--VIARA-ink)',
                            border: '1px solid var(--VIARA-line)',
                            boxShadow: '0 18px 45px -16px rgba(15, 23, 42, 0.28)',
                            borderRadius: 'var(--VIARA-radius-surface)',
                            padding: 'var(--VIARA-density-card-padding)',
                            fontFamily: 'var(--VIARA-font-family)',
                            fontSize: '0.875rem',
                            fontWeight: '600',
                            maxWidth: '420px',
                        },
                        success: {
                            iconTheme: {
                                primary: 'var(--VIARA-success)',
                                secondary: 'var(--VIARA-success-soft)',
                            },
                        },
                        error: {
                            duration: 6000,
                            iconTheme: {
                                primary: 'var(--VIARA-danger)',
                                secondary: 'var(--VIARA-danger-soft)',
                            },
                        },
                    }}
                />
                <ToastHub position="bottom-end" />

                <Suspense fallback={<PageLoader />}>
                    <Routes>
                        {/* Public Routes */}
                        <Route path="/login" element={<Login />} />
                        <Route path="/portal" element={<ExternalRedirect to={getPatientPortalHomeUrl()} />} />
                        <Route path="/portal/login" element={<ExternalRedirect to={getPatientPortalLoginUrl()} />} />
                        <Route path="/doctor-portal" element={<ExternalRedirect to={getDoctorPortalHomeUrl()} />} />
                        <Route path="/doctor-portal/login" element={<ExternalRedirect to={getDoctorPortalLoginUrl()} />} />
                        <Route path="/unauthorized" element={<Unauthorized />} />
                        <Route path="/onboarding" element={<Onboarding />} />
                        <Route path="/offline" element={<Offline />} />
                        {/* Public waiting-room display board for external TV screens */}
                        <Route path="/display" element={<DisplayBoard />} />

                        <Route path="/print/sticker/:id" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/print/sticker/:id')}>
                                <PrintSticker />
                            </ProtectedRoute>
                        } />
                        <Route path="/print/receipt/:id" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/print/receipt/:id')}>
                                <PrintReceipt />
                            </ProtectedRoute>
                        } />
                        <Route path="/print/booking-slip/:id" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/print/booking-slip/:id')}>
                                <PrintBookingSlip />
                            </ProtectedRoute>
                        } />
                        <Route path="/print/invoice/:id" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/print/invoice/:id')}>
                                <PrintInvoice />
                            </ProtectedRoute>
                        } />

                        <Route path="/dashboard" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/dashboard')}>
                                <AppLayout role="Staff">
                                    <RoleAwareDashboard />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/help" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/help')}>
                                <AppLayout role="Staff">
                                    <Help />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/admin" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/admin')}>
                                <AppLayout role="Admin">
                                    <LicenseGate feature="analytics">
                                        <Admin />
                                    </LicenseGate>
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/users" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/users')}>
                                <AppLayout role="Admin">
                                    <Users />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/users/:userId" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/users/:userId')}>
                                <AppLayout role="Admin">
                                    <UserDetailPage />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/user-activity" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/user-activity')}>
                                <AppLayout role="Admin">
                                    <LicenseGate feature="audit">
                                        <UserActivityTracking />
                                    </LicenseGate>
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/referring-doctors" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/referring-doctors')}>
                                <AppLayout role="Receptionist">
                                    <LicenseGate feature="crm">
                                        <ReferringDoctors />
                                    </LicenseGate>
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/referring-doctors/:doctorId" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/referring-doctors/:doctorId')}>
                                <AppLayout role="Receptionist">
                                    <LicenseGate feature="crm">
                                        <DoctorDetailPage />
                                    </LicenseGate>
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/pacs/viewer" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/pacs/viewer')}>
                                <LicenseGate feature="pacs">
                                    <PacsViewer />
                                </LicenseGate>
                            </ProtectedRoute>
                        } />

                        <Route path="/pacs/reconciliation" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/pacs/reconciliation')}>
                                <AppLayout role="Radiologist">
                                    <LicenseGate feature="pacs">
                                        <PacsReconciliation />
                                    </LicenseGate>
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/settings" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/settings')}>
                                <AppLayout role="Staff">
                                    <Settings />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/display/control" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/display/control')}>
                                <AppLayout role="Staff">
                                    <DisplayBoardControl />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/profile" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/profile')}>
                                <AppLayout role="Staff">
                                    <Profile />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/notifications" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/notifications')}>
                                <AppLayout role="Staff">
                                    <Notifications />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/approvals" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/approvals')}>
                                <AppLayout role="Staff">
                                    <LicenseGate feature="finance">
                                        <PendingRequests />
                                    </LicenseGate>
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/analytics" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/analytics')}>
                                <AppLayout role="Admin">
                                    <LicenseGate feature="analytics">
                                        <RoleAwareAnalytics />
                                    </LicenseGate>
                                </AppLayout>
                            </ProtectedRoute>
                        } />


                        <Route path="/worklist" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/worklist')}>
                                <AppLayout role="Staff">
                                    <Worklist />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/case-reports" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/case-reports')}>
                                <AppLayout role="Staff">
                                    <CaseReports />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/cases/:examId" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/cases/:examId')}>
                                <AppLayout role="Staff">
                                    <CaseDetailsPage />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/reports/editor/:examId" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/reports/editor/:examId')}>
                                <AppLayout role="Staff">
                                    <ReportEditorPage />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/doctor" element={<Navigate to="/worklist" replace />} />

                        <Route path="/reception" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/reception')}>
                                <AppLayout role="Receptionist">
                                    <Reception />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/appointments" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/appointments')}>
                                <AppLayout role="Receptionist">
                                    <Appointments />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/appointments/new" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/appointments/new')}>
                                <AppLayout role="Receptionist">
                                    <BookAppointment />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/patients" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/patients')}>
                                <AppLayout role="Receptionist">
                                    <Patients />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/patients/:patientId" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/patients/:patientId')}>
                                <AppLayout role="Receptionist">
                                    <PatientDetailPage />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/end-of-day" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/end-of-day')}>
                                <AppLayout role="Receptionist">
                                    <EndOfDayReview />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/financials" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/financials')}>
                                <AppLayout role="Accountant">
                                    <LicenseGate feature="finance">
                                        <Financials />
                                    </LicenseGate>
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/payroll" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/payroll')}>
                                <AppLayout role="HR">
                                    <LicenseGate feature="hr">
                                        <Payroll />
                                    </LicenseGate>
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/insurance" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/insurance')}>
                                <AppLayout role="Accountant">
                                    <LicenseGate feature="insurance">
                                        <Insurance />
                                    </LicenseGate>
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/equipment" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/equipment')}>
                                <AppLayout role="Admin">
                                    <LicenseGate feature="equipment">
                                        <Equipment />
                                    </LicenseGate>
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/hr" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/hr')}>
                                <AppLayout role="HR">
                                    <LicenseGate feature="hr">
                                        <HR />
                                    </LicenseGate>
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        {/* /leave is now inside the Profile page — redirect for bookmarks/old links */}
                        <Route path="/leave" element={<Navigate to="/profile?section=leave" replace />} />

                        <Route path="/marketing" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/marketing')}>
                                <AppLayout role="Marketing">
                                    <LicenseGate feature="crm">
                                        <Marketing />
                                    </LicenseGate>
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/modality" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/modality')}>
                                <AppLayout role="Technician">
                                    <Modality />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/technician" element={<Navigate to="/modality" replace />} />

                        <Route path="/nurse" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/nurse')}>
                                <AppLayout role="Nurse">
                                    <Nurse />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/inventory" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/inventory')}>
                                <AppLayout role="Admin">
                                    <LicenseGate feature="inventory">
                                        <Inventory />
                                    </LicenseGate>
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/communications" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/communications')}>
                                <AppLayout role="Staff">
                                    <CommunicationCenter />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/portal/dashboard" element={<ExternalRedirect to={getPatientPortalDashboardUrl()} />} />
                        <Route path="/doctor-portal/dashboard" element={<ExternalRedirect to={getDoctorPortalDashboardUrl()} />} />

                        {/* Default & Landing Routes */}
                        <Route path="/landing" element={<Landing />} />
                        <Route path="/" element={
                            isAuthenticated
                                ? (localStorage.getItem('viara_onboarding_complete') ? <Navigate to="/dashboard" replace /> : <Navigate to="/onboarding" replace />)
                                : <Landing />
                        } />
                        <Route path="*" element={<NotFound />} />
                    </Routes>
                </Suspense>
            </BrowserRouter>
        </ErrorBoundary>
    );
}

export default App;
