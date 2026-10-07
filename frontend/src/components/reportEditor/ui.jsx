// Presentational, prop-driven UI primitives for the report editor. Each is memoized
// and free of business logic, so they can be reused across the editor and tested in
// isolation. Extracted from ReportEditorPage.jsx.
import React, { memo, useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useSelector } from 'react-redux';
import { selectCurrentUser } from '../../store/authSlice';
import {
    useGetPatientDocumentsQuery,
    useUploadDocumentMutation,
    useDeleteDocumentMutation
} from '../../store/api';
import toast from 'react-hot-toast';
import { authenticatedFetch } from '../../utils/authenticatedFetch';
import { formatDateTime } from './utils';
import { inputClass, secondaryBtn } from '../../utils/designTokens';
import { hasDeveloperOrAdminRole } from '../../utils/roles';
import {
    AlertCircle,
    AlertTriangle,
    Bot,
    Brain,
    BrainCircuit,
    Check,
    CheckCircle,
    CheckCircle2,
    ChevronDown,
    ChevronUp,
    ClipboardCheck,
    Clock3,
    Download,
    Eye,
    FileCheck2,
    FileImage,
    FileText,
    Info,
    LayoutTemplate,
    Loader2,
    LockKeyhole,
    Mic,
    MicOff,
    Monitor,
    MoreHorizontal,
    PenLine,
    Printer,
    RefreshCw,
    RotateCcw,
    Save,
    Send,
    ServerCog,
    Sparkles,
    Trash2,
    Upload,
    X,
    XCircle
} from 'lucide-react';
import {
    PANEL,
    PANEL_HEADER,
    PANEL_TITLE,
    SECTION_CONFIG,
    SOFT_BUTTON,
    FLOATING_FOOTER
} from './constants';

const getToneClasses = (tone) => {
    const tones = {
        slate:
            'bg-slate-50/80 text-slate-700 ring-slate-200/70 dark:bg-slate-800/40 dark:text-slate-300 dark:ring-slate-700/50',
        teal:
            'bg-teal-50/80 text-teal-700 ring-teal-200/70 dark:bg-teal-950/30 dark:text-teal-300 dark:ring-teal-800/50',
        amber:
            'bg-amber-50/80 text-amber-700 ring-amber-200/70 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-800/50',
        emerald:
            'bg-emerald-50/80 text-emerald-700 ring-emerald-200/70 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-800/50',
        rose:
            'bg-rose-50/80 text-rose-700 ring-rose-200/70 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-800/50',
        blue:
            'bg-blue-50/80 text-blue-700 ring-blue-200/70 dark:bg-blue-950/30 dark:text-blue-300 dark:ring-blue-800/50'
    };

    return tones[tone] || tones.slate;
};

const useClickOutside = (onOutside) => {
    const ref = React.useRef(null);
    React.useEffect(() => {
        const handlePointerDown = (event) => {
            if (ref.current && !ref.current.contains(event.target)) onOutside();
        };
        document.addEventListener('mousedown', handlePointerDown);
        return () => document.removeEventListener('mousedown', handlePointerDown);
    }, [onOutside]);
    return ref;
};

const useFloatingMenu = ({ open, onClose, width = 240, align = 'end', maxHeight = 288 }) => {
    const triggerRef = useRef(null);
    const menuRef = useRef(null);
    const [style, setStyle] = useState(null);

    useEffect(() => {
        if (!open) return undefined;

        const updatePosition = () => {
            const trigger = triggerRef.current;
            if (!trigger) return;

            const rect = trigger.getBoundingClientRect();
            const margin = 12;
            const gap = 8;
            const direction = window.getComputedStyle(trigger).direction;
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const preferredLeft = align === 'start'
                ? (direction === 'rtl' ? rect.right - width : rect.left)
                : (direction === 'rtl' ? rect.left : rect.right - width);
            const left = Math.min(
                Math.max(margin, preferredLeft),
                Math.max(margin, viewportWidth - width - margin)
            );
            const availableBelow = viewportHeight - rect.bottom - margin - gap;
            const availableAbove = rect.top - margin - gap;
            const placeAbove = availableBelow < Math.min(maxHeight, 180) && availableAbove > availableBelow;
            const availableHeight = Math.max(120, Math.min(maxHeight, placeAbove ? availableAbove : availableBelow));
            const top = placeAbove
                ? Math.max(margin, rect.top - availableHeight - gap)
                : Math.min(rect.bottom + gap, viewportHeight - availableHeight - margin);

            setStyle({
                position: 'fixed',
                left: `${left}px`,
                top: `${top}px`,
                width: `${Math.min(width, viewportWidth - margin * 2)}px`,
                maxHeight: `${availableHeight}px`
            });
        };

        updatePosition();
        window.addEventListener('resize', updatePosition);
        window.addEventListener('scroll', updatePosition, true);
        return () => {
            window.removeEventListener('resize', updatePosition);
            window.removeEventListener('scroll', updatePosition, true);
        };
    }, [align, maxHeight, open, width]);

    useEffect(() => {
        if (!open) return undefined;

        const handlePointerDown = (event) => {
            const target = event.target;
            if (
                triggerRef.current?.contains(target) ||
                menuRef.current?.contains(target)
            ) {
                return;
            }
            onClose();
        };

        const handleKeyDown = (event) => {
            if (event.key === 'Escape') onClose();
        };

        document.addEventListener('mousedown', handlePointerDown);
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('mousedown', handlePointerDown);
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [onClose, open]);

    return { triggerRef, menuRef, style };
};

export const MetaChip = memo(({ icon: Icon, label, value, tone = 'slate' }) => (
    <span
        className={`inline-flex min-h-9 min-w-0 items-center gap-2 rounded-md px-3 text-[11px] font-bold ring-1 ${getToneClasses(
            tone
        )}`}
    >
        <Icon size={14} className="shrink-0 opacity-70" aria-hidden="true" />
        <span className="shrink-0 text-slate-400/80 dark:text-slate-500">
            {label}
        </span>
        <span className="min-w-0 truncate font-extrabold">{value || '-'}</span>
    </span>
));
MetaChip.displayName = 'MetaChip';

export const ActionButton = memo(
    ({ icon: Icon, label, children, className = '', loading = false, compactOnMobile = false, ...props }) => (
        <button
            type="button"
            title={label}
            aria-label={label}
            className={`${SOFT_BUTTON} ${className}`}
            {...props}
        >
            {loading ? (
                <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            ) : (
                <Icon size={14} aria-hidden="true" />
            )}
            <span className={compactOnMobile ? 'hidden sm:inline' : ''}>{children || label}</span>
        </button>
    )
);
ActionButton.displayName = 'ActionButton';

/* Groups secondary header actions behind a single overflow trigger so the primary
   toolbar reads as a few clear choices instead of many. */
export const OverflowMenu = memo(({ label, items }) => {
    const [open, setOpen] = useState(false);
    const closeMenu = React.useCallback(() => setOpen(false), []);
    const { triggerRef, menuRef, style } = useFloatingMenu({
        open,
        onClose: closeMenu,
        width: 240,
        align: 'end'
    });

    return (
        <div ref={triggerRef} className="relative inline-flex">
            <button
                type="button"
                onClick={() => setOpen((current) => !current)}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={label}
                title={label}
                className={`${SOFT_BUTTON} px-3`}
            >
                <MoreHorizontal size={15} aria-hidden="true" />
            </button>
            {open && style && createPortal((
                <div
                    ref={menuRef}
                    role="menu"
                    style={style}
                    className="z-[100] overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-2xl animate-fade-in dark:border-slate-700 dark:bg-slate-900"
                >
                    {items.map(({ key, icon: Icon, label: itemLabel, onSelect, disabled, active }) => (
                        <button
                            key={key}
                            type="button"
                            role="menuitem"
                            disabled={disabled}
                            onClick={() => {
                                setOpen(false);
                                onSelect();
                            }}
                            className={`flex w-full items-center gap-2.5 rounded-md px-3 py-2.5 text-start text-xs font-bold transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${active
                                ? 'bg-teal-50/80 text-teal-800 dark:bg-teal-950/40 dark:text-teal-300'
                                : 'text-slate-600 hover:bg-slate-50/80 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800/60 dark:hover:text-white'
                                }`}
                        >
                            <Icon size={14} className="opacity-70" />
                            {itemLabel}
                        </button>
                    ))}
                </div>
            ), document.body)}
        </div>
    );
});
OverflowMenu.displayName = 'OverflowMenu';

/* Reusable accordion shell used for both the Study Tools stack and the optional
   report sections, so long pages collapse to scannable headers. */
export const CollapsibleSection = memo(
    ({ icon: Icon, title, subtitle, badge, badgeTone = 'slate', defaultOpen = false, compact = false, children }) => {
        const [open, setOpen] = useState(defaultOpen);

        return (
            <section className={`${compact ? 'overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900/95' : PANEL} overflow-hidden`}>
                <button
                    type="button"
                    onClick={() => setOpen((current) => !current)}
                    aria-expanded={open}
                    className={`flex w-full items-center justify-between gap-3 text-start transition-all duration-200 hover:bg-slate-50/60 dark:hover:bg-slate-800/30 ${compact ? 'px-3 py-2.5' : 'px-5 py-3.5'}`}
                >
                    <span className={`flex min-w-0 items-center ${compact ? 'gap-2' : 'gap-3'}`}>
                        <span className={`flex shrink-0 items-center justify-center rounded-md bg-teal-50 text-teal-700 ring-1 ring-teal-100 dark:bg-teal-950/40 dark:text-teal-300 dark:ring-teal-900 ${compact ? 'h-7 w-7' : 'h-8 w-8'}`}>
                            <Icon size={compact ? 14 : 16} aria-hidden="true" />
                        </span>
                        <span className="min-w-0">
                            <span className={`block font-bold uppercase text-slate-700 dark:text-slate-200 ${compact ? 'whitespace-normal break-words text-[10px] leading-3 tracking-[.04em]' : 'truncate text-[11px] tracking-wider'}`}>
                                {title}
                            </span>
                            {subtitle && (
                                <span className="mt-0.5 block truncate text-[10px] font-semibold text-slate-400 dark:text-slate-500">
                                    {subtitle}
                                </span>
                            )}
                        </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                        {badge && (
                            <span
                                className={`rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ring-1 ${getToneClasses(
                                    badgeTone
                                )}`}
                            >
                                {badge}
                            </span>
                        )}
                        <ChevronDown
                            size={compact ? 14 : 16}
                            className={`text-slate-400 transition-transform duration-300 ${open ? 'rotate-180' : ''}`}
                            aria-hidden="true"
                        />
                    </span>
                </button>
                {open && <div className={`border-t border-slate-100 dark:border-slate-800 ${compact ? 'p-2.5' : 'p-4'}`}>{children}</div>}
            </section>
        );
    }
);
CollapsibleSection.displayName = 'CollapsibleSection';

export const StatusPill = memo(({ locked, status, dirty, t }) => (
    <div className="flex flex-wrap items-center gap-2.5">
        <span
            className={`inline-flex items-center rounded-md px-2.5 py-1 text-[9px] font-bold uppercase ring-1 ${locked || status === 'Finalized'
                ? 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-900'
                : status === 'Approved'
                    ? 'bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-950/30 dark:text-teal-300 dark:ring-teal-900'
                    : status === 'Reviewed'
                        ? 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900'
                        : status === 'Typed'
                            ? 'bg-blue-50 text-blue-700 ring-blue-200 dark:bg-blue-950/30 dark:text-blue-300 dark:ring-blue-900'
                            : 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700'
                }`}
        >
            {locked && <LockKeyhole size={10} className="me-1.5" aria-hidden="true" />}
            {t(`statuses.${status}`, { defaultValue: status })}
        </span>
        <span
            aria-live="polite"
            className={`inline-flex items-center gap-1.5 text-[10px] font-bold ${dirty
                ? 'text-amber-600 dark:text-amber-400'
                : 'text-emerald-600 dark:text-emerald-400'
                }`}
        >
            <span
                className={`h-2 w-2 rounded-full shadow-sm ${dirty ? 'animate-pulse bg-amber-500 shadow-amber-500/30' : 'bg-emerald-500 shadow-emerald-500/30'
                    }`}
            />
            {dirty ? t('editor.unsaved') : t('editor.allSaved')}
        </span>
    </div>
));
StatusPill.displayName = 'StatusPill';

export const WorkflowStepper = memo(({ status, currentStatus, t }) => {
    const WORKFLOW = ['Draft', 'Typed', 'Reviewed', 'Approved', 'Finalized'];
    const activeIndex = WORKFLOW.indexOf(status || currentStatus || 'Draft');
    const safeIndex = activeIndex >= 0 ? activeIndex : 0;

    return (
        <ol
            className="flex min-w-[520px] items-center"
            aria-label={t('editor.workflow')}
        >
            {WORKFLOW.map((step, index) => {
                const complete = index < safeIndex;
                const active = index === safeIndex;

                return (
                    <li
                        key={step}
                        className={`flex items-center ${index < WORKFLOW.length - 1 ? 'flex-1' : ''
                            }`}
                    >
                        <span
                            aria-current={active ? 'step' : undefined}
                            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-all duration-300 ${complete
                                ? 'bg-teal-700 text-white shadow-sm ring-0 dark:bg-teal-500'
                                : active
                                    ? 'bg-slate-950 text-white shadow-sm ring-[3px] ring-teal-500/20 ring-offset-1 ring-offset-white dark:bg-slate-200 dark:text-slate-900 dark:ring-teal-400/20 dark:ring-offset-slate-950'
                                    : 'bg-white text-slate-400 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-500 dark:ring-slate-700'
                                }`}
                        >
                            {complete ? <Check size={13} /> : index + 1}
                        </span>
                        <span
                            className={`mx-2 whitespace-nowrap text-[10px] font-bold uppercase transition-colors duration-200 ${index <= safeIndex
                                ? 'text-slate-700 dark:text-slate-300'
                                : 'text-slate-300 dark:text-slate-600'
                                }`}
                        >
                            {t(`statuses.${step}`, { defaultValue: step })}
                        </span>
                        {index < WORKFLOW.length - 1 && (
                            <span
                                className={`mx-2 h-px min-w-4 flex-1 transition-colors duration-500 ${complete
                                    ? 'bg-teal-500'
                                    : 'bg-slate-200 dark:bg-slate-700'
                                    }`}
                            />
                        )}
                    </li>
                );
            })}
        </ol>
    );
});
WorkflowStepper.displayName = 'WorkflowStepper';

export const ProgressBar = memo(({ value }) => (
    <div
        className="h-1 overflow-hidden bg-slate-100 dark:bg-slate-800"
        role="progressbar"
        aria-valuemin="0"
        aria-valuemax="100"
        aria-valuenow={value}
    >
        <div
            className="h-full bg-teal-600 transition-[width] duration-500 ease-out dark:bg-teal-500"
            style={{ width: `${value}%` }}
        />
    </div>
));
ProgressBar.displayName = 'ProgressBar';

export const SectionQuickNav = memo(
    ({ sections, activeSection, completion, onSelect, t }) => (
        <nav
            className="sticky top-2 z-20 overflow-hidden rounded-2xl border border-slate-200/80 bg-white/95 shadow-sm backdrop-blur print:static dark:border-slate-800 dark:bg-slate-900 xl:top-3"
            aria-label={t('editor.sections')}
        >
            <div className="flex items-center gap-1.5 overflow-x-auto p-1.5">
                <span className="hidden min-h-8 shrink-0 items-center gap-1.5 rounded-lg bg-slate-50 px-2 text-[9px] font-black uppercase tracking-[.08em] text-slate-400 ring-1 ring-inset ring-slate-100 dark:bg-slate-950/40 dark:text-slate-500 dark:ring-slate-800 sm:flex">
                    <PenLine size={12} className="opacity-70" />
                    {t('editor.sections')}
                </span>

                {SECTION_CONFIG.map(({ key, required, icon }) => {
                    const Icon = IconMap[icon] || FileText;
                    const complete = Boolean(sections[key]?.trim());
                    const active = activeSection === key;

                    return (
                        <button
                            key={key}
                            type="button"
                            onClick={() => onSelect(key)}
                            aria-current={active ? 'location' : undefined}
                            className={`inline-flex min-h-8 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[11px] font-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/30 ${active
                                    ? 'bg-teal-700 text-white shadow-sm dark:bg-teal-600'
                                    : 'bg-transparent text-slate-600 hover:bg-slate-50 hover:text-teal-700 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-teal-300'
                                }`}
                        >
                            {complete ? <Check size={12} /> : <Icon size={12} />}
                            <span className="max-w-[9.5rem] truncate">{t(`sections.${key}`)}</span>
                            {required && !complete && (
                                <span
                                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? 'bg-white shadow-sm shadow-white/50' : 'bg-rose-500 shadow-sm shadow-rose-500/30'
                                        }`}
                                    title={t('editor.required')}
                                />
                            )}
                        </button>
                    );
                })}

                <span className="ms-auto inline-flex min-h-8 shrink-0 items-center rounded-lg bg-slate-900 px-2.5 text-[10px] font-black tabular-nums text-white dark:bg-slate-100 dark:text-slate-900">
                    {completion}%
                </span>
            </div>
        </nav>
    )
);
SectionQuickNav.displayName = 'SectionQuickNav';

