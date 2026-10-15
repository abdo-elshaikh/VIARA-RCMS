import { Component, useEffect, useState } from 'react';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import SystemState from './ui/SystemState';

const IS_DEV = import.meta.env.DEV;

// ─── Dev details notice ──────────────────────────────────────────────────────
const DevDetails = ({ error, errorInfo, t }) => (
    <div className="mx-auto mt-7 max-w-xl">
        <details className="text-start">
            <summary className="mb-2 cursor-pointer text-sm font-semibold text-[var(--VIARA-ink)] hover:text-[var(--VIARA-accent)]">
                {t('states.errorBoundary.devDetails')}
            </summary>
            <div className="max-h-48 overflow-auto rounded-xl border border-[var(--VIARA-line)] bg-[var(--VIARA-surface-muted)] p-4">
                <code className="block whitespace-pre-wrap text-start text-xs text-[var(--danger)]">
                    {error.toString()}
                    {errorInfo && '\n\n' + errorInfo.componentStack}
                </code>
            </div>
        </details>
    </div>
);

// ─── Action button styles (mirroring NotFound) ───────────────────────────────
const actionBase =
    'inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-5 text-sm font-bold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[rgba(var(--VIARA-accent-rgb),0.18)] sm:w-auto';
const primaryAction = `${actionBase} bg-[var(--VIARA-accent)] text-[var(--VIARA-accent-contrast)] shadow-sm shadow-[rgba(var(--VIARA-accent-rgb),.18)] hover:brightness-110 disabled:opacity-60`;
const secondaryAction = `${actionBase} border border-[var(--VIARA-line)] bg-[var(--VIARA-surface)] text-[var(--VIARA-ink)] hover:border-[rgba(var(--VIARA-accent-rgb),.3)] hover:bg-[var(--VIARA-accent-soft)] dark:hover:bg-[var(--VIARA-surface-hover)]`;

// ─── Base class component (no hooks) ────────────────────────────────────────
class ErrorBoundaryBase extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError() {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ error, errorInfo });

        // Log to console in development
        if (IS_DEV) {
            console.error('Error caught by boundary:', error, errorInfo);
        }
    }

    handleReset = () => {
        if (
            this.state.error?.message?.includes?.('dynamically imported module') ||
            this.state.error?.message?.includes?.('Failed to fetch dynamically imported') ||
            this.state.error?.message?.includes?.('Loading chunk')
        ) {
            window.location.reload();
            return;
        }
        this.setState({ hasError: false, error: null, errorInfo: null });
    };

    handleGoHome = () => {
        window.location.href = '/dashboard';
    };

    render() {
        const { t } = this.props;

        if (this.state.hasError) {
            const notice =
                IS_DEV && this.state.error ? (
                    <DevDetails
                        error={this.state.error}
                        errorInfo={this.state.errorInfo}
                        t={t}
                    />
                ) : null;

            return (
                <SystemState
                    icon={AlertTriangle}
                    tone="rose"
                    visual="error"
                    eyebrow={t('states.errorBoundary.eyebrow', { defaultValue: 'Something went wrong' })}
                    title={t('states.errorBoundary.title')}
                    description={t('states.errorBoundary.description')}
                    notice={notice}
                >
                    <button
                        type="button"
                        onClick={this.handleReset}
                        className={primaryAction}
                    >
                        <RefreshCw size={17} />
                        {t('states.errorBoundary.tryAgain')}
                    </button>
                    <button
                        type="button"
                        onClick={this.handleGoHome}
                        className={secondaryAction}
                    >
                        <Home size={17} />
                        {t('states.errorBoundary.goHome')}
                    </button>
                </SystemState>
            );
        }

        return this.props.children;
    }
}

// ─── Localized wrapper (injects i18n into class component) ──────────────────
/** Localized root error boundary for the staff application. */
const ErrorBoundary = ({ children }) => {
    const { t, i18n } = useTranslation('system');
    const [localeReady, setLocaleReady] = useState(false);

    useEffect(() => {
        let active = true;
        Promise.all([
            i18n.loadNamespaces('system'),
            i18n.loadNamespaces('common'),
        ]).finally(() => {
            if (active) setLocaleReady(true);
        });
        return () => { active = false; };
    }, [i18n]);

    return (
        <ErrorBoundaryBase t={t} dir={i18n.dir()} localeReady={localeReady}>
            {children}
        </ErrorBoundaryBase>
    );
};

export default ErrorBoundary;
