import { Activity } from 'lucide-react';
import { Link } from 'react-router-dom';
import LanguageToggle from './LanguageToggle';
import { VIARA_BRAND } from '../../config/brand';

const tones = {
    cyan: 'bg-[var(--VIARA-accent-soft)] text-[var(--VIARA-accent)] ring-[rgba(var(--VIARA-accent-rgb),0.18)]',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100 dark:bg-amber-950/30 dark:text-amber-400 dark:ring-amber-900/50',
    slate: 'bg-slate-100 text-slate-700 ring-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-700',
    rose: 'bg-rose-50 text-rose-700 ring-rose-100 dark:bg-rose-950/30 dark:text-rose-400 dark:ring-rose-900/50',
};

const SystemState = ({ icon: Icon, tone = 'cyan', eyebrow, title, description, notice, children }) => (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--VIARA-canvas)] px-5 py-10 sm:px-8">
        <div className="relative w-full max-w-2xl">
            <div className="mb-8 flex items-center justify-between">
                <Link to="/" className="flex items-center gap-3" aria-label={VIARA_BRAND.name}>
                    <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-[var(--VIARA-accent)] text-white"><Activity size={20} strokeWidth={2.7} /></span>
                    <span className="font-bold tracking-[0.09em] text-[var(--VIARA-ink)]">{VIARA_BRAND.name}</span>
                </Link>
                <LanguageToggle />
            </div>
            <section className="rounded-2xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] p-7 text-center shadow-sm sm:p-10">
                <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ring-8 ${tones[tone] || tones.cyan}`}><Icon size={31} strokeWidth={1.8} /></div>
                <p className="mt-7 text-xs font-bold uppercase tracking-[0.16em] text-[var(--VIARA-accent)]">{eyebrow}</p>
                <h1 className="mx-auto mt-3 max-w-xl text-3xl font-semibold tracking-[-0.035em] text-[var(--VIARA-ink)] sm:text-4xl">{title}</h1>
                <div className="mx-auto mt-4 max-w-xl text-sm leading-7 text-[var(--VIARA-muted)]">{description}</div>
                {notice}
                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">{children}</div>
            </section>
        </div>
    </main>
);

export default SystemState;
