import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ArrowLeft, ArrowRight, Home, KeyRound, Route, ShieldAlert, UserRound, ExternalLink, LogOut } from 'lucide-react';
import { useSelector, useDispatch } from 'react-redux';
import { useTranslation } from 'react-i18next';
import { selectCurrentUser, selectIsAuthenticated, logOut } from '../store/authSlice';
import getRoleHomePath from '../utils/getRoleHomePath';
import { getPatientPortalHomeUrl, getDoctorPortalHomeUrl } from '../utils/portalUrls';
import SystemState from '../components/ui/SystemState';

const actionBase = 'inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--VIARA-accent-rgb),0.18)] sm:w-auto';
const secondaryAction = `${actionBase} border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] text-[var(--VIARA-ink)] hover:border-[rgba(var(--VIARA-accent-rgb),.3)] hover:bg-[var(--VIARA-accent-soft)] dark:hover:bg-[var(--VIARA-surface-hover)]`;
const primaryAction = `${actionBase} bg-[var(--VIARA-accent)] text-[var(--VIARA-accent-contrast)] shadow-sm shadow-[rgba(var(--VIARA-accent-rgb),.18)] hover:brightness-110 disabled:opacity-60`;

const DetailItem = ({ icon: Icon, label, value }) => (
    <div className="flex min-w-0 items-start gap-3 rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] p-3 text-start">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[var(--VIARA-surface)] text-[var(--VIARA-accent)] ring-1 ring-[var(--VIARA-line)]">
            <Icon size={17} />
        </span>
        <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-[var(--VIARA-muted)]">{label}</p>
            <p dir="auto" className="mt-1 truncate text-sm font-semibold text-[var(--VIARA-ink)]">{value}</p>
        </div>
    </div>
);

const Unauthorized = () => {
    const { t, i18n } = useTranslation('system');
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const location = useLocation();
    const user = useSelector(selectCurrentUser);
    const isAuthenticated = useSelector(selectIsAuthenticated);
    const BackIcon = i18n.dir() === 'rtl' ? ArrowRight : ArrowLeft;
    const homePath = getRoleHomePath(user, isAuthenticated);

    const isPortalUser = user?.role === 'Patient' || user?.role === 'Doctor' || user?.role === 'Referring_Doctor';
    const isDoctorPortal = user?.role === 'Doctor' || user?.role === 'Referring_Doctor';

    const roleLabel = user?.role || t('states.unauthorized.guestRole', { defaultValue: 'Guest session' });
    const userLabel = user?.name
        || user?.full_name
        || [user?.first_name, user?.last_name].filter(Boolean).join(' ')
        || user?.username
        || user?.email
        || t('states.unauthorized.currentUser', { defaultValue: 'Current user' });

    const handleSwitchToStaff = () => {
        dispatch(logOut());
        navigate('/login', { replace: true });
    };

    const portalUrl = isDoctorPortal ? getDoctorPortalHomeUrl() : getPatientPortalHomeUrl();
    const portalActionLabel = isDoctorPortal
        ? t('states.unauthorized.goToDoctorPortal', { defaultValue: 'Go to Doctor Portal' })
        : t('states.unauthorized.goToPatientPortal', { defaultValue: 'Go to Patient Portal' });

    const eyebrow = isPortalUser
        ? t('states.unauthorized.portalEyebrow', { defaultValue: 'Workspace Separation' })
        : t('states.unauthorized.eyebrow');

    const title = isPortalUser
        ? t('states.unauthorized.portalTitle', { defaultValue: 'External Portal Account' })
        : t('states.unauthorized.title');

    const description = isPortalUser
        ? t('states.unauthorized.portalDescription', {
            role: roleLabel,
            defaultValue: `You are signed in with an external portal account (${roleLabel}). This system is reserved for internal staff.`
        })
        : t('states.unauthorized.description');

    const guidance = isPortalUser
        ? t('states.unauthorized.portalGuidance', {
            defaultValue: 'To access your clinical exams and reports, please navigate to the external portal or sign in with an authorized staff account.'
        })
        : t('states.unauthorized.guidance', {
            defaultValue: 'Use your assigned workspace, or ask an administrator to update your role or permissions if this page is required for your work.'
        });

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
            <p className={`mt-4 rounded-xl border px-4 py-3 text-start text-sm leading-6 ${
                isPortalUser
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200'
                    : 'border-[rgba(217,154,24,.2)] bg-[var(--warning-bg)] text-[var(--warning)]'
            }`}>
                {guidance}
            </p>
        </div>
    );

    return (
        <SystemState
            icon={ShieldAlert}
            tone={isPortalUser ? 'cyan' : 'rose'}
            code="403"
            visual="restricted"
            eyebrow={eyebrow}
            title={title}
            description={description}
            notice={notice}
        >
            {isPortalUser ? (
                <>
                    <a href={portalUrl} className={primaryAction}>
                        <ExternalLink size={17} />
                        {portalActionLabel}
                    </a>
                    <button type="button" onClick={handleSwitchToStaff} className={secondaryAction}>
                        <LogOut size={17} />
                        {t('states.unauthorized.signInAsStaff', { defaultValue: 'Sign in with Staff Account' })}
                    </button>
                    <button type="button" onClick={() => navigate(-1)} className={secondaryAction}>
                        <BackIcon size={17} />
                        {t('states.back')}
                    </button>
                </>
            ) : (
                <>
                    <button type="button" onClick={() => navigate(-1)} className={secondaryAction}>
                        <BackIcon size={17} />
                        {t('states.back')}
                    </button>
                    {homePath.startsWith('http')
                        ? <a href={homePath} className={primaryAction}><Home size={17} />{isAuthenticated ? t('states.home') : t('states.signIn')}</a>
                        : <Link to={homePath} className={primaryAction}><Home size={17} />{isAuthenticated ? t('states.home') : t('states.signIn')}</Link>}
                </>
            )}
        </SystemState>
    );
};

export default Unauthorized;
