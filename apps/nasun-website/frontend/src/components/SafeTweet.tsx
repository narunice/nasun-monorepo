import { Component, type ReactNode } from 'react';
import {
  EmbeddedTweet,
  TweetSkeleton,
  TweetNotFound,
  useTweet,
} from 'react-tweet';
import { normalizeTweet } from './safeTweetUtils';
import logger from '../lib/logger';

interface SafeTweetProps {
  id: string;
  fallback?: ReactNode;
  notFoundFallback?: ReactNode;
}

class LocalErrorBoundary extends Component<
  { fallback: ReactNode; children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error) {
    logger.warn('SafeTweet render error (falling back):', error.message);
  }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

function TweetInner({ id, fallback, notFoundFallback }: SafeTweetProps) {
  const { data, error, isLoading } = useTweet(id);
  if (isLoading) return <>{fallback ?? <TweetSkeleton />}</>;
  if (error || !data) return <>{notFoundFallback ?? <TweetNotFound error={error} />}</>;
  return <EmbeddedTweet tweet={normalizeTweet(data)} />;
}

/**
 * Drop-in replacement for `<Tweet>` from react-tweet that survives:
 *  - upstream API omitting empty entity arrays (defensive normalization)
 *  - any other sync render failure inside react-tweet (ErrorBoundary)
 *
 * On total failure the boundary fallback is rendered instead of taking
 * down the page via the app-level ErrorBoundary.
 *
 * The boundary is keyed on `id` so that switching to a new tweet
 * after a previous render failure remounts cleanly instead of staying
 * stuck in the errored state.
 */
export function SafeTweet({ id, fallback, notFoundFallback }: SafeTweetProps) {
  return (
    <LocalErrorBoundary
      key={id}
      fallback={notFoundFallback ?? <TweetNotFound error={null} />}
    >
      <TweetInner id={id} fallback={fallback} notFoundFallback={notFoundFallback} />
    </LocalErrorBoundary>
  );
}
