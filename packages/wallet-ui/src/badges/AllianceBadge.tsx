import type { FC } from "react";

export interface AllianceBadgeProps {
  /** "full" shows "Alliance", "compact" shows "AL" */
  variant?: "full" | "compact";
  className?: string;
}

// Stylized linked-rings glyph evokes a covenant / alliance — distinct from
// the Genesis Pass crown so the two NFTs read as different motifs even at
// thumbnail scale.
function ShieldIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 3l8 3v6c0 4.5-3.2 8.4-8 9-4.8-.6-8-4.5-8-9V6l8-3z" />
      <path d="M9 12l2 2 4-4" />
    </svg>
  );
}

// Alliance tone keyed to the Alliance health donut (emerald). Same shape and
// size as GenesisPassBadge so the two stack neatly above the avatar.
// `min-w-*` is matched on GenesisPassBadge so the two pills line up vertically
// when stacked above the avatar. Without this they ride at different widths
// because "Alliance" is shorter than "Genesis Pass".
const COMPACT_CLASSES =
  "inline-flex items-center justify-center gap-0.5 min-w-[2.75rem] px-1.5 py-0.5 rounded-full text-xs font-bold leading-none bg-emerald-500/15 text-emerald-400 border border-emerald-500/40";

const FULL_CLASSES =
  "inline-flex items-center justify-center gap-1 min-w-[7.5rem] px-1.5 sm:px-2 py-0.5 rounded-full text-sm font-semibold bg-emerald-500/15 text-emerald-300 border border-emerald-500/40";

export const AllianceBadge: FC<AllianceBadgeProps> = ({
  variant = "compact",
  className = "",
}) => {
  const isCompact = variant === "compact";
  const baseClasses = isCompact ? COMPACT_CLASSES : FULL_CLASSES;
  const iconSize = isCompact ? "w-3 h-3" : "w-4 h-4";

  return (
    <span
      className={`${baseClasses} ${className}`.trim()}
      title="Alliance NFT Holder"
    >
      <ShieldIcon className={`${iconSize} flex-shrink-0 text-emerald-400`} />
      {isCompact ? "AL" : "Alliance"}
    </span>
  );
};
