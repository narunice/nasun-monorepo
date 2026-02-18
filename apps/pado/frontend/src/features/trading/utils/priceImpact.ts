/**
 * Price Impact Color Utilities
 * Returns WCAG AA-compliant theme-aware Tailwind color classes for price impact display.
 * Light theme uses darker shades (e.g. text-amber-700), dark theme uses bright shades (e.g. text-yellow-400).
 */

/**
 * Returns a theme-aware Tailwind color class for a given price impact percentage.
 * Low (<0.5%): green, Medium (0.5-2%): amber, High (>=2%): red
 */
export function getPriceImpactColorClass(impactPct: number): string {
  if (impactPct < 0.5) return 'text-green-700 dark:text-green-400';
  if (impactPct < 2.0) return 'text-amber-700 dark:text-yellow-400';
  return 'text-red-700 dark:text-red-400';
}
