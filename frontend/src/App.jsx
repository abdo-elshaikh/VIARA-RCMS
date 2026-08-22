import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { selectCurrentToken, selectCurrentUser, selectIsAuthenticated, rehydrateUser, logOut, setAccessToken } from './store/authSlice';
import ErrorBoundary from './components/ErrorBoundary';
import { api, rehydrateSession, useGetPreferencesQuery } from './store/api';
import Modal from './components/ui/Modal';
import { DEFAULT_PREFERENCES, updateAllPreferences } from './store/preferencesSlice';
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

const API_BASE_URL = import.meta.env.VITE_API_URL || '/api';

const getCsrfToken = () => {
    if (typeof document === 'undefined') return null;
    const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
};

// Eager-loaded components (needed immediately)
import Login from './pages/Login';
import AppLayout from './components/dashboard/AppLayout';
import Help from './pages/Help';

// Lazy-loaded pages for code splitting
const DashboardHome = lazy(() => import('./pages/DashboardHome'));
const Admin = lazy(() => import('./pages/Admin'));
const Users = lazy(() => import('./pages/Users'));
const UserDetailPage = lazy(() => import('./pages/UserDetailPage'));
const Financials = lazy(() => import('./pages/Financials'));
const Payroll = lazy(() => import('./pages/Payroll'));
const Insurance = lazy(() => import('./pages/Insurance'));
const Worklist = lazy(() => import('./pages/Worklist'));
const ReportEditorPage = lazy(() => import('./pages/ReportEditorPage'));
const PacsViewer = lazy(() => import('./pages/PacsViewer'));
const PacsReconciliation = lazy(() => import('./pages/PacsReconciliation'));
const Reception = lazy(() => import('./pages/Reception'));
const Patients = lazy(() => import('./pages/Patients'));
const PatientDetailPage = lazy(() => import('./pages/PatientDetailPage'));
const ReferringDoctors = lazy(() => import('./pages/ReferringDoctors'));
const DoctorDetailPage = lazy(() => import('./pages/DoctorDetailPage'));
const Appointments = lazy(() => import('./pages/Appointments'));
const BookAppointment = lazy(() => import('./pages/BookAppointment'));
const HR = lazy(() => import('./pages/HR'));
const Marketing = lazy(() => import('./pages/Marketing'));
const AnalyticsDashboard = lazy(() => import('./pages/AnalyticsDashboard'));
const ReferralAnalytics = lazy(() => import('./pages/ReferralAnalytics'));

