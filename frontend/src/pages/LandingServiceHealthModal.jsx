import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, AlertCircle, CheckCircle2, Copy, RotateCw, Server, X } from 'lucide-react';
import { useSelector } from 'react-redux';
import { selectCurrentUser, selectIsAuthenticated } from '../store/authSlice';
import { useGetOrthancSystemQuery } from '../store/api';
import './LandingServiceHealthModal.css';

const API_BASE = (import.meta.env.VITE_API_URL || '/api').replace(/\/+$/, '');
const OHIF_URL = import.meta.env.VITE_OHIF_URL
    || `${window.location.protocol}//${window.location.hostname}:3005`;
const SERVICES = [
    { id: 'backend', en: 'Backend API', ar: 'الخادم الخلفي', compose: 'backend' },
    { id: 'orthanc', en: 'Orthanc PACS', ar: 'أورثانك PACS', compose: 'orthanc' },
    { id: 'ohif', en: 'OHIF Viewer', ar: 'عارض OHIF', compose: 'ohif' },
];

async function checkUrl(url, { timeoutMs = 5000, opaqueIsReachable = false } = {}) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
    try {
        const response = await fetch(url, {
            method: 'GET',
            cache: 'no-store',
            credentials: 'omit',
            mode: opaqueIsReachable ? 'no-cors' : 'cors',
            signal: controller.signal,
        });
        return response.ok || (opaqueIsReachable && response.type === 'opaque');
    } catch {
        return false;
    } finally {
        window.clearTimeout(timeout);
    }
}

