import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, Clock3, ShieldAlert, Sparkles, X } from 'lucide-react';
import { useLicense } from '../hooks/useLicense';

const UPGRADE_URL = import.meta.env.VITE_UPGRADE_URL || 'https://viara.net/upgrade';
const CONTACT_URL = import.meta.env.VITE_SALES_CONTACT_URL || 'https://viara.net/contact';

const TrialBanner = () => {
    const { isTrial, daysRemaining, isExpired, loading, edition } = useLicense();
    const { t, i18n } = useTranslation('common');
    const [dismissed, setDismissed] = useState(false);
    const isArabic = i18n.resolvedLanguage?.startsWith('ar') || i18n.language?.startsWith('ar');

    if (!loading && edition) {
        try {
            sessionStorage.setItem('viara_license_edition', edition);
        } catch {
            // Session storage is optional.
        }
    }

    if (loading || !isTrial || dismissed) return null;

    const expired = isExpired || (daysRemaining !== null && daysRemaining <= 0);
    const isUrgent = !expired && daysRemaining !== null && daysRemaining <= 3;
    const isWarning = !expired && !isUrgent && daysRemaining !== null && daysRemaining <= 7;
    const tone = expired || isUrgent ? 'danger' : isWarning ? 'warning' : 'info';
    const Icon = expired || isUrgent ? ShieldAlert : isWarning ? Clock3 : Sparkles;
    const message = expired
        ? t('trial.expired')
        : daysRemaining === 0
            ? t('trial.lastDay')
            : daysRemaining === 1
                ? t('trial.oneDay')
                : daysRemaining === null
                    ? t('trial.active')
                    : t('trial.daysRemaining', { count: daysRemaining });
    const actionUrl = expired ? CONTACT_URL : UPGRADE_URL;
    const actionLabel = expired ? t('trial.contactUs') : t('trial.upgrade');

    return (
        <div
            id="trial-banner"
            className={`trial-banner trial-banner--${tone} vx-trial select-none`}
            data-tone={tone}
            role={expired || isUrgent ? 'alert' : 'status'}
            aria-live={expired || isUrgent ? 'assertive' : 'polite'}
            dir={isArabic ? 'rtl' : 'ltr'}
        >
            <div className="trial-banner__content vx-trial-msg">
                <span className="trial-banner__icon" aria-hidden="true">
                    <Icon size={16} className={expired || isUrgent ? 'animate-pulse' : ''} />
                </span>

                <p className="trial-banner__message">
                    <span className="trial-banner__badge vx-trial-badge">
                        <span className="trial-banner__badge-dot" aria-hidden="true" />
                        {t('trial.badge')}
                    </span>
                    <span className="trial-banner__text">{message}</span>
                </p>
            </div>

            <div className="trial-banner__actions">
                <a
                    href={actionUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    id={expired ? 'trial-banner-contact-btn' : 'trial-banner-upgrade-btn'}
                    className="trial-banner__cta vx-trial-cta group"
                >
                    <span>{actionLabel}</span>
                    <ArrowUpRight
                        size={14}
                        aria-hidden="true"
                        className="transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 rtl:group-hover:-translate-x-0.5"
                    />
                </a>
                {!expired && (
                    <button
                        id="trial-banner-dismiss-btn"
                        type="button"
                        onClick={() => setDismissed(true)}
                        aria-label={t('trial.dismiss')}
                        title={t('trial.dismiss')}
                        className="trial-banner__dismiss vx-trial-close"
                    >
                        <X size={15} aria-hidden="true" />
                    </button>
                )}
            </div>
        </div>
    );
};

export default TrialBanner;