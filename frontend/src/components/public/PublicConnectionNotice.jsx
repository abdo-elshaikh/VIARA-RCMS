import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { checkBackendHealth } from '../../utils/backendHealth';

export default function PublicConnectionNotice({ onSupport }) {
    const { t } = useTranslation('auth');
    const [available, setAvailable] = useState(true);
    const [checking, setChecking] = useState(false);
    const activeRef = useRef(false);
    const pendingRef = useRef(false);
    const check = useCallback(async () => {
        if (pendingRef.current) return;
        pendingRef.current = true;
        setChecking(true);
        try {
            const result = await checkBackendHealth();
            if (activeRef.current) setAvailable(result.backendAvailable);
        } finally {
            pendingRef.current = false;
            if (activeRef.current) setChecking(false);
        }
    }, []);
    useEffect(() => {
        activeRef.current = true;
        const update = (event) => setAvailable(Boolean(event.detail.available));
        const offline = () => setAvailable(false);
        window.addEventListener('VIARA_PUBLIC_CONNECTION', update);
        window.addEventListener('offline', offline);
        void check();
        return () => {
            activeRef.current = false;
            window.removeEventListener('VIARA_PUBLIC_CONNECTION', update);
            window.removeEventListener('offline', offline);
        };
    }, [check]);
    if (available) return null;
    return (
        <div className="public-connection" role="status">
            <span>{t('publicLogin.connectionUnavailable')}</span>
            <button type="button" disabled={checking} onClick={() => void check()}>{checking ? t('publicLogin.checkingConnection') : t('publicLogin.retry')}</button>
            <button type="button" onClick={onSupport}>{t('publicLogin.helpTitle')}</button>
        </div>
    );
}
