/**
 * NetworkBadge Component
 * Displays the current network type as a colored badge
 */

import type { NetworkType } from '@nasun/wallet';

export interface NetworkBadgeProps {
  /** Network type to display */
  type: NetworkType;
  /** Badge size */
  size?: 'xs' | 'sm';
  /** Additional class names */
  className?: string;
}

const NETWORK_STYLES: Record<NetworkType, string> = {
  devnet: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  testnet: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  mainnet: 'bg-green-500/20 text-green-400 border-green-500/30',
};

const SIZE_STYLES = {
  xs: 'px-1 py-0.5 text-[10px] xl:text-xs',
  sm: 'px-1.5 py-0.5 text-xs xl:text-sm',
};

/**
 * Network badge component
 * Shows devnet (orange), testnet (blue), or mainnet (green)
 */
export function NetworkBadge({
  type,
  size = 'sm',
  className = '',
}: NetworkBadgeProps) {
  const label = type.toUpperCase();

  return (
    <span
      className={`
        inline-flex items-center font-medium rounded border
        ${NETWORK_STYLES[type]}
        ${SIZE_STYLES[size]}
        ${className}
      `}
    >
      {label}
    </span>
  );
}
