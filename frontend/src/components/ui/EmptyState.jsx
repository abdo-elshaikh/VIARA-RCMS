import { AlertCircle, FileSearch, Inbox, Plus, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Button from './Button';

// ─── Animated SVG Artwork ─────────────────────────────────────────────────────

const ArtworkSearch = () => (
    <svg viewBox="0 0 120 100" className="h-full w-full" fill="none" aria-hidden="true">
        <ellipse cx="60" cy="88" rx="38" ry="5" fill="rgba(var(--VIARA-accent-rgb,8,127,91),.08)" />
        {/* Document stack */}
        <rect x="28" y="22" width="44" height="54" rx="6" fill="var(--VIARA-surface-muted)" stroke="var(--VIARA-line)" strokeWidth="1.5" />
        <rect x="32" y="18" width="44" height="54" rx="6" fill="var(--VIARA-surface)" stroke="var(--VIARA-line)" strokeWidth="1.5" />
        {/* Lines on doc */}
        <rect x="40" y="32" width="28" height="3" rx="1.5" fill="var(--VIARA-line-strong)" opacity=".5" />
        <rect x="40" y="40" width="20" height="3" rx="1.5" fill="var(--VIARA-line-strong)" opacity=".35" />
        <rect x="40" y="48" width="24" height="3" rx="1.5" fill="var(--VIARA-line-strong)" opacity=".35" />
        {/* Magnifier */}
        <circle
            cx="74" cy="64" r="14"
            fill="color-mix(in srgb, var(--VIARA-accent-soft) 80%, transparent)"
            stroke="var(--VIARA-accent)" strokeWidth="3"
            style={{ animation: 'es-bob 2.4s ease-in-out infinite' }}
        />
        <line x1="84" y1="74" x2="94" y2="84" stroke="var(--VIARA-accent)" strokeWidth="4" strokeLinecap="round" />
        {/* Sparkle */}
        <circle cx="38" cy="16" r="2" fill="var(--VIARA-accent)" opacity=".4"
            style={{ animation: 'es-pulse 2s ease-in-out infinite 0.5s' }} />
        <circle cx="90" cy="24" r="1.5" fill="var(--VIARA-accent)" opacity=".3"
            style={{ animation: 'es-pulse 2s ease-in-out infinite 1s' }} />
    </svg>
);

const ArtworkEmpty = () => (
    <svg viewBox="0 0 120 100" className="h-full w-full" fill="none" aria-hidden="true">
        <ellipse cx="60" cy="88" rx="38" ry="5" fill="rgba(var(--VIARA-accent-rgb,8,127,91),.08)" />
        {/* Inbox tray */}
        <rect x="22" y="48" width="76" height="34" rx="8" fill="var(--VIARA-surface)" stroke="var(--VIARA-line)" strokeWidth="1.5" />
        <path d="M22 64h22l6 10h20l6-10h22" stroke="var(--VIARA-line)" strokeWidth="1.5" fill="none" />
        {/* Floating papers */}
        <rect
            x="40" y="22" width="32" height="26" rx="5"
            fill="var(--VIARA-surface-muted)" stroke="var(--VIARA-line)" strokeWidth="1.5"
            style={{ animation: 'es-float 3s ease-in-out infinite' }}
        />
        <rect x="48" y="30" width="16" height="2.5" rx="1.25" fill="var(--VIARA-muted)" opacity=".4" />
        <rect x="48" y="36" width="10" height="2.5" rx="1.25" fill="var(--VIARA-muted)" opacity=".3" />
        {/* Dots */}
        <circle cx="32" cy="20" r="2" fill="var(--VIARA-accent)" opacity=".35"
            style={{ animation: 'es-pulse 2.5s ease-in-out infinite' }} />
        <circle cx="88" cy="32" r="1.5" fill="var(--VIARA-accent)" opacity=".25"
            style={{ animation: 'es-pulse 2.5s ease-in-out infinite 0.8s' }} />
    </svg>
);

const ArtworkError = () => (
    <svg viewBox="0 0 120 100" className="h-full w-full" fill="none" aria-hidden="true">
        <ellipse cx="60" cy="88" rx="38" ry="5" fill="rgba(var(--VIARA-accent-rgb,8,127,91),.08)" />
        {/* Cloud */}
        <path
            d="M35 62c0-13 10-23 22-23a22 22 0 0 1 21 15 16 16 0 0 1 7 13H35c0-3 0-5 0-5Z"
            fill="var(--VIARA-surface)" stroke="var(--VIARA-line)" strokeWidth="1.5"
            style={{ animation: 'es-bob 3s ease-in-out infinite' }}
        />
        {/* X mark */}
        <path d="M50 45l20 14M70 45L50 59" stroke="var(--VIARA-danger)" strokeWidth="3.5" strokeLinecap="round" />
        <circle cx="88" cy="30" r="2" fill="var(--VIARA-danger)" opacity=".3"
            style={{ animation: 'es-pulse 2s ease-in-out infinite 0.4s' }} />
        <circle cx="34" cy="28" r="1.5" fill="var(--VIARA-danger)" opacity=".25"
            style={{ animation: 'es-pulse 2s ease-in-out infinite 1.1s' }} />
    </svg>
);

const artworkMap = {
    search: ArtworkSearch,
    default: ArtworkEmpty,
    error: ArtworkError,
};

// ─── CSS keyframes injected once ─────────────────────────────────────────────
let _injected = false;
const injectKeyframes = () => {
    if (_injected || typeof document === 'undefined') return;
    _injected = true;
    const style = document.createElement('style');
    style.textContent = `
        @keyframes es-bob   { 0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)} }
        @keyframes es-float { 0%,100%{transform:translateY(0) rotate(-1deg)}50%{transform:translateY(-7px) rotate(1deg)} }
        @keyframes es-pulse { 0%,100%{opacity:.25;transform:scale(1)}50%{opacity:.6;transform:scale(1.35)} }
    `;
    document.head.appendChild(style);
};

// ─── Component ────────────────────────────────────────────────────────────────
const variantColors = {
    default: 'bg-[var(--VIARA-surface-muted)] text-[var(--VIARA-muted)]',
    search:  'bg-[var(--VIARA-accent-soft)] text-[var(--VIARA-accent)] dark:bg-[rgba(var(--VIARA-accent-rgb),0.14)] dark:text-[var(--VIARA-accent-text)]',
    error:   'bg-[var(--VIARA-danger-soft)] text-[var(--VIARA-danger)]',
};

const EmptyState = ({
    icon,
    title,
    description,
    subtitle,
    action,
    actionLabel,
    onAction,
    variant = 'default',
    compact = false,
    artwork = true,          // set to false to hide SVG artwork
    className = '',
}) => {
    injectKeyframes();
    const { t } = useTranslation('system');
    const DisplayIcon = icon || ({ search: Search, error: AlertCircle, default: Inbox }[variant] || Inbox);
    const Artwork = artworkMap[variant] || artworkMap.default;
    const supportingText = description || subtitle;

    return (
        <div className={`flex flex-col items-center justify-center px-4 text-center ${compact ? 'py-7' : 'py-12'} ${className}`}>
            {/* Animated SVG artwork (hidden in compact mode) */}
            {artwork && !compact && (
                <div className="mb-3 h-28 w-40 opacity-90">
                    <Artwork />
                </div>
            )}

            {/* Fallback icon badge (always shown in compact mode) */}
            {(!artwork || compact) && (
                <div className={`${compact ? 'mb-3 h-12 w-12' : 'mb-5 h-16 w-16'} flex items-center justify-center rounded-2xl ring-8 ring-[var(--VIARA-canvas)] dark:ring-[var(--VIARA-surface)] ${variantColors[variant] || variantColors.default}`}>
                    <DisplayIcon className={compact ? 'h-5 w-5' : 'h-7 w-7'} aria-hidden="true" />
                </div>
            )}

            <h3 className={`${compact ? 'text-sm' : 'text-base'} font-bold text-[var(--VIARA-ink)]`}>
                {title || t('empty.defaultTitle')}
            </h3>
            {supportingText && (
                <p className="mt-2 max-w-sm text-sm leading-6 text-[var(--VIARA-muted)]">{supportingText}</p>
            )}
            {action || (onAction && (
                <Button
                    icon={Plus}
                    onClick={onAction}
                    variant="primary"
                    size="md"
                    className="mt-6"
                >
                    {actionLabel || t('empty.create')}
                </Button>
            ))}
        </div>
    );
};

// ─── Presets ──────────────────────────────────────────────────────────────────
const Preset = ({ type, ...props }) => {
    const { t } = useTranslation('system');
    const config = {
        patients:     { variant: 'search', title: t('empty.patients.title'),     description: t('empty.patients.description') },
        appointments: { variant: 'default', title: t('empty.appointments.title'), description: t('empty.appointments.description') },
        search:       { variant: 'search', title: t('empty.search.title'),       description: t('empty.search.description') },
        worklist:     { variant: 'search', title: t('empty.worklist.title'),     description: t('empty.worklist.description') },
    }[type];
    return <EmptyState {...config} {...props} />;
};

EmptyState.NoPatients      = props => <Preset type="patients"     {...props} />;
EmptyState.NoAppointments  = props => <Preset type="appointments" {...props} />;
EmptyState.NoSearchResults = props => <Preset type="search"       {...props} />;
EmptyState.EmptyWorklist   = props => <Preset type="worklist"     {...props} />;

export default EmptyState;