export const MiniStat = memo(({ label, value }) => (
    <div className="rounded-xl bg-slate-50/80 p-3 ring-1 ring-inset ring-slate-100/80 backdrop-blur-sm dark:bg-slate-800/30 dark:ring-slate-700/40">
        <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {label}
        </p>
        <p className="mt-1 text-sm font-bold tabular-nums text-slate-900 dark:text-white">
            {value}
        </p>
    </div>
));
MiniStat.displayName = 'MiniStat';

export const QualityPanel = memo(
    ({ completion, reportWords, qualityScore, checks, t }) => {
        const remainingChecks = checks.filter((check) => !check.complete).slice(0, 3);
        return (
        <section className={`${PANEL} p-4`}>
            <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        {t('editor.quality.title')}
                    </p>
                    <p className="mt-1.5 text-xs font-semibold text-slate-500 dark:text-slate-400">
                        {completion}% {t('editor.completion')} · {reportWords} {t('editor.words', { defaultValue: 'words' })}
                    </p>
                </div>
                <span
                    className={`inline-flex min-h-9 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-bold tabular-nums ring-1 ${getToneClasses(
                        qualityScore >= 80
                            ? 'emerald'
                            : qualityScore >= 50
                                ? 'teal'
                                : 'amber'
                    )}`}
                >
                    <ClipboardCheck size={15} aria-hidden="true" />
                    {qualityScore}%
                </span>
            </div>

            {remainingChecks.length > 0 ? <div className="mt-3 divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
                {remainingChecks.map((check) => (
                    <div
                        key={check.key}
                        className="flex items-start gap-3 py-3"
                    >
                        <AlertCircle size={15} className="mt-0.5 shrink-0 text-amber-500 dark:text-amber-400" />
                        <div className="min-w-0">
                            <p className="text-[11px] font-bold text-slate-700 dark:text-slate-200">{check.label}</p>
                            <p className="mt-0.5 text-[10px] leading-4 text-slate-500 dark:text-slate-400">{check.detail}</p>
                        </div>
                    </div>
                ))}
            </div> : <div className="mt-3 flex items-center gap-2 border-t border-slate-100 pt-3 text-[11px] font-bold text-emerald-700 dark:border-slate-800 dark:text-emerald-300"><CheckCircle2 size={14} />{t('editor.quality.complete', 'Ready for final review')}</div>}
        </section>
        );
    }
);
QualityPanel.displayName = 'QualityPanel';

const DOCUMENT_TYPES = [
    'Consent Form',
    'Patient ID',
    'Passport',
    'Insurance Card',
    'Insurance Approval',
    'Prescription',
    'Previous Report',
    'Lab Result',
    'Invoice',
    'Signed Form',
    'Other'
];

const DEFAULT_DELIVERY_METHODS = [
    'Email',
    'SMS Link',
    'WhatsApp Link',
    'Printed',
    'Patient Portal'
];

const formatBytes = (bytes, decimals = 2) => {
    if (!+bytes) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
};

const formatSeconds = (seconds) => {
    const value = Number(seconds);
    if (!Number.isFinite(value) || value < 0) return null;
    if (value < 60) return `${Math.max(0, Math.round(value))}s`;
    const minutes = Math.floor(value / 60);
    const remainingSeconds = Math.round(value % 60);
    return `${minutes}m ${remainingSeconds}s`;
};

const IconMap = {
    Info,
    Monitor,
    FileText,
    ClipboardCheck,
    CheckCircle2
};

