import { AlertCircle, FileSearch, Inbox, Plus, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import Button from './Button';

const variantIcons = { default: Inbox, search: FileSearch, error: AlertCircle };
const variantColors = {
    default: 'bg-slate-100 text-slate-400 dark:bg-[var(--VIARA-surface-muted)] dark:text-[var(--VIARA-muted)]',
    search: 'bg-[var(--VIARA-accent-soft)] text-[var(--VIARA-accent)] dark:bg-[rgba(var(--VIARA-accent-rgb),0.14)] dark:text-[var(--VIARA-accent-text)]',
    error: 'bg-red-50 text-red-500 dark:bg-red-400/10 dark:text-red-300',
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
    className = '',
}) => {
    const { t } = useTranslation('system');
    const DisplayIcon = icon || variantIcons[variant] || Inbox;
    const supportingText = description || subtitle;

    return (
        <div className={`flex flex-col items-center justify-center px-4 text-center ${compact ? 'py-7' : 'py-12'} ${className}`}>
            <div className={`${compact ? 'mb-3 h-12 w-12' : 'mb-5 h-16 w-16'} flex items-center justify-center rounded-2xl ring-8 ring-slate-50 dark:ring-[var(--VIARA-surface)] ${variantColors[variant] || variantColors.default}`}>
                <DisplayIcon className={compact ? 'h-5 w-5' : 'h-7 w-7'} aria-hidden="true" />
            </div>
            <h3 className={`${compact ? 'text-sm' : 'text-lg'} font-semibold text-slate-900 dark:text-[var(--VIARA-ink)]`}>{title || t('empty.defaultTitle')}</h3>
            {supportingText && <p className="mt-2 max-w-sm text-sm leading-6 text-slate-500 dark:text-[var(--VIARA-muted)]">{supportingText}</p>}
            {action || (onAction && <Button onClick={onAction} variant="primary" size="md" className="mt-6"><Plus className="h-4 w-4" />{actionLabel || t('empty.create')}</Button>)}
        </div>
    );
};

const Preset = ({ type, ...props }) => {
    const { t } = useTranslation('system');
    const config = {
        patients: { icon: Search, title: t('empty.patients.title'), description: t('empty.patients.description') },
        appointments: { icon: Inbox, title: t('empty.appointments.title'), description: t('empty.appointments.description') },
        search: { variant: 'search', title: t('empty.search.title'), description: t('empty.search.description') },
        worklist: { icon: FileSearch, title: t('empty.worklist.title'), description: t('empty.worklist.description') },
    }[type];
    return <EmptyState {...config} {...props} />;
};

EmptyState.NoPatients = props => <Preset type="patients" {...props} />;
EmptyState.NoAppointments = props => <Preset type="appointments" {...props} />;
EmptyState.NoSearchResults = props => <Preset type="search" {...props} />;
EmptyState.EmptyWorklist = props => <Preset type="worklist" {...props} />;

export default EmptyState;
