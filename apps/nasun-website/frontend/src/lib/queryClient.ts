/**
 * Shared QueryClient singleton.
 *
 * Extracted from main.tsx so that invalidation helpers (invalidateXxx functions)
 * can access the client outside the React tree.
 *
 * IMPORTANT: main.tsx passes this exact instance to <QueryClientProvider>.
 * NasunProvider's useQueryClient() therefore resolves to the same object.
 * Do not create additional QueryClient instances.
 */

import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (failureCount, error) => {
        if (error && typeof error === "object" && "status" in error) {
          const status = (error as { status: number }).status;
          // 4xx errors (client errors, throttling): no retry
          if (status >= 400 && status < 500) return false;
          // 5xx server errors: retry once
          if (status >= 500) return failureCount < 1;
        }
        // Network errors: retry up to 2 times
        return failureCount < 2;
      },
      staleTime: 1000 * 60 * 5, // 5 minutes
    },
  },
});
