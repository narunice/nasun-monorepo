/**
 * Single source of truth for "Coming Soon" tags used across uju surfaces
 * (staking rows, wallet rows, NFT slots, etc.). Visual rules per design
 * brief:
 *   - normal letter-spacing (no tracking-widest)
 *   - thin (font-light) weight
 *   - sentence-case "Coming Soon" — only C and S are capitalized
 *   - flat tinted background, no border, no hover (it's a label, not a button)
 */
export function UjuComingSoonTag({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-md bg-uju-border/40 text-uju-secondary px-2 py-0.5 text-sm font-light leading-tight ${className}`}
    >
      Coming Soon
    </span>
  );
}
