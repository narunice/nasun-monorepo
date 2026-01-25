/**
 * LedgerConnect Component
 *
 * Hardware wallet connection button/dropdown.
 * Rebranded from "Connect Ledger" to "Add Hardware Key" for user clarity.
 *
 * UX Principle: Hardware = Extra security layer (assurance, not barrier)
 *
 * Status display:
 * - disconnected → "Add Hardware Key"
 * - connecting → "Connecting..."
 * - connected → "Hardware Secured ✓"
 * - app-required → "Open Wallet App"
 * - error → "Connection Issue"
 */

import type { LedgerConnectionStatus, LedgerDeviceInfo } from '@nasun/wallet';
import * as React from 'react';

export interface LedgerConnectProps {
  /** Current connection status */
  status: LedgerConnectionStatus;
  /** Connected device info */
  deviceInfo?: LedgerDeviceInfo | null;
  /** Connect callback */
  onConnect: () => void;
  /** Disconnect callback */
  onDisconnect?: () => void;
  /** Display variant */
  variant?: 'button' | 'dropdown' | 'inline';
  /** Button size */
  size?: 'sm' | 'md' | 'lg';
  /** Show connected address */
  connectedAddress?: string;
  /** Additional class names */
  className?: string;
}

/** Status display configuration */
interface StatusConfig {
  label: string;
  subtext: string;
  icon: string;
  styles: string;
  bgStyles: string;
}

const STATUS_CONFIG: Record<LedgerConnectionStatus, StatusConfig> = {
  disconnected: {
    label: 'Add Hardware Key',
    subtext: 'Extra security layer',
    icon: '🔑',
    styles: 'text-gray-700 dark:text-gray-300',
    bgStyles:
      'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 border-gray-300 dark:border-gray-600',
  },
  connecting: {
    label: 'Connecting...',
    subtext: 'Check your device',
    icon: '⏳',
    styles: 'text-blue-700 dark:text-blue-300',
    bgStyles:
      'bg-blue-50 dark:bg-blue-900/20 border-blue-300 dark:border-blue-600',
  },
  connected: {
    label: 'Hardware Secured',
    subtext: 'Ledger connected',
    icon: '✓',
    styles: 'text-green-700 dark:text-green-300',
    bgStyles:
      'bg-green-50 dark:bg-green-900/20 hover:bg-green-100 dark:hover:bg-green-900/30 border-green-300 dark:border-green-600',
  },
  'app-required': {
    label: 'Open Wallet App',
    subtext: 'On your Ledger device',
    icon: '📱',
    styles: 'text-yellow-700 dark:text-yellow-300',
    bgStyles:
      'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-300 dark:border-yellow-600',
  },
  error: {
    label: 'Connection Issue',
    subtext: 'Try reconnecting',
    icon: '⚠',
    styles: 'text-red-700 dark:text-red-300',
    bgStyles:
      'bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/30 border-red-300 dark:border-red-600',
  },
};

const SIZE_STYLES = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
  lg: 'px-5 py-2.5 text-base',
};

/**
 * Format address for display
 */
function formatAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

/**
 * Ledger connection button/component
 *
 * @example
 * // Basic button
 * <LedgerConnect status="disconnected" onConnect={handleConnect} />
 *
 * // Connected with address
 * <LedgerConnect
 *   status="connected"
 *   connectedAddress="0x1234..."
 *   onConnect={handleConnect}
 *   onDisconnect={handleDisconnect}
 * />
 */
export function LedgerConnect({
  status,
  deviceInfo,
  onConnect,
  onDisconnect,
  variant = 'button',
  size = 'md',
  connectedAddress,
  className = '',
}: LedgerConnectProps) {
  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const config = STATUS_CONFIG[status];
  const isConnected = status === 'connected';
  const isLoading = status === 'connecting';

  // Button click handler
  const handleClick = () => {
    if (variant === 'dropdown' && isConnected) {
      setDropdownOpen(!dropdownOpen);
    } else if (isConnected && onDisconnect) {
      onDisconnect();
    } else if (!isLoading) {
      onConnect();
    }
  };

  if (variant === 'inline') {
    return (
      <div
        className={`flex items-center gap-2 ${config.styles} ${className}`}
      >
        <span>{config.icon}</span>
        <span className="font-medium">{config.label}</span>
        {isConnected && connectedAddress && (
          <span className="text-sm opacity-75 font-mono">
            ({formatAddress(connectedAddress)})
          </span>
        )}
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {/* Main button */}
      <button
        onClick={handleClick}
        disabled={isLoading}
        className={`
          flex items-center gap-2 rounded-lg border font-medium transition-all
          ${SIZE_STYLES[size]}
          ${config.bgStyles}
          ${config.styles}
          disabled:opacity-50 disabled:cursor-not-allowed
        `}
      >
        {/* Icon */}
        <span className={isLoading ? 'animate-pulse' : ''}>{config.icon}</span>

        {/* Label */}
        <span>{config.label}</span>

        {/* Connected address (compact) */}
        {isConnected && connectedAddress && size !== 'sm' && (
          <span className="text-xs opacity-75 font-mono ml-1">
            {formatAddress(connectedAddress)}
          </span>
        )}

        {/* Dropdown arrow */}
        {variant === 'dropdown' && isConnected && (
          <span className="text-xs ml-1">{dropdownOpen ? '▲' : '▼'}</span>
        )}
      </button>

      {/* Dropdown menu */}
      {variant === 'dropdown' && dropdownOpen && isConnected && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 overflow-hidden z-10">
          {/* Device info */}
          <div className="p-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center">
                <span className="text-green-600 dark:text-green-400 text-lg">
                  ✓
                </span>
              </div>
              <div>
                <p className="font-medium text-gray-900 dark:text-white">
                  Hardware Secured
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {deviceInfo?.model || 'Ledger Nano'}
                  {deviceInfo?.appName && ` · ${deviceInfo.appName}`}
                </p>
              </div>
            </div>
          </div>

          {/* Connected address */}
          {connectedAddress && (
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">
                Connected Address
              </p>
              <p className="text-sm font-mono text-gray-900 dark:text-white truncate">
                {connectedAddress}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="p-2">
            {onDisconnect && (
              <button
                onClick={() => {
                  setDropdownOpen(false);
                  onDisconnect();
                }}
                className="w-full px-3 py-2 text-sm text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
              >
                Disconnect
              </button>
            )}
          </div>
        </div>
      )}

      {/* Click outside handler */}
      {dropdownOpen && (
        <div
          className="fixed inset-0 z-0"
          onClick={() => setDropdownOpen(false)}
        />
      )}
    </div>
  );
}

/**
 * Check if WebHID is supported in the current browser
 */
export function isWebHIDSupported(): boolean {
  return (
    typeof navigator !== 'undefined' &&
    'hid' in navigator &&
    typeof (navigator as Navigator & { hid?: unknown }).hid !== 'undefined'
  );
}

/**
 * Browser compatibility warning component
 */
export function LedgerBrowserWarning({ className = '' }: { className?: string }) {
  if (isWebHIDSupported()) {
    return null;
  }

  return (
    <div
      className={`p-4 rounded-lg bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 ${className}`}
    >
      <div className="flex items-start gap-3">
        <span className="text-xl text-yellow-500 dark:text-yellow-400">🌐</span>
        <div>
          <p className="font-medium text-yellow-700 dark:text-yellow-300">
            Browser not compatible
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
            Your browser doesn&apos;t support hardware wallets. Use Chrome, Edge, or
            Brave for Ledger support.
          </p>
        </div>
      </div>
    </div>
  );
}
