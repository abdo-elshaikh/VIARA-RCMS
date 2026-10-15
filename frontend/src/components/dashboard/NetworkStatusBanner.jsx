import React, { useState, useEffect, useCallback, useRef } from 'react';
import { WifiOff, Wifi, RefreshCw, CheckCircle2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { checkBackendHealth } from '../../utils/backendHealth';

const NetworkStatusBanner = () => {
    const { t } = useTranslation(['system', 'common']);
    const [isOnline, setIsOnline] = useState(() => (typeof navigator === 'undefined' ? true : navigator.onLine));
    const [isChecking, setIsChecking] = useState(false);
    const [showRestoredNotice, setShowRestoredNotice] = useState(false);
    const wasOfflineRef = useRef(false);
    const restoredTimerRef = useRef(null);

    const handleRetry = useCallback(async () => {
        setIsChecking(true);
        try {
            const health = await checkBackendHealth({ timeoutMs: 3000 });
            if (health.online && health.backendAvailable) {
                setIsOnline(true);
                setShowRestoredNotice(true);
                if (restoredTimerRef.current) window.clearTimeout(restoredTimerRef.current);
                restoredTimerRef.current = window.setTimeout(() => setShowRestoredNotice(false), 3500);
            }
        } finally {
            setIsChecking(false);
        }
    }, []);

    useEffect(() => {
        const onOnline = () => {
            setIsOnline(true);
            if (wasOfflineRef.current) {
                setShowRestoredNotice(true);
                if (restoredTimerRef.current) window.clearTimeout(restoredTimerRef.current);
                restoredTimerRef.current = window.setTimeout(() => setShowRestoredNotice(false), 3500);
            }
            wasOfflineRef.current = false;
        };

        const onOffline = () => {
            setIsOnline(false);
            wasOfflineRef.current = true;
            setShowRestoredNotice(false);
        };

        window.addEventListener('online', onOnline);
        window.addEventListener('offline', onOffline);

        return () => {
            window.removeEventListener('online', onOnline);
            window.removeEventListener('offline', onOffline);
            if (restoredTimerRef.current) window.clearTimeout(restoredTimerRef.current);
        };
    }, []);

    if (isOnline && !showRestoredNotice) {
        return null;
    }

    if (showRestoredNotice) {
        return (
            <aside
                role="status"
                aria-live="polite"
                className="sticky top-0 z-40 flex items-center justify-between gap-3 border-b border-emerald-500/20 bg-emerald-600/95 px-4 py-2 text-xs font-bold text-white shadow-md backdrop-blur-md transition-all animate-in fade-in slide-in-from-top-2"
            >
                <div className="flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-white shrink-0" />
                    <span>
                        {t('states.offline.online', {
                            defaultValue: 'Connection restored. Cloud synchronization is active.',
                        })}
                    </span>
                </div>
                <div className="flex items-center gap-1.5 opacity-90">
                    <Wifi size={14} />
                    <span className="text-[11px] font-medium uppercase tracking-wider">Online</span>
                </div>
            </aside>
        );
    }

    return (
        <aside
            role="alert"
            aria-live="assertive"
            className="sticky top-0 z-40 flex flex-wrap items-center justify-between gap-3 border-b border-amber-500/30 bg-amber-500/95 px-4 py-2.5 text-xs font-bold text-slate-950 shadow-md backdrop-blur-md dark:border-amber-400/20 dark:bg-amber-600/95 dark:text-white transition-all animate-in fade-in slide-in-from-top-2"
        >
            <div className="flex min-w-0 items-center gap-2.5">
                <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-slate-900 dark:bg-white opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-slate-950 dark:bg-white" />
                </span>
                <WifiOff size={16} className="shrink-0 text-slate-950 dark:text-white" />
                <div className="min-w-0">
                    <p className="truncate font-black">
                        {t('states.offline.disconnected', {
                            defaultValue: 'Offline mode active — in-progress data is preserved locally.',
                        })}
                    </p>
                    <p className="hidden sm:block text-[11px] font-medium opacity-90">
                        {t('states.offline.description', {
                            defaultValue: 'Keep this screen open. Data will automatically synchronize once the connection returns.',
                        })}
                    </p>
                </div>
            </div>

            <button
                type="button"
                onClick={handleRetry}
                disabled={isChecking}
                className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-950 px-3 py-1 text-[11px] font-black text-white shadow-xs transition hover:bg-slate-800 disabled:opacity-60 dark:bg-white dark:text-slate-950 dark:hover:bg-slate-100"
            >
                <RefreshCw size={12} className={isChecking ? 'animate-spin' : ''} />
                <span>{isChecking ? t('states.offline.checking', { defaultValue: 'Checking...' }) : t('states.offline.retry', { defaultValue: 'Retry' })}</span>
            </button>
        </aside>
    );
};

export default NetworkStatusBanner;
