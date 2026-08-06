import { useEffect, lazy, Suspense, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useAppDispatch, useAppSelector } from './store/store';
import { Toaster } from 'react-hot-toast';

import { rehydrateUser, selectCurrentUser, selectIsAuthenticated } from './store/authSlice';
import { selectTheme } from './store/preferencesSlice';
import { applyPortalTheme, resolveTheme } from './utils/theme';

const PatientLogin = lazy(() => import('./pages/PatientLogin'));
const PatientPortal = lazy(() => import('./pages/PatientPortal'));
const DoctorLogin = lazy(() => import('./pages/DoctorLogin'));
const DoctorPortal = lazy(() => import('./pages/DoctorPortal'));
const PortalLanding = lazy(() => import('./pages/PortalLanding'));
const PortalPasswordChange = lazy(() => import('./pages/PortalPasswordChange'));

const PATIENT_ROLES = ['Patient'] as const;
const DOCTOR_ROLES = ['Doctor'] as const;

interface RequireRoleProps {
    roles: readonly string[];
    redirectTo: string;
    children: ReactNode;
}

const RequireRole = ({ roles, redirectTo, children }: RequireRoleProps) => {
    const isAuthenticated = useAppSelector(selectIsAuthenticated);
    const user = useAppSelector(selectCurrentUser);

    if (!isAuthenticated) return <Navigate to={redirectTo} replace />;
    if (isAuthenticated && (user as any)?.mustChangePassword) return <Navigate to="/portal/change-password" replace />;
    if (!user?.role || !roles.includes(user.role)) return <Navigate to={redirectTo} replace />;
    return children;
};

const RequirePortalAccount = ({ children }: { children: ReactNode }) => {
    const isAuthenticated = useAppSelector(selectIsAuthenticated);
    const user = useAppSelector(selectCurrentUser);

    if (!isAuthenticated || !user?.role) return <Navigate to="/" replace />;
    if (![...PATIENT_ROLES, ...DOCTOR_ROLES].includes(user.role as 'Patient' | 'Doctor')) {
        return <Navigate to="/" replace />;
    }
    return children;
};

const App = () => {
    const dispatch = useAppDispatch();
    const isAuthenticated = useAppSelector(selectIsAuthenticated);
    const user = useAppSelector(selectCurrentUser);
    const theme = useAppSelector(selectTheme);
    const isDark = resolveTheme(theme) === 'dark';

    useEffect(() => {
        dispatch(rehydrateUser());
    }, [dispatch]);

    useEffect(() => {
        const apply = () => applyPortalTheme(theme);
        apply();

        if (theme !== 'system' || typeof window.matchMedia !== 'function') return undefined;

        const media = window.matchMedia('(prefers-color-scheme: dark)');
        media.addEventListener?.('change', apply);
        return () => media.removeEventListener?.('change', apply);
    }, [theme]);

    const isPatient = isAuthenticated && PATIENT_ROLES.some((role) => role === user?.role);
    const isDoctor = isAuthenticated && DOCTOR_ROLES.some((role) => role === user?.role);

    return (
        <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <Toaster
                position="top-center"
                toastOptions={{
                    duration: 4000,
                    style: {
                        border: `1px solid ${isDark ? '#263c53' : '#dce9f5'}`,
                        borderRadius: '14px',
                        background: isDark ? '#0d2030' : '#ffffff',
                        color: isDark ? '#edf5ff' : '#0b2245',
                        boxShadow: '0 20px 48px -30px rgba(8,39,97,.42)',
                    },
                }}
            />
            <Suspense fallback={<div role="status" aria-live="polite" className="flex h-screen w-full flex-col items-center justify-center gap-3 bg-background text-sm font-semibold text-muted-foreground"><div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-600 border-t-transparent" /><span>Loading portal…</span></div>}>
            <Routes>
                {/* Default route opens the public portal landing page. */}
                <Route path="/" element={<PortalLanding />} />
                <Route path="/portal" element={<Navigate to="/patient" replace />} />
                <Route path="/portal/login" element={<Navigate to="/patient/login" replace />} />
                <Route path="/portal/dashboard" element={<Navigate to="/patient/dashboard" replace />} />
                <Route path="/doctor-portal" element={<Navigate to="/doctor" replace />} />
                <Route path="/doctor-portal/login" element={<Navigate to="/doctor/login" replace />} />
                <Route path="/doctor-portal/dashboard" element={<Navigate to="/doctor/dashboard" replace />} />

                {/* Patient */}
                <Route
                    path="/patient"
                    element={<Navigate to={isPatient ? "/patient/dashboard" : "/patient/login"} replace />}
                />
                <Route path="/patient/login" element={<PatientLogin />} />
                <Route
                    path="/patient/dashboard"
                    element={
                        <RequireRole roles={PATIENT_ROLES} redirectTo="/patient/login">
                            <PatientPortal />
                        </RequireRole>
                    }
                />

                {/* Doctor */}
                <Route
                    path="/doctor"
                    element={<Navigate to={isDoctor ? "/doctor/dashboard" : "/doctor/login"} replace />}
                />
                <Route path="/doctor/login" element={<DoctorLogin />} />
                <Route path="/portal/change-password" element={<RequirePortalAccount><PortalPasswordChange /></RequirePortalAccount>} />
                <Route
                    path="/doctor/dashboard"
                    element={
                        <RequireRole roles={DOCTOR_ROLES} redirectTo="/doctor/login">
                            <DoctorPortal />
                        </RequireRole>
                    }
                />

                {/* Fallback */}
                <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
            </Suspense>
        </BrowserRouter>
    );
};

export default App;
