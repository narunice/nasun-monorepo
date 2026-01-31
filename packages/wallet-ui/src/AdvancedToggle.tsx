/**
 * Pro Mode Toggle Component
 *
 * Allows users to switch between simple and pro wallet modes.
 * Pro mode reveals additional features like:
 * - Smart Account status
 * - Session Key management
 * - ZK-ID proofs
 * - WalletConnect sessions
 * - Multi-chain support
 */

import { useUISettingsStore } from './stores/uiSettingsStore';

export interface AdvancedToggleProps {
  /** Custom class name */
  className?: string;
  /** Show description text */
  showDescription?: boolean;
  /** Compact mode (smaller toggle) */
  compact?: boolean;
}

export function AdvancedToggle({
  className = '',
  showDescription = true,
  compact = false,
}: AdvancedToggleProps) {
  const { isAdvancedMode, toggleAdvancedMode } = useUISettingsStore();

  return (
    <div className={`${className}`}>
      <label className="flex items-center justify-between cursor-pointer">
        <div className="flex-1">
          <span
            className={`font-medium text-gray-900 dark:text-white ${
              compact ? 'text-sm' : ''
            }`}
          >
            Pro Mode
          </span>
          {showDescription && (
            <p className="text-xs text-gray-500 dark:text-zinc-400 mt-0.5">
              Unlock multi-chain support and advanced features
            </p>
          )}
        </div>

        {/* Toggle switch */}
        <button
          type="button"
          role="switch"
          aria-checked={isAdvancedMode}
          onClick={toggleAdvancedMode}
          className={`relative inline-flex items-center ${
            compact ? 'h-5 w-9' : 'h-6 w-11'
          } rounded-full transition-colors ${
            isAdvancedMode
              ? 'bg-blue-600'
              : 'bg-gray-300 dark:bg-zinc-600'
          }`}
        >
          <span className="sr-only">Toggle pro mode</span>
          <span
            className={`inline-block ${
              compact ? 'h-4 w-4' : 'h-4 w-4'
            } transform rounded-full bg-white transition-transform ${
              isAdvancedMode
                ? compact
                  ? 'translate-x-[18px]'
                  : 'translate-x-6'
                : 'translate-x-1'
            }`}
          />
        </button>
      </label>
    </div>
  );
}

export default AdvancedToggle;
