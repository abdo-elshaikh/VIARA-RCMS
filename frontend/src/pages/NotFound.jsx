import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Compass, Home, Map, Route, SearchX } from 'lucide-react';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { selectCurrentUser, selectIsAuthenticated } from '../store/authSlice';
import getRoleHomePath from '../utils/getRoleHomePath';
import SystemState from '../components/ui/SystemState';

const actionBase = 'inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--VIARA-accent-rgb),0.18)] sm:w-auto';
const secondaryAction = `${actionBase} border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] text-[var(--VIARA-ink)] hover:bg-[var(--VIARA-surface-hover)] dark:hover:bg-slate-800/50`;
const primaryAction = `${actionBase} bg-[var(--VIARA-accent)] text-white shadow-sm hover:brightness-110 disabled:opacity-60`;

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
    const BackIcon = i18n.dir() === 'rtl' ? ArrowRight : ArrowLeft;
    const homePath = getRoleHomePath(user, isAuthenticated);
    const notice = (
        <div className="mx-auto mt-7 max-w-xl">
            <div className="rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] px-4 py-3 text-start">
                <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--VIARA-muted)]">
                    {t('states.notFound.requestedRoute', { defaultValue: 'Requested route' })}
                </p>
                <p className="mt-1 truncate font-mono text-sm font-semibold text-[var(--VIARA-ink)]">
                    {location.pathname}
                </p>
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
        <SystemState icon={SearchX} eyebrow={t('states.notFound.eyebrow')} title={t('states.notFound.title')} description={t('states.notFound.description', { path: location.pathname })} notice={notice}>
            <button type="button" onClick={() => navigate(-1)} className={secondaryAction}><BackIcon size={17} />{t('states.back')}</button>
            {homePath.startsWith('http')
                ? <a href={homePath} className={primaryAction}><Home size={17} />{isAuthenticated ? t('states.home') : t('states.signIn')}</a>
                : <Link to={homePath} className={primaryAction}><Home size={17} />{isAuthenticated ? t('states.home') : t('states.signIn')}</Link>}
        </SystemState>
    );
};

export default NotFound;