const Modality = lazy(() => import('./pages/Modality'));
const Nurse = lazy(() => import('./pages/Nurse'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Equipment = lazy(() => import('./pages/Equipment'));
const Unauthorized = lazy(() => import('./pages/Unauthorized'));
const NotFound = lazy(() => import('./pages/NotFound'));
const Settings = lazy(() => import('./pages/Settings'));
const Profile = lazy(() => import('./pages/Profile'));
const Notifications = lazy(() => import('./pages/Notifications'));
const PendingRequests = lazy(() => import('./pages/PendingRequests'));
const Offline = lazy(() => import('./pages/Offline'));
const Landing = lazy(() => import('./pages/Landing'));
const CommunicationCenter = lazy(() => import('./components/communications/CommunicationCenter'));
const CaseReports = lazy(() => import('./pages/CaseReports'));
const CaseDetailsPage = lazy(() => import('./pages/CaseDetailsPage'));

const PrintSticker = lazy(() => import('./pages/print/PrintSticker'));
const PrintReceipt = lazy(() => import('./pages/print/PrintReceipt'));
const PrintInvoice = lazy(() => import('./pages/print/PrintInvoice'));

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

// Enhanced Protected Route Wrapper
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

const RoleAwareDashboard = () => {
    const user = useSelector(selectCurrentUser);
    return user?.role === 'Marketing' ? <Marketing /> : <DashboardHome />;
};

const RoleAwareAnalytics = () => {
    const user = useSelector(selectCurrentUser);
    return user?.role === 'Marketing' ? <ReferralAnalytics /> : <AnalyticsDashboard />;
};

const ConnectivityWatcher = () => {
    const location = useLocation();
    const navigate = useNavigate();

    useEffect(() => {
        if (location.pathname !== '/offline') {
            sessionStorage.setItem('lastOnlinePath', `${location.pathname}${location.search}${location.hash}`);
        }
    }, [location]);

    useEffect(() => {
        const handleOffline = () => {
            if (window.location.pathname !== '/offline') {
                navigate('/offline', {
                    replace: false,
                    state: {
                        from: `${window.location.pathname}${window.location.search}${window.location.hash}`
                    }
                });
            }
        };

        const handleOnline = () => {
            if (window.location.pathname === '/offline') {
                const returnPath = sessionStorage.getItem('lastOnlinePath') || '/dashboard';
                navigate(returnPath, { replace: true });
            }
        };

        window.addEventListener('offline', handleOffline);
        window.addEventListener('online', handleOnline);

        if (!navigator.onLine) {
            handleOffline();
        }

        return () => {
            window.removeEventListener('offline', handleOffline);
            window.removeEventListener('online', handleOnline);
        };
    }, [navigate]);

    return null;
};

const SessionTimeout = ({ t }) => {
    const dispatch = useDispatch();
    const navigate = useNavigate();
    const location = useLocation();
    const isAuthenticated = useSelector(selectIsAuthenticated);
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
        if (!isAuthenticated) {
            setShowWarning(false);
            return undefined;
        }

        const warningMs = 28 * 60 * 1000;
        const expiryMs = 30 * 60 * 1000;
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
        const handleActivity = () => {
            if (!warningOpenRef.current) schedule();
        };

        schedule();
        const events = ['mousedown', 'keypress', 'scroll', 'touchstart'];
        events.forEach((event) => document.addEventListener(event, handleActivity, { passive: true }));
        return () => {
            clearTimers();
            events.forEach((event) => document.removeEventListener(event, handleActivity));
        };
    }, [dispatch, isAuthenticated, location.hash, location.pathname, location.search, navigate, t, timerGeneration]);

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
                    <button type="button" onClick={extendSession} disabled={isExtending} className="min-h-11 rounded-xl bg-cyan-700 px-4 text-sm font-bold text-white disabled:opacity-60">
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
    const preferences = useSelector((state) => state.preferences);
    const [isRehydrated, setIsRehydrated] = useState(false);

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
        const language = preferences?.language;
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

    // Session Timeout Logic (30 minutes of inactivity)
    useEffect(() => {
        if (!isAuthenticated) return;

        let timeoutId;
        const resetTimer = () => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                dispatch(api.endpoints.logout.initiate());
                dispatch(logOut());
                toast.error(t('session.expired'));
            }, 30 * 60 * 1000); // 30 mins
        };

        const events = ['mousedown', 'mousemove', 'keypress', 'scroll', 'touchstart'];
        events.forEach(e => document.addEventListener(e, resetTimer));

        resetTimer(); // init

        return () => {
            clearTimeout(timeoutId);
            events.forEach(e => document.removeEventListener(e, resetTimer));
        };
    }, [isAuthenticated, dispatch, t]);

    const currentUser = useSelector(selectCurrentUser);
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

        // Fetch a short-lived SSE session token so the access JWT is not placed in the URL.
        const csrfToken = getCsrfToken();
        fetch(`${API_BASE_URL}/realtime/session`, {
            method: 'POST',
            credentials: 'include',
            headers: {
                'Authorization': `Bearer ${token}`,
                ...(csrfToken ? { 'x-csrf-token': csrfToken } : {}),
            }
        })
            .then(res => res.ok ? res.json() : null)
            .then(sseSession => {
                if (isCancelled || !sseSession?.token) return;
                eventSource = new EventSource(`${API_BASE_URL}/realtime/stream?token=${encodeURIComponent(sseSession.token)}`);

                eventSource.onmessage = (event) => {
                    try {
                        const parsed = JSON.parse(event.data);

                        if (parsed.type === 'PING' || parsed.type === 'CONNECTED') return;

                        const { event: sseEvent, data } = parsed;
                        const notificationPreferences = preferencesRef.current || {};
                        const activeUserId = currentUserIdRef.current;

                        if (sseEvent === 'FORCE_LOGOUT') {
                            dispatch(logOut());
                            toast.error(data?.message || t('auth.forceLogout', 'You have been logged out because your account was accessed from another device.'), { duration: 6000 });
                            return;
                        }

                        if (sseEvent === 'NEW_NOTIFICATION') {
                            // Incrementally patch caches instead of invalidating (avoids a refetch).
                            // Bump the always-subscribed unread badge count.
                            dispatch(api.util.updateQueryData('getNotificationUnreadCount', undefined, (draft) => {
                                if (draft && typeof draft.unreadCount === 'number' && !data.is_read) {
                                    draft.unreadCount += 1;
                                }
                            }));
                            // Prepend into the notification-center list cache when it exists
                            // (NotificationCenter subscribes with { limit: 120 }; no-op when closed).
                            dispatch(api.util.updateQueryData('getNotifications', { limit: 120 }, (draft) => {
                                if (!draft || !Array.isArray(draft.items)) return;
                                if (draft.items.some((n) => n.notification_id === data.notification_id)) return;
                                draft.items.unshift(data);
                                if (typeof draft.total === 'number') draft.total += 1;
                                if (draft.counts) {
                                    draft.counts.all = (draft.counts.all || 0) + 1;
                                    if (!data.is_read) draft.counts.unread = (draft.counts.unread || 0) + 1;
                                    if (data.status === 'Failed') draft.counts.failed = (draft.counts.failed || 0) + 1;
                                    if (data.status === 'Pending') draft.counts.pending = (draft.counts.pending || 0) + 1;
                                    if (data.status === 'Sent') draft.counts.sent = (draft.counts.sent || 0) + 1;
                                    if (data.status === 'Delivered') draft.counts.delivered = (draft.counts.delivered || 0) + 1;
                                }
                            }));
                            dispatch(api.util.invalidateTags(['Notifications']));
                            toast.success(data.content || 'New system notification received!', {
                                icon: '🔔',
                                duration: 5000
                            });
                            if (notificationPreferences?.desktopSystemNotifications !== false) {
                                const critical = data.status === 'Failed' || /critical|urgent|failed|safety/i.test(`${data.event_type || ''} ${data.subject || ''}`);
                                showDesktopNotification({
                                    title: data.subject || `${VIARA_BRAND.name} notification`,
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
                            sseEvent === 'NEW_DOCTOR_MESSAGE_UPDATE'
                        ) {
                            dispatch(api.util.invalidateTags([
                                'ChatMessages', 'StaffUsers', 'PatientConversations', 'DoctorConversations', 'ChatUnread'
                            ]));

                            window.dispatchEvent(new CustomEvent('SSE_REALTIME_MESSAGE', { detail: { event: sseEvent, data } }));

                            const isIncoming = sseEvent === 'NEW_PATIENT_MESSAGE_ALERT' ||
                                sseEvent === 'NEW_DOCTOR_MESSAGE_ALERT' ||
                                (sseEvent === 'NEW_STAFF_MESSAGE' && data.sender_id !== activeUserId);

                            if (isIncoming) {
                                toast(data.body || 'New message received', {
                                    icon: '💬',
                                    duration: 4000
                                });
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
                        }
                    } catch (err) {
                        console.error('Failed to parse SSE payload', err);
                    }
                };

                eventSource.onerror = (error) => {
                    console.error('SSE connection error:', error);
                    if (isCancelled) return;
                    eventSource.close();
                    toast.error(t('sse.disconnected', 'Live updates disconnected. Attempting to reconnect...'), {
                        id: 'sse-disconnected',
                    });
                };
            })
            .catch(err => {
                console.error('Failed to establish SSE session', err);
            });

        return () => {
            isCancelled = true;
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
                            borderRadius: '12px',
                            padding: '16px',
                        },
                        success: {
                            iconTheme: {
                                primary: '#10b981',
                                secondary: '#fff',
                            },
                        },
                        error: {
                            iconTheme: {
                                primary: '#ef4444',
                                secondary: '#fff',
                            },
                        },
                    }}
                />

                <Suspense fallback={<PageLoader />}>
                    <Routes>
                        {/* Public Routes */}
                        <Route path="/login" element={<Login />} />
                        <Route path="/portal" element={<ExternalRedirect to={getPatientPortalHomeUrl()} />} />
                        <Route path="/portal/login" element={<ExternalRedirect to={getPatientPortalLoginUrl()} />} />
                        <Route path="/doctor-portal" element={<ExternalRedirect to={getDoctorPortalHomeUrl()} />} />
                        <Route path="/doctor-portal/login" element={<ExternalRedirect to={getDoctorPortalLoginUrl()} />} />
                        <Route path="/unauthorized" element={<Unauthorized />} />
                        <Route path="/offline" element={<Offline />} />

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
                                    <Admin />
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

                        <Route path="/referring-doctors" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/referring-doctors')}>
                                <AppLayout role="Receptionist">
                                    <ReferringDoctors />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/referring-doctors/:doctorId" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/referring-doctors/:doctorId')}>
                                <AppLayout role="Receptionist">
                                    <DoctorDetailPage />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/pacs/viewer" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/pacs/viewer')}>
                                <PacsViewer />
                            </ProtectedRoute>
                        } />

                        <Route path="/pacs/reconciliation" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/pacs/reconciliation')}>
                                <AppLayout role="Radiologist">
                                    <PacsReconciliation />
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
                                    <PendingRequests />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/analytics" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/analytics')}>
                                <AppLayout role="Admin">
                                    <RoleAwareAnalytics />
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

                        <Route path="/financials" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/financials')}>
                                <AppLayout role="Accountant">
                                    <Financials />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/payroll" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/payroll')}>
                                <AppLayout role="HR">
                                    <Payroll />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/insurance" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/insurance')}>
                                <AppLayout role="Accountant">
                                    <Insurance />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/equipment" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/equipment')}>
                                <AppLayout role="Admin">
                                    <Equipment />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/hr" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/hr')}>
                                <AppLayout role="HR">
                                    <HR />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        {/* /leave is now inside the Profile page — redirect for bookmarks/old links */}
                        <Route path="/leave" element={<Navigate to="/profile?section=leave" replace />} />

                        <Route path="/marketing" element={
                            <ProtectedRoute allowedRoles={getRouteRoles('/marketing')}>
                                <AppLayout role="Marketing">
                                    <Marketing />
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
                                    <Inventory />
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
                            isAuthenticated ? <Navigate to="/dashboard" replace /> : <Landing />
                        } />
                        <Route path="*" element={<NotFound />} />
                    </Routes>
                </Suspense>
            </BrowserRouter>
        </ErrorBoundary>
    );
}

export default App;
