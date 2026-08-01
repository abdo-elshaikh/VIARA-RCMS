import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface WorkspacePageHeaderProps {
    icon: LucideIcon;
    eyebrow?: ReactNode;
    title: ReactNode;
    description?: ReactNode;
    actions?: ReactNode;
    aside?: ReactNode;
}

export const WorkspacePageHeader = ({
    icon: Icon,
    eyebrow,
    title,
    description,
    actions,
    aside,
}: WorkspacePageHeaderProps) => (
    <section className="portal-workspace-page-header relative overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <div className="pointer-events-none absolute inset-y-0 end-0 w-2/5 bg-[radial-gradient(circle_at_center,rgba(7,92,183,.1),transparent_68%)]" aria-hidden="true" />
        <div className={`relative grid gap-5 p-5 sm:p-6 ${aside ? 'lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center' : ''}`}>
            <div className="flex min-w-0 items-start gap-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-700 ring-1 ring-primary-100 dark:bg-primary-400/10 dark:text-primary-300 dark:ring-primary-300/15">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0">
                    {eyebrow && <p className="text-[10px] font-black uppercase tracking-[.15em] text-primary-700 dark:text-primary-300">{eyebrow}</p>}
                    <h1 className="mt-1 text-2xl font-black tracking-tight text-foreground sm:text-3xl">{title}</h1>
                    {description && <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">{description}</p>}
                    {actions && <div className="mt-4 flex flex-wrap gap-2.5">{actions}</div>}
                </div>
            </div>
            {aside && <div className="min-w-0 lg:min-w-[15rem]">{aside}</div>}
        </div>
    </section>
);

interface WorkspaceStatProps {
    icon: LucideIcon;
    label: ReactNode;
    value: ReactNode;
    hint?: ReactNode;
    tone?: 'brand' | 'success' | 'warning' | 'violet';
    onClick?: () => void;
}

const tones = {
    brand: 'bg-primary-50 text-primary-700 dark:bg-primary-400/10 dark:text-primary-300',
    success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300',
    warning: 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300',
    violet: 'bg-violet-50 text-violet-700 dark:bg-violet-400/10 dark:text-violet-300',
};

export const WorkspaceStat = ({ icon: Icon, label, value, hint, tone = 'brand', onClick }: WorkspaceStatProps) => {
    const content = (
        <>
            <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tones[tone]}`}>
                <Icon className="h-4.5 w-4.5" aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
                <span className="block text-[10px] font-black uppercase tracking-[.12em] text-muted-foreground">{label}</span>
                <strong className="mt-1 block truncate text-xl font-black text-foreground">{value}</strong>
                {hint && <small className="mt-0.5 block truncate text-[11px] text-muted-foreground">{hint}</small>}
            </span>
        </>
    );

    const className = 'flex min-w-0 items-center gap-3 rounded-2xl border border-border bg-surface p-4 text-start shadow-sm transition hover:border-primary-200 hover:shadow-md';

    return onClick ? <button type="button" onClick={onClick} className={className}>{content}</button> : <article className={className}>{content}</article>;
};

