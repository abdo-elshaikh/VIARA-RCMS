import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Activity, AlertCircle, CheckCircle2, Copy, RotateCw } from 'lucide-react';
import { useSelector } from 'react-redux';
import { selectCurrentUser, selectIsAuthenticated } from '../store/authSlice';
import { useGetOrthancSystemQuery } from '../store/api';
import { checkBackendHealth } from '../utils/backendHealth';
import PublicDialog from '../components/public/PublicDialog';
import '../styles/LandingServiceHealthModal.css';

export default function LandingServiceHealthModal({ onClose, onSupport, isRtl }) {
    const authenticated = useSelector(selectIsAuthenticated);
    const user = useSelector(selectCurrentUser);
    const canManage = authenticated && ['Admin', 'Developer'].includes(user?.role);
    const { data: orthanc, error: orthancError, isFetching: orthancFetching, refetch } = useGetOrthancSystemQuery(undefined, { skip: !canManage });
    const [state, setState] = useState('checking');
    const [checkedAt, setCheckedAt] = useState(null);
    const [copied, setCopied] = useState('');
    const activeRef = useRef(false);
    const pendingRef = useRef(false);
    const copyTimerRef = useRef(null);
    const t = (ar, en) => isRtl ? ar : en;

    const check = useCallback(async () => {
        if (pendingRef.current) return;
        pendingRef.current = true;
        setState('checking');
        try {
            const result = await checkBackendHealth({ timeoutMs: 5000 });
            if (!activeRef.current) return;
            setState(result.backendAvailable ? 'online' : 'offline');
            setCheckedAt(new Date());
        } finally { pendingRef.current = false; }
    }, []);

    useEffect(() => {
        activeRef.current = true;
        void check();
        return () => { activeRef.current = false; window.clearTimeout(copyTimerRef.current); };
    }, [check]);

    const copyCommand = async (target, restart = false) => {
        try {
            const command = `docker compose up -d --build ${restart ? '--force-recreate ' : ''}${target}`;
            await navigator.clipboard.writeText(command);
            setCopied(command);
            window.clearTimeout(copyTimerRef.current);
            copyTimerRef.current = window.setTimeout(() => setCopied(''), 2000);
        } catch { setCopied('failed'); }
    };

    return (
        <PublicDialog title={t('حالة النظام', 'System availability')} titleId="vlp-health-title" closeLabel={t('إغلاق', 'Close')} onClose={onClose} className="public-dialog--health">
            <p>{t('تحقق من إمكانية الوصول للنظام أو تواصل مع فريق الدعم في مركزك.', 'Check whether the system is available, or contact your center support team.')}</p>
            <div className={`vlp-health-summary ${state === 'online' ? 'is-online' : ''}`} role="status" aria-live="polite">
                {state === 'checking' ? <RotateCw size={22} className="is-spinning" aria-hidden="true" /> : state === 'online' ? <CheckCircle2 size={22} aria-hidden="true" /> : <AlertCircle size={22} aria-hidden="true" />}
                <strong>{state === 'checking' ? t('جارٍ التحقق من الاتصال…', 'Checking connectivity…') : state === 'online' ? t('النظام متاح حاليًا.', 'The system is currently available.') : t('تعذر الوصول للنظام حاليًا. أعد المحاولة أو تواصل مع الدعم.', 'The system is currently unavailable. Try again or contact support.')}</strong>
            </div>
            {checkedAt && <p className="vlp-health-checked"><span>{t('آخر فحص', 'Last checked')}: </span><time dateTime={checkedAt.toISOString()}>{checkedAt.toLocaleTimeString(isRtl ? 'ar-EG' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</time></p>}
            <div className="vlp-health-public-actions">
                <button type="button" className="public-dialog__secondary" disabled={state === 'checking'} onClick={() => void check()}><RotateCw size={18} aria-hidden="true" />{t('إعادة الفحص', 'Check again')}</button>
                {onSupport && <button type="button" className="public-dialog__secondary" onClick={onSupport}><Activity size={18} aria-hidden="true" />{t('التواصل مع الدعم', 'Contact support')}</button>}
            </div>
            {canManage && (
                <details className="vlp-health-admin">
                    <summary>{t('تفاصيل إدارة النظام', 'System administration details')}</summary>
                    <p>{t('خدمة الصور', 'Imaging service')}: {orthancFetching ? t('جارٍ الفحص', 'Checking') : orthanc && !orthancError ? t('تستجيب', 'Responding') : t('تعذر الفحص', 'Could not check')}</p>
                    <button type="button" className="public-dialog__secondary" disabled={orthancFetching} onClick={() => void refetch()}>{t('فحص خدمة الصور', 'Check imaging service')}</button>
                    <p>{t('انسخ الأوامر وشغّلها من مجلد المشروع. لا تُنفَّذ في المتصفح.', 'Copy commands and run them from the project folder. They are not executed by the browser.')}</p>
                    {['backend', 'orthanc', 'ohif'].map(target => (
                        <div className="vlp-health-admin-row" key={target}>
                            <strong dir="ltr">{target}</strong>
                            <button type="button" className="public-dialog__secondary" onClick={() => void copyCommand(target)}><Copy size={16} aria-hidden="true" />{t('نسخ أمر التشغيل', 'Copy start command')}</button>
                            <button type="button" className="public-dialog__secondary" onClick={() => void copyCommand(target, true)}>{t('نسخ أمر إعادة التشغيل', 'Copy restart command')}</button>
                        </div>
                    ))}
                    {copied && <p role="status">{copied === 'failed' ? t('تعذر النسخ', 'Could not copy') : t('تم نسخ الأمر', 'Command copied')}</p>}
                </details>
            )}
        </PublicDialog>
    );
}
