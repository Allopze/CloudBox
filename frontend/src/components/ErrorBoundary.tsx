import React, { Component, ReactNode } from 'react';
import { withTranslation, WithTranslation } from 'react-i18next';
import { AlertTriangle, RefreshCw, Home, Mail } from 'lucide-react';
import { captureError } from '../lib/sentry';

interface Props extends WithTranslation {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });

    // Log error to console in development
    console.error('ErrorBoundary caught an error:', error);
    console.error('Component stack:', errorInfo.componentStack);

    // Send to GlitchTip/Sentry
    captureError(error, {
      componentStack: errorInfo.componentStack,
    });
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  handleContactAdmin = () => {
    const subject = encodeURIComponent('Error Report - CloudBox');
    const errorDetails = this.state.error
      ? `\n\nError Details:\n${this.state.error.toString()}\n\nStack:\n${this.state.errorInfo?.componentStack || 'No stack available'}`
      : '';
    const body = encodeURIComponent(`Hello,\n\nI encountered an error while using CloudBox.\n\nPage: ${window.location.href}\nDate: ${new Date().toISOString()}${errorDetails}\n\nPlease look into this issue.\n\nThank you.`);
    window.location.href = `mailto:soporte@cloudbox.lat?subject=${subject}&body=${body}`;
  };

  render() {
    const { t } = this.props;

    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-dark-50 dark:bg-dark-900 p-4">
          <div className="max-w-md w-full bg-white dark:bg-dark-800 rounded-2xl shadow-xl p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
              <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
            </div>

            <h1 className="text-2xl font-bold text-dark-900 dark:text-white mb-2">
              {t('errorBoundary.title')}
            </h1>

            <p className="text-dark-500 dark:text-dark-400 mb-6">
              {t('errorBoundary.description')}
            </p>

            {import.meta.env.DEV && this.state.error && (
              <details className="mb-6 text-left">
                <summary className="cursor-pointer text-sm text-dark-500 dark:text-dark-400 hover:text-dark-700 dark:hover:text-dark-300">
                  {t('errorBoundary.showDetails')}
                </summary>
                <div className="mt-2 p-3 bg-dark-100 dark:bg-dark-700 rounded-lg overflow-auto max-h-48">
                  <p className="text-xs font-mono text-red-600 dark:text-red-400 whitespace-pre-wrap">
                    {this.state.error.toString()}
                  </p>
                  {this.state.errorInfo && (
                    <p className="text-xs font-mono text-dark-500 dark:text-dark-400 whitespace-pre-wrap mt-2">
                      {this.state.errorInfo.componentStack}
                    </p>
                  )}
                </div>
              </details>
            )}

            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={this.handleReload}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-primary-600 hover:bg-primary-700 text-white font-medium rounded-lg transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                {t('errorBoundary.reload')}
              </button>

              <button
                onClick={this.handleGoHome}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-dark-100 dark:bg-dark-700 hover:bg-dark-200 dark:hover:bg-dark-600 text-dark-700 dark:text-dark-200 font-medium rounded-lg transition-colors"
              >
                <Home className="w-4 h-4" />
                {t('errorBoundary.goHome')}
              </button>
            </div>

            {/* Contact Admin Button */}
            <div className="mt-4 pt-4 border-t border-dark-100 dark:border-dark-700">
              <button
                onClick={this.handleContactAdmin}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 text-sm text-dark-500 dark:text-dark-400 hover:text-primary-600 dark:hover:text-primary-400 transition-colors"
              >
                <Mail className="w-4 h-4" />
                {t('errorBoundary.contactAdmin')}
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default withTranslation()(ErrorBoundary);
