import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Home, RefreshCw, ServerCrash, Wifi, WifiOff } from 'lucide-react';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { selectCurrentUser, selectIsAuthenticated } from '../store/authSlice';
import getRoleHomePath from '../utils/getRoleHomePath';
import SystemState from '../components/ui/SystemState';
import { checkBackendHealth } from '../utils/backendHealth';

const Offline = () => {
    const { t, i18n } = useTranslation('system');
    const navigate = useNavigate();
    const location = useLocation();
    const user = useSelector(selectCurrentUser);
    const isAuthenticated = useSelector(selectIsAuthenticated);
    const [isChecking, setIsChecking] = useState(false);
    const [serviceState, setServiceState] = useState(navigator.onLine ? 'checking' : 'network-down');
    const homePath = getRoleHomePath(user, isAuthenticated);
    const fromPath = location.state?.from || sessionStorage.getItem('lastOnlinePath') || homePath;
    const BackIcon = i18n.dir() === 'rtl' ? ArrowRight : ArrowLeft;

    useEffect(() => {
        let active = true;
        const updateServiceState = async () => {
            const result = await checkBackendHealth();
            if (!active) return;
            setServiceState(!result.online ? 'network-down' : result.backendAvailable ? 'backend-up' : 'backend-down');
        };
        const handleOnline = () => { void updateServiceState(); };
        const handleOffline = () => {
            setServiceState('network-down');
        };
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        void updateServiceState();
        return () => {
            active = false;
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, []);

    const handleRetry = async () => {
        setIsChecking(true);
        setServiceState('checking');
        const result = await checkBackendHealth();
        setServiceState(!result.online ? 'network-down' : result.backendAvailable ? 'backend-up' : 'backend-down');
        setIsChecking(false);
        if (result.online && result.backendAvailable) {
            if (fromPath.startsWith('http')) {
                window.location.replace(fromPath);
            } else {
                navigate(fromPath, { replace: true });
            }
        }
    };

    const isBackendDown = serviceState === 'backend-down';
    const isServiceRestored = serviceState === 'backend-up';
    const notice = (
        <div role="status" className={`mx-auto mt-6 flex max-w-md items-start gap-2.5 rounded-xl border px-4 py-3 text-start text-sm font-semibold ${isServiceRestored ? 'border-[rgba(22,134,95,.2)] bg-[var(--success-bg)] text-[var(--success)]' : serviceState === 'checking' ? 'border-[rgba(var(--VIARA-accent-rgb),.2)] bg-[var(--VIARA-accent-soft)] text-[var(--VIARA-accent-text)]' : 'border-[rgba(217,154,24,.24)] bg-[var(--warning-bg)] text-[var(--warning)]'}`}>
            {isServiceRestored ? <Wifi size={17} className="mt-0.5 shrink-0" aria-hidden="true" /> : isBackendDown ? <ServerCrash size={17} className="mt-0.5 shrink-0" aria-hidden="true" /> : <WifiOff size={17} className="mt-0.5 shrink-0" aria-hidden="true" />}
            <span>{isServiceRestored
                ? t('states.offline.serviceAvailable', { defaultValue: 'The VIARA service is responding again.' })
                : isBackendDown
                    ? t('states.offline.backendUnavailable', { defaultValue: 'The server or its database is not responding.' })
                    : serviceState === 'checking'
                        ? t('states.offline.checkingBackend', { defaultValue: 'Checking the VIARA service...' })
                        : t('states.offline.disconnected')}</span>
        </div>
    );

    const actionBase = 'inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--VIARA-accent-rgb),0.18)] sm:w-auto';
    const secondaryAction = `${actionBase} border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] text-[var(--VIARA-ink)] hover:border-[rgba(var(--VIARA-accent-rgb),.3)] hover:bg-[var(--VIARA-accent-soft)] dark:hover:bg-[var(--VIARA-surface-hover)]`;
    const primaryAction = `${actionBase} bg-[var(--VIARA-accent)] text-[var(--VIARA-accent-contrast)] shadow-sm shadow-[rgba(var(--VIARA-accent-rgb),.18)] hover:brightness-110 disabled:opacity-60`;

    return (
        <SystemState icon={isBackendDown ? ServerCrash : WifiOff} tone="slate" visual="offline" eyebrow={t('states.offline.eyebrow')} title={isBackendDown ? t('states.offline.backendTitle', { defaultValue: 'VIARA service is unavailable.' }) : t('states.offline.title')} description={isBackendDown ? t('states.offline.backendDescription', { defaultValue: 'Your internet connection is active, but the application cannot reach its server. Try again in a moment.' }) : t('states.offline.description')} notice={notice}>
            <button type="button" onClick={() => navigate(-1)} className={secondaryAction}><BackIcon size={17} />{t('states.back')}</button>
            <button type="button" onClick={handleRetry} disabled={isChecking} className={primaryAction}><RefreshCw size={17} className={isChecking ? 'animate-spin' : ''} />{isChecking ? t('states.offline.checking') : t('states.offline.retry')}</button>
            {homePath.startsWith('http')
                ? <a href={homePath} className={secondaryAction}><Home size={17} />{t('states.home')}</a>
                : <Link to={homePath} className={secondaryAction}><Home size={17} />{t('states.home')}</Link>}
        </SystemState>
    );
};

export default Offline;
