import React, { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import toast, { Toaster } from 'react-hot-toast';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { selectCurrentToken, selectCurrentUser, selectIsAuthenticated, rehydrateUser, logOut } from './store/authSlice';
import ErrorBoundary from './components/ErrorBoundary';
import { api, rehydrateSession, useGetPreferencesQuery } from './store/api';
import { DEFAULT_PREFERENCES, updateAllPreferences } from './store/preferencesSlice';
import {
    getDoctorPortalDashboardUrl,
    getDoctorPortalHomeUrl,
    getDoctorPortalLoginUrl,
    getPatientPortalDashboardUrl,
    getPatientPortalHomeUrl,
    getPatientPortalLoginUrl,
} from './utils/portalUrls';

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
        <div className="min-h-screen flex items-center justify-center bg-[var(--rcms-canvas)]">
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
    if (user?.mustChangePassword && location.pathname !== '/settings') {
        return <Navigate to="/settings?tab=security" replace />;
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

const COLOR_MAP = {
    cyan: '#0891b2',
    indigo: '#4f46e5',
    rose: '#e11d48',
    emerald: '#059669',
    amber: '#d97706',
    slate: '#475569'
};

const hexToRgb = (hex) => {
    const normalized = /^#[0-9a-f]{6}$/i.test(hex || '') ? hex : COLOR_MAP.cyan;
    const value = Number.parseInt(normalized.slice(1), 16);
    return `${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}`;
};


const App = () => {
    const dispatch = useDispatch();
    const { t } = useTranslation('common');
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
            root.style.colorScheme = dark ? 'dark' : 'light';
        };
        applyTheme();
        systemTheme.addEventListener?.('change', applyTheme);

        const rawSelectedColor = mergedPreferences.primaryColor === 'custom'
            ? mergedPreferences.customColor
            : COLOR_MAP[mergedPreferences.primaryColor] || COLOR_MAP.cyan;
        const selectedColor = /^#[0-9a-f]{6}$/i.test(rawSelectedColor || '') ? rawSelectedColor : COLOR_MAP.cyan;

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
        root.style.setProperty('--rcms-accent', selectedColor);
        root.style.setProperty('--rcms-accent-dark', selectedColor);
        root.style.setProperty('--rcms-accent-rgb', hexToRgb(selectedColor));
        return () => systemTheme.removeEventListener?.('change', applyTheme);
    }, [preferences]);

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

        const eventSource = new EventSource(`/api/realtime/stream?token=${encodeURIComponent(token)}`);

        eventSource.onmessage = (event) => {
            try {
                const parsed = JSON.parse(event.data);
                
                if (parsed.type === 'PING' || parsed.type === 'CONNECTED') return;

                const { event: sseEvent, data } = parsed;
                const notificationPreferences = preferencesRef.current || {};
                const activeUserId = currentUserIdRef.current;

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
                            if (data.status === 'Sent' || data.status === 'Delivered') draft.counts.sent = (draft.counts.sent || 0) + 1;
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
                            title: data.subject || 'RCMS notification',
                            body: notificationPreferences?.desktopNotificationPreview
                                ? (data.content || data.event_type || 'New system notification received')
                                : 'New system notification received',
                            tag: `rcms-notification-${data.notification_id || Date.now()}`,
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
                                tag: `rcms-message-${data.message_id || Date.now()}`,
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
            eventSource.close();
        };

        return () => {
            eventSource.close();
        };
    }, [isAuthenticated, currentToken, dispatch]);

    if (!isRehydrated) {
        return null;
    }

    return (
        <ErrorBoundary>
            <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
                <ConnectivityWatcher />
                <Toaster
                    position="top-center"
                    reverseOrder={false}
                    toastOptions={{
                        duration: 4000,
                        style: {
                            background: 'var(--rcms-surface)',
                            color: 'var(--rcms-ink)',
                            border: '1px solid var(--rcms-line)',
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
                            <ProtectedRoute allowedRoles={['Admin', 'Receptionist', 'Radiologist', 'Technician', 'Nurse']}>
                                <PrintSticker />
                            </ProtectedRoute>
                        } />
                        <Route path="/print/receipt/:id" element={
                            <ProtectedRoute allowedRoles={['Admin', 'Receptionist', 'Radiologist', 'Technician', 'Nurse']}>
                                <PrintReceipt />
                            </ProtectedRoute>
                        } />
                        <Route path="/print/invoice/:id" element={
                            <ProtectedRoute allowedRoles={['Admin', 'Receptionist', 'Cashier', 'Accountant', 'Radiologist', 'Technician', 'Nurse', 'Insurance_Staff', 'HR', 'Referring_Doctor']}>
                                <PrintInvoice />
                            </ProtectedRoute>
                        } />

                        <Route path="/dashboard" element={
                            <ProtectedRoute allowedRoles={['Admin', 'Radiologist', 'Receptionist', 'Cashier', 'Accountant', 'HR', 'Technician', 'Nurse', 'Insurance_Staff', 'Marketing']}>
                                <AppLayout role="Staff">
                                    <RoleAwareDashboard />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/help" element={
                            <ProtectedRoute allowedRoles={['Admin', 'Radiologist', 'Receptionist', 'Cashier', 'Accountant', 'HR', 'Technician', 'Nurse', 'Insurance_Staff', 'Marketing']}>
                                <AppLayout role="Staff">
                                    <Help />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/admin" element={
                            <ProtectedRoute allowedRoles={['Admin']}>
                                <AppLayout role="Admin">
                                    <Admin />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/users" element={
                            <ProtectedRoute allowedRoles={['Admin', 'HR']}>
                                <AppLayout role="Admin">
                                    <Users />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/users/:userId" element={
                            <ProtectedRoute allowedRoles={['Admin', 'HR', 'Receptionist', 'Radiologist', 'Technician', 'Nurse', 'Cashier', 'Accountant', 'Insurance_Staff', 'Marketing']}>
                                <AppLayout role="Admin">
                                    <UserDetailPage />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/referring-doctors" element={
                            <ProtectedRoute allowedRoles={['Receptionist', 'Admin', 'Accountant', 'Marketing']}>
                                <AppLayout role="Receptionist">
                                    <ReferringDoctors />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/referring-doctors/:doctorId" element={
                            <ProtectedRoute allowedRoles={['Receptionist', 'Admin', 'Accountant', 'Radiologist', 'Marketing']}>
                                <AppLayout role="Receptionist">
                                    <DoctorDetailPage />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/pacs/viewer" element={
                            <ProtectedRoute allowedRoles={['Radiologist', 'Technician', 'Admin']}>
                                <PacsViewer />
                            </ProtectedRoute>
                        } />

                        <Route path="/pacs/reconciliation" element={
                            <ProtectedRoute allowedRoles={['Radiologist', 'Technician', 'Admin']}>
                                <AppLayout role="Radiologist">
                                    <PacsReconciliation />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/settings" element={
                            <ProtectedRoute allowedRoles={['Admin', 'Radiologist', 'Receptionist', 'Cashier', 'Accountant', 'HR', 'Technician', 'Nurse', 'Insurance_Staff', 'Marketing']}>
                                <AppLayout role="Staff">
                                    <Settings />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/notifications" element={
                            <ProtectedRoute allowedRoles={['Developer', 'Admin', 'Receptionist', 'HR', 'Marketing']}>
                                <AppLayout role="Staff">
                                    <Notifications />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/approvals" element={
                            <ProtectedRoute allowedRoles={['Admin', 'HR', 'Accountant', 'Insurance_Staff', 'Receptionist']}>
                                <AppLayout role="Staff">
                                    <PendingRequests />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/analytics" element={
                            <ProtectedRoute allowedRoles={['Admin', 'Accountant', 'Marketing']}>
                                <AppLayout role="Admin">
                                    <RoleAwareAnalytics />
                                </AppLayout>
                            </ProtectedRoute>
                        } />


                        <Route path="/worklist" element={
                            <ProtectedRoute allowedRoles={['Radiologist', 'Technician', 'Nurse', 'Admin']}>
                                <AppLayout role="Staff">
                                    <Worklist />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/case-reports" element={
                            <ProtectedRoute allowedRoles={['Radiologist', 'Admin', 'Receptionist', 'Technician', 'Nurse']}>
                                <AppLayout role="Staff">
                                    <CaseReports />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/cases/:examId" element={
                            <ProtectedRoute allowedRoles={['Radiologist', 'Admin', 'Receptionist', 'Technician', 'Nurse', 'Marketing']}>
                                <AppLayout role="Staff">
                                    <CaseDetailsPage />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/reports/editor/:examId" element={
                            <ProtectedRoute allowedRoles={['Radiologist', 'Admin']}>
                                <AppLayout role="Staff">
                                    <ReportEditorPage />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/doctor" element={<Navigate to="/worklist" replace />} />

                        <Route path="/reception" element={
                            <ProtectedRoute allowedRoles={['Receptionist', 'Cashier', 'Admin']}>
                                <AppLayout role="Receptionist">
                                    <Reception />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/appointments" element={
                            <ProtectedRoute allowedRoles={['Receptionist', 'Admin']}>
                                <AppLayout role="Receptionist">
                                    <Appointments />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/appointments/new" element={
                            <ProtectedRoute allowedRoles={['Receptionist', 'Admin']}>
                                <AppLayout role="Receptionist">
                                    <BookAppointment />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/patients" element={
                            <ProtectedRoute allowedRoles={['Receptionist', 'Admin', 'Radiologist', 'Nurse', 'Marketing']}>
                                <AppLayout role="Receptionist">
                                    <Patients />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/patients/:patientId" element={
                            <ProtectedRoute allowedRoles={['Receptionist', 'Admin', 'Radiologist', 'Nurse', 'Marketing']}>
                                <AppLayout role="Receptionist">
                                    <PatientDetailPage />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/referring-doctors" element={
                            <ProtectedRoute allowedRoles={['Receptionist', 'Admin', 'Accountant', 'Marketing']}>
                                <AppLayout role="Receptionist">
                                    <ReferringDoctors />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/financials" element={
                            <ProtectedRoute allowedRoles={['Accountant', 'Admin']}>
                                <AppLayout role="Accountant">
                                    <Financials />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/payroll" element={
                            <ProtectedRoute allowedRoles={['HR', 'Accountant', 'Admin']}>
                                <AppLayout role="HR">
                                    <Payroll />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/insurance" element={
                            <ProtectedRoute allowedRoles={['Accountant', 'Admin', 'Receptionist', 'Insurance_Staff']}>
                                <AppLayout role="Accountant">
                                    <Insurance />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/equipment" element={
                            <ProtectedRoute allowedRoles={['Admin', 'Receptionist', 'Technician']}>
                                <AppLayout role="Admin">
                                    <Equipment />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/hr" element={
                            <ProtectedRoute allowedRoles={['HR', 'Admin']}>
                                <AppLayout role="HR">
                                    <HR />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/marketing" element={
                            <ProtectedRoute allowedRoles={['Admin', 'Receptionist', 'HR', 'Marketing']}>
                                <AppLayout role="Marketing">
                                    <Marketing />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/modality" element={
                            <ProtectedRoute allowedRoles={['Technician', 'Admin']}>
                                <AppLayout role="Technician">
                                    <Modality />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/technician" element={<Navigate to="/modality" replace />} />

                        <Route path="/nurse" element={
                            <ProtectedRoute allowedRoles={['Nurse', 'Radiologist', 'Technician', 'Admin']}>
                                <AppLayout role="Nurse">
                                    <Nurse />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/inventory" element={
                            <ProtectedRoute allowedRoles={['Admin', 'Technician']}>
                                <AppLayout role="Admin">
                                    <Inventory />
                                </AppLayout>
                            </ProtectedRoute>
                        } />

                        <Route path="/communications" element={
                            <ProtectedRoute allowedRoles={['Admin', 'Receptionist', 'Radiologist', 'Technician', 'Nurse', 'HR', 'Marketing']}>
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
