import { useState } from 'react';
import { Activity } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import LanguageToggle from './LanguageToggle';
import { VIARA_BRAND } from '../../config/brand';

const tones = {
    cyan: 'bg-[var(--VIARA-accent-soft)] text-[var(--VIARA-accent)] ring-[rgba(var(--VIARA-accent-rgb),0.18)]',
    amber: 'bg-[var(--warning-bg)] text-[var(--warning)] ring-[rgba(217,154,24,.16)]',
    slate: 'bg-[var(--VIARA-surface-muted)] text-[var(--VIARA-ink)] ring-[var(--VIARA-line)]',
    rose: 'bg-[var(--danger-bg)] text-[var(--danger)] ring-[rgba(217,87,87,.16)]',
};

const StateArtwork = ({ variant = 'missing' }) => (
    <div className="relative mx-auto flex aspect-[1.18/1] w-full max-w-[34rem] items-center justify-center">
        <div className="absolute inset-[8%] rounded-full bg-[radial-gradient(ellipse_at_center,rgba(var(--VIARA-accent-rgb),.14),transparent_68%)]" />
        <span className="absolute start-[17%] top-[17%] h-3 w-3 rounded-full bg-[rgba(var(--VIARA-accent-rgb),.35)]" />
        <span className="absolute end-[16%] top-[25%] h-2.5 w-2.5 rounded-full border-2 border-[rgba(var(--VIARA-accent-rgb),.35)]" />
        <span className="absolute bottom-[18%] start-[20%] h-2 w-2 rounded-full bg-[rgba(var(--VIARA-accent-rgb),.3)]" />
        <svg viewBox="0 0 520 420" className="relative z-10 h-full w-full drop-shadow-[0_24px_30px_rgba(15,23,42,.08)]" fill="none" aria-hidden="true">
            <ellipse cx="257" cy="355" rx="194" ry="25" fill="rgba(var(--VIARA-accent-rgb),.08)" />
            {variant === 'missing' ? (
                <>
                    <circle cx="245" cy="211" r="158" fill="rgba(var(--VIARA-accent-rgb),.055)" />
                    <rect x="89" y="88" width="270" height="235" rx="25" fill="var(--VIARA-surface)" stroke="var(--VIARA-line)" strokeWidth="2" />
                    <path d="M90 113a25 25 0 0 1 25-25h220a25 25 0 0 1 24 25v22H90v-22Z" fill="var(--VIARA-surface-muted)" />
                    <circle cx="116" cy="111" r="5" fill="var(--VIARA-accent)" />
                    <circle cx="134" cy="111" r="5" fill="rgba(var(--VIARA-accent-rgb),.5)" />
                    <circle cx="152" cy="111" r="5" fill="rgba(var(--VIARA-accent-rgb),.28)" />
                    <rect x="151" y="166" width="148" height="115" rx="13" stroke="var(--VIARA-line-strong)" strokeWidth="3" strokeDasharray="8 7" />
                    <path d="M191 210c0-12 10-22 22-22s22 10 22 22-10 22-22 22-22-10-22-22Z" fill="var(--VIARA-surface-muted)" />
                    <path d="M202 205h1m20 0h1m-22 17c6-6 14-6 20 0" stroke="var(--VIARA-muted)" strokeWidth="4" strokeLinecap="round" />
                    <circle cx="329" cy="276" r="60" fill="color-mix(in srgb,var(--VIARA-accent-soft) 70%,var(--VIARA-surface))" stroke="rgba(var(--VIARA-accent-rgb),.36)" strokeWidth="8" />
                    <circle cx="329" cy="276" r="44" stroke="rgba(var(--VIARA-accent-rgb),.22)" strokeWidth="2" />
                    <path d="m371 320 52 49" stroke="var(--VIARA-accent)" strokeWidth="19" strokeLinecap="round" />
                    <path d="m424 367 9 10" stroke="var(--VIARA-accent-dark)" strokeWidth="14" strokeLinecap="round" />
                    <path d="M393 127 415 91l22 36h-44Z" fill="var(--VIARA-accent-soft)" stroke="rgba(var(--VIARA-accent-rgb),.36)" strokeWidth="3" />
                    <path d="M415 103v10m0 7v1" stroke="var(--VIARA-accent)" strokeWidth="4" strokeLinecap="round" />
                    <path d="M65 291c-14-24-2-52 11-60 18 17 20 41 7 63m-12-7c-28-6-43-28-40-46 26-1 43 15 47 37m-29 92 12-51m-22 51h44l-5 24H62l-6-24Z" stroke="var(--VIARA-accent)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
                </>
            ) : variant === 'restricted' ? (
                <>
                    <circle cx="260" cy="210" r="154" fill="rgba(var(--VIARA-accent-rgb),.055)" />
                    <path d="M260 66 377 111v96c0 80-47 133-117 169-70-36-117-89-117-169v-96l117-45Z" fill="var(--VIARA-surface)" stroke="rgba(var(--VIARA-accent-rgb),.38)" strokeWidth="8" strokeLinejoin="round" />
                    <path d="M260 101 344 133v73c0 58-31 98-84 129-53-31-84-71-84-129v-73l84-32Z" fill="var(--VIARA-accent-soft)" />
                    <rect x="221" y="190" width="78" height="65" rx="12" fill="var(--VIARA-accent)" />
                    <path d="M237 190v-15a23 23 0 0 1 46 0v15" stroke="var(--VIARA-accent)" strokeWidth="11" strokeLinecap="round" />
                    <circle cx="260" cy="220" r="6" fill="var(--VIARA-accent-contrast)" />
                    <path d="M260 226v12" stroke="var(--VIARA-accent-contrast)" strokeWidth="5" strokeLinecap="round" />
                    <path d="M94 141h44m-22-22v44m275 145h34m-17-17v34" stroke="rgba(var(--VIARA-accent-rgb),.45)" strokeWidth="5" strokeLinecap="round" />
                </>
            ) : (
                <>
                    <circle cx="260" cy="210" r="154" fill="rgba(var(--VIARA-accent-rgb),.055)" />
                    <path d="M163 278h192a55 55 0 0 0 0-110c-7 0-14 1-20 4a81 81 0 0 0-151 15 47 47 0 0 0-21 91Z" fill="var(--VIARA-surface)" stroke="rgba(var(--VIARA-accent-rgb),.35)" strokeWidth="7" strokeLinejoin="round" />
                    <path d="m202 204 116 74m-7-89-93 105" stroke="var(--VIARA-accent)" strokeWidth="12" strokeLinecap="round" />
                    <path d="M94 144h42m-21-21v42m276 144h32m-16-16v32" stroke="rgba(var(--VIARA-accent-rgb),.4)" strokeWidth="5" strokeLinecap="round" />
                    <circle cx="125" cy="303" r="8" fill="var(--VIARA-accent)" opacity=".55" />
                    <circle cx="396" cy="127" r="6" fill="var(--VIARA-accent)" opacity=".4" />
                </>
            )}
        </svg>
        <div className="absolute bottom-[6%] end-[8%] grid h-12 w-12 place-items-center rounded-2xl border border-[rgba(var(--VIARA-accent-rgb),.18)] bg-[var(--VIARA-surface)] text-[var(--VIARA-accent)] shadow-lg shadow-[rgba(var(--VIARA-accent-rgb),.12)] sm:h-14 sm:w-14">
            <Activity size={23} strokeWidth={2.2} />
        </div>
    </div>
);

