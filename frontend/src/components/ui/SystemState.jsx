import { Activity } from 'lucide-react';
import { Link } from 'react-router-dom';
import LanguageToggle from './LanguageToggle';

const tones = {
    cyan: 'bg-cyan-50 text-cyan-700 ring-cyan-100',
    amber: 'bg-amber-50 text-amber-700 ring-amber-100',
    slate: 'bg-slate-100 text-slate-700 ring-slate-200',
};

const SystemState = ({ icon: Icon, tone = 'cyan', eyebrow, title, description, notice, children }) => (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[var(--rcms-canvas)] px-5 py-10 sm:px-8">
        <div className="absolute inset-x-0 top-0 h-64 bg-[#07111f]" aria-hidden="true"><div className="landing-grid opacity-50" /></div>
        <div className="relative w-full max-w-2xl">
            <div className="mb-8 flex items-center justify-between text-white">
                <Link to="/" className="flex items-center gap-3" aria-label="RCMS">
                    <span className="flex h-10 w-10 items-center justify-center rounded-[14px] bg-cyan-300 text-slate-950"><Activity size={20} strokeWidth={2.7} /></span>
                    <span className="font-bold tracking-[0.09em]">RCMS</span>
                </Link>
                <LanguageToggle variant="dark" />
            </div>
            <section className="rounded-3xl border border-slate-200 bg-white p-7 text-center shadow-[0_28px_80px_-38px_rgba(15,23,42,.45)] sm:p-10">
                <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-2xl ring-8 ${tones[tone] || tones.cyan}`}><Icon size={31} strokeWidth={1.8} /></div>
                <p className="mt-7 text-xs font-bold uppercase tracking-[0.16em] text-cyan-700">{eyebrow}</p>
                <h1 className="mx-auto mt-3 max-w-xl text-3xl font-semibold tracking-[-0.035em] text-slate-950 sm:text-4xl">{title}</h1>
                <div className="mx-auto mt-4 max-w-xl text-sm leading-7 text-slate-500">{description}</div>
                {notice}
                <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">{children}</div>
            </section>
        </div>
    </main>
);

export default SystemState;