export default function LandingServiceHealthModal({ onClose, isRtl }) {
    const isAuthenticated = useSelector(selectIsAuthenticated);
    const currentUser = useSelector(selectCurrentUser);
    const canCheckOrthanc = Boolean(isAuthenticated && currentUser);
    const { data: orthanc, error: orthancError, isFetching: orthancFetching, refetch } =
        useGetOrthancSystemQuery(undefined, {
            skip: !canCheckOrthanc,
            pollingInterval: 0,
        });
    const [backendState, setBackendState] = useState('checking');
    const [ohifState, setOhifState] = useState('checking');
    const [checking, setChecking] = useState(false);
    const [copied, setCopied] = useState('');
    const [checkedAt, setCheckedAt] = useState(null);
    const onCloseRef = useRef(onClose);

    useEffect(() => {
        onCloseRef.current = onClose;
    }, [onClose]);

    const checkWebServices = useCallback(async () => {
        setChecking(true);
        setBackendState('checking');
        setOhifState('checking');
        const [backendOk, ohifOk] = await Promise.all([
            checkUrl(`${API_BASE}/v1/health`),
            checkUrl(OHIF_URL, { opaqueIsReachable: true }),
        ]);
        setBackendState(backendOk ? 'online' : 'offline');
        setOhifState(ohifOk ? 'online' : 'offline');
        setCheckedAt(new Date());
        setChecking(false);
    }, []);

    useEffect(() => {
        void checkWebServices();
        const onKeyDown = (event) => {
            if (event.key === 'Escape') onCloseRef.current?.();
        };
        window.addEventListener('keydown', onKeyDown);
        return () => {
            window.removeEventListener('keydown', onKeyDown);
        };
    }, [checkWebServices]);

    const copyCommand = async (service, action) => {
        const targets = service?.compose || 'backend orthanc ohif';
        const command = action === 'start'
            ? `docker compose up -d --build ${targets}`
            : `docker compose up -d --build --force-recreate ${targets}`;
        try {
            if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(command);
            } else {
                const input = document.createElement('textarea');
                input.value = command;
                input.style.position = 'fixed';
                input.style.opacity = '0';
                document.body.appendChild(input);
                input.select();
                const successful = document.execCommand('copy');
                input.remove();
                if (!successful) throw new Error('Clipboard unavailable');
            }
            setCopied(`${service?.id || 'all'}-${action}`);
            window.setTimeout(() => setCopied(''), 1800);
        } catch {
            setCopied('failed');
        }
    };

    const labels = isRtl
        ? {
              title: 'حالة الخدمات',
              description: 'افحص اتصال الخدمات أو انسخ أمر إدارتها وشغّله من مجلد المشروع.',
              refresh: 'إعادة الفحص',
              close: 'إغلاق',
              online: 'تعمل',
              offline: 'لا تستجيب',
              locked: 'تحتاج إلى تسجيل دخول مخوّل',
              checking: 'جارٍ الفحص',
              start: 'نسخ أمر التشغيل',
              restart: 'نسخ أمر إعادة التشغيل',
              copied: 'تم النسخ',
              copyFailed: 'تعذر النسخ',
              note: 'لأمان النظام، تُنسخ الأوامر فقط ولا تُنفّذ من المتصفح. شغّلها في Terminal أو PowerShell من مجلد VIARA.',
              allOnline: 'الخدمات الثلاث تستجيب.',
              partial: 'تحقق من الخدمات التي لا تستجيب ثم شغّل أمر البدء أو إعادة التشغيل.',
          }
        : {
              title: 'Service health',
              description: 'Check service connectivity or copy a management command to run from the project folder.',
              refresh: 'Check again',
              close: 'Close',
              online: 'Online',
              offline: 'Not responding',
              locked: 'Authorized sign-in required',
              checking: 'Checking',
              start: 'Copy start command',
              restart: 'Copy restart command',
              copied: 'Copied',
              copyFailed: 'Could not copy',
              note: 'For system safety, commands are copied but not run by the browser. Run them in Terminal or PowerShell from the VIARA project folder.',
              allOnline: 'All three services are responding.',
              partial: 'Check any service that is not responding, then run its start or restart command.',
          };

    const states = {
        backend: backendState,
        orthanc: !canCheckOrthanc
            ? 'locked'
            : orthancFetching
            ? 'checking'
            : orthanc && !orthancError
              ? 'online'
              : [401, 403].includes(orthancError?.status)
                ? 'locked'
                : 'offline',
        ohif: ohifState,
    };
    const allOnline = Object.values(states).every((state) => state === 'online');
    const isChecking = checking || Object.values(states).some((state) => state === 'checking');
    const onlineCount = Object.values(states).filter((state) => state === 'online').length;
    const lockedCount = Object.values(states).filter((state) => state === 'locked').length;
    const offlineCount = Object.values(states).filter((state) => state === 'offline').length;
    const progressLabel = isRtl ? '\u062c\u0627\u0631\u064d \u0627\u0644\u062a\u062d\u0642\u0642 \u0645\u0646 \u0627\u0644\u062e\u062f\u0645\u0627\u062a...' : 'Checking services…';
    const countLabel = isRtl
        ? `${onlineCount} \u0645\u0646 ${3 - lockedCount} \u062e\u062f\u0645\u0627\u062a \u0645\u0641\u062d\u0648\u0635\u0629 \u062a\u0633\u062a\u062c\u064a\u0628${lockedCount ? `\u060c ${lockedCount} \u062a\u062d\u062a\u0627\u062c \u0644\u062a\u0633\u062c\u064a\u0644 \u0627\u0644\u062f\u062e\u0648\u0644` : ''}`
        : `${onlineCount} of ${3 - lockedCount} checked services responding${lockedCount ? `; ${lockedCount} requires authorized sign-in` : ''}`;
    const summaryLabel = lockedCount && offlineCount
        ? isRtl
            ? '\u062a\u062d\u062a\u0627\u062c \u062d\u0627\u0644\u0629 Orthanc \u0625\u0644\u0649 \u062a\u0633\u062c\u064a\u0644 \u062f\u062e\u0648\u0644\u060c \u0648OHIF \u0644\u0627 \u062a\u0633\u062a\u062c\u064a\u0628.'
            : 'Orthanc needs authorized sign-in; OHIF is not responding.'
        : lockedCount && !offlineCount
            ? isRtl
                ? '\u0628\u0639\u0636 \u0627\u0644\u0641\u062d\u0648\u0635\u0627\u062a \u062a\u062a\u0637\u0644\u0628 \u062a\u0633\u062c\u064a\u0644 \u062f\u062e\u0648\u0644 \u0645\u062e\u0648\u0651\u0644.'
                : 'Some checks require an authorized sign-in.'
            : labels.partial;
    const checkedAtLabel = isRtl ? '\u0622\u062e\u0631 \u0641\u062d\u0635' : 'Last check';
    const startAllLabel = isRtl ? '\u062a\u0634\u063a\u064a\u0644 \u0627\u0644\u0643\u0644' : 'Start all';
    const restartAllLabel = isRtl ? '\u0625\u0639\u0627\u062f\u0629 \u062a\u0634\u063a\u064a\u0644 \u0627\u0644\u0643\u0644' : 'Restart all';

    return (
        <div className="vlp-health-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
            <section
                className="vlp-health-modal"
                role="dialog"
                aria-modal="true"
                aria-labelledby="vlp-health-title"
                dir={isRtl ? 'rtl' : 'ltr'}
            >
                <header className="vlp-health-header">
                    <span className="vlp-health-mark"><Activity size={21} /></span>
                    <div>
                        <h2 id="vlp-health-title">{labels.title}</h2>
                        <p>{labels.description}</p>
                    </div>
                    <button className="vlp-health-close" onClick={onClose} aria-label={labels.close} type="button"><X size={19} /></button>
                </header>

                <div className={`vlp-health-summary ${allOnline ? 'is-online' : ''} ${isChecking ? 'is-checking' : ''}`}>
                    {isChecking ? <RotateCw size={19} className="is-spinning" /> : allOnline ? <CheckCircle2 size={19} /> : <AlertCircle size={19} />}
                    <strong>{isChecking ? progressLabel : allOnline ? labels.allOnline : summaryLabel}</strong>
                    <button type="button" onClick={() => { void checkWebServices(); if (canCheckOrthanc) void refetch(); }} disabled={checking || orthancFetching}>
                        <RotateCw size={15} className={checking || orthancFetching ? 'is-spinning' : ''} />
                        {labels.refresh}
                    </button>
                </div>

                <div className="vlp-health-overview">
                    <span>{countLabel}</span>
                    {checkedAt && <time dateTime={checkedAt.toISOString()}>{checkedAtLabel}: {checkedAt.toLocaleTimeString(isRtl ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</time>}
                    <div>
                        <button type="button" onClick={() => void copyCommand(null, 'start')}><Copy size={13} />{copied === 'all-start' ? labels.copied : startAllLabel}</button>
                        <button type="button" onClick={() => void copyCommand(null, 'restart')}><RotateCw size={13} />{copied === 'all-restart' ? labels.copied : restartAllLabel}</button>
                    </div>
                </div>

                <div className="vlp-health-services">
                    {SERVICES.map((service) => {
                        const state = states[service.id];
                        const isCopied = copied.startsWith(service.id);
                        return (
                            <article className="vlp-health-service" key={service.id}>
                                <span className="vlp-health-service-icon"><Server size={19} /></span>
                                <div className="vlp-health-service-info">
                                    <strong>{isRtl ? service.ar : service.en}</strong>
                                    <span className={`vlp-health-status status-${state}`}>
                                        <i />{state === 'online' ? labels.online : state === 'checking' ? labels.checking : state === 'locked' ? labels.locked : labels.offline}
                                    </span>
                                </div>
                                <div className="vlp-health-actions">
                                    <button type="button" onClick={() => void copyCommand(service, 'start')}>
                                        <Copy size={14} />{copied === `${service.id}-start` ? labels.copied : labels.start}
                                    </button>
                                    <button type="button" onClick={() => void copyCommand(service, 'restart')}>
                                        <RotateCw size={14} />{copied === `${service.id}-restart` ? labels.copied : labels.restart}
                                    </button>
                                </div>
                            </article>
                        );
                    })}
                </div>

                {copied === 'failed' && <p className="vlp-health-copy-error">{labels.copyFailed}</p>}
                <footer className="vlp-health-footer">{labels.note}</footer>
            </section>
        </div>
    );
}
