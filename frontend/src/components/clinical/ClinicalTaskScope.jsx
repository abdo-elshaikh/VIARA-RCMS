import { Inbox, ListChecks, UserRound } from 'lucide-react';

const tabs = [
    { id: 'all', icon: ListChecks },
    { id: 'mine', icon: UserRound },
    { id: 'available', icon: Inbox },
];

export const ClinicalTaskScope = ({ value, onChange, assignedCount = 0, availableCount = 0, t }) => (
    <div className="inline-flex rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] p-1" role="tablist" aria-label={t('taskScope.label')}>
        {tabs.map(({ id, icon: Icon }) => {
            const selected = value === id;
            const count = id === 'all' ? assignedCount + availableCount : id === 'mine' ? assignedCount : availableCount;
            return (
                <button
                    key={id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => onChange(id)}
                    className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-bold transition ${selected
                        ? 'bg-[var(--VIARA-surface)] text-[var(--VIARA-accent)] shadow-sm ring-1 ring-[var(--VIARA-line)]'
                        : 'text-[var(--VIARA-muted)] hover:text-[var(--VIARA-ink)]'}`}
                >
                    <Icon size={14} aria-hidden="true" />
                    <span>{t(`taskScope.${id}`)}</span>
                    <span className={`min-w-5 rounded-md px-1.5 py-0.5 text-center font-mono text-[10px] ${selected
                        ? 'bg-[var(--VIARA-accent-soft)] text-[var(--VIARA-accent)]'
                        : 'bg-[var(--VIARA-surface)] text-[var(--VIARA-muted)]'}`}>{count}</span>
                </button>
            );
        })}
    </div>
);

export const AssignmentBadge = ({ status, t }) => {
    const normalized = status || 'Unassigned';
    const styles = {
        Unassigned: 'border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-500/30 dark:bg-amber-500/10 dark:text-amber-300',
        Assigned: 'border-teal-300 bg-teal-50 text-teal-800 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-300',
        'In Progress': 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-300',
        'On Hold': 'border-rose-300 bg-rose-50 text-rose-800 dark:border-rose-500/30 dark:bg-rose-500/10 dark:text-rose-300',
    };
    return (
        <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${styles[normalized] || styles.Assigned}`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
            {t(`taskScope.status.${normalized}`, { defaultValue: normalized })}
        </span>
    );
};

export default ClinicalTaskScope;
