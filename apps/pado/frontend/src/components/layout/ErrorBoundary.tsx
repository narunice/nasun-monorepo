/**
 * ErrorBoundary
 * 전역 에러 처리 컴포넌트
 *
 * 2026-05-27: also reports unrecoverable React errors to the chat-server
 * operator alert channel so we hear about user-blocking regressions in
 * minutes, not hours. Stale chunk errors are excluded (those auto-reload
 * and aren't worth alerting on). Best-effort: never blocks UI render.
 */

import { Component, type ReactNode, type ErrorInfo } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
  isChunkError: boolean;
}

const ERROR_REPORT_ENDPOINT = 'https://nasun.io/chat/api/frontend-error-report';
const REPORT_APP_ID = 'pado';

function reportToOperators(error: Error, errorInfo: ErrorInfo): void {
  // Fire-and-forget; never throw out of here. The chat-server dedups so
  // a refresh loop won't spam Telegram.
  try {
    const body = JSON.stringify({
      app: REPORT_APP_ID,
      message: error.message?.slice(0, 500) ?? '(no message)',
      stack: error.stack?.slice(0, 1000) ?? '',
      componentStack: errorInfo.componentStack?.slice(0, 600) ?? '',
      url: window.location.href.slice(0, 300),
      userAgent: navigator.userAgent.slice(0, 200),
      buildHash:
        (typeof document !== 'undefined' &&
          document.querySelector<HTMLMetaElement>('meta[name="x-build-hash"]')?.content) ||
        '',
    });
    void fetch(ERROR_REPORT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    }).catch(() => {
      // Best-effort: swallow network errors. The user already sees the
      // ErrorBoundary fallback; failing to alert operators must not crash
      // the boundary itself.
    });
  } catch {
    // JSON.stringify or DOM access threw; nothing more to do.
  }
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null, isChunkError: false };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    const msg = error.message || '';
    const isChunkError =
      msg.includes('Failed to fetch dynamically imported module') ||
      msg.includes('Loading chunk') ||
      msg.includes('Loading CSS chunk');
    return { hasError: true, error, isChunkError };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);

    // Auto-reload on stale chunk errors (happens after deployments)
    if (this.state.isChunkError) {
      const key = 'chunk-reload-ts';
      const lastReload = Number(sessionStorage.getItem(key) || 0);
      // Prevent reload loop: only auto-reload once per 30 seconds
      if (Date.now() - lastReload > 30_000) {
        sessionStorage.setItem(key, String(Date.now()));
        window.location.reload();
        return;
      }
    }

    // Non-chunk errors: alert operators so we don't wait on user reports.
    if (!this.state.isChunkError) {
      reportToOperators(error, errorInfo);
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      // Chunk load error: show spinner while auto-reloading
      if (this.state.isChunkError) {
        return (
          <div className="flex items-center justify-center min-h-screen bg-theme-bg-primary">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-pd1 border-t-transparent" />
          </div>
        );
      }

      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-theme-bg-primary text-theme-text-primary">
          <div className="text-center max-w-md px-6">
            <div className="text-6xl mb-4">:(</div>
            <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
            <p className="mb-2 text-theme-text-muted">
              The page hit an unexpected error. Our team has been notified and we're looking into it.
            </p>
            <p className="mb-6 text-sm text-theme-text-muted">
              A hard refresh (Ctrl/Cmd + Shift + R) often clears it. If it keeps happening, please share the error text below in the Pado feedback channel.
            </p>
            {this.state.error && (
              <pre className="mb-6 p-4 bg-theme-bg-secondary rounded text-left text-xs text-red-400 overflow-auto max-h-40">
                {this.state.error.message || '(no error message)'}
              </pre>
            )}
            <button
              onClick={this.handleReload}
              className="px-6 py-2 bg-pd1 text-white rounded hover:bg-pd1/80 transition-colors"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
