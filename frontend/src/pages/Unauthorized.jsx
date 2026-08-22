import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Home, KeyRound, Route, ShieldAlert, UserRound } from 'lucide-react';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { selectCurrentUser, selectIsAuthenticated } from '../store/authSlice';
import getRoleHomePath from '../utils/getRoleHomePath';
import SystemState from '../components/ui/SystemState';

const actionBase = 'inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--VIARA-accent-rgb),0.18)] sm:w-auto';
const secondaryAction = `${actionBase} border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] text-[var(--VIARA-ink)] hover:bg-[var(--VIARA-surface-hover)] dark:hover:bg-slate-800/50`;
const primaryAction = `${actionBase} bg-[var(--VIARA-accent)] text-white shadow-sm hover:brightness-110 disabled:opacity-60`;

const DetailItem = ({ icon: Icon, label, value }) => (
    <div className="flex min-w-0 items-start gap-3 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] p-3 text-start">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--VIARA-surface)] text-[var(--VIARA-accent)] ring-1 ring-[var(--VIARA-line)]">
            <Icon size={17} />
        </span>
        <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--VIARA-muted)]">{label}</p>
            <p className="mt-1 truncate text-sm font-semibold text-[var(--VIARA-ink)]">{value}</p>
        </div>
    </div>
);

const Unauthorized = () => {
    const { t, i18n } = useTranslation('system');
    const navigate = useNavigate();
    const location = useLocation();
    const user = useSelector(selectCurrentUser);
    const isAuthenticated = useSelector(selectIsAuthenticated);
    const BackIcon = i18n.dir() === 'rtl' ? ArrowRight : ArrowLeft;
    const homePath = getRoleHomePath(user, isAuthenticated);
    const roleLabel = user?.role || t('states.unauthorized.guestRole', { defaultValue: 'Guest session' });
    const userLabel = [user?.first_name, user?.last_name].filter(Boolean).join(' ')
        || user?.username
        || user?.email
        || t('states.unauthorized.currentUser', { defaultValue: 'Current user' });
    const notice = (
        <div className="mx-auto mt-7 max-w-xl">
            <div className="grid gap-3 sm:grid-cols-3">
                <DetailItem
                    icon={Route}
                    label={t('states.unauthorized.requestedRoute', { defaultValue: 'Requested route' })}
                    value={location.pathname}
                />
                <DetailItem
                    icon={UserRound}
                    label={t('states.unauthorized.account', { defaultValue: 'Account' })}
                    value={userLabel}
                />
                <DetailItem
                    icon={KeyRound}
                    label={t('states.unauthorized.role', { defaultValue: 'Role' })}
                    value={roleLabel}
                />
            </div>
            <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/20 dark:text-amber-100">
                {t('states.unauthorized.guidance', {
                    defaultValue: 'Use your assigned workspace, or ask an administrator to update your role or permissions if this page is required for your work.'
                })}
            </p>
        </div>
    );

    return (
        <SystemState icon={ShieldAlert} tone="amber" eyebrow={t('states.unauthorized.eyebrow')} title={t('states.unauthorized.title')} description={t('states.unauthorized.description')} notice={notice}>
            <button type="button" onClick={() => navigate(-1)} className={secondaryAction}><BackIcon size={17} />{t('states.back')}</button>
            {homePath.startsWith('http')
                ? <a href={homePath} className={primaryAction}><Home size={17} />{isAuthenticated ? t('states.home') : t('states.signIn')}</a>
                : <Link to={homePath} className={primaryAction}><Home size={17} />{isAuthenticated ? t('states.home') : t('states.signIn')}</Link>}
        </SystemState>
    );
};

export default Unauthorized;
