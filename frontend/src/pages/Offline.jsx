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

    const notice = <div role="status" className={`mx-auto mt-6 max-w-md rounded-xl border px-4 py-3 text-sm font-semibold ${isOnline ? 'border-emerald-200 dark:border-emerald-900/50 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 'border-amber-200 dark:border-amber-900/50 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400'}`}>{isOnline ? t('states.offline.online') : t('states.offline.disconnected')}</div>;

    return (
        <SystemState icon={WifiOff} tone="slate" eyebrow={t('states.offline.eyebrow')} title={t('states.offline.title')} description={t('states.offline.description')} notice={notice}>
            <button type="button" onClick={() => navigate(-1)} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-transparent px-5 text-sm font-bold text-slate-700 dark:text-slate-200 transition hover:bg-slate-50 dark:hover:bg-slate-800/50 sm:w-auto"><BackIcon size={17} />{t('states.back')}</button>
            <button type="button" onClick={handleRetry} disabled={isChecking} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-cyan-700 dark:bg-cyan-600 px-5 text-sm font-bold text-white transition hover:bg-cyan-800 dark:hover:bg-cyan-700 disabled:opacity-60 sm:w-auto"><RefreshCw size={17} className={isChecking ? 'animate-spin' : ''} />{isChecking ? t('states.offline.checking') : t('states.offline.retry')}</button>
            {homePath.startsWith('http')
                ? <a href={homePath} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-transparent px-5 text-sm font-bold text-slate-700 dark:text-slate-200 transition hover:bg-slate-50 dark:hover:bg-slate-800/50 sm:w-auto"><Home size={17} />{t('states.home')}</a>
                : <Link to={homePath} className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-transparent px-5 text-sm font-bold text-slate-700 dark:text-slate-200 transition hover:bg-slate-50 dark:hover:bg-slate-800/50 sm:w-auto"><Home size={17} />{t('states.home')}</Link>}
        </SystemState>
    );
};

export default Offline;
