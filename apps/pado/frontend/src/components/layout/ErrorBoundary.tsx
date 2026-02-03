/**
 * ErrorBoundary
 * 전역 에러 처리 컴포넌트
 */

import { Component, type ReactNode, type ErrorInfo } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    // 향후 에러 로깅 서비스 연동 가능
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-theme-bg-primary text-theme-text-primary">
          <div className="text-center max-w-md px-6">
            <div className="text-6xl mb-4">:(</div>
            <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
            <p className="mb-6 text-theme-text-muted">
              An unexpected error occurred. Please try refreshing the page.
            </p>
            {import.meta.env.DEV && this.state.error && (
              <pre className="mb-6 p-4 bg-theme-bg-secondary rounded text-left text-xs text-red-400 overflow-auto max-h-40">
                {this.state.error.message}
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
