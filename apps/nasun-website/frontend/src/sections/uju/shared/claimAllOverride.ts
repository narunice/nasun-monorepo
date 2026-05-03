/**
 * Tailwind class string for overriding `@nasun/wallet-ui#ClaimAllButton`'s
 * default violet/lavender gradient with uju's cyan→lime palette.
 *
 * Scope: uju surfaces only (Dashboard's Active Engagement card). Pado/Baram
 * keep the shared package's default colors. The `!` (important) prefixes are
 * required because the shared component already applies `bg-gradient-to-r
 * from-pado-violet to-pado-lavender` and we need to win specificity in
 * Tailwind's class-order resolution.
 */
export const UJU_CLAIM_ALL_OVERRIDE =
  "!bg-gradient-to-r !from-pado-3 !via-pado-4 !to-pado-5 !text-uju-bg " +
  "!rounded-full !text-sm " +
  "!shadow-[0_4px_14px_rgba(94,225,228,0.4)] " +
  "hover:!brightness-110 hover:!shadow-[0_6px_20px_rgba(134,243,183,0.55)]";
