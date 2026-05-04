/**
 * Prediction market price formatters.
 *
 * On-chain prices are basis points (bps) where 10000 = $1.00. Since each share
 * pays $1 at resolution, the cents value of a share equals its implied
 * probability percent (60¢ ↔ 60% chance). Surfacing both reinforces the
 * mental model for novice users.
 */

export function bpsToCents(bps: number): number {
  return bps / 100;
}

// Compact form for tight surfaces (order book rows, history lists).
export function formatCents(bps: number, decimals = 1): string {
  return `${(bps / 100).toFixed(decimals)}¢`;
}

// Verbose form for learning surfaces (placeholders, summaries, onboarding).
export function formatCentsWithProb(bps: number, decimals = 1): string {
  const v = (bps / 100).toFixed(decimals);
  return `${v}¢ (${v}%)`;
}
