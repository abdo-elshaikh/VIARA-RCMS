import { Component, type ErrorInfo, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

interface ErrorBoundaryProps {
    children: ReactNode;
}

interface ErrorBoundaryState {
    hasError: boolean;
}

class PortalErrorBoundaryBase extends Component<ErrorBoundaryProps & { t: (key: string) => string }, ErrorBoundaryState> {
    state: ErrorBoundaryState = { hasError: false };

    static getDerivedStateFromError(): ErrorBoundaryState {
        return { hasError: true };
    }

    componentDidCatch(error: Error, info: ErrorInfo): void {
        console.error('[PortalErrorBoundary]', error.message, info.componentStack);
    }

    render(): ReactNode {
        const { t } = this.props;
        if (this.state.hasError) {
            return (
                <div
                    role="alert"
                    dir="auto"
                    className="flex min-h-screen w-full flex-col items-center justify-center gap-4 bg-background px-6 text-center"
                >
                    <span className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
                        {t('states.errorBoundary.eyebrow')}
                    </span>
                    <h1 className="text-2xl font-black text-foreground">{t('states.errorBoundary.title')}</h1>
                    <p className="max-w-md text-sm font-medium text-muted-foreground">
                        {t('states.errorBoundary.description')}
                    </p>
                    <div className="mt-2 flex items-center gap-3">
                        <button
                            type="button"
                            onClick={() => this.setState({ hasError: false })}
                            className="rounded-xl bg-primary-600 px-5 py-2.5 text-sm font-bold text-white transition hover:bg-primary-700 focus:outline-none focus-visible:ring-4 focus-visible:ring-primary-600/30"
                        >
                            {t('states.errorBoundary.retry')}
                        </button>
                        <Link
                            to="/"
                            className="rounded-xl border border-border px-5 py-2.5 text-sm font-bold text-foreground transition hover:bg-muted focus:outline-none focus-visible:ring-4 focus-visible:ring-primary-600/20"
                        >
                            {t('states.errorBoundary.home')}
                        </Link>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

/** Localized root error boundary: prevents a blank page when a view crashes. */
const PortalErrorBoundary = ({ children }: ErrorBoundaryProps) => {
    const { t } = useTranslation('system');
    return (
        <PortalErrorBoundaryBase t={t}>
            {children}
        </PortalErrorBoundaryBase>
    );
};

export default PortalErrorBoundary;
