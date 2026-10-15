import { Component, type ErrorInfo, type ReactNode } from "react";
import logger from "../../lib/logger";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  /**
   * The error looks like a failed chunk/module load, so a reload is the action
   * that can plausibly fix it. Named for the condition rather than for an
   * action: nothing here retries. Reloading is owned by lazyWithRetry and the
   * vite:preloadError listener in main.tsx, which share a 60s window and a
   * MAX_SESSION_RELOADS budget. By the time an error reaches this boundary
   * that budget is spent, so the user is offered the reload instead.
   */
  isChunkError: boolean;
}

/**
 * Detects if an error is a ChunkLoadError (dynamic import failure).
 *
 * Deliberately does NOT match a bare "Failed to fetch". Vite's real message is
 * "Failed to fetch dynamically imported module: <url>", which the
 * "dynamically imported module" clause already catches, while the bare
 * substring also matches the TypeError any offline or failed API call throws.
 * Treating those as a stale chunk told the user their page was a leftover from
 * a previous version and swallowed the caller's `fallback`.
 */
function isChunkLoadError(error: Error): boolean {
  return (
    error.name === "ChunkLoadError" ||
    error.message.includes("Loading chunk") ||
    error.message.includes("dynamically imported module")
  );
}

/**
 * Reload with the same cache-busting `_r` param lazyWithRetry and the
 * vite:preloadError listener in main.tsx use. A plain reload can be served the
 * same cached document and preload graph that just failed, which puts the user
 * straight back on this screen. Does not touch the sessionStorage reload
 * budget: this click is user-paced, so exhausting the automatic budget should
 * still leave the manual escape hatch available.
 */
function cacheBustedReload(): void {
  const url = new URL(window.location.href);
  url.searchParams.set("_r", String(Date.now()));
  window.location.replace(url.toString());
}

class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    isChunkError: false,
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      isChunkError: isChunkLoadError(error),
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error("Uncaught error in ErrorBoundary:", error, errorInfo);

    // This boundary deliberately does NOT reload. Reloading on a chunk error
    // is lazyWithRetry's job (and main.tsx's for vite:preloadError), both
    // bounded by a 60s window and MAX_SESSION_RELOADS per tab. An unbounded
    // reload here would sit outside that budget and recreate the reload loop
    // those guards were added to stop, because the budget being exhausted is
    // exactly how an error gets this far. Offer the reload, do not take it.
    if (isChunkLoadError(error)) {
      logger.warn(
        "ChunkLoadError reached ErrorBoundary; reload budget is spent, prompting the user.",
      );
    }
  }

  public render() {
    if (this.state.hasError) {
      // A stale or missing chunk is recoverable by loading the page again, so
      // say that and give the user the button. This used to render a bare
      // spinner on the assumption that componentDidCatch was about to reload;
      // once that reload was removed, nothing ended the spinner and the user
      // was stranded on it with no way out.
      if (this.state.isChunkError) {
        return (
          <div className="flex flex-col items-center justify-center min-h-screen gap-4 bg-nasun-black px-6 text-center">
            <p className="text-base text-white">
              This page could not finish loading. It is usually a leftover file
              from a previous version.
            </p>
            <button
              type="button"
              onClick={cacheBustedReload}
              className="rounded-md border border-white/30 px-4 py-2 text-base text-white hover:bg-white/10"
            >
              Reload page
            </button>
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
