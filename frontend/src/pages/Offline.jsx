import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Home, RefreshCw, WifiOff } from 'lucide-react';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { selectCurrentUser, selectIsAuthenticated } from '../store/authSlice';
import getRoleHomePath from '../utils/getRoleHomePath';
import SystemState from '../components/ui/SystemState';

const Offline = () => {
    const { t, i18n } = useTranslation('system');
    const navigate = useNavigate();
    const location = useLocation();
    const user = useSelector(selectCurrentUser);
    const isAuthenticated = useSelector(selectIsAuthenticated);
    const [isChecking, setIsChecking] = useState(false);
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const homePath = getRoleHomePath(user, isAuthenticated);
    const fromPath = location.state?.from || sessionStorage.getItem('lastOnlinePath') || homePath;
    const BackIcon = i18n.dir() === 'rtl' ? ArrowRight : ArrowLeft;

    const handleRetry = () => {
        setIsChecking(true);
        const online = navigator.onLine;
        setIsOnline(online);
        window.setTimeout(() => {
            setIsChecking(false);
            if (online) {
                if (fromPath.startsWith('http')) {
                    window.location.replace(fromPath);
                } else {
                    navigate(fromPath, { replace: true });
                }
            }
        }, 350);
    };

    const notice = <div role="status" className={`mx-auto mt-6 max-w-md rounded-xl border px-4 py-3 text-sm font-semibold ${isOnline ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-400' : 'border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-400'}`}>{isOnline ? t('states.offline.online') : t('states.offline.disconnected')}</div>;

    const actionBase = 'inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--VIARA-accent-rgb),0.18)] sm:w-auto';
    const secondaryAction = `${actionBase} border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] text-[var(--VIARA-ink)] hover:bg-[var(--VIARA-surface-hover)] dark:hover:bg-slate-800/50`;
    const primaryAction = `${actionBase} bg-[var(--VIARA-accent)] text-white shadow-sm hover:brightness-110 disabled:opacity-60`;

    return (
        <SystemState icon={WifiOff} tone="slate" eyebrow={t('states.offline.eyebrow')} title={t('states.offline.title')} description={t('states.offline.description')} notice={notice}>
            <button type="button" onClick={() => navigate(-1)} className={secondaryAction}><BackIcon size={17} />{t('states.back')}</button>
            <button type="button" onClick={handleRetry} disabled={isChecking} className={primaryAction}><RefreshCw size={17} className={isChecking ? 'animate-spin' : ''} />{isChecking ? t('states.offline.checking') : t('states.offline.retry')}</button>
            {homePath.startsWith('http')
                ? <a href={homePath} className={secondaryAction}><Home size={17} />{t('states.home')}</a>
                : <Link to={homePath} className={secondaryAction}><Home size={17} />{t('states.home')}</Link>}
        </SystemState>
    );
};

export default Offline;