const SystemState = ({ icon: Icon, tone = 'cyan', code, visual = 'missing', eyebrow, title, description, notice, children }) => {
    const { i18n, t } = useTranslation('common');
    const [logoFailed, setLogoFailed] = useState(false);
    const isRtl = i18n.dir() === 'rtl';

    return (
        <main dir={isRtl ? 'rtl' : 'ltr'} className="viara-system-state relative flex min-h-screen flex-col overflow-hidden bg-[var(--VIARA-canvas)]">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
                <span className="absolute -top-40 start-1/2 h-80 w-[min(80vw,48rem)] -translate-x-1/2 rounded-full bg-[rgba(var(--VIARA-accent-rgb),.08)] blur-3xl" />
                <span className="absolute -bottom-56 -end-40 h-80 w-80 rounded-full bg-[rgba(var(--VIARA-accent-rgb),.055)] blur-3xl" />
            </div>
            {/* <header className="relative z-10 flex min-h-[4.5rem] items-center border-b border-[var(--VIARA-line)] bg-[color-mix(in_srgb,var(--VIARA-surface)_94%,var(--VIARA-accent-soft))] px-4 shadow-sm shadow-[rgba(var(--VIARA-shadow),.04)] sm:px-8">
                <div className="mx-auto flex w-full max-w-[1440px] items-center justify-between gap-3">
                    <Link to="/" className="group inline-flex min-w-0 items-center gap-2.5 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--VIARA-accent)] focus-visible:ring-offset-2" aria-label={VIARA_BRAND.name}>
                        <span className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-[rgba(var(--VIARA-accent-rgb),.2)] bg-[var(--VIARA-surface)] shadow-sm shadow-[rgba(var(--VIARA-accent-rgb),.12)]">
                            {logoFailed ? <Activity size={20} strokeWidth={2.5} className="text-[var(--VIARA-accent)]" /> : (
                                <img src={VIARA_BRAND.logoUrl} alt="" className="h-8 w-8 object-contain" onError={() => setLogoFailed(true)} />
                            )}
                        </span>
                        <span className="min-w-0">
                            <span dir="ltr" className="block truncate text-[11px] font-black tracking-[.2em] text-[var(--VIARA-ink)]">{VIARA_BRAND.name}</span>
                            <span className="mt-0.5 block truncate text-[10px] font-medium text-[var(--VIARA-muted)]">{t('app.fullName', { defaultValue: VIARA_BRAND.descriptor })}</span>
                        </span>
                    </Link>
                    <LanguageToggle variant="compact" />
                </div>
            </header> */}
            <div className="relative z-10 mx-auto flex w-full max-w-[1440px] flex-1 items-center px-3 py-5 sm:px-8 sm:py-8 lg:px-10">
                <section dir="ltr" className="viara-system-state-card grid w-full overflow-hidden rounded-[1.75rem] border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] shadow-xl shadow-[rgba(var(--VIARA-shadow),.08)] lg:min-h-[min(46rem,calc(100vh-9rem))] lg:grid-cols-[.9fr_1.1fr]">
                    <div className="relative hidden items-center justify-center overflow-hidden border-e border-[var(--VIARA-line)] bg-[linear-gradient(145deg,color-mix(in_srgb,var(--VIARA-surface)_88%,var(--VIARA-accent-soft)),var(--VIARA-surface))] p-5 sm:flex sm:min-h-[18rem] lg:p-8">
                        <StateArtwork variant={visual} />
                    </div>
                    <div dir={isRtl ? 'rtl' : 'ltr'} className="relative flex min-w-0 flex-col justify-center p-5 text-center sm:p-8 lg:p-10">
                        <div className="mx-auto w-full max-w-2xl">
                            {code ? (
                                <div dir="ltr" className="mb-2 select-none text-7xl font-black leading-none tracking-[-.075em] text-[var(--VIARA-accent)] sm:text-8xl">
                                    {code.split('').map((digit, index) => <span key={`${digit}-${index}`} className={index !== Math.floor(code.length / 2) ? 'opacity-35' : 'drop-shadow-[0_8px_14px_rgba(var(--VIARA-accent-rgb),.16)]'}>{digit}</span>)}
                                </div>
                            ) : (
                                <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-2xl ring-8 ${tones[tone] || tones.cyan}`}><Icon size={27} strokeWidth={1.8} /></div>
                            )}
                            <p className="mt-4 text-[11px] font-extrabold uppercase tracking-[0.16em] text-[var(--VIARA-accent-text)]">{eyebrow}</p>
                            <h1 className="mx-auto mt-2 max-w-2xl text-2xl font-black leading-tight tracking-[-0.035em] text-[var(--VIARA-ink)] sm:text-3xl">{title}</h1>
                            <div className="mx-auto mt-3 max-w-2xl text-sm leading-7 text-[var(--VIARA-muted)] sm:text-[15px]">{description}</div>
                            {notice}
                            <div className="mt-6 flex flex-col items-stretch justify-center gap-2.5 sm:mt-7 sm:flex-row sm:items-center">{children}</div>
                        </div>
                    </div>
                </section>
            </div>
        </main>
    );
};

export default SystemState;
