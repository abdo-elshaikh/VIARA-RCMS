import React from 'react';
import { Mail, Phone } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useGetPublicCenterSettingsQuery } from '../../store/api';
import PublicDialog from './PublicDialog';

export default function PublicSupportDialog({ onClose, returnFocusRef }) {
    const { t } = useTranslation('auth');
    const { data, isLoading, isError, refetch } = useGetPublicCenterSettingsQuery();
    const email = data?.support_email || data?.email;
    const phone = data?.hotline || data?.phone;
    return (
        <PublicDialog title={t('publicLogin.helpTitle')} titleId="viara-support-title" closeLabel={t('publicLogin.close')} onClose={onClose} returnFocusRef={returnFocusRef}>
            <p>{t('publicLogin.helpDescription')}</p>
            {isLoading ? <p role="status">{t('publicLogin.loadingSupport')}</p> : isError ? (
                <div role="alert">
                    <p>{t('publicLogin.supportUnavailable')}</p>
                    <button type="button" className="public-dialog__secondary" onClick={refetch}>{t('publicLogin.retry')}</button>
                </div>
            ) : (
                <div className="public-dialog__contacts">
                    {email && <a href={`mailto:${email}`}><Mail size={20} aria-hidden="true" /><span dir="ltr">{email}</span></a>}
                    {phone && <a href={`tel:${String(phone).replace(/[^+\d]/g, '')}`}><Phone size={20} aria-hidden="true" /><span dir="ltr">{phone}</span></a>}
                    {!email && !phone && <p>{t('publicLogin.noContact')}</p>}
                </div>
            )}
        </PublicDialog>
    );
}
