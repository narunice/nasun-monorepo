import { Component, type ErrorInfo, type ReactNode } from "react";
import { Spinner } from "../ui/Spinner";
import logger from "../../lib/logger";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  isRetrying: boolean;
}

/**
 * Detects if an error is a ChunkLoadError (dynamic import failure)
 */
function isChunkLoadError(error: Error): boolean {
  return (
    error.name === "ChunkLoadError" ||
    error.message.includes("Failed to fetch") ||
    error.message.includes("Loading chunk") ||
    error.message.includes("dynamically imported module")
  );
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    isRetrying: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    // ChunkLoadError: show spinner while reloading
    // Other errors: show fallback UI
    return {
      hasError: true,
      isRetrying: isChunkLoadError(error),
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error("Uncaught error in ErrorBoundary:", error, errorInfo);

    // ChunkLoadError detected - auto reload after brief spinner display
    if (isChunkLoadError(error)) {
      logger.warn("ChunkLoadError detected. Reloading page...");
      // TEMP DISABLED for reload-loop diagnosis. Re-enable after root cause confirmed.
      // setTimeout(() => {
      //   window.location.reload();
      // }, 1000);
    }
  }

  public render() {
    if (this.state.hasError) {
      // ChunkLoadError: show spinner while reloading
      if (this.state.isRetrying) {
        return (
          <div className="flex items-center justify-center min-h-screen bg-nasun-black">
            <Spinner size="xl" />
          </div>
        );
      }

      // Other errors: show fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return <h1>Something went wrong.</h1>;
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
