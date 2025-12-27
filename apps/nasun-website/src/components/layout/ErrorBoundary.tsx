import { Component, type ErrorInfo, type ReactNode } from "react";
import logger from "../../lib/logger";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    // Error parameter is required by React but not used in this implementation
    void error;
    return { hasError: true };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error("Uncaught error in ErrorBoundary:", error, errorInfo);

    // ChunkLoadError 감지 - 자동 재시도
    const isChunkLoadError =
      error.name === "ChunkLoadError" ||
      error.message.includes("Failed to fetch") ||
      error.message.includes("Loading chunk") ||
      error.message.includes("dynamically imported module");

    if (isChunkLoadError) {
      logger.warn("ChunkLoadError detected. Attempting to reload in 1 second...");
      setTimeout(() => {
        window.location.reload();
      }, 1000);
    }
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return <h1>문제가 발생했습니다.</h1>;
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
