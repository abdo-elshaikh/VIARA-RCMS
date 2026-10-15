import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Check, Compass, Copy, Home, Map, Route, SearchX } from 'lucide-react';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { selectCurrentUser, selectIsAuthenticated } from '../store/authSlice';
import getRoleHomePath from '../utils/getRoleHomePath';
import SystemState from '../components/ui/SystemState';

const actionBase = 'inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--VIARA-accent-rgb),0.18)] sm:w-auto';
const secondaryAction = `${actionBase} border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] text-[var(--VIARA-ink)] hover:border-[rgba(var(--VIARA-accent-rgb),.3)] hover:bg-[var(--VIARA-accent-soft)] dark:hover:bg-[var(--VIARA-surface-hover)]`;
const primaryAction = `${actionBase} bg-[var(--VIARA-accent)] text-[var(--VIARA-accent-contrast)] shadow-sm shadow-[rgba(var(--VIARA-accent-rgb),.18)] hover:brightness-110 disabled:opacity-60`;

const HintItem = ({ icon: Icon, title, text }) => (
    <div className="rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] p-4 text-start">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-[var(--VIARA-surface)] text-[var(--VIARA-accent)] ring-1 ring-[var(--VIARA-line)]">
            <Icon size={17} />
        </span>
        <p className="mt-3 text-sm font-bold text-[var(--VIARA-ink)]">{title}</p>
        <p className="mt-1 text-xs leading-5 text-[var(--VIARA-muted)]">{text}</p>
    </div>
);

const NotFound = () => {
    const { t, i18n } = useTranslation('system');
    const location = useLocation();
    const navigate = useNavigate();
    const user = useSelector(selectCurrentUser);
    const isAuthenticated = useSelector(selectIsAuthenticated);
    const [pathCopied, setPathCopied] = useState(false);
    const BackIcon = i18n.dir() === 'rtl' ? ArrowRight : ArrowLeft;
    const homePath = getRoleHomePath(user, isAuthenticated);
    const isRtl = i18n.dir() === 'rtl';
    const notice = (
        <div className="mx-auto mt-7 max-w-xl">
            <div className="rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] px-4 py-3 text-start">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--VIARA-muted)]">
                    {t('states.notFound.requestedRoute', { defaultValue: 'Requested route' })}
                </p>
                <div className="mt-1 flex min-w-0 items-center gap-2">
                    <p dir="ltr" className="min-w-0 flex-1 truncate text-start font-mono text-sm font-semibold text-[var(--VIARA-ink)]">{location.pathname}</p>
                    <button
                        type="button"
                        onClick={async () => {
                            try {
                                await navigator.clipboard.writeText(location.pathname);
                                setPathCopied(true);
                            } catch {
                                setPathCopied(false);
                            }
                        }}
                        className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg border border-[rgba(var(--VIARA-accent-rgb),.2)] bg-[var(--VIARA-surface)] px-2.5 text-[10px] font-bold text-[var(--VIARA-accent-text)] transition hover:bg-[var(--VIARA-accent-soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--VIARA-accent)]"
                        aria-label={t('states.notFound.copyPath', { defaultValue: isRtl ? 'نسخ المسار' : 'Copy path' })}
                    >
                        {pathCopied ? <Check size={13} /> : <Copy size={13} />}
                        <span>{pathCopied ? t('states.notFound.copied', { defaultValue: isRtl ? 'تم النسخ' : 'Copied' }) : t('states.notFound.copyPath', { defaultValue: isRtl ? 'نسخ المسار' : 'Copy path' })}</span>
                    </button>
                </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
                <HintItem
                    icon={Route}
                    title={t('states.notFound.checkUrlTitle', { defaultValue: 'Check the URL' })}
                    text={t('states.notFound.checkUrlText', { defaultValue: 'Confirm the link was copied completely and has no extra characters.' })}
                />
                <HintItem
                    icon={Map}
                    title={t('states.notFound.navigateTitle', { defaultValue: 'Use navigation' })}
                    text={t('states.notFound.navigateText', { defaultValue: 'Open your workspace from the main menu to reach active modules.' })}
                />
                <HintItem
                    icon={Compass}
                    title={t('states.notFound.sessionTitle', { defaultValue: 'Session preserved' })}
                    text={t('states.notFound.sessionText', { defaultValue: 'Your sign-in state is intact; only this route is unavailable.' })}
                />
            </div>
        </div>
    );

    return (
        <SystemState icon={SearchX} code="404" visual="missing" eyebrow={t('states.notFound.eyebrow')} title={t('states.notFound.title')} description={t('states.notFound.description', { path: location.pathname })} notice={notice}>
            <button type="button" onClick={() => navigate(-1)} className={secondaryAction}><BackIcon size={17} />{t('states.back')}</button>
            {homePath.startsWith('http')
                ? <a href={homePath} className={primaryAction}><Home size={17} />{isAuthenticated ? t('states.home') : t('states.signIn')}</a>
                : <Link to={homePath} className={primaryAction}><Home size={17} />{isAuthenticated ? t('states.home') : t('states.signIn')}</Link>}
        </SystemState>
    );
};

export default NotFound;
