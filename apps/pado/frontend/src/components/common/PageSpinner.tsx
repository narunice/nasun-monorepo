/**
 * PageSpinner Component
 * Full-screen centered spinner used as Suspense fallback for lazy-loaded routes.
 */

import { Spinner } from './Spinner';

export function PageSpinner() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Spinner size="lg" />
    </div>
  );
}
