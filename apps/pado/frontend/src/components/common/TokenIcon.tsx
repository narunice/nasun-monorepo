/**
 * TokenIcon — Shared token icon component with official crypto logos.
 * Centralizes token color config and SVG icons previously duplicated across 6+ files.
 */

import { memo } from 'react';

// ─── Inline SVG Logo Components ───────────────────────────────────────────────

// SVG icon size = 60% of container, centered by flexbox, clipped by overflow-hidden
const ICON_RATIO = 0.6;

const BtcIcon = memo(function BtcIcon({ size }: { size: number }) {
  const s = Math.round(size * ICON_RATIO);
  return (
    <svg viewBox="0 0 24 24" width={s} height={s} fill="currentColor">
      <path d="M14.24 10.56c-.31 1.24-2.24.73-2.88.58l.55-2.18c.64.16 2.67.47 2.33 1.6zm-1.31 3.48c-.36 1.46-2.74.83-3.5.63l.63-2.52c.76.2 3.28.58 2.87 1.89zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm3.93 9.41c-.16 1.09-.93 1.6-1.8 1.82.97.39 1.46 1.06 1.12 2.42-.43 1.71-1.82 1.95-3.77 1.63l-.37 1.47-1-.25.37-1.44c-.25-.06-.51-.13-.78-.2l-.37 1.45-1-.25.37-1.47c-.3-.08-.6-.16-.92-.25l-1.3-.33.4-1.12s.74.19.73.18c.28.07.4-.12.44-.24l.58-2.32.1.03-.1-.03.82-3.25c.01-.2-.05-.46-.43-.55.02-.01-.73-.18-.73-.18l.24-1.05 1.38.35-.01.02c.22.05.44.11.67.16l.36-1.46 1 .25-.36 1.42c.27.06.53.13.79.19l.35-1.41 1 .25-.37 1.47c1.52.42 2.62 1.08 2.38 2.51z" />
    </svg>
  );
});

const UsdcIcon = memo(function UsdcIcon({ size }: { size: number }) {
  const s = Math.round(size * ICON_RATIO);
  return (
    <svg viewBox="0 0 24 24" width={s} height={s} fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.31-8.86c-1.77-.45-2.34-.94-2.34-1.67 0-.84.79-1.43 2.1-1.43 1.38 0 1.9.66 1.94 1.64h1.71c-.05-1.34-.87-2.57-2.49-2.97V5.5h-2.84v1.19c-1.51.32-2.72 1.3-2.72 2.81 0 1.79 1.49 2.69 3.66 3.21 1.95.46 2.34 1.15 2.34 1.87 0 .53-.39 1.39-2.1 1.39-1.6 0-2.23-.72-2.32-1.64H8.5c.1 1.71 1.38 2.66 2.73 2.98V18.5h2.84v-1.18c1.53-.29 2.72-1.18 2.73-2.8-.01-2.2-1.9-2.96-4.49-3.38z" />
    </svg>
  );
});

const EthIcon = memo(function EthIcon({ size }: { size: number }) {
  const s = Math.round(size * ICON_RATIO);
  return (
    <svg viewBox="0 0 24 24" width={s} height={s} fill="currentColor">
      <path d="M12 1.5l-7 10.17L12 15l7-3.33L12 1.5zM5 13.34L12 22.5l7-9.16L12 16.67 5 13.34z" />
    </svg>
  );
});

const SolIcon = memo(function SolIcon({ size }: { size: number }) {
  const s = Math.round(size * ICON_RATIO);
  return (
    <svg viewBox="0 0 24 24" width={s} height={s} fill="currentColor">
      <path d="M5.51 18.5h14.14c.18 0 .35-.07.48-.2l2.37-2.44a.32.32 0 00-.23-.55H8.13c-.18 0-.35.07-.48.2l-2.37 2.44a.32.32 0 00.23.55zm-.74-7h14.14c.18 0 .35-.07.48-.2l2.37-2.44a.32.32 0 00-.23-.55H7.39c-.18 0-.35.07-.48.2L4.54 10.95a.32.32 0 00.23.55zm14.88 1.69H5.51a.32.32 0 00-.23.55l2.37 2.44c.13.13.3.2.48.2h14.14a.32.32 0 00.23-.55l-2.37-2.44c-.13-.13-.3-.2-.48-.2z" />
    </svg>
  );
});

