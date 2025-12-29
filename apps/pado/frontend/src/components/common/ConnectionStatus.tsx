/**
 * ConnectionStatus Component
 * Displays current connection mode as a badge
 */

import type { ConnectionMode } from '../../features/trading/types/events';

interface ConnectionStatusBadgeProps {
  mode: ConnectionMode;
  className?: string;
}

const modeConfig = {
  websocket: {
    color: 'bg-green-500',
    textColor: 'text-green-500',
    label: 'Live',
    description: 'Connected to blockchain via WebSocket',
  },
  polling: {
    color: 'bg-yellow-500',
    textColor: 'text-yellow-500',
    label: 'Polling',
    description: 'Polling blockchain events every 2s',
  },
  simulation: {
    color: 'bg-orange-500',
    textColor: 'text-orange-500',
    label: 'Demo',
    description: 'Showing simulated data',
  },
} as const;

/**
 * Small badge showing connection status
 */
export function ConnectionStatusBadge({ mode, className = '' }: ConnectionStatusBadgeProps) {
  const config = modeConfig[mode];

  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium ${className}`}
      title={config.description}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${config.color} animate-pulse`} />
      <span className={`${config.textColor}`}>{config.label}</span>
    </span>
  );
}

/**
 * Dot-only indicator for compact display
 */
export function ConnectionStatusDot({ mode, className = '' }: ConnectionStatusBadgeProps) {
  const config = modeConfig[mode];

  return (
    <span
      className={`inline-block w-2 h-2 rounded-full ${config.color} ${className}`}
      title={`${config.label}: ${config.description}`}
    />
  );
}
