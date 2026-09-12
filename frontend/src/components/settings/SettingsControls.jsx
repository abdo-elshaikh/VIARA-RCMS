import React from 'react';
import { Check, CheckCircle2, Loader2 } from 'lucide-react';

export const settingsPanelClass = 'settings-panel ds-panel border backdrop-blur-xl';

export const SettingsPanel = ({ id, icon: Icon, title, description, action, children, className = '' }) => (
    <section id={id} className={`${settingsPanelClass} scroll-mt-24 ${className}`}>
        <div className="settings-panel-header flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
                {Icon && (
                    <span className="settings-panel-icon mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center">
                        <Icon size={17} aria-hidden="true" />
                    </span>
                )}
                <div className="min-w-0">
                    <h2 className="text-sm font-black text-[var(--VIARA-ink)]">{title}</h2>
                    {description && <p className="mt-1 text-xs leading-5 text-[var(--VIARA-muted)]">{description}</p>}
                </div>
            </div>
            {action && <div className="shrink-0">{action}</div>}
        </div>
        <div className="settings-panel-body">{children}</div>
    </section>
);

export const SettingsChoice = ({ selected, disabled, onClick, compact = false, center = false, children, className = '', ariaLabel }) => (
    <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        aria-pressed={selected}
        aria-label={ariaLabel}
        className={`settings-choice relative flex min-w-0 ${compact ? 'flex-row items-center gap-3' : 'flex-col'} ${center ? 'items-center justify-center text-center' : 'items-start text-start'} ${selected ? 'settings-choice-selected' : ''} ${className}`}
    >
        {children}
        {selected && (
            <span className="settings-choice-check absolute end-2.5 top-2.5 flex h-5 w-5 items-center justify-center" aria-hidden="true">
                <Check size={12} strokeWidth={3} />
            </span>
        )}
    </button>
);

export const SettingsFact = ({ label, value, icon: Icon }) => (
    <div className="settings-fact min-w-0">
        <span className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-[var(--VIARA-muted)]">
            {Icon && <Icon size={11} aria-hidden="true" />}
            {label}
        </span>
        <p className="mt-1 break-words text-xs font-black leading-5 text-[var(--VIARA-ink)]">{value}</p>
    </div>
);

export const SettingsSwitch = ({ label, checked, disabled, onChange, describedBy }) => (
    <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        aria-describedby={describedBy}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className="settings-switch"
        data-checked={checked}
    >
        <span className="settings-switch-thumb" aria-hidden="true" />
    </button>
);

export const SettingsSyncStatus = ({ loading, label, loadingLabel }) => (
    <span className={`settings-sync-status ds-status ${loading ? 'ds-status-accent' : 'ds-status-success'} inline-flex items-center gap-1.5 border px-3 py-1 text-xs font-bold`} role="status" aria-live="polite">
        {loading
            ? <Loader2 size={13} className="animate-spin" aria-hidden="true" />
            : <CheckCircle2 size={13} aria-hidden="true" />}
        {loading ? loadingLabel : label}
    </span>
);

export const SettingsRow = ({ title, description, children, className = '' }) => (
    <div className={`settings-row flex items-center justify-between gap-4 ${className}`}>
        <div className="min-w-0">
            <p className="text-xs font-extrabold text-[var(--VIARA-ink)]">{title}</p>
            {description && <p className="mt-1 text-[11px] leading-5 text-[var(--VIARA-muted)]">{description}</p>}
        </div>
        <div className="shrink-0">{children}</div>
    </div>
);
