import type { FC } from "react";

export interface GenesisPassBadgeProps {
  /** "full" shows "Genesis Pass", "compact" shows "GP" */
  variant?: "full" | "compact";
  className?: string;
}

function CrownIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M11.562 3.266a.5.5 0 0 1 .876 0L15.39 8.87a1 1 0 0 0 1.516.294L21.183 5.5a.5.5 0 0 1 .798.519l-2.834 10.246a1 1 0 0 1-.956.734H5.81a1 1 0 0 1-.957-.734L2.02 6.02a.5.5 0 0 1 .798-.519l4.276 3.664a1 1 0 0 0 1.516-.294z" />
      <path d="M5 21h14" />
    </svg>
  );
}

// Genesis Pass tone keyed to the GP health donut (red-orange family). Kept
// in sync with apps/nasun-website/.../HealthGaugeCard.tsx so the dashboard's
// donut, badge, and other GP surfaces read as the same identity color.
// `min-w-*` matches AllianceBadge so the two pills align when stacked.
const COMPACT_CLASSES =
  "inline-flex items-center justify-center gap-0.5 min-w-[2.75rem] px-1.5 py-0.5 rounded-full text-xs font-bold leading-none bg-orange-600/15 text-orange-400 border border-orange-600/40";

const FULL_CLASSES =
  "inline-flex items-center justify-center gap-1 min-w-[7.5rem] px-1.5 sm:px-2 py-0.5 rounded-full text-sm font-semibold bg-orange-600/15 text-orange-300 border border-orange-600/40";

export const GenesisPassBadge: FC<GenesisPassBadgeProps> = ({
  variant = "compact",
  className = "",
}) => {
  const isCompact = variant === "compact";
  const baseClasses = isCompact ? COMPACT_CLASSES : FULL_CLASSES;
  const iconSize = isCompact ? "w-3 h-3" : "w-4 h-4";

  return (
    <span
      className={`${baseClasses} ${className}`.trim()}
      title="Genesis Pass Holder"
    >
      <CrownIcon className={`${iconSize} flex-shrink-0 text-amber-400`} />
      {isCompact ? "GP" : "Genesis Pass"}
    </span>
  );
};