const NsnIcon = memo(function NsnIcon({ size }: { size: number }) {
  // Official Nasun symbol — triangle polygon from nasun_symbol_white.svg
  const s = Math.round(size * 0.5); // smaller ratio for non-square viewBox
  return (
    <svg
      viewBox="0 0 245.1 212.26"
      width={s}
      height={s}
      preserveAspectRatio="xMidYMid meet"
      fill="currentColor"
    >
      <polygon points="122.55 212.26 245.1 0 0 0 122.55 212.26" />
    </svg>
  );
});

// ─── Token Icon Configuration ─────────────────────────────────────────────────

interface TokenIconConfig {
  Icon: React.ComponentType<{ size: number }>;
  bgClass: string;
  hexColor: string;
  gradientClass: string;
}

const TOKEN_ICON_CONFIG: Record<string, TokenIconConfig> = {
  NBTC: {
    Icon: BtcIcon,
    bgClass: 'bg-orange-500',
    hexColor: '#f97316',
    gradientClass: 'bg-gradient-to-br from-orange-400 to-yellow-500',
  },
  NUSDC: {
    Icon: UsdcIcon,
    bgClass: 'bg-blue-500',
    hexColor: '#3b82f6',
    gradientClass: 'bg-gradient-to-br from-blue-400 to-blue-600',
  },
  NSN: {
    Icon: NsnIcon,
    bgClass: 'bg-purple-500',
    hexColor: '#8b5cf6',
    gradientClass: 'bg-gradient-to-br from-pd4 to-pd2',
  },
  NETH: {
    Icon: EthIcon,
    bgClass: 'bg-indigo-500',
    hexColor: '#6366f1',
    gradientClass: 'bg-gradient-to-br from-indigo-400 to-blue-600',
  },
  NSOL: {
    Icon: SolIcon,
    bgClass: 'bg-emerald-500',
    hexColor: '#14b8a6',
    gradientClass: 'bg-gradient-to-br from-emerald-400 to-teal-600',
  },
};

const FALLBACK_HEX = '#6b7280';

/** Get hex color for canvas/SVG rendering. Returns gray fallback for unknown tokens. */
export function getTokenHexColor(symbol: string, fallback = FALLBACK_HEX): string {
  return TOKEN_ICON_CONFIG[symbol]?.hexColor ?? fallback;
}

// ─── TokenIcon Component ──────────────────────────────────────────────────────

const SIZE_MAP = {
  xs: 16,
  sm: 24,
  md: 32,
  lg: 40,
} as const;

interface TokenIconProps {
  symbol: string;
  size?: keyof typeof SIZE_MAP;
  gradient?: boolean;
  className?: string;
}

export const TokenIcon = memo(function TokenIcon({
  symbol,
  size = 'sm',
  gradient = false,
  className = '',
}: TokenIconProps) {
  const px = SIZE_MAP[size];
  const config = TOKEN_ICON_CONFIG[symbol];
  const bgClass = config
    ? (gradient ? config.gradientClass : config.bgClass)
    : 'bg-theme-bg-tertiary';

  return (
    <div
      role="img"
      aria-label={`${symbol} token`}
      className={`shrink-0 rounded-full overflow-hidden flex items-center justify-center text-white ${bgClass} ${className}`}
      style={{ width: px, height: px }}
    >
      {config ? (
        <config.Icon size={px} />
      ) : (
        <span
          className="font-bold"
          style={{ fontSize: px * 0.4 }}
        >
          {symbol.charAt(0)}
        </span>
      )}
    </div>
  );
});
