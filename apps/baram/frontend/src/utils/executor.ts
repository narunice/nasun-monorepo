/**
 * Executor-related utility functions
 *
 * Extracted from useExecutors hook for independent testing and reuse.
 */

/**
 * Calculate effectiveScore for UI sorting (non-deterministic, off-chain only).
 * effectiveScore = sqrt(staked_amount / 1e9) * (reputation / 1000)
 */
export function calculateEffectiveScore(stakeAmount: number, reputation: number): number {
  return Math.sqrt(stakeAmount / 1e9) * (reputation / 1000);
}

/**
 * Validate executor endpoint URL.
 * Rejects non-HTTPS URLs to prevent MITM attacks on the public key exchange.
 * Allows http only in development (localhost).
 */
export function isValidEndpointUrl(url: string, isDev: boolean = false): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'http:' && isDev) return true;
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
