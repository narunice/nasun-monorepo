/**
 * Lazy loading with exponential backoff retry
 *
 * @description
 * Prevents ChunkLoadError from immediately showing error page.
 * Retries chunk loading with exponential backoff (1s, 2s, 3s).
 *
 * @author Claude Code
 * @date 2025-10-27
 */
import { lazy, type ComponentType } from "react";

export function lazyWithRetry<T extends ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
  retries = 3
): React.LazyExoticComponent<T> {
  return lazy(async () => {
    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        return await factory();
      } catch (error) {
        const isLastAttempt = attempt === retries - 1;
        if (isLastAttempt) throw error;

        // Exponential backoff: 1s, 2s, 3s
        const delay = 1000 * (attempt + 1);
        console.warn(
          `[lazyWithRetry] Attempt ${attempt + 1} failed, retrying in ${delay}ms...`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
    throw new Error("Failed to load component after retries");
  });
}