export const PageState = memo(({ icon: Icon, title, description, actions, children }) => (
    <div className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
        {Icon && (
            <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 text-slate-400 shadow-sm ring-1 ring-slate-200/60 dark:from-slate-800/60 dark:to-slate-900/60 dark:text-slate-500 dark:ring-slate-700/40 mb-5">
                <Icon size={22} />
            </span>
        )}
        {title && <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">{title}</h3>}
        {description && <p className="mt-2 max-w-sm text-xs leading-relaxed text-slate-500 dark:text-slate-400">{description}</p>}
        {actions && <div className="mt-6 flex flex-wrap justify-center gap-2">{actions}</div>}
        {children}
    </div>
));
PageState.displayName = 'PageState';

export const Notice = memo(({ tone = 'slate', title, description, action, onClose }) => {
    const toneClasses = getToneClasses(tone);
    return (
        <div className={`relative mb-4 flex gap-3.5 rounded-lg p-4 ring-1 ring-inset ${toneClasses}`}>
            <Info size={16} className="mt-0.5 shrink-0 opacity-70" />
            <div className="min-w-0 flex-1">
                {title && <h4 className="text-xs font-bold">{title}</h4>}
                {description && <p className="mt-1 text-xs font-semibold leading-relaxed opacity-85">{description}</p>}
            </div>
            {action && <div className="shrink-0 self-center">{action}</div>}
            {onClose && (
                <button
                    type="button"
                    onClick={onClose}
                    className="p-1 -me-1 -mt-1 hover:opacity-70 transition-opacity self-start"
                >
                    <X size={14} />
                </button>
            )}
        </div>
    );
});
Notice.displayName = 'Notice';

export const MobileWorkspaceTabs = memo(({ activeTab, onChange, showSidebar = false, t }) => {
    const tabs = [
        {
            key: 'editor',
            label: t('editor.tabs.editor', 'Editor'),
            icon: FileText,
            activeClass: 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900/60 dark:bg-teal-950/30 dark:text-teal-300'
        },
        showSidebar && {
            key: 'tools',
            label: t('editor.tabs.sidebar', 'Study tools'),
            icon: ServerCog,
            activeClass: 'border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-300'
        },
        {
            key: 'preview',
            label: t('editor.tabs.preview', 'Preview'),
            icon: Eye,
            activeClass: 'border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/60 dark:bg-sky-950/30 dark:text-sky-300'
        }
    ].filter(Boolean);

    return (
        <div className="sticky top-2 z-20 flex rounded-2xl border border-slate-200/80 bg-white/95 p-1 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900 xl:hidden">
            {tabs.map(tab => {
                const Icon = tab.icon;
                const active = activeTab === tab.key;
                return (
                    <button
                        key={tab.key}
                        type="button"
                        onClick={() => onChange(tab.key)}
                        className={`flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-xl border px-2 transition-colors ${
                            active
                                ? tab.activeClass
                                : 'border-transparent text-slate-400 hover:bg-slate-50 hover:text-slate-600 dark:hover:bg-slate-800/70 dark:hover:text-slate-200'
                        }`}
                    >
                        <Icon size={14} />
                        <span className="truncate text-[10px] font-black uppercase">{tab.label}</span>
                    </button>
                );
            })}
        </div>
    );
});
MobileWorkspaceTabs.displayName = 'MobileWorkspaceTabs';

const normalizeTemplateType = (value) => String(value || '').trim().toUpperCase();

export const TemplateBar = memo(({
    templates = [],
    onApply,
    onSaveTemplate,
    editable = false,
    isSavingTemplate = false,
    currentExamTypeId,
    currentModalityType,
    currentStudyTypeLabel,
    t
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const closeMenu = React.useCallback(() => setIsOpen(false), []);
    const currentModality = normalizeTemplateType(currentModalityType);
    const currentStudyType = normalizeTemplateType(currentStudyTypeLabel);
    const typeLabel = currentModalityType || currentStudyTypeLabel || t('editor.templates.reportType', 'study type');
    const organizedTemplates = useMemo(() => {
        const hasTypeContext = Boolean(currentExamTypeId || currentModality || currentStudyType);
        const scoreTemplate = (tpl) => {
            const tplModality = normalizeTemplateType(tpl.modality_type || tpl.modality_name);
            const tplExamTypeId = tpl.exam_type_id || tpl.examTypeId;
            const tplStudyType = normalizeTemplateType(tpl.exam_type_name || tpl.exam_type || tpl.study_type || tpl.name);
            const matchesExamType = currentExamTypeId && String(tplExamTypeId || '') === String(currentExamTypeId);
            const matchesModality = currentModality && tplModality === currentModality;
            const matchesStudyType = currentStudyType && tplStudyType.includes(currentStudyType);
            const isGeneral = !tplModality && !tplExamTypeId;

            if (matchesExamType || matchesModality || matchesStudyType) return 0;
            if (isGeneral || !hasTypeContext) return 1;
            return 2;
        };

        return [...templates]
            .map((tpl, index) => ({ tpl, index, score: scoreTemplate(tpl) }))
            .sort((a, b) => a.score - b.score || a.index - b.index)
            .map(({ tpl, score }) => ({ ...tpl, matchScore: score }));
    }, [currentExamTypeId, currentModality, currentStudyType, templates]);
    const { triggerRef, menuRef, style } = useFloatingMenu({
        open: isOpen,
        onClose: closeMenu,
        width: 320,
        align: 'start',
        maxHeight: 340
    });

    return (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200/80 bg-white/95 px-3 py-2 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700 ring-1 ring-teal-100 dark:bg-teal-950/35 dark:text-teal-300 dark:ring-teal-900/60">
                    <LayoutTemplate size={14} />
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-500 dark:text-slate-400">
                    {t('editor.templates.title', 'Templates')}
                </span>
                <span className="max-w-[180px] truncate rounded-full bg-slate-100 px-2 py-1 text-[10px] font-black text-slate-600 ring-1 ring-slate-200/70 dark:bg-slate-950/50 dark:text-slate-300 dark:ring-slate-800">
                    {typeLabel}
                </span>
                
                {templates.length === 0 ? (
                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                        {t('editor.templates.none', 'No templates available')}
                    </span>
                ) : (
                    <div ref={triggerRef} className="relative inline-flex">
                        <button
                            type="button"
                            onClick={() => setIsOpen(!isOpen)}
                            className="inline-flex min-h-8 items-center gap-1.5 rounded-lg border border-teal-200 bg-teal-50 px-2.5 py-1 text-[10px] font-black text-teal-700 shadow-sm transition-all duration-200 hover:bg-teal-100 dark:border-teal-900/60 dark:bg-teal-950/30 dark:text-teal-300 dark:hover:bg-teal-950/50"
                        >
                            {t('editor.templates.selectForType', {
                                defaultValue: 'Select {{type}} template',
                                type: typeLabel
                            })}
                            <ChevronDown size={12} className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
                        </button>
                        {isOpen && style && createPortal((
                            <div
                                ref={menuRef}
                                role="menu"
                                style={style}
                                className="z-[100] overflow-y-auto rounded-xl bg-white p-1.5 shadow-2xl ring-1 ring-slate-200 animate-fade-in dark:bg-slate-900 dark:ring-slate-700"
                            >
                                {organizedTemplates.map(tpl => (
                                    <button
                                        key={tpl.template_id || tpl.name}
                                        type="button"
                                        role="menuitem"
                                        onClick={() => {
                                            onApply(tpl.template_id);
                                            setIsOpen(false);
                                        }}
                                        className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-start transition-colors ${
                                            tpl.matchScore === 0
                                                ? 'bg-teal-50/80 text-teal-800 hover:bg-teal-100 dark:bg-teal-950/30 dark:text-teal-200 dark:hover:bg-teal-950/50'
                                                : 'text-slate-700 hover:bg-slate-50 hover:text-slate-950 dark:text-slate-300 dark:hover:bg-slate-800/70 dark:hover:text-white'
                                        }`}
                                    >
                                        <span className="min-w-0 flex-1">
                                            <span className="block truncate text-xs font-black">{tpl.name}</span>
                                            <span className="mt-0.5 block truncate text-[9px] font-bold opacity-65">
                                                {tpl.matchScore === 0
                                                    ? t('editor.templates.matchedType', 'Matched to this study')
                                                    : tpl.matchScore === 1
                                                        ? t('editor.templates.generalType', 'General template')
                                                        : t('editor.templates.otherType', 'Other type')}
                                                {tpl.modality_type ? ` · ${tpl.modality_type}` : ''}
                                                {tpl.is_builtin ? ` · ${t('editor.templates.builtin', 'Built-in')}` : ''}
                                            </span>
                                        </span>
                                        {tpl.matchScore === 0 ? <CheckCircle2 size={14} className="shrink-0" /> : null}
                                    </button>
                                ))}
                            </div>
                        ), document.body)}
                    </div>
                )}
            </div>

            {editable && onSaveTemplate && (
                <button
                    type="button"
                    disabled={isSavingTemplate}
                    onClick={onSaveTemplate}
                    className="inline-flex min-h-8 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold uppercase text-slate-700 shadow-sm transition-colors hover:border-teal-200 hover:bg-teal-50 hover:text-teal-700 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:text-teal-300"
                >
                    {isSavingTemplate ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
                    {t('editor.templates.saveCurrent', 'Save as Template')}
                </button>
            )}
        </div>
    );
});
TemplateBar.displayName = 'TemplateBar';

const SECTION_MACROS = {
    technique: [
        'Standard multiplanar images acquired without IV contrast.',
        'With and without IV gadolinium contrast enhancement.',
        'Low-dose non-contrast protocol performed.'
    ],
    findings: [
        'No acute fracture, dislocation, or osseous lesion.',
        'Clear lung fields bilaterally without consolidation or effusion.',
        'No focal mass lesion, acute territorial infarct, or hemorrhage.',
        'Unremarkable examination with normal anatomy and alignment.'
    ],
    impression: [
        'Unremarkable examination within normal limits for age.',
        'No acute intracranial or cervical spine pathology.',
        'Stable appearances compared to prior study.',
        'Findings discussed with attending physician.'
    ],
    recommendations: [
        'Routine clinical follow-up as clinically indicated.',
        'Correlation with laboratory and inflammatory markers.',
        'Follow-up imaging in 3 to 6 months if symptoms persist.'
    ]
};

export const ReportSectionCard = memo(({ config, value = '', editable = false, active = false, collapsed = false, onToggleCollapse, onFocus, onChange, canImprove = false, isImproving = false, onImprove, canUndoImprove = false, onUndoImprove, locale = 'en-US', t }) => {
    const IconComponent = IconMap[config.icon] || FileText;
    const isCollapsible = config.collapsible;
    const textareaRef = useRef(null);
    const [isListening, setIsListening] = useState(false);
    const recognitionRef = useRef(null);

    const toggleDictation = useCallback(() => {
        if (!editable) return;
        const SpeechRec = typeof window !== 'undefined' && (window.SpeechRecognition || window.webkitSpeechRecognition);
        if (!SpeechRec) {
            toast.error(t('editor.dictationUnsupported', 'Voice dictation is not supported in this browser.'));
            return;
        }

        if (isListening) {
            recognitionRef.current?.stop();
            setIsListening(false);
            return;
        }

        try {
            const recognition = new SpeechRec();
            recognition.continuous = true;
            recognition.interimResults = false;
            recognition.lang = locale?.startsWith('ar') ? 'ar-EG' : 'en-US';

            recognition.onstart = () => {
                setIsListening(true);
            };

            recognition.onresult = (event) => {
                let speechTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        speechTranscript += event.results[i][0].transcript;
                    }
                }
                if (speechTranscript) {
                    const currentText = value || '';
                    const spacer = currentText.length > 0 && !currentText.endsWith(' ') && !currentText.endsWith('\n') ? ' ' : '';
                    onChange(config.key, currentText + spacer + speechTranscript.trim());
                }
            };

            recognition.onerror = (event) => {
                setIsListening(false);
                if (event.error !== 'no-speech') {
                    toast.error(`Dictation: ${event.error}`);
                }
            };

            recognition.onend = () => {
                setIsListening(false);
            };

            recognitionRef.current = recognition;
            recognition.start();
        } catch {
            setIsListening(false);
        }
    }, [config.key, editable, isListening, locale, onChange, t, value]);

    useEffect(() => {
        return () => {
            if (recognitionRef.current) {
                try {
                    recognitionRef.current.stop();
                } catch {
                    // ignore
                }
            }
        };
    }, []);

    const appendMacro = useCallback((phrase) => {
        const current = value || '';
        const spacer = current.length > 0 && !current.endsWith('\n') ? (current.endsWith(' ') ? '' : '\n') : '';
        onChange(config.key, current + spacer + phrase);
    }, [config.key, onChange, value]);

    // Auto-grow the textarea to fit its content
    useEffect(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = `${el.scrollHeight}px`;
    }, [value, collapsed]);

    const wordCount = value?.trim() ? value.trim().split(/\s+/).filter(Boolean).length : 0;
    const charCount = value?.length || 0;
    const maxLength = config.maxLength || 10000;
    const fillRatio = maxLength ? charCount / maxLength : 0;

    const fillState =
        !value?.trim() ? 'empty'
        : charCount < (config.required ? 80 : 40) ? 'minimal'
        : fillRatio > 0.85 ? 'near-full'
        : 'good';

    const fillBadge = {
        empty: {
            label: t('editor.sectionEmpty', 'Empty'),
            cls: 'bg-slate-100/80 text-slate-400 dark:bg-slate-800/50 dark:text-slate-500'
        },
        minimal: {
            label: t('editor.sectionMinimal', 'Minimal'),
            cls: 'bg-amber-50/80 text-amber-600 ring-1 ring-amber-200/60 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-800/40'
        },
        good: {
            label: t('editor.sectionGood', 'Good'),
            cls: 'bg-emerald-50/80 text-emerald-600 ring-1 ring-emerald-200/60 dark:bg-emerald-950/25 dark:text-emerald-400 dark:ring-emerald-800/40'
        },
        'near-full': {
            label: t('editor.sectionNearFull', 'Near limit'),
            cls: 'bg-rose-50/80 text-rose-600 ring-1 ring-rose-200/60 dark:bg-rose-950/30 dark:text-rose-400 dark:ring-rose-800/40'
        }
    }[fillState];

    const accentColor = active
        ? 'border-s-teal-500 dark:border-s-teal-400'
        : 'border-s-transparent';

    return (
        <div
            onClick={onFocus}
            className={`group relative border-s-[3px] transition-colors ${accentColor} ${
                active
                    ? 'bg-teal-50/40 dark:bg-teal-950/10'
                    : 'bg-white dark:bg-transparent hover:bg-slate-50/70 dark:hover:bg-slate-800/20'
            }`}
        >
            {/* ── Header ── */}
            <div className="flex items-center justify-between gap-3 px-3 py-2.5 sm:px-4">
                <div className="flex min-w-0 items-center gap-2.5">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors ${
                        active
                            ? 'bg-teal-100 text-teal-700 ring-1 ring-teal-200 dark:bg-teal-950/50 dark:text-teal-300 dark:ring-teal-900'
                            : 'bg-slate-100/80 text-slate-500 dark:bg-slate-800/40 dark:text-slate-400'
                    }`}>
                        <IconComponent size={16} />
                    </span>

                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="block truncate text-[11px] font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
                                {t(`sections.${config.key}`)}
                                {config.required && <span className="ms-1 text-rose-500">*</span>}
                            </span>
                            {/* Fill-state badge — shown when not collapsed */}
                            {!collapsed && (
                                <span className={`inline-flex items-center rounded-lg px-2 py-0.5 text-[9px] font-black uppercase tracking-wide transition-all duration-200 ${fillBadge.cls}`}>
                                    {fillBadge.label}
                                </span>
                            )}
                        </div>
                        {!collapsed && value?.trim() && (
                            <p className="mt-0.5 text-[9px] font-semibold text-slate-400 dark:text-slate-500">
                                {wordCount} {t('editor.words', 'words')}
                                {' · '}
                                {charCount.toLocaleString(locale)} / {maxLength.toLocaleString(locale)} {t('editor.chars', 'chars')}
                            </p>
                        )}
                    </div>
                </div>

                <div className="flex items-center gap-1.5">
                    {canUndoImprove && editable && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onUndoImprove?.(config.key);
                            }}
                            title={t('editor.undoImproveTooltip', 'Restore the text before the last improvement')}
                            className="inline-flex items-center gap-1.5 rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[10px] font-bold text-amber-700 transition-colors hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300 dark:hover:bg-amber-950/50"
                        >
                            <RotateCcw size={11} />
                            {t('actions.undo', 'Undo')}
                        </button>
                    )}

                    {/* Voice Dictation button */}
                    {editable && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                toggleDictation();
                            }}
                            title={isListening ? t('editor.dictating') : t('editor.dictate')}
                            className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[10px] font-bold transition-all ${
                                isListening
                                    ? 'bg-rose-500 text-white shadow-xs ring-2 ring-rose-400/50 animate-pulse'
                                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300'
                            }`}
                        >
                            {isListening ? <MicOff size={11} /> : <Mic size={11} />}
                            <span>{isListening ? t('editor.dictating') : t('editor.dictate')}</span>
                        </button>
                    )}

                    {/* AI Improve button */}
                    {canImprove && editable && value?.trim() && (
                        <button
                            type="button"
                            disabled={isImproving}
                            onClick={(e) => {
                                e.stopPropagation();
                                onImprove(config.key);
                            }}
                            title={t('editor.improveTooltip', 'Rewrite this section using AI')}
                            className="inline-flex items-center gap-1.5 rounded-md border border-teal-200 bg-teal-50 px-2.5 py-1.5 text-[10px] font-bold text-teal-700 transition-colors hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-teal-900 dark:bg-teal-950/30 dark:text-teal-300 dark:hover:bg-teal-950/50"
                        >
                            {isImproving
                                ? <Loader2 size={11} className="animate-spin" />
                                : <Sparkles size={11} />
                            }
                            {t('editor.improve', 'Improve')}
                        </button>
                    )}

                    {/* Clear button — only when editable and has content */}
                    {editable && value?.trim() && !isCollapsible && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onChange(config.key, '');
                            }}
                            title={t('editor.clearSection', 'Clear this section')}
                            className="rounded-xl p-1.5 text-slate-400 opacity-0 transition-all duration-200 group-hover:opacity-100 hover:bg-rose-50/80 hover:text-rose-500 dark:hover:bg-rose-950/20 dark:hover:text-rose-400"
                        >
                            <X size={13} />
                        </button>
                    )}

                    {/* Collapse toggle */}
                    {isCollapsible && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.stopPropagation();
                                onToggleCollapse(config.key);
                            }}
                            className="rounded-xl p-1.5 text-slate-400 transition-all duration-200 hover:bg-slate-100/80 hover:text-slate-600 dark:hover:bg-slate-800/40 dark:hover:text-slate-200"
                        >
                            <ChevronDown
                                size={15}
                                className={`transition-transform duration-300 ${collapsed ? '' : 'rotate-180'}`}
                            />
                        </button>
                    )}
                </div>
            </div>

            {/* ── Textarea ── */}
            {!collapsed && (
                <div className="px-3 pb-3 sm:px-4 sm:pb-4">
                    <div className={`relative rounded-md transition-shadow ${
                        active
                            ? 'ring-2 ring-teal-500/15 shadow-sm shadow-teal-500/5'
                            : 'ring-0'
                    }`}>
                        <textarea
                            ref={textareaRef}
                            value={value}
                            readOnly={!editable}
                            onChange={(e) => {
                                onChange(config.key, e.target.value);
                            }}
                            onFocus={onFocus}
                            placeholder={t(`placeholders.${config.key}`, `Enter ${config.key}...`)}
                            maxLength={config.maxLength}
                            rows={config.rows || 4}
                            dir="ltr"
                            lang="en"
                            style={{ resize: 'none', overflow: 'hidden' }}
                            className={`w-full rounded-xl border bg-white p-3 text-left text-[13px] leading-6 text-slate-800 outline-none placeholder:text-left placeholder:text-slate-300 transition-colors dark:bg-slate-950/40 dark:text-slate-200 dark:placeholder:text-slate-600 sm:p-3.5 ${
                                editable
                                    ? 'border-slate-200/70 focus:border-teal-400/50 focus:shadow-[0_0_0_3px_rgba(var(--viara-primary-rgb),0.06)] dark:border-slate-700/50 dark:focus:border-teal-600/40 dark:focus:shadow-[0_0_0_3px_rgba(var(--viara-primary-rgb),0.08)]'
                                    : 'cursor-not-allowed border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-900/30'
                            }`}
                        />
                    </div>

                    {/* Quick Clinical Macros */}
                    {editable && SECTION_MACROS[config.key] && (
                        <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                {t('editor.quickPhrases')}:
                            </span>
                            {SECTION_MACROS[config.key].map((phrase) => (
                                <button
                                    key={phrase}
                                    type="button"
                                    onClick={() => appendMacro(phrase)}
                                    className="rounded-lg border border-slate-200/80 bg-slate-50/80 px-2 py-0.5 text-[10.5px] font-medium text-slate-600 hover:border-teal-400 hover:bg-teal-50 hover:text-teal-700 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300 dark:hover:border-teal-500 dark:hover:bg-teal-950/30 dark:hover:text-teal-300 transition"
                                >
                                    + {phrase}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* ── Footer bar ── */}
                    <div className="mt-2.5 flex items-center justify-between gap-2">
                        {/* Char usage progress bar */}
                        <div className="flex flex-1 items-center gap-2.5">
                            <div className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100/80 dark:bg-slate-800/50">
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${
                                        fillRatio > 0.85 ? 'bg-rose-500'
                                        : fillRatio > 0.5 ? 'bg-teal-500'
                                        : fillRatio > 0 ? 'bg-slate-300 dark:bg-slate-600'
                                        : ''
                                    }`}
                                    style={{ width: `${Math.min(fillRatio * 100, 100)}%` }}
                                />
                            </div>
                            <span className="shrink-0 text-[9px] font-semibold tabular-nums text-slate-400 dark:text-slate-500">
                                {charCount.toLocaleString(locale)} / {maxLength.toLocaleString(locale)}
                            </span>
                        </div>

                        {/* Read-only indicator */}
                        {!editable && (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100/80 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-slate-400 dark:bg-slate-800/40 dark:text-slate-500">
                                <LockKeyhole size={8} />
                                {t('editor.readOnly', 'Read only')}
                            </span>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
});
ReportSectionCard.displayName = 'ReportSectionCard';


export const InspectorTabs = memo(({ activeTab, onChange, showDelivery = false, showDocuments = false, t }) => {
    const tabs = [
        { key: 'preview', label: t('editor.tabs.preview', 'Preview') },
        { key: 'context', label: t('editor.tabs.context', 'Clinical context') },
        showDocuments && { key: 'documents', label: t('editor.tabs.documents', 'Documents') },
        showDelivery && { key: 'delivery', label: t('editor.tabs.delivery', 'Delivery') }
    ].filter(Boolean);

    return (
        <div className="flex overflow-x-auto rounded-lg border border-slate-200 bg-slate-100 p-1 dark:border-slate-800 dark:bg-slate-950/60">
            {tabs.map(tab => (
                <button
                    key={tab.key}
                    type="button"
                    onClick={() => onChange(tab.key)}
                    className={`min-w-max flex-1 rounded-md px-2 py-2 text-center text-[10px] font-bold uppercase transition-colors ${
                        activeTab === tab.key
                            ? 'bg-white text-slate-950 shadow-sm ring-1 ring-slate-200/50 dark:bg-slate-700 dark:text-white dark:ring-slate-600/50'
                            : 'text-slate-400 hover:text-slate-700 dark:text-slate-500 dark:hover:text-slate-200'
                    }`}
                >
                    {tab.label}
                </button>
            ))}
        </div>
    );
});
InspectorTabs.displayName = 'InspectorTabs';

export const ClinicalContextPanel = memo(({ exam, locale, t }) => {
    return (
        <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    {t('details.clinicalIndication', 'Clinical Indication')}
                </h3>
                <p className="mt-1.5 text-xs font-semibold leading-relaxed text-slate-700 dark:text-slate-300">
                    {exam?.clinical_indication || exam?.report_sections?.clinicalHistory || t('details.noIndication', 'No clinical history provided')}
                </p>
            </div>

            {exam?.is_follow_up && (
                <div className="rounded-lg border border-sky-200 bg-sky-50/70 p-3 dark:border-sky-900/60 dark:bg-sky-950/20">
                    <div className="flex items-center justify-between gap-3">
                        <h3 className="text-xs font-bold uppercase text-sky-800 dark:text-sky-300">{t('details.followUpContext', { defaultValue: 'Follow-up context' })}</h3>
                        <span className="font-mono text-[10px] font-bold text-sky-700 dark:text-sky-400">{exam.prior_order_number || exam.prior_exam_id}</span>
                    </div>
                    <p className="mt-2 text-xs font-bold text-slate-800 dark:text-slate-200">{exam.prior_exam_type_name || exam.prior_modality_name || t('details.priorStudy', { defaultValue: 'Prior study' })}</p>
                    <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
                        {[exam.prior_exam_time ? formatDateTime(exam.prior_exam_time, locale) : null, exam.prior_report_status].filter(Boolean).join(' · ')}
                    </p>
                    {exam.follow_up_reason && <p className="mt-2 whitespace-pre-wrap border-t border-sky-200/70 pt-2 text-xs leading-5 text-slate-600 dark:border-sky-900/50 dark:text-slate-400">{exam.follow_up_reason}</p>}
                </div>
            )}

            <div className="border-t border-slate-100 pt-3 dark:border-slate-800">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-2">
                    {t('details.patientInfo', 'Patient Info')}
                </h3>
                <div className="grid grid-cols-2 gap-2 text-xs font-semibold">
                    <MiniStat label={t('details.sex', 'Gender')} value={exam?.patient_sex || '-'} />
                    <MiniStat label={t('details.age', 'Age')} value={exam?.patient_age || '-'} />
                </div>
            </div>

            <div className="border-t border-slate-100 pt-3 dark:border-slate-800 space-y-2.5 text-xs">
                <div className="flex justify-between">
                    <span className="font-bold text-slate-400 dark:text-slate-500">{t('details.referringPhysician', 'Referring Doctor')}</span>
                    <span className="font-bold text-slate-700 dark:text-slate-200">{exam?.referring_physician_name || '-'}</span>
                </div>
                <div className="flex justify-between">
                    <span className="font-bold text-slate-400 dark:text-slate-500">{t('details.modality', 'Modality')}</span>
                    <span className="font-bold text-slate-700 dark:text-slate-200">{exam?.modality_type || '-'}</span>
                </div>
                <div className="flex justify-between">
                    <span className="font-bold text-slate-400 dark:text-slate-500">{t('details.accessionNumber', 'Accession #')}</span>
                    <span className="font-bold text-slate-700 dark:text-slate-200">{exam?.order_number || '-'}</span>
                </div>
                <div className="flex justify-between">
                    <span className="font-bold text-slate-400 dark:text-slate-500">{t('details.examDate', 'Exam Date')}</span>
                    <span className="font-bold text-slate-700 dark:text-slate-200">
                        {exam?.created_at ? formatDateTime(exam.created_at, locale) : '-'}
                    </span>
                </div>
            </div>
        </div>
    );
});
ClinicalContextPanel.displayName = 'ClinicalContextPanel';

export const PatientDocumentsPanel = memo(({ patientId, locale, t }) => {
    const user = useSelector(selectCurrentUser);
    const canUpload = hasDeveloperOrAdminRole(user?.role) || ['Technician', 'Radiologist'].includes(user?.role);
    const { data: documents, isLoading } = useGetPatientDocumentsQuery(patientId, { skip: !patientId });
    const [uploadDocument, { isLoading: isUploading }] = useUploadDocumentMutation();

    const [file, setFile] = useState(null);
    const [docType, setDocType] = useState('Patient ID');
    const fileInputRef = useRef(null);

    const handleFileChange = (e) => {
        if (e.target.files && e.target.files[0]) {
            const selected = e.target.files[0];
            if (selected.size > 10 * 1024 * 1024) {
                toast.error(t('documents.fileTooLarge', {
                    defaultValue: 'File size exceeds the 10 MB limit.'
                }));
                return;
            }
            setFile(selected);
        }
    };

    const handleUpload = async (e) => {
        e.preventDefault();
        if (!file) return;

        const formData = new FormData();
        formData.append('file', file);
        formData.append('patient_id', patientId);
        formData.append('type', docType);
        formData.append('notes', '');

        try {
            await uploadDocument(formData).unwrap();
            toast.success(t('documents.uploadSuccess', { defaultValue: 'Document uploaded' }));
            setFile(null);
            if (fileInputRef.current) fileInputRef.current.value = '';
        } catch (error) {
            toast.error(error?.data?.error || t('documents.uploadError', {
                defaultValue: 'Failed to upload document'
            }));
        }
    };

    const handleDownload = async (doc) => {
        try {
            const baseUrl = import.meta.env.VITE_API_URL || '/api';
            const response = await authenticatedFetch(`${baseUrl}/documents/${doc.document_id}/download`);
            if (!response.ok) throw new Error('Could not download file');
            const blob = await response.blob();
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = doc.file_name || 'document';
            document.body.appendChild(link);
            link.click();
            link.remove();
            URL.revokeObjectURL(url);
        } catch (error) {
            toast.error(error.message || t('documents.downloadError', {
                defaultValue: 'Failed to download document'
            }));
        }
    };

    return (
        <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            {canUpload && (
                <form onSubmit={handleUpload} className="space-y-2 border-b border-slate-100/80 pb-3 dark:border-slate-700/40">
                    <div className="grid grid-cols-2 gap-2">
                        <select
                            value={docType}
                            onChange={(e) => setDocType(e.target.value)}
                            className="rounded-xl border border-slate-200/70 bg-white px-2.5 py-1.5 text-xs text-slate-800 outline-none transition-all duration-200 focus:border-teal-400/50 dark:border-slate-700/50 dark:bg-slate-900/50 dark:text-slate-200"
                        >
                            {DOCUMENT_TYPES.map(type => (
                                <option key={type} value={type}>
                                    {t(`documents.types.${type}`, type)}
                                </option>
                            ))}
                        </select>
                        <input
                            type="file"
                            ref={fileInputRef}
                            onChange={handleFileChange}
                            accept="image/jpeg, image/png, application/pdf"
                            className="hidden"
                            id="sidebar-doc-upload"
                        />
                        <label
                            htmlFor="sidebar-doc-upload"
                            className="inline-flex min-h-8 cursor-pointer items-center justify-center rounded-xl border border-slate-200/60 bg-slate-50/80 text-[10px] font-bold text-slate-700 backdrop-blur-sm transition-all duration-200 hover:bg-teal-50/50 hover:border-teal-200/60 dark:border-slate-700/40 dark:bg-slate-800/40 dark:text-slate-300 dark:hover:bg-teal-950/20"
                        >
                            {file ? file.name.slice(0, 15) + '...' : t('documents.selectFile', 'Choose file')}
                        </label>
                    </div>
                    {file && (
                        <button
                            type="submit"
                            disabled={isUploading}
                            className="inline-flex min-h-8 w-full items-center justify-center rounded-md bg-teal-700 px-3 text-[10px] font-bold text-white shadow-sm transition-colors hover:bg-teal-800 disabled:opacity-50"
                        >
                            {isUploading ? t('documents.uploading', 'Uploading...') : t('documents.upload', 'Upload')}
                        </button>
                    )}
                </form>
            )}

            <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    {t('documents.title', 'Patient Documents')}
                </h3>
                {isLoading ? (
                    <p className="text-xs text-slate-400 dark:text-slate-500">{t('documents.loading', 'Loading...')}</p>
                ) : documents?.length === 0 ? (
                    <p className="text-xs text-slate-400 dark:text-slate-500">{t('documents.empty', 'No documents uploaded')}</p>
                ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {documents.map(doc => (
                            <div key={doc.document_id} className="flex items-center justify-between py-2 text-xs">
                                <div className="min-w-0 flex-1">
                                    <p className="font-bold text-slate-700 dark:text-slate-200 truncate">{doc.file_name}</p>
                                    <p className="text-[10px] text-slate-400 dark:text-slate-500">{doc.type} · {formatBytes(doc.size_bytes)}</p>
                                </div>
                                <button
                                    onClick={() => handleDownload(doc)}
                                    className="p-1 text-teal-600 hover:bg-teal-50 dark:hover:bg-teal-950/30 rounded transition"
                                >
                                    <Download size={13} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
});
PatientDocumentsPanel.displayName = 'PatientDocumentsPanel';

export const DeliveryPanel = memo(({ history = [], onDeliver, isDelivering = false, locale, t, exam = null }) => {
    const [method, setMethod] = useState('Email');
    const [recipientName, setRecipientName] = useState(exam?.patient_name || '');
    const [recipientContact, setRecipientContact] = useState(() => (
        method === 'Email'
            ? (exam?.patient_email || exam?.email || '')
            : (exam?.patient_phone || exam?.phone || '')
    ));
    const [notes, setNotes] = useState('');
    const [copyCount, setCopyCount] = useState(1);

    const handlePrefillPatient = () => {
        if (!exam) return;
        if (exam.patient_name) setRecipientName(exam.patient_name);
        if (method === 'Email' && (exam.patient_email || exam.email)) {
            setRecipientContact(exam.patient_email || exam.email);
        } else if (exam.patient_phone || exam.phone) {
            setRecipientContact(exam.patient_phone || exam.phone);
        }
    };

    const handleOpenWhatsApp = () => {
        const cleanPhone = (recipientContact || '').replace(/\D/g, '');
        if (!cleanPhone) return;
        const patientName = recipientName || exam?.patient_name || '';
        const isAr = locale?.startsWith('ar');
        const text = isAr
            ? `السلام عليكم، نفيدكم بجاهزية التقرير الطبي للأشعة ${patientName ? `للمريض: ${patientName}` : ''}.`
            : `Hello, this is VIARA Radiology. Your imaging report ${patientName ? `for ${patientName}` : ''} is ready.`;
        window.open(`https://wa.me/${cleanPhone}?text=${encodeURIComponent(text)}`, '_blank', 'noopener,noreferrer');
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onDeliver({
            deliveryMethod: method,
            recipientName,
            recipientContact: method === 'Printed' ? '' : recipientContact,
            notes,
            printCopyCount: method === 'Printed' ? copyCount : 0
        });
        setRecipientName('');
        setRecipientContact('');
        setNotes('');
    };

    const formatMethodLabel = (m) => t(`delivery.methods.${m}`, m);

    return (
        <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <form onSubmit={handleSubmit} className="space-y-3 border-b border-slate-100 pb-3 dark:border-slate-800">
                <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        {t('delivery.newDelivery', 'Record Delivery')}
                    </h3>
                    {exam?.patient_name && (
                        <button
                            type="button"
                            onClick={handlePrefillPatient}
                            className="inline-flex items-center gap-1 text-[10px] font-bold text-teal-600 hover:text-teal-700 dark:text-teal-400"
                        >
                            <span>{t('delivery.fillPatient', { defaultValue: 'Use patient info' })}</span>
                        </button>
                    )}
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                            {t('delivery.method', 'Method')}
                        </label>
                        <select
                            value={method}
                            onChange={(e) => setMethod(e.target.value)}
                            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                        >
                            {DEFAULT_DELIVERY_METHODS.map(m => (
                                <option key={m} value={m}>{formatMethodLabel(m)}</option>
                            ))}
                        </select>
                    </div>

                    {method === 'Printed' ? (
                        <div>
                            <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                                {t('delivery.copies', 'Copies')}
                            </label>
                            <input
                                type="number"
                                min="1"
                                value={copyCount}
                                onChange={(e) => setCopyCount(parseInt(e.target.value) || 1)}
                                className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                            />
                        </div>
                    ) : (
                        <div>
                            <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                                {t('delivery.contact', 'Contact')}
                            </label>
                            <input
                                type="text"
                                value={recipientContact}
                                onChange={(e) => setRecipientContact(e.target.value)}
                                placeholder={method === 'Email' ? 'email@example.com' : '+123456789'}
                                className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                            />
                        </div>
                    )}
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div className="col-span-2">
                        <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                            {t('delivery.recipientName', 'Recipient')}
                        </label>
                        <input
                            type="text"
                            value={recipientName}
                            onChange={(e) => setRecipientName(e.target.value)}
                            placeholder={t('delivery.recipientPlaceholder', {
                                defaultValue: 'Recipient name'
                            })}
                            className="w-full rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-800 outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
                        />
                    </div>
                </div>

                <div>
                    <label className="block text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-1">
                        {t('delivery.notes', 'Notes')}
                    </label>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder={t('delivery.notesPlaceholder', {
                            defaultValue: 'Optional notes'
                        })}
                        rows="1"
                        className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs text-slate-800 outline-none dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 resize-none"
                    />
                </div>

                {method === 'WhatsApp Link' && recipientContact && (
                    <button
                        type="button"
                        onClick={handleOpenWhatsApp}
                        className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 rounded-md border border-emerald-500/40 bg-emerald-500/10 px-3 text-xs font-bold text-emerald-700 hover:bg-emerald-500 hover:text-white dark:text-emerald-300 transition-colors"
                    >
                        <Send size={13} />
                        <span>{t('delivery.openWhatsApp', { defaultValue: 'Open WhatsApp' })}</span>
                    </button>
                )}

                <button
                    type="submit"
                    disabled={isDelivering}
                    className="inline-flex min-h-9 w-full items-center justify-center rounded-md bg-teal-700 px-3 text-xs font-bold text-white shadow-sm transition-colors hover:bg-teal-800 disabled:opacity-50"
                >
                    {isDelivering ? t('delivery.sending', 'Recording...') : t('delivery.send', 'Record')}
                </button>
            </form>

            <div className="space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    {t('delivery.history', 'Delivery History')}
                </h3>
                {history?.length === 0 ? (
                    <p className="text-xs text-slate-400 dark:text-slate-500">{t('delivery.noHistory', 'No delivery recorded')}</p>
                ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 max-h-48 overflow-y-auto">
                        {history.map(item => (
                            <div key={item.delivery_id || item.id} className="py-2 text-[11px] leading-relaxed">
                                <div className="flex justify-between font-bold text-slate-700 dark:text-slate-200">
                                    <span>{formatMethodLabel(item.delivery_method || item.deliveryMethod)}</span>
                                    <span>{item.delivered_at ? formatDateTime(item.delivered_at, locale) : ''}</span>
                                </div>
                                <div className="text-[10px] text-slate-400 dark:text-slate-500">
                                    <p>{t('delivery.by', 'By')}: {item.delivered_by_name || 'System'}</p>
                                    {item.recipient_name && <p>{t('delivery.to', 'To')}: {item.recipient_name} ({item.recipient_contact || '-'})</p>}
                                    {item.notes && <p className="italic">{item.notes}</p>}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
});
DeliveryPanel.displayName = 'DeliveryPanel';

export const AiPreliminaryDraftPanel = memo(({
    draft,
    history = [],
    currentSections = {},
    isGenerating = false,
    editable = false,
    reportAiConfigured = false,
    reportSettingsStatus,
    isAdmin = false,
    onConfigure,
    onGenerate,
    onInsert,
    onLoad,
    locale,
    t
}) => {
    const [selectedKeys, setSelectedKeys] = useState([]);
    const [applyMode, setApplyMode] = useState('fill_empty');
    const draftSections = SECTION_CONFIG.filter(({ key }) => String(draft?.sections?.[key] || '').trim());
    const draftSignature = draftSections
        .map(({ key }) => `${key}:${String(draft?.sections?.[key] || '')}`)
        .join('|');
    const availableKeySignature = draftSections.map(({ key }) => key).join(',');

    useEffect(() => {
        setSelectedKeys(availableKeySignature ? availableKeySignature.split(',') : []);
        setApplyMode('fill_empty');
    }, [draft?.draftId, draft?.createdAt, draftSignature, availableKeySignature]);

    const selectedKeySet = new Set(selectedKeys);
    const selectedSections = draftSections.filter(({ key }) => selectedKeySet.has(key));
    const conflictingSections = selectedSections.filter(({ key }) => String(currentSections[key] || '').trim());
    const applyCount = applyMode === 'replace'
        ? selectedSections.length
        : selectedSections.length - conflictingSections.length;
    const provenance = draft?.provenance || {};
    const sourceContext = draft?.sourceContext || {};
    const imageAnalysis = sourceContext.imageAnalysis || null;
    const coverage = provenance.coverage || imageAnalysis?.payload?.provenance?.coverage || null;
    const providerName = provenance.provider || draft?.provider || reportSettingsStatus?.provider;
    const modelName = provenance.model || draft?.model || reportSettingsStatus?.model;
    const imageAssisted = imageAnalysis?.quality?.supported === true
        && Number(imageAnalysis.quality.imageCountAnalyzed) > 0
        && Number(imageAnalysis.evidenceCount) > 0
        && imageAnalysis?.provenance?.mode !== 'metadata-only-analysis'
        && Number(coverage?.analyzedImageCount || imageAnalysis.quality.imageCountAnalyzed) > 0
        && (provenance.sourceMode === 'pacs-image-analysis'
            || provenance.mode === 'structured-pacs-ai')
        && Boolean(imageAnalysis);
    const coverageParts = [];
    if (coverage?.analyzedImageCount != null) {
        coverageParts.push(`${coverage.analyzedImageCount}/${coverage.studyImageCount || coverage.analyzedImageCount} ${t('editor.aiDraft.images', { defaultValue: 'images' })}`);
    }
    if (coverage?.analyzedSeriesCount != null) {
        coverageParts.push(`${coverage.analyzedSeriesCount}/${coverage.studySeriesCount || coverage.analyzedSeriesCount} ${t('editor.aiDraft.series', { defaultValue: 'series' })}`);
    }

    const toggleSection = (key) => {
        setSelectedKeys((current) => current.includes(key)
            ? current.filter((item) => item !== key)
            : [...current, key]);
    };

    return (
        <div className="space-y-4">
            {!reportAiConfigured ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs dark:border-slate-800 dark:bg-slate-900/50">
                    <div className="flex gap-2.5">
                        <AlertCircle size={15} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
                        <p className="leading-5 text-slate-600 dark:text-slate-400">
                        {t('editor.aiDraft.notConfigured', 'AI draft generation is not configured for this facility.')}
                        </p>
                    </div>
                    {isAdmin && (
                        <button
                            type="button"
                            onClick={onConfigure}
                            className={`${secondaryBtn} mt-3 min-h-9 w-full rounded-lg text-[11px] font-bold`}
                        >
                            {t('editor.aiDraft.configure', 'Configure Settings')}
                        </button>
                    )}
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="flex items-center justify-between gap-3 border-b border-slate-200 pb-3 dark:border-slate-800">
                        <div className="min-w-0">
                            <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500">
                                {t('editor.aiDraft.activeProfile', 'Active profile')}
                            </p>
                            <p className="mt-0.5 truncate text-xs font-bold text-slate-700 dark:text-slate-200">
                                {reportSettingsStatus?.profileName || providerName || t('editor.aiDraft.pacsProfile', { defaultValue: 'PACS image analysis' })}
                                {(reportSettingsStatus?.model || modelName) ? ` / ${reportSettingsStatus?.model || modelName}` : ''}
                            </p>
                        </div>
                        {isAdmin && (
                            <button type="button" onClick={onConfigure} className="shrink-0 text-[10px] font-bold text-teal-700 hover:underline dark:text-teal-300">
                                {t('editor.aiDraft.changeProfile', 'Change')}
                            </button>
                        )}
                    </div>
                    {draft ? (
                        <div className="space-y-4">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-900/60">
                                            <CheckCircle2 size={11} />
                                            {t('editor.aiDraft.ready', 'Draft ready')}
                                        </span>
                                        <span className={`rounded-md px-2 py-1 text-[10px] font-bold ring-1 ${imageAssisted ? getToneClasses('teal') : getToneClasses('slate')}`}>
                                            {imageAssisted
                                                ? t('editor.aiDraft.imageAssisted', { defaultValue: 'Image assisted' })
                                                : t('editor.aiDraft.metadataOnly', { defaultValue: 'Metadata only' })}
                                        </span>
                                    </div>
                                    {(providerName || modelName) && (
                                        <p className="mt-2 truncate text-[11px] font-semibold text-slate-600 dark:text-slate-400">
                                            {[providerName, modelName].filter(Boolean).join(' / ')}
                                        </p>
                                    )}
                                    {coverageParts.length > 0 && (
                                        <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-500">
                                            {t('editor.aiDraft.reviewedCoverage', { defaultValue: 'Reviewed coverage' })}: {coverageParts.join(' / ')}
                                        </p>
                                    )}
                                </div>
                                {draft.createdAt && (
                                    <span className="shrink-0 text-[10px] text-slate-400 dark:text-slate-500">
                                        {formatDateTime(draft.createdAt, locale)}
                                    </span>
                                )}
                            </div>

                            <div className="divide-y divide-slate-100 border-y border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                                {draftSections.map(({ key }) => {
                                    const hasCurrentText = Boolean(String(currentSections[key] || '').trim());
                                    const selected = selectedKeySet.has(key);
                                    const willApply = selected && (applyMode === 'replace' || !hasCurrentText);
                                    return (
                                        <label key={key} className="flex cursor-pointer gap-2.5 py-2.5">
                                            <input
                                                type="checkbox"
                                                checked={selected}
                                                onChange={() => toggleSection(key)}
                                                className="mt-0.5 h-4 w-4 shrink-0 rounded border-slate-300 text-teal-600 focus:ring-teal-500/30 dark:border-slate-700 dark:bg-slate-900"
                                            />
                                            <span className="min-w-0 flex-1">
                                                <span className="flex items-center justify-between gap-2">
                                                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                                                        {t(`sections.${key}`)}
                                                    </span>
                                                    <span className={`shrink-0 text-[9px] font-bold ${willApply ? 'text-teal-700 dark:text-teal-300' : 'text-slate-400 dark:text-slate-500'}`}>
                                                        {!selected
                                                            ? t('editor.aiDraft.skipped', { defaultValue: 'Skipped' })
                                                            : hasCurrentText && applyMode === 'fill_empty'
                                                                ? t('editor.aiDraft.keepCurrent', { defaultValue: 'Keep current' })
                                                                : hasCurrentText
                                                                    ? t('editor.aiDraft.willReplace', { defaultValue: 'Will replace' })
                                                                    : t('editor.aiDraft.willFill', { defaultValue: 'Will fill' })}
                                                    </span>
                                                </span>
                                                <span className="mt-2 block max-h-24 overflow-auto whitespace-pre-wrap rounded-md bg-slate-50 px-2.5 py-2 text-[10px] leading-4 text-slate-600 dark:bg-slate-900/70 dark:text-slate-350">
                                                    {draft.sections[key]}
                                                </span>
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>

                            {editable && (
                                <div className="space-y-3">
                                    <div className="grid grid-cols-2 rounded-lg bg-slate-100 p-1 dark:bg-slate-900">
                                        {[
                                            ['fill_empty', t('editor.aiDraft.insertEmpty', 'Fill empty')],
                                            ['replace', t('editor.aiDraft.replaceSelected', { defaultValue: 'Replace selected' })]
                                        ].map(([mode, label]) => (
                                            <button
                                                key={mode}
                                                type="button"
                                                onClick={() => setApplyMode(mode)}
                                                aria-pressed={applyMode === mode}
                                                className={`min-h-8 rounded-md px-2 text-[10px] font-bold transition ${applyMode === mode ? 'bg-white text-slate-800 shadow-sm dark:bg-slate-800 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'}`}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                    {applyMode === 'replace' && conflictingSections.length > 0 && (
                                        <div className="flex gap-2 rounded-lg bg-amber-50 px-2.5 py-2 text-[10px] leading-4 text-amber-800 ring-1 ring-amber-200 dark:bg-amber-950/25 dark:text-amber-300 dark:ring-amber-900/60">
                                            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                                            <span>{t('editor.aiDraft.replaceWarning', {
                                                count: conflictingSections.length,
                                                defaultValue: `${conflictingSections.length} populated sections will be replaced after confirmation.`
                                            })}</span>
                                        </div>
                                    )}
                                    <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                                        <button
                                            type="button"
                                            onClick={() => onInsert(applyMode, selectedKeys)}
                                            disabled={applyCount < 1}
                                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-teal-600 px-3 text-[11px] font-bold text-white transition hover:bg-teal-700 disabled:cursor-not-allowed disabled:opacity-45"
                                        >
                                            <Check size={13} />
                                            {t('editor.aiDraft.applySelected', {
                                                count: applyCount,
                                                defaultValue: `Apply ${applyCount} sections`
                                            })}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={onGenerate}
                                            disabled={isGenerating}
                                            title={t('editor.aiDraft.regenerate', { defaultValue: 'Regenerate draft' })}
                                            aria-label={t('editor.aiDraft.regenerate', { defaultValue: 'Regenerate draft' })}
                                            className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 hover:text-slate-800 disabled:opacity-50 dark:border-slate-800 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white"
                                        >
                                            <RefreshCw size={14} className={isGenerating ? 'animate-spin' : ''} />
                                        </button>
                                    </div>
                                </div>
                            )}

                            {(draft.limitations?.length > 0 || draftSections.length > 0) && (
                                <details className="group border-t border-slate-200 pt-3 dark:border-slate-800">
                                    <summary className="flex cursor-pointer list-none items-center justify-between text-[10px] font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200">
                                        <span>{t('editor.aiDraft.reviewDetails', { defaultValue: 'Draft details and limitations' })}</span>
                                        <ChevronDown size={13} className="transition group-open:rotate-180" />
                                    </summary>
                                    <div className="mt-3 space-y-3 text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                                        {draft.limitations?.length > 0 && (
                                            <ul className="space-y-1.5">
                                                {draft.limitations.map((item, index) => <li key={`${item}-${index}`}>- {item}</li>)}
                                            </ul>
                                        )}
                                        <p className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-900/70">
                                            {draft.disclaimer || t('editor.aiDraft.disclaimer', { defaultValue: 'Preliminary AI content requires radiologist review and must not be finalized without checking the source images.' })}
                                        </p>
                                    </div>
                                </details>
                            )}
                        </div>
                    ) : (
                        <div className="space-y-3">
                            <div className="flex gap-2.5 rounded-lg bg-slate-50 p-3 text-[11px] leading-5 text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900/60 dark:text-slate-400 dark:ring-slate-800">
                                <BrainCircuit size={15} className="mt-0.5 shrink-0 text-teal-600 dark:text-teal-400" />
                                <p>{t('editor.aiDraft.generateHelp', { defaultValue: 'Create a sectioned preliminary draft from the exam context and the latest completed image analysis when available.' })}</p>
                            </div>
                            <button
                                type="button"
                                disabled={isGenerating || !editable}
                                onClick={onGenerate}
                                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-lg bg-teal-600 px-4 text-xs font-bold text-white transition hover:bg-teal-700 disabled:opacity-50"
                            >
                                {isGenerating ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                                {isGenerating
                                    ? t('editor.aiDraft.generating', { defaultValue: 'Generating draft...' })
                                    : t('editor.aiDraft.generate', 'Generate AI Draft')}
                            </button>
                        </div>
                    )}

                    {history?.length > 0 && (
                        <div className="space-y-2 border-t border-slate-200 pt-3 dark:border-slate-800">
                            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                {t('editor.aiDraft.history', 'Draft History')}
                            </h4>
                            <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                {history.slice(0, 5).map((h, i) => (
                                    <div key={h.draft_id || i} className="flex items-center justify-between gap-3 py-2 text-xs">
                                        <span className="min-w-0">
                                            <span className="block truncate text-[10px] font-bold text-slate-600 dark:text-slate-300">
                                                {[h.provider, h.model].filter(Boolean).join(' / ') || t('editor.aiDraft.savedDraft', { defaultValue: 'Saved draft' })}
                                            </span>
                                            <span className="mt-0.5 block text-[9px] text-slate-400 dark:text-slate-500">
                                                {h.created_at ? formatDateTime(h.created_at, locale) : t('editor.aiDraft.version', { defaultValue: 'Draft v{{version}}', version: history.length - i })}
                                            </span>
                                        </span>
                                        <button
                                            type="button"
                                            onClick={() => onLoad(h)}
                                            className="shrink-0 rounded-md px-2 py-1.5 text-[10px] font-bold text-teal-700 hover:bg-teal-50 dark:text-teal-300 dark:hover:bg-teal-950/30"
                                        >
                                            {t('editor.aiDraft.load', 'Load')}
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
});
AiPreliminaryDraftPanel.displayName = 'AiPreliminaryDraftPanel';

export const ReportDocumentPanel = memo(({ settings = {}, onChange, t }) => (
    <div className="space-y-3">
        <div className="divide-y divide-slate-100 border-y border-slate-200 dark:divide-slate-800 dark:border-slate-800">
            {[
                ['includeHeader', t('editor.document.includeHeader', 'Facility header')],
                ['includeFooter', t('editor.document.includeFooter', 'Document footer')],
                ['includeSignature', t('editor.document.includeSignature', 'Signature verification')]
            ].map(([key, label]) => (
                <label key={key} className="flex cursor-pointer items-center justify-between gap-3 py-2.5 text-[11px] font-bold text-slate-700 dark:text-slate-300">
                    <span>{label}</span>
                    <input
                        type="checkbox"
                        checked={settings[key] !== false}
                        onChange={(event) => onChange({ ...settings, [key]: event.target.checked })}
                        className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500/30 dark:border-slate-700 dark:bg-slate-900"
                    />
                </label>
            ))}
        </div>

        <label className="block space-y-1.5">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                {t('editor.document.headerText', { defaultValue: 'Header contact details' })}
            </span>
            <textarea
                rows={3}
                value={settings.reportHeader || ''}
                disabled={settings.includeHeader === false}
                onChange={(event) => onChange({ ...settings, reportHeader: event.target.value })}
                className={`${inputClass} min-h-20 resize-y text-[11px] leading-4 disabled:opacity-50`}
            />
        </label>

        <label className="block space-y-1.5">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
                {t('editor.document.footerText', { defaultValue: 'Footer text' })}
            </span>
            <textarea
                rows={2}
                value={settings.reportFooter || ''}
                disabled={settings.includeFooter === false}
                onChange={(event) => onChange({ ...settings, reportFooter: event.target.value })}
                className={`${inputClass} min-h-16 resize-y text-[11px] leading-4 disabled:opacity-50`}
            />
        </label>
    </div>
));
ReportDocumentPanel.displayName = 'ReportDocumentPanel';

export const ReportExportDialog = memo(({
    open,
    onClose,
    onExportWord,
    onExportPdf,
    onDownloadPdf,
    isExportingWord = false,
    isOpeningPdf = false,
    locked = false,
    exam,
    sections = {},
    settings = {},
    onSettingsChange,
    t
}) => {
    const [format, setFormat] = useState('word');
    const working = isExportingWord || isOpeningPdf;
    const completedSections = SECTION_CONFIG.filter(({ key }) => String(sections[key] || '').trim()).length;

    useEffect(() => {
        if (open) setFormat(locked ? 'pdf_preview' : 'word');
    }, [locked, open]);

    useEffect(() => {
        if (!open) return undefined;
        const handleKeyDown = (event) => {
            if (event.key === 'Escape' && !working) onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose, open, working]);

    if (!open) return null;

    const exportSelected = async () => {
        let completed = false;
        if (format === 'word') {
            completed = await onExportWord();
        } else if (format === 'pdf_preview' || format === 'pdf') {
            completed = await onExportPdf();
        } else if (format === 'pdf_download') {
            if (typeof onDownloadPdf === 'function') {
                completed = await onDownloadPdf();
            } else {
                completed = await onExportPdf();
            }
        }
        if (completed) onClose();
    };

    return createPortal(
        <div
            className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-md"
            role="presentation"
            onMouseDown={(event) => {
                if (event.target === event.currentTarget && !working) onClose();
            }}
        >
            <section
                role="dialog"
                aria-modal="true"
                aria-labelledby="report-export-title"
                className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-white/20 bg-white/95 shadow-[0_8px_32px_rgba(0,0,0,0.12)] backdrop-blur-2xl dark:border-white/10 dark:bg-slate-900/95"
            >
                <header className="relative flex items-start justify-between gap-4 border-b border-slate-200/50 px-6 py-5 dark:border-slate-700/50">
                    <div className="min-w-0">
                        <div className="flex items-center gap-3">
                            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-teal-500 to-emerald-600 text-white shadow-lg shadow-teal-500/20">
                                <Download size={22} />
                            </div>
                            <div className="min-w-0">
                                <h2 id="report-export-title" className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                                    {t('editor.export.title', { defaultValue: 'Export Diagnostic Report' })}
                                </h2>
                                <p className="mt-1 truncate text-sm font-semibold text-slate-500 dark:text-slate-400">
                                    {exam?.patient_name || exam?.mrn || '-'} <span className="mx-1.5 opacity-50">•</span> {exam?.order_number || exam?.exam_id || '-'}
                                </p>
                            </div>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        disabled={working}
                        aria-label={t('common:actions.close', { defaultValue: 'Close' })}
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-500 transition-colors hover:bg-slate-200 hover:text-slate-900 disabled:opacity-40 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700 dark:hover:text-white"
                    >
                        <X size={18} />
                    </button>
                </header>

                <div className="relative overflow-y-auto px-6 py-6">
                    <div className="grid gap-3 sm:grid-cols-3">
                        <button
                            type="button"
                            onClick={() => setFormat('word')}
                            aria-pressed={format === 'word'}
                            className={`group relative flex flex-col justify-between rounded-xl border p-4 text-start transition-all ${
                                format === 'word' 
                                    ? 'border-blue-500 bg-blue-50/80 shadow-md shadow-blue-500/10 ring-2 ring-blue-500/20 dark:bg-blue-500/10' 
                                    : 'border-slate-200 bg-white hover:border-blue-300 hover:bg-blue-50/30 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:bg-slate-800'
                            }`}
                        >
                            <div className="flex items-center justify-between">
                                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${
                                    format === 'word' ? 'bg-blue-600 text-white shadow-sm' : 'bg-blue-100 text-blue-600 dark:bg-blue-900/50 dark:text-blue-400 group-hover:bg-blue-200'
                                }`}>
                                    <FileText size={20} />
                                </div>
                                {format === 'word' && (
                                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-600 text-white">
                                        <Check size={12} />
                                    </span>
                                )}
                            </div>
                            <div className="mt-3">
                                <span className="block text-sm font-bold text-slate-900 dark:text-slate-100">Word (.docx)</span>
                                <span className="mt-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                                    {t('editor.export.wordDetail', { defaultValue: 'Editable clinical Word document' })}
                                </span>
                            </div>
                        </button>

                        <button
                            type="button"
                            onClick={() => setFormat('pdf_preview')}
                            aria-pressed={format === 'pdf_preview' || format === 'pdf'}
                            className={`group relative flex flex-col justify-between rounded-xl border p-4 text-start transition-all ${
                                format === 'pdf_preview' || format === 'pdf'
                                    ? 'border-rose-500 bg-rose-50/80 shadow-md shadow-rose-500/10 ring-2 ring-rose-500/20 dark:bg-rose-500/10' 
                                    : 'border-slate-200 bg-white hover:border-rose-300 hover:bg-rose-50/30 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:bg-slate-800'
                            }`}
                        >
                            <div className="flex items-center justify-between">
                                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${
                                    format === 'pdf_preview' || format === 'pdf' ? 'bg-rose-600 text-white shadow-sm' : 'bg-rose-100 text-rose-600 dark:bg-rose-900/50 dark:text-rose-400 group-hover:bg-rose-200'
                                }`}>
                                    <Printer size={20} />
                                </div>
                                {(format === 'pdf_preview' || format === 'pdf') && (
                                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-600 text-white">
                                        <Check size={12} />
                                    </span>
                                )}
                            </div>
                            <div className="mt-3">
                                <span className="block text-sm font-bold text-slate-900 dark:text-slate-100">PDF / Print</span>
                                <span className="mt-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                                    {t('editor.export.pdfDetail', { defaultValue: 'Interactive print preview & customizer' })}
                                </span>
                            </div>
                        </button>

                        <button
                            type="button"
                            onClick={() => setFormat('pdf_download')}
                            aria-pressed={format === 'pdf_download'}
                            className={`group relative flex flex-col justify-between rounded-xl border p-4 text-start transition-all ${
                                format === 'pdf_download' 
                                    ? 'border-emerald-500 bg-emerald-50/80 shadow-md shadow-emerald-500/10 ring-2 ring-emerald-500/20 dark:bg-emerald-500/10' 
                                    : 'border-slate-200 bg-white hover:border-emerald-300 hover:bg-emerald-50/30 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:bg-slate-800'
                            }`}
                        >
                            <div className="flex items-center justify-between">
                                <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${
                                    format === 'pdf_download' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/50 dark:text-emerald-400 group-hover:bg-emerald-200'
                                }`}>
                                    <Download size={20} />
                                </div>
                                {format === 'pdf_download' && (
                                    <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-600 text-white">
                                        <Check size={12} />
                                    </span>
                                )}
                            </div>
                            <div className="mt-3">
                                <span className="block text-sm font-bold text-slate-900 dark:text-slate-100">PDF File (.pdf)</span>
                                <span className="mt-1 block text-xs font-medium text-slate-500 dark:text-slate-400">
                                    {t('editor.export.pdfDownloadDetail', { defaultValue: 'Direct high-res PDF download with QR' })}
                                </span>
                            </div>
                        </button>
                    </div>

                    <div className="mt-5 rounded-xl border border-slate-200/60 bg-slate-50/50 p-4 dark:border-slate-700/60 dark:bg-slate-800/30">
                        <div className="grid grid-cols-3 divide-x divide-slate-200/60 dark:divide-slate-700/60 rtl:divide-x-reverse text-center">
                            <div className="px-3">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t('editor.export.status', { defaultValue: 'Status' })}</p>
                                <p className={`mt-1.5 text-sm font-bold ${locked ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                    {locked ? 'Finalized' : 'Draft'}
                                </p>
                            </div>
                            <div className="px-3">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t('editor.export.sections', { defaultValue: 'Sections' })}</p>
                                <p className="mt-1.5 text-sm font-bold text-slate-700 dark:text-slate-200">
                                    {completedSections} <span className="text-slate-400">/ {SECTION_CONFIG.length}</span>
                                </p>
                            </div>
                            <div className="px-3">
                                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{t('editor.export.language', { defaultValue: 'Language' })}</p>
                                <p className="mt-1.5 text-sm font-bold text-slate-700 dark:text-slate-200">
                                    {t('editor.export.english', { defaultValue: 'Bilingual (AR/EN)' })}
                                </p>
                            </div>
                        </div>
                    </div>

                    <div className="mt-5">
                        <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            {t('editor.export.contents', { defaultValue: 'Document Settings' })}
                        </h3>
                        <div className="space-y-2">
                            {[
                                ['includeHeader', t('editor.document.includeHeader', 'Facility header & credentials')],
                                ['includeFooter', t('editor.document.includeFooter', 'Confidentiality footer & page numbers')],
                                ['includeSignature', t('editor.document.includeSignature', 'Signature & cryptographic QR verification')]
                            ].map(([key, label]) => (
                                <label key={key} className="group flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200/60 bg-white px-4 py-3 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700/60 dark:bg-slate-800 dark:hover:border-slate-600 dark:hover:bg-slate-800/80">
                                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{label}</span>
                                    <div className="relative flex items-center">
                                        <input
                                            type="checkbox"
                                            checked={settings[key] !== false}
                                            onChange={(event) => onSettingsChange({ ...settings, [key]: event.target.checked })}
                                            className="peer sr-only"
                                        />
                                        <div className="h-6 w-11 rounded-full bg-slate-200 after:absolute after:start-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:border after:border-gray-300 after:bg-white after:transition-all after:content-[''] peer-checked:bg-teal-500 peer-checked:after:translate-x-full peer-checked:after:border-white peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-teal-500/20 dark:border-gray-600 dark:bg-slate-700 dark:peer-focus:ring-teal-800/30 rtl:peer-checked:after:-translate-x-full"></div>
                                    </div>
                                </label>
                            ))}
                        </div>
                    </div>

                    {!locked && (
                        <div className="mt-5 flex gap-3 rounded-xl border border-amber-200/60 bg-gradient-to-r from-amber-50 to-orange-50 px-4 py-3 text-amber-800 shadow-sm dark:border-amber-900/40 dark:from-amber-950/30 dark:to-orange-950/30 dark:text-amber-300">
                            <AlertTriangle size={18} className="shrink-0 text-amber-600 dark:text-amber-500" />
                            <p className="text-xs font-semibold leading-relaxed">
                                {t('editor.export.draftNotice', { defaultValue: 'This report is currently in Draft. Exported documents will clearly display a preliminary draft indicator until officially finalized.' })}
                            </p>
                        </div>
                    )}
                </div>

                <footer className="relative flex items-center justify-end gap-3 border-t border-slate-200/50 bg-slate-50/80 px-6 py-4 backdrop-blur-xl dark:border-slate-700/50 dark:bg-slate-900/80">
                    <button 
                        type="button" 
                        onClick={onClose} 
                        disabled={working} 
                        className="rounded-xl px-5 py-2.5 text-sm font-bold text-slate-600 transition-colors hover:bg-slate-200/50 dark:text-slate-300 dark:hover:bg-slate-800"
                    >
                        {t('common:actions.cancel', { defaultValue: 'Cancel' })}
                    </button>
                    <button
                        type="button"
                        onClick={exportSelected}
                        disabled={working}
                        className="inline-flex min-h-[44px] min-w-[170px] items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-teal-600 to-emerald-600 px-6 text-sm font-bold text-white shadow-md shadow-teal-500/20 transition-all hover:from-teal-500 hover:to-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                        {working ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                        {format === 'word'
                            ? t('editor.export.downloadWord', { defaultValue: 'Download Word (.docx)' })
                            : format === 'pdf_download'
                                ? t('editor.export.downloadPdf', { defaultValue: 'Download PDF (.pdf)' })
                                : t('editor.export.openPdf', { defaultValue: 'Open Print Preview' })}
                    </button>
                </footer>
            </section>
        </div>,
        document.body
    );
});
const aiAnalysisTone = {
    Queued: 'bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/30 dark:text-amber-300 dark:ring-amber-900/50',
    Running: 'bg-cyan-50 text-cyan-700 ring-cyan-200 dark:bg-cyan-950/30 dark:text-cyan-300 dark:ring-cyan-900/50',
    Completed: 'bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/30 dark:text-emerald-300 dark:ring-emerald-900/50',
    Failed: 'bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/30 dark:text-rose-300 dark:ring-rose-900/50',
    Canceled: 'bg-slate-100 text-slate-600 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800'
};

const OrderImagingPanel = memo(
    ({ exam, imaging, imagesReady, isUploading, uploadProgress, onView, onUpload, t }) => {
        const imageCount = imaging?.image_count || 0;
        const seriesCount = Array.isArray(imaging?.series) ? imaging.series.length : 0;
        const processedCount = Number(uploadProgress?.processedCount || 0);
        const processingTotal = Number(uploadProgress?.processingTotal || uploadProgress?.files || 0);
        const linkedCount = Number(uploadProgress?.reconciledCount || 0);
        const issueCount = Number(uploadProgress?.unreconciledCount || 0)
            + Number(uploadProgress?.failedCount || 0)
            + Number(uploadProgress?.rejectedCount || 0);
        const eta = formatSeconds(uploadProgress?.etaSeconds);
        const elapsed = formatSeconds(uploadProgress?.elapsedSeconds);
        const speed = uploadProgress?.bytesPerSecond ? `${formatBytes(uploadProgress.bytesPerSecond, 1)}/s` : null;
        const batchLabel = uploadProgress?.batches > 1
            ? `${uploadProgress.batch || 1}/${uploadProgress.batches}`
            : null;
        const progressLabel = uploadProgress?.phase === 'processing'
            ? t('editor.uploadProcessing', { defaultValue: 'Processing in PACS' })
            : t('editor.uploadingImages', { defaultValue: 'Uploading images' });

        return (
            <div>
                <p className="truncate text-sm font-bold text-slate-900 dark:text-white">
                    {exam?.order_number || exam?.exam_id || '-'}
                </p>

                <div className="mt-3 grid grid-cols-2 gap-2">
                    <MiniStat
                        label={t('details.images', { defaultValue: 'Images' })}
                        value={imageCount}
                    />
                    <MiniStat
                        label={t('common:pacs.viewer.series', { defaultValue: 'Series' })}
                        value={seriesCount}
                    />
                </div>

                <div className="mt-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100 dark:bg-slate-900/50 dark:ring-slate-800">
                    <div className="flex items-center gap-2 text-[11px] font-bold text-slate-700 dark:text-slate-200">
                        {imagesReady ? (
                            <CheckCircle2 size={14} className="shrink-0 text-emerald-600 dark:text-emerald-400" />
                        ) : (
                            <Clock3 size={14} className="shrink-0 text-amber-600 dark:text-amber-400" />
                        )}
                        <span>
                            {imagesReady
                                ? t('editor.imaging.ready', { defaultValue: 'Linked to this order' })
                                : t('editor.imaging.waiting', { defaultValue: 'Waiting for order images' })}
                        </span>
                    </div>
                    <p className="mt-1.5 text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                        {t('editor.imaging.orderHelp', {
                            defaultValue: 'Matching uses the order/accession number; patient identifiers are checked only to prevent mismatch.'
                        })}
                    </p>
                </div>

                {isUploading && (
                    <div className="mt-3 rounded-xl border border-teal-100 bg-teal-50/70 p-3 dark:border-teal-900/50 dark:bg-teal-950/20">
                        <div className="flex items-center justify-between gap-3 text-[11px] font-bold text-teal-800 dark:text-teal-200">
                            <span>{progressLabel}</span>
                            <span className="font-mono">
                                {Number.isFinite(uploadProgress?.percent) ? `${uploadProgress.percent}%` : '...'}
                            </span>
                        </div>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-teal-100 dark:bg-teal-950">
                            <div
                                className={`h-full rounded-full bg-teal-600 transition-all duration-300 ${Number.isFinite(uploadProgress?.percent) ? '' : 'animate-pulse'}`}
                                style={{ width: `${Number.isFinite(uploadProgress?.percent) ? uploadProgress.percent : 35}%` }}
                            />
                        </div>
                        <p className="mt-2 text-[10px] font-semibold leading-4 text-teal-700/80 dark:text-teal-300/80">
                            {uploadProgress?.phase === 'processing'
                                ? t('editor.uploadProcessingHelp', {
                                    defaultValue: 'Processed {{processed}}/{{total}} - linked {{linked}} - issues {{issues}}',
                                    processed: processedCount,
                                    total: processingTotal,
                                    linked: linkedCount,
                                    issues: issueCount
                                })
                                : t('editor.uploadProgressHelp', {
                                    defaultValue: '{{count}} file(s) selected',
                                    count: uploadProgress?.files || 0
                                })}
                        </p>
                        {uploadProgress?.phase === 'processing' && uploadProgress.currentFile && (
                            <p className="mt-1 truncate text-[10px] font-semibold text-teal-800/80 dark:text-teal-200/80">
                                {t('editor.uploadOverlay.currentFile', 'Current file')}: {uploadProgress.currentFile}
                            </p>
                        )}
                        <div className="mt-2 flex flex-wrap gap-1.5 text-[10px] font-bold text-teal-800 dark:text-teal-200">
                            {batchLabel && <span className="rounded-full bg-white/70 px-2 py-1 dark:bg-teal-950/50">{t('editor.uploadOverlay.batch', 'Batch')}: {batchLabel}</span>}
                            {speed && <span className="rounded-full bg-white/70 px-2 py-1 dark:bg-teal-950/50">{speed}</span>}
                            {eta && <span className="rounded-full bg-white/70 px-2 py-1 dark:bg-teal-950/50">{t('editor.uploadOverlay.eta', 'ETA')}: {eta}</span>}
                            {elapsed && <span className="rounded-full bg-white/70 px-2 py-1 dark:bg-teal-950/50">{t('editor.uploadOverlay.elapsed', 'Elapsed')}: {elapsed}</span>}
                        </div>
                    </div>
                )}

                <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                        type="button"
                        onClick={onView}
                        disabled={!imagesReady}
                        className={`${secondaryBtn} min-h-9 rounded-xl px-3 text-[11px]`}
                    >
                        {t('editor.imaging.view', { defaultValue: 'View images' })}
                    </button>
                    <button
                        type="button"
                        onClick={onUpload}
                        className="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 text-[11px] font-bold text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 transition"
                    >
                        <Upload size={13} />
                        {t('editor.imaging.upload', { defaultValue: 'Upload DICOM' })}
                    </button>
                </div>
            </div>
        );
    }
);
OrderImagingPanel.displayName = 'OrderImagingPanel';

const AiAnalysisResultSummary = memo(({ workerResult, summary, coverage, t }) => {
    const findings = Array.isArray(workerResult?.findings) ? workerResult.findings : [];
    const detectedFindings = findings.filter((finding) => finding?.present !== false);
    const negativeFindings = findings.filter((finding) => finding?.present === false);
    const quality = workerResult?.quality || {};
    const limitations = Array.isArray(workerResult?.limitations)
        ? [...new Set(workerResult.limitations.map(String).filter(Boolean))]
        : [];
    const impression = String(workerResult?.impression || '').trim();
    const summaryText = String(summary || '').trim();
    const showImpression = impression && impression.toLowerCase() !== summaryText.toLowerCase();
    const views = Array.isArray(quality.views) ? quality.views.filter(Boolean) : [];
    const model = workerResult?.model || {};
    const evidenceCount = Array.isArray(workerResult?.evidence) ? workerResult.evidence.length : 0;
    const sampled = coverage && !coverage.completePixelCoverage;
    const qualityLimited = quality.diagnostic === false;

    return (
        <section className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
            <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-3.5 py-3 dark:border-slate-800">
                <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-950/40 dark:text-teal-300">
                        <BrainCircuit size={15} />
                    </span>
                    <div className="min-w-0">
                        <h3 className="text-xs font-bold text-slate-900 dark:text-white">
                            {t('editor.aiImage.result', { defaultValue: 'Result summary' })}
                        </h3>
                        <p className="mt-0.5 text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            {workerResult?.resultType || t('editor.aiImage.preliminaryScreening', { defaultValue: 'Preliminary AI screening' })}
                        </p>
                    </div>
                </div>
                <span className={`shrink-0 rounded-md px-2 py-1 text-[9px] font-bold ring-1 ${qualityLimited ? getToneClasses('amber') : getToneClasses('emerald')}`}>
                    {qualityLimited
                        ? t('editor.aiImage.limitedQuality', { defaultValue: 'Limited quality' })
                        : t('editor.aiImage.reviewable', { defaultValue: 'Reviewable' })}
                </span>
            </header>

            <div className="space-y-4 p-3.5">
                <div>
                    <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                        {t('editor.aiImage.overview', { defaultValue: 'Overview' })}
                    </p>
                    <p className="mt-1.5 whitespace-pre-line text-[11px] font-semibold leading-5 text-slate-700 dark:text-slate-200">
                        {summaryText || t('editor.aiImage.noSummary', { defaultValue: 'The provider completed analysis without a narrative summary.' })}
                    </p>
                </div>

                {showImpression && (
                    <div className="rounded-lg border border-teal-200 bg-teal-50/60 px-3 py-2.5 dark:border-teal-900/60 dark:bg-teal-950/25">
                        <p className="text-[9px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300">
                            {t('editor.aiImage.preliminaryImpression', { defaultValue: 'Preliminary impression' })}
                        </p>
                        <p className="mt-1 whitespace-pre-line text-[11px] font-bold leading-5 text-slate-800 dark:text-slate-100">
                            {impression}
                        </p>
                    </div>
                )}

                <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 dark:border-slate-800 dark:bg-slate-800 sm:grid-cols-4">
                    {[
                        [t('editor.aiImage.detected', { defaultValue: 'Detected' }), detectedFindings.length],
                        [t('editor.aiImage.imageCoverage', { defaultValue: 'Images' }), coverage ? `${coverage.analyzedImageCount || 0}/${coverage.studyImageCount || 0}` : (quality.imageCountAnalyzed || '-')],
                        [t('editor.aiImage.seriesCoverage', { defaultValue: 'Series' }), coverage ? `${coverage.analyzedSeriesCount || 0}/${coverage.studySeriesCount || 0}` : '-'],
                        [t('editor.aiImage.views', { defaultValue: 'Views' }), views.length || '-']
                    ].map(([label, value]) => (
                        <div key={label} className="bg-white px-2.5 py-2.5 text-center dark:bg-slate-950">
                            <p className="text-[9px] font-bold uppercase text-slate-400 dark:text-slate-500">{label}</p>
                            <p className="mt-1 text-xs font-bold tabular-nums text-slate-800 dark:text-slate-100">{value}</p>
                        </div>
                    ))}
                </div>

                <div>
                    <div className="flex items-center justify-between gap-3">
                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            {t('editor.aiImage.detectedSignals', { defaultValue: 'Detected signals' })}
                        </h4>
                        {detectedFindings.length > 0 && (
                            <span className="text-[9px] font-bold text-slate-400 dark:text-slate-500">
                                {t('editor.aiImage.modelScore', { defaultValue: 'Model score' })}
                            </span>
                        )}
                    </div>

                    {detectedFindings.length > 0 ? (
                        <div className="mt-2 max-h-72 divide-y divide-slate-100 overflow-y-auto border-y border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                            {detectedFindings.map((finding, index) => {
                                const numericScore = finding.confidence == null ? null : Number(finding.confidence);
                                const hasScore = Number.isFinite(numericScore);
                                const score = hasScore ? Math.round(Math.max(0, Math.min(1, numericScore)) * 100) : null;
                                return (
                                    <div key={`${finding.label || 'finding'}-${index}`} className="py-2.5">
                                        <div className="flex items-start justify-between gap-3">
                                            <div className="min-w-0 flex-1">
                                                <p className="text-[11px] font-bold text-slate-800 dark:text-slate-100">
                                                    {finding.label || t('editor.aiImage.finding', { defaultValue: 'Unspecified finding' })}
                                                </p>
                                                {finding.location && (
                                                    <p className="mt-0.5 text-[9px] font-bold uppercase text-teal-700 dark:text-teal-300">
                                                        {finding.location}
                                                    </p>
                                                )}
                                            </div>
                                            {hasScore && (
                                                <span
                                                    title={t('editor.aiImage.scoreHelp', { defaultValue: 'Model score, not a calibrated clinical probability' })}
                                                    className="shrink-0 rounded-md bg-slate-100 px-2 py-1 font-mono text-[10px] font-bold text-slate-600 dark:bg-slate-900 dark:text-slate-300"
                                                >
                                                    {score}%
                                                </span>
                                            )}
                                        </div>
                                        {finding.description && (
                                            <p className="mt-1 text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                                                {finding.description}
                                            </p>
                                        )}
                                        {Array.isArray(finding.evidence) && finding.evidence.length > 0 && (
                                            <p className="mt-1 text-[9px] font-semibold text-slate-400 dark:text-slate-500">
                                                {t('editor.aiImage.evidenceFrames', {
                                                    count: finding.evidence.length,
                                                    defaultValue: `${finding.evidence.length} referenced frame(s)`
                                                })}
                                            </p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    ) : (
                        <div className="mt-2 flex gap-2.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 text-[10px] leading-4 text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
                            <Info size={13} className="mt-0.5 shrink-0" />
                            <span>{t('editor.aiImage.noPositiveSignals', { defaultValue: 'No positive screening signals were returned. This does not establish a normal study.' })}</span>
                        </div>
                    )}
                </div>

                {(sampled || qualityLimited || limitations.length > 0) && (
                    <details className="group border-t border-slate-200 pt-3 dark:border-slate-800" open={qualityLimited || undefined}>
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                            <span className="flex items-center gap-2">
                                <AlertTriangle size={13} className={qualityLimited ? 'text-amber-600 dark:text-amber-400' : 'text-slate-400'} />
                                {t('editor.aiImage.limitations', { defaultValue: 'Coverage and limitations' })}
                            </span>
                            <ChevronDown size={13} className="text-slate-400 transition group-open:rotate-180" />
                        </summary>
                        <div className="mt-2.5 space-y-2 text-[10px] leading-4 text-slate-500 dark:text-slate-400">
                            {sampled && (
                                <p>{t('editor.aiImage.sampledCoverage', { defaultValue: 'Representative frames were selected across the available series. Full DICOM review is still required.' })}</p>
                            )}
                            {limitations.map((limitation, index) => <p key={`${limitation}-${index}`}>- {limitation}</p>)}
                        </div>
                    </details>
                )}

                <details className="group border-t border-slate-200 pt-3 dark:border-slate-800">
                    <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                        <span>{t('editor.aiImage.technicalDetails', { defaultValue: 'Technical details' })}</span>
                        <ChevronDown size={13} className="transition group-open:rotate-180" />
                    </summary>
                    <dl className="mt-2.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[9px]">
                        <dt className="font-bold text-slate-400">{t('editor.aiImage.provider', { defaultValue: 'Provider' })}</dt>
                        <dd className="truncate text-end font-mono font-bold text-slate-600 dark:text-slate-300">{model.provider || '-'}</dd>
                        <dt className="font-bold text-slate-400">{t('editor.aiImage.model', { defaultValue: 'Model' })}</dt>
                        <dd className="truncate text-end font-mono font-bold text-slate-600 dark:text-slate-300">{model.name || '-'}</dd>
                        <dt className="font-bold text-slate-400">{t('editor.aiImage.modality', { defaultValue: 'Modality' })}</dt>
                        <dd className="text-end font-bold text-slate-600 dark:text-slate-300">{quality.modality || '-'}</dd>
                        <dt className="font-bold text-slate-400">{t('editor.aiImage.evidence', { defaultValue: 'Evidence images' })}</dt>
                        <dd className="text-end font-bold text-slate-600 dark:text-slate-300">{evidenceCount || '-'}</dd>
                        {negativeFindings.length > 0 && (
                            <>
                                <dt className="font-bold text-slate-400">{t('editor.aiImage.negativeSignals', { defaultValue: 'Negative signals' })}</dt>
                                <dd className="text-end font-bold text-slate-600 dark:text-slate-300">{negativeFindings.length}</dd>
                            </>
                        )}
                    </dl>
                </details>
            </div>
        </section>
    );
});
AiAnalysisResultSummary.displayName = 'AiAnalysisResultSummary';

const AiImageAnalysisPanel = memo(
    ({ jobs = [], imagesReady, canRequest, isRequesting, locale, onRequest, onRetry, isRetrying, onCancel, isCanceling, pacsSettingsStatus, isAdmin, onConfigure, t }) => {
        const latest = jobs[0] || null;
        const workerResult = latest?.result_payload?.worker || null;
        const unsupported = latest?.status === 'Completed' && workerResult?.quality?.supported === false;
        const status = unsupported
            ? t('editor.aiImage.unsupported', { defaultValue: 'Not supported' })
            : (latest?.status || t('editor.aiImage.notRequestedShort', { defaultValue: 'Not requested' }));
        const tone = unsupported
            ? 'bg-slate-50 text-slate-700 ring-slate-200 dark:bg-slate-900/60 dark:text-slate-300 dark:ring-slate-800'
            : (aiAnalysisTone[latest?.status] || 'bg-slate-50 text-slate-600 ring-slate-200 dark:bg-slate-900/60 dark:text-slate-300 dark:ring-slate-800');
        const active = ['Queued', 'Running'].includes(latest?.status);
        const summary = latest?.result_summary || workerResult?.summary || '';
        const progress = latest?.result_payload?.progress || null;
        const coverage = workerResult?.provenance?.coverage || null;
        const progressPercent = progress?.total
            ? Math.min(100, Math.round((Number(progress.current || 0) / Number(progress.total)) * 100))
            : 0;
        const isProviderRetry = progress?.phase === 'provider_retry';
        const progressLabel = isProviderRetry
            ? t('editor.aiImage.providerRetry', { defaultValue: 'Provider rate limited' })
            : t('editor.aiImage.preparingCase', { defaultValue: 'Preparing case images' });

        return (
            <div>
                <p className="text-[11px] leading-4 text-slate-500 dark:text-slate-400">
                    {t('editor.aiImage.help', {
                        defaultValue: 'Queued DICOM analysis workflow. Results stay separate from the signed report.'
                    })}
                </p>

                <div className="mt-3 grid grid-cols-2 gap-2">
                    <MiniStat
                        label={t('editor.aiImage.jobs', { defaultValue: 'Jobs' })}
                        value={jobs.length}
                    />
                    <MiniStat
                        label={t('editor.aiImage.latest', { defaultValue: 'Latest' })}
                        value={status}
                    />
                </div>

                <div className={`mt-3 rounded-xl p-3 text-[11px] ring-1 ${tone}`}>
                    <div className="flex items-center justify-between gap-2">
                        <span className="font-bold">{status}</span>
                        {active && <Loader2 size={13} className="animate-spin" />}
                    </div>
                    <p className="mt-1 leading-4 opacity-80">
                        {latest
                            ? formatDateTime(latest.created_at, locale)
                            : t('editor.aiImage.notRequested', { defaultValue: 'No analysis job has been requested for this study.' })}
                    </p>
                    {latest?.model && (
                        <p className="mt-1 truncate font-mono text-[10px] opacity-70">
                            {latest.provider || 'AI'} / {latest.model}
                        </p>
                    )}
                    {active && progress?.total > 0 && (
                        <div className="mt-2.5">
                            <div className="mb-1 flex items-center justify-between gap-2 text-[10px] font-bold tabular-nums">
                                <span>{progressLabel}</span>
                                <span>
                                    {isProviderRetry
                                        ? t('editor.aiImage.retryIn', {
                                            defaultValue: 'Retry in {{seconds}}s',
                                            seconds: Math.ceil(Number(progress.retryAfterMs || 0) / 1000)
                                        })
                                        : `${progress.current}/${progress.total}`}
                                </span>
                            </div>
                            <div className="h-1.5 overflow-hidden rounded-full bg-black/10 dark:bg-white/10">
                                <div
                                    className="h-full rounded-full bg-current transition-[width] duration-500"
                                    style={{ width: `${progressPercent}%` }}
                                />
                            </div>
                        </div>
                    )}
                </div>

                {(latest?.error_message || latest?.error) && (
                    <div className="mt-3 rounded-lg border border-rose-200 bg-rose-50 p-3 text-[11px] font-semibold leading-5 text-rose-800 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
                        {latest.error_message || latest.error}
                    </div>
                )}

                {latest?.status === 'Completed' && workerResult && !unsupported && (
                    <AiAnalysisResultSummary
                        workerResult={workerResult}
                        summary={summary}
                        coverage={coverage}
                        t={t}
                    />
                )}

                {unsupported && (
                    <p className="mt-3 text-[10px] font-semibold leading-4 text-slate-500 dark:text-slate-400">
                        {t('editor.aiImage.unsupportedHelp', {
                            defaultValue: 'The active local model supports adult chest radiographs only. It generated no findings for this study.'
                        })}
                    </p>
                )}

                <div className="mt-3 rounded-xl bg-slate-50 p-3 text-[10px] font-semibold leading-4 text-slate-500 ring-1 ring-slate-100 dark:bg-slate-900/50 dark:text-slate-400 dark:ring-slate-800">
                    {t('editor.aiImage.safety', {
                        defaultValue: 'Results remain separate from the report until a radiologist explicitly reviews and inserts a preliminary draft.'
                    })}
                </div>

                {!active && !unsupported && latest?.status !== 'Completed' && (
                    <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 dark:border-slate-800 dark:bg-slate-900/60">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-[9px] font-bold uppercase text-slate-400 dark:text-slate-500">
                                    {t('editor.aiImage.activeProfile', 'Active provider profile')}
                                </p>
                                <p className="mt-1 truncate text-[11px] font-bold text-slate-700 dark:text-slate-200">
                                    {pacsSettingsStatus?.profileName || pacsSettingsStatus?.provider || t('editor.aiImage.notConfiguredShort', 'Not configured')}
                                    {pacsSettingsStatus?.model ? ` / ${pacsSettingsStatus.model}` : ''}
                                </p>
                                {!pacsSettingsStatus?.configured && (
                                    <p className="mt-1 text-[10px] font-semibold text-amber-700 dark:text-amber-300">
                                        {t('editor.aiImage.profileIncomplete', 'Complete this profile before requesting analysis.')}
                                    </p>
                                )}
                            </div>
                            {isAdmin && !pacsSettingsStatus?.configured && (
                                <button type="button" onClick={onConfigure} className="shrink-0 text-[10px] font-bold text-teal-700 hover:underline dark:text-teal-300">
                                    {t('editor.aiDraft.configure', 'Configure')}
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {active ? (
                    <button
                        type="button"
                        onClick={() => onCancel(latest.job_id)}
                        disabled={isCanceling}
                        className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 text-sm font-bold text-rose-700 hover:bg-rose-100 disabled:opacity-50 dark:border-rose-900/60 dark:bg-rose-950/20 dark:text-rose-400 dark:hover:bg-rose-950/40"
                    >
                        {isCanceling ? <Loader2 size={14} className="animate-spin" /> : <XCircle size={14} />}
                        {t('editor.aiImage.stopAnalysis', { defaultValue: 'Stop analysis' })}
                    </button>
                ) : (latest?.status === 'Failed' || latest?.status === 'Canceled') ? (
                    <button
                        type="button"
                        onClick={() => onRetry(latest.job_id)}
                        disabled={isRetrying}
                        className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl border border-teal-200 bg-teal-50 px-4 text-sm font-bold text-teal-700 hover:bg-teal-100 disabled:opacity-50 dark:border-teal-900/60 dark:bg-teal-950/20 dark:text-teal-400 dark:hover:bg-teal-950/40"
                    >
                        {isRetrying ? <Loader2 size={14} className="animate-spin" /> : <RotateCcw size={14} />}
                        {t('editor.aiImage.retryAnalysis', { defaultValue: 'Retry analysis' })}
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={onRequest}
                        disabled={!imagesReady || !canRequest || isRequesting || unsupported || !pacsSettingsStatus?.configured}
                        className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-xl bg-teal-600 px-4 text-sm font-bold text-white hover:bg-teal-700 disabled:opacity-50 dark:bg-teal-600 dark:hover:bg-teal-700 transition mt-3"
                    >
                        {isRequesting ? <Loader2 size={14} className="animate-spin" /> : <BrainCircuit size={14} />}
                        {unsupported
                            ? t('editor.aiImage.unsupportedAction', { defaultValue: 'Study not supported' })
                            : t('editor.aiImage.request', { defaultValue: 'Request analysis' })}
                    </button>
                )}
            </div>
        );
    }
);
AiImageAnalysisPanel.displayName = 'AiImageAnalysisPanel';

export const StudyToolsPanel = memo(({
    activeTool = null,
    compact = false,
    exam,
    imaging,
    imagesReady,
    isUploadingImages,
    imageUploadProgress,
    onViewImages,
    onUploadImages,
    aiAnalysisJobs = [],
    canUseImageAi = false,
    isRequestingAiAnalysis = false,
    locale,
    onRequestAiAnalysis,
    onRetryAiJob,
    isRetryingAiJob = false,
    onCancelAiJob,
    isCancelingAiJob = false,
    pacsSettingsStatus,
    reportSettingsStatus,
    aiDraft,
    aiDraftHistory = [],
    currentReportSections = {},
    editable = false,
    locked = false,
    reportAiConfigured = false,
    isAdmin = false,
    isGeneratingAiDraft = false,
    onConfigureAi,
    onGenerateAiDraft,
    onInsertAiDraft,
    onLoadAiDraft,
    reportDocument,
    onReportDocumentChange,
    t
}) => {
    const latestAiJob = aiAnalysisJobs[0] || null;
    const aiJobActive = ['Queued', 'Running'].includes(latestAiJob?.status);
    const aiJobUnsupported = latestAiJob?.status === 'Completed'
        && latestAiJob?.result_payload?.worker?.quality?.supported === false;
    const aiJobFailed = latestAiJob?.status === 'Failed';
    const aiJobBadge = aiJobUnsupported
        ? t('editor.aiImage.unsupported', { defaultValue: 'Not supported' })
        : (latestAiJob?.status
            ? t(`statuses.${latestAiJob.status}`, { defaultValue: latestAiJob.status })
            : t('editor.aiImage.notRequestedShort', { defaultValue: 'Not requested' }));
    const aiJobBadgeTone = aiJobFailed
        ? 'rose'
        : (aiJobUnsupported ? 'slate' : (aiJobActive ? 'amber' : (latestAiJob ? 'emerald' : 'slate')));
    const toolSections = [
        {
            key: 'imaging',
            icon: FileImage,
            title: t('editor.imaging.orderTitle', { defaultValue: 'Order imaging' }),
            subtitle: exam?.order_number || exam?.exam_id,
            badge: imagesReady ? t('editor.imagesReadyShort', { defaultValue: 'Ready' }) : t('editor.pendingImagesShort', { defaultValue: 'Pending' }),
            badgeTone: imagesReady ? 'emerald' : 'amber',
            defaultOpen: !imagesReady || activeTool === 'imaging',
            content: (
                <OrderImagingPanel
                    exam={exam}
                    imaging={imaging}
                    imagesReady={imagesReady}
                    isUploading={isUploadingImages}
                    uploadProgress={imageUploadProgress}
                    onView={onViewImages}
                    onUpload={onUploadImages}
                    t={t}
                />
            )
        },
        {
            key: 'aiImage',
            icon: BrainCircuit,
            title: t('editor.aiImage.title', { defaultValue: 'AI image analysis' }),
            badge: aiJobBadge,
            badgeTone: aiJobBadgeTone,
            defaultOpen: activeTool === 'aiImage',
            content: (
                <AiImageAnalysisPanel
                    jobs={aiAnalysisJobs}
                    imagesReady={imagesReady}
                    canRequest={canUseImageAi}
                    isRequesting={isRequestingAiAnalysis}
                    locale={locale}
                    onRequest={onRequestAiAnalysis}
                    onRetry={onRetryAiJob}
                    isRetrying={isRetryingAiJob}
                    onCancel={onCancelAiJob}
                    isCanceling={isCancelingAiJob}
                    pacsSettingsStatus={pacsSettingsStatus}
                    isAdmin={isAdmin}
                    onConfigure={onConfigureAi}
                    t={t}
                />
            )
        },
        {
            key: 'aiDraft',
            icon: Sparkles,
            title: t('editor.aiDraft.title', { defaultValue: 'AI report assistant' }),
            badge: aiDraft ? t('editor.aiDraft.badgeReady', { defaultValue: 'Ready' }) : null,
            badgeTone: 'emerald',
            defaultOpen: activeTool === 'aiDraft' || (reportAiConfigured && !locked),
            content: (
                <AiPreliminaryDraftPanel
                    draft={aiDraft}
                    history={aiDraftHistory}
                    currentSections={currentReportSections}
                    isGenerating={isGeneratingAiDraft}
                    editable={editable}
                    reportAiConfigured={reportAiConfigured}
                    reportSettingsStatus={reportSettingsStatus}
                    isAdmin={isAdmin}
                    onConfigure={onConfigureAi}
                    onGenerate={onGenerateAiDraft}
                    onInsert={onInsertAiDraft}
                    onLoad={onLoadAiDraft}
                    locale={locale}
                    t={t}
                />
            )
        },
        {
            key: 'document',
            icon: FileCheck2,
            title: t('editor.document.title', { defaultValue: 'Export settings' }),
            defaultOpen: activeTool === 'document',
            content: (
                <ReportDocumentPanel
                    settings={reportDocument}
                    onChange={onReportDocumentChange}
                    t={t}
                />
            )
        }
    ];
    const visibleToolSections = activeTool
        ? toolSections.filter((section) => section.key === activeTool)
        : toolSections;

    return (
        <div className={compact ? 'space-y-2' : 'space-y-3'}>
            {!compact && (
            <div className="flex items-center justify-between gap-3 px-1">
                <div className="flex items-center gap-2.5">
                    <span className="flex h-8 w-8 items-center justify-center rounded-md bg-teal-50 ring-1 ring-teal-100 dark:bg-teal-950/40 dark:ring-teal-900">
                        <ServerCog size={15} className="text-teal-700 dark:text-teal-400" />
                    </span>
                    <h2 className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                        {t('editor.studyTools', { defaultValue: 'Study tools' })}
                    </h2>
                </div>
                <span className="rounded-full bg-slate-100/80 px-2.5 py-1 text-[10px] font-bold text-slate-500 ring-1 ring-slate-200/60 backdrop-blur-sm dark:bg-slate-800/40 dark:text-slate-300 dark:ring-slate-700/50">
                    {imagesReady ? t('editor.imagesReadyShort', { defaultValue: 'Images ready' }) : t('editor.pendingImagesShort', { defaultValue: 'Images pending' })}
                </span>
            </div>
            )}

            {visibleToolSections.map(({ key, icon, title, subtitle, badge, badgeTone, defaultOpen, content }) => (
                <CollapsibleSection
                    key={key}
                    icon={icon}
                    title={title}
                    subtitle={subtitle}
                    badge={badge}
                    badgeTone={badgeTone}
                    defaultOpen={defaultOpen}
                    compact={compact}
                >
                    {content}
                </CollapsibleSection>
            ))}
        </div>
    );
});
StudyToolsPanel.displayName = 'StudyToolsPanel';

export const ReportPreviewPanel = memo(({ exam, sections, t }) => {
    return (
        <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
            <div className="border-b border-slate-100/80 pb-4 dark:border-slate-700/40 text-center">
                <h2 className="text-sm font-bold tracking-wider text-slate-800 dark:text-slate-200">
                    {t('editor.preview.reportHeader', 'RADIOLOGY REPORT')}
                </h2>
                <p className="mt-1.5 text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">
                    {exam?.patient_name || '-'} · MRN: {exam?.mrn || '-'}
                </p>
            </div>

            <div className="space-y-3.5 text-xs leading-relaxed text-slate-700 dark:text-slate-300">
                {SECTION_CONFIG.map(config => {
                    const value = sections[config.key]?.trim();
                    if (!value) return null;

                    return (
                        <div key={config.key} className="space-y-1">
                            <h4 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                {t(`sections.${config.key}`)}
                            </h4>
                            <p dir="ltr" lang="en" className="whitespace-pre-line text-left font-semibold text-slate-700 dark:text-slate-300">
                                {value}
                            </p>
                        </div>
                    );
                })}
            </div>
            
            {exam?.digital_signature_name && (
                <div className="border-t border-slate-100 pt-3 text-end text-[10px] font-bold text-slate-500 dark:border-slate-800 dark:text-slate-400">
                    <p>{t('editor.preview.digitallySignedBy', 'Digitally signed by')}:</p>
                    <p className="mt-0.5 text-xs font-bold text-slate-900 dark:text-slate-200">
                        {exam.digital_signature_name}
                    </p>
                </div>
            )}
        </div>
    );
});
ReportPreviewPanel.displayName = 'ReportPreviewPanel';

export const ImageUploadOverlay = memo(({ progress, t }) => {
    if (!progress || progress.phase === 'done') return null;
    const percent = Number.isFinite(progress.percent) ? progress.percent : null;
    const files = Number(progress.files || 0);
    const processingTotal = Number(progress.processingTotal || files || 0);
    const processedCount = Number(progress.processedCount || 0);
    const storedCount = Number(progress.storedCount || 0);
    const reconciledCount = Number(progress.reconciledCount || 0);
    const unreconciledCount = Number(progress.unreconciledCount || 0);
    const failedCount = Number(progress.failedCount || 0);
    const rejectedCount = Number(progress.rejectedCount || 0);
    const uploaded = progress.loaded ? formatBytes(progress.loaded) : null;
    const total = progress.total ? formatBytes(progress.total) : null;
    const speed = progress.bytesPerSecond ? `${formatBytes(progress.bytesPerSecond, 1)}/s` : null;
    const eta = formatSeconds(progress.etaSeconds);
    const elapsed = formatSeconds(progress.elapsedSeconds);
    const activeFiles = Array.isArray(progress.activeFiles) ? progress.activeFiles.filter(Boolean) : [];
    const batchLabel = progress.batches > 1
        ? `${progress.batch || 1}/${progress.batches}`
        : null;
    const isProcessing = progress.phase === 'processing';
    const statusLabel = progress.processingStatus && progress.processingStatus !== 'idle'
        ? String(progress.processingStatus)
        : (isProcessing ? 'processing' : 'uploading');
    const countLabel = processingTotal
        ? `${Math.min(processedCount, processingTotal)} / ${processingTotal}`
        : `${processedCount}`;

    return createPortal(
        <div 
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 p-4 backdrop-blur-xl"
            role="progressbar"
            aria-label={t('editor.uploadOverlay.label', { defaultValue: 'Image upload progress' })}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent ?? undefined}
        >
            <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-white/95 p-6 text-start shadow-2xl shadow-slate-900/20 backdrop-blur-xl dark:bg-slate-900/95 dark:shadow-black/40">
                <div className="flex items-start gap-4">
                    <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-teal-50 text-teal-700 dark:bg-teal-950/30 dark:text-teal-300">
                        {isProcessing ? <Loader2 className="animate-spin" size={21} /> : <Upload size={21} />}
                    </span>
                    <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="min-w-0">
                                <h3 className="text-base font-bold text-slate-900 dark:text-white">
                                    {isProcessing ? t('editor.uploadOverlay.processing', 'Processing in PACS') : t('editor.uploadOverlay.title', 'Uploading Images')}
                                </h3>
                                <p className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
                                    {isProcessing
                                        ? t('editor.uploadOverlay.processingDetail', 'Storing and reconciling images with the study order')
                                        : t('editor.uploadOverlay.uploadDetail', 'Sending files to the PACS import service')}
                                </p>
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                                        {statusLabel}
                                    </span>
                                    {batchLabel && (
                                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                                            {t('editor.uploadOverlay.batch', 'Batch')}: {batchLabel}
                                        </span>
                                    )}
                                    {isProcessing && processingTotal > 0 && (
                                        <span className="rounded-full border border-teal-200 bg-teal-50 px-2.5 py-1 text-[10px] font-bold text-teal-700 dark:border-teal-900/60 dark:bg-teal-950/30 dark:text-teal-300">
                                            {t('editor.uploadOverlay.processedCount', 'Processed {{count}}', { count: countLabel })}
                                        </span>
                                    )}
                                </div>
                            </div>
                            <span className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 font-mono text-sm font-bold text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-white">
                                {percent !== null ? `${percent}%` : '...'}
                            </span>
                        </div>
                    </div>
                </div>
                
                <div className="mt-5">
                    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div 
                            className={`h-full rounded-full bg-teal-600 transition-all duration-300 dark:bg-teal-400 ${percent === null ? 'animate-pulse' : ''}`}
                            style={{ width: `${percent ?? 35}%` }}
                        />
                    </div>
                    <div className="mt-2 flex flex-wrap justify-between gap-2 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                        <span>
                            {isProcessing
                                ? t('editor.uploadOverlay.processedCount', 'Processed {{count}}', { count: countLabel })
                                : t('editor.uploadOverlay.filesCount', 'Uploading {{count}} files...', { count: files })}
                        </span>
                        {uploaded && total && (
                            <span>{uploaded} / {total}</span>
                        )}
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
                        <ProgressMeta label={t('editor.uploadOverlay.speed', 'Speed')} value={speed || '-'} />
                        <ProgressMeta label={t('editor.uploadOverlay.eta', 'ETA')} value={eta || '-'} />
                        <ProgressMeta label={t('editor.uploadOverlay.elapsed', 'Elapsed')} value={elapsed || '0s'} />
                    </div>
                </div>

                {isProcessing && (
                    <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <ProgressCount label={t('editor.uploadOverlay.stored', 'Stored')} value={storedCount} tone="emerald" />
                        <ProgressCount label={t('editor.uploadOverlay.linked', 'Linked')} value={reconciledCount} tone="teal" />
                        <ProgressCount label={t('editor.uploadOverlay.review', 'Needs review')} value={unreconciledCount} tone="amber" />
                        <ProgressCount label={t('editor.uploadOverlay.failed', 'Failed')} value={failedCount + rejectedCount} tone="rose" />
                    </div>
                )}

                {isProcessing && progress.currentFile && (
                    <p className="mt-4 truncate rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300">
                        {t('editor.uploadOverlay.currentFile', 'Current file')}: {progress.currentFile}
                    </p>
                )}

                {isProcessing && activeFiles.length > 0 && (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                            {t('editor.uploadOverlay.activeFiles', 'Active files')}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-1.5">
                            {activeFiles.slice(0, 5).map((file) => (
                                <span key={file} className="max-w-full truncate rounded-full bg-white px-2.5 py-1 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-800">
                                    {file}
                                </span>
                            ))}
                            {activeFiles.length > 5 && (
                                <span className="rounded-full bg-slate-200 px-2.5 py-1 text-[10px] font-bold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                    +{activeFiles.length - 5}
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {progress.lastError && (
                    <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-300">
                        {progress.lastError}
                    </p>
                )}
            </div>
        </div>,
        document.body
    );
});
ImageUploadOverlay.displayName = 'ImageUploadOverlay';

const ProgressMeta = ({ label, value }) => (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-950">
        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{label}</p>
        <p className="mt-1 truncate text-xs font-bold text-slate-700 dark:text-slate-200">{value}</p>
    </div>
);

const ProgressCount = ({ label, value, tone }) => {
    const tones = {
        emerald: 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/25 dark:text-emerald-300',
        teal: 'border-teal-200 bg-teal-50 text-teal-700 dark:border-teal-900/50 dark:bg-teal-950/25 dark:text-teal-300',
        rose: 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/50 dark:bg-rose-950/25 dark:text-rose-300',
        amber: 'border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/50 dark:bg-amber-950/25 dark:text-amber-300'
    };
    return (
        <div className={`rounded-lg border px-3 py-2 ${tones[tone] || tones.emerald}`}>
            <p className="text-[10px] font-bold uppercase tracking-wider opacity-80">{label}</p>
            <p className="mt-1 text-lg font-bold">{value}</p>
        </div>
    );
};
