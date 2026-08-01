import React, { Component } from 'react';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';
import Button from './ui/Button';

const IS_DEV = import.meta.env.DEV;

class ErrorBoundary extends Component {
    constructor(props) {
        super(props);
        this.state = { hasError: false, error: null, errorInfo: null };
    }

    static getDerivedStateFromError(error) {
        return { hasError: true };
    }

    componentDidCatch(error, errorInfo) {
        this.setState({ error, errorInfo });

        // Log to console in development
        if (IS_DEV) {
            console.error('Error caught by boundary:', error, errorInfo);
        }

        // TODO: Send to error reporting service (Sentry, LogRocket, etc.)
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null, errorInfo: null });
    };

    handleGoHome = () => {
        window.location.href = '/dashboard';
    };

    render() {
        if (this.state.hasError) {
            return (
                <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
                    <div className="max-w-md w-full">
                        <div className="bg-white rounded-2xl shadow-lg border border-slate-200 p-8 text-center">
                            {/* Error Icon */}
                            <div className="mx-auto w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mb-4">
                                <AlertTriangle className="w-8 h-8 text-red-600" />
                            </div>

                            {/* Title */}
                            <h2 className="text-2xl font-bold text-slate-900 mb-2">
                                Something went wrong
                            </h2>

                            {/* Message */}
                            <p className="text-slate-600 mb-6">
                                We're sorry for the inconvenience. The application encountered an unexpected error.
                            </p>

                            {/* Error Details (Development Only) */}
                            {IS_DEV && this.state.error && (
                                <details className="mb-6 text-left">
                                    <summary className="cursor-pointer text-sm font-medium text-slate-700 hover:text-slate-900 mb-2">
                                        Error Details (Dev Only)
                                    </summary>
                                    <div className="bg-slate-100 rounded-lg p-4 overflow-auto max-h-40">
                                        <code className="text-xs text-red-600 block whitespace-pre-wrap">
                                            {this.state.error.toString()}
                                            {this.state.errorInfo && '\n\n' + this.state.errorInfo.componentStack}
                                        </code>
                                    </div>
                                </details>
                            )}

                            {/* Actions */}
                            <div className="flex flex-col sm:flex-row gap-3">
                                <Button
                                    variant="primary"
                                    className="flex-1"
                                    onClick={this.handleReset}
                                >
                                    <RefreshCw className="w-4 h-4 mr-2" />
                                    Try Again
                                </Button>

                                <Button
                                    variant="outline"
                                    className="flex-1"
                                    onClick={this.handleGoHome}
                                >
                                    <Home className="w-4 h-4 mr-2" />
                                    Go Home
                                </Button>
                            </div>

                            {/* Support Info */}
                            <p className="mt-6 text-xs text-slate-500">
                                If this problem persists, please contact support.
                            </p>
                        </div>
                    </div>
                </div>
            );
        }

        return this.props.children;
    }
}

export default ErrorBoundary;
