/**
 * ErrorBoundary - Catches render errors and displays recovery UI
 *
 * Critical for a financial dApp: if the UI crashes while NUSDC is escrowed,
 * the user needs guidance on how to recover funds.
 */

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[ErrorBoundary] Uncaught error:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg-primary,#0a0a0f)] p-4">
          <div className="max-w-md w-full bg-[var(--color-bg-secondary,#111118)] border border-[var(--color-border,#2a2a3a)] rounded-xl p-6 space-y-4">
            <div className="flex items-center gap-2 text-[var(--color-error,#ef4444)]">
              <svg className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <h2 className="text-base font-semibold">Application Error</h2>
            </div>

            <p className="text-sm text-[var(--color-text-secondary,#9ca3af)]">
              An unexpected error occurred. If you have an active request with escrowed NUSDC,
              it will be automatically refunded after the timeout period (~5 minutes).
            </p>

            {this.state.error && (
              <pre className="text-xs text-[var(--color-text-muted,#6b7280)] bg-[var(--color-bg-primary,#0a0a0f)] rounded p-3 overflow-x-auto">
                {this.state.error.message}
              </pre>
            )}

            <button
              onClick={this.handleReload}
              className="w-full px-4 py-2 text-sm font-medium rounded-lg bg-baram-1 text-white hover:bg-baram-2 transition-colors"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
